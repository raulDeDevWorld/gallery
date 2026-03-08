'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DataPanel from '@/components/DataPanel'
import Table, { THead } from '@/components/Table'
import Button from '@/components/Button'
import LoaderBlack from '@/components/LoaderBlack'
import { useUser } from '@/context'
import { getPagedData, getValue, readUserData } from '@/firebase/database'
import { anularTransferencia, solicitarTransferencia, transferirTransferencia } from '@/firebase/ops'
import { lower } from '@/lib/string'
import { isAdmin, isPersonal } from '@/lib/roles'
import { generateUUID } from '@/utils/UIDgenerator'

function inputClass() {
  return 'h-10 w-full rounded-2xl bg-surface/60 px-4 text-sm text-text placeholder:text-muted ring-1 ring-border/25 outline-none focus:ring-2 focus:ring-accent/25'
}

function asNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function money(n) {
  return new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 }).format(asNumber(n, 0))
}

function cartKey(productoId, tallaRaw) {
  return `${String(productoId || '').trim()}__${String(tallaRaw || '').trim()}`
}

// Normaliza tallas para UI (label) pero mantiene la llave real (key) para descontar/incrementar sin errores por espacios.
function normalizeTallasByLabel(rawTallas) {
  const raw = rawTallas && typeof rawTallas === 'object' ? rawTallas : {}
  const byLabel = {}
  for (const [t, q] of Object.entries(raw)) {
    const key = String(t ?? '')
    const label = key.trim()
    const stock = asNumber(q, 0)
    if (!label || stock < 0) continue
    const prev = byLabel[label]
    if (!prev || stock > prev.stock) byLabel[label] = { key, label, stock }
  }
  return byLabel
}

function countItems(items) {
  const obj = items && typeof items === 'object' ? items : {}
  let productos = 0
  let pares = 0
  for (const data of Object.values(obj)) {
    const tallas = data?.tallas && typeof data.tallas === 'object' ? data.tallas : {}
    const qty = Object.values(tallas).reduce((acc, n) => acc + asNumber(n, 0), 0)
    if (qty > 0) productos += 1
    pares += qty
  }
  return { productos, pares }
}

function summarizeTransferItems(items = {}, productMetaById = {}) {
  const productRows = []
  let units = 0

  const iterator = items && typeof items === 'object' ? Object.entries(items) : []
  for (const [productId, detail] of iterator) {
    const tallas = detail?.tallas && typeof detail.tallas === 'object' ? detail.tallas : {}
    const meta = productMetaById?.[productId]
    const label = [meta?.marca, meta?.modelo, meta?.nombre].filter(Boolean).join(' ').trim() || productId || 'Producto'
    const lines = []
    let productUnits = 0

    for (const [talla, qtyRaw] of Object.entries(tallas)) {
      const qty = asNumber(qtyRaw, 0)
      if (qty <= 0) continue
      productUnits += qty
      lines.push(`T${String(talla || '').trim()} x${qty}`)
    }

    if (!productUnits) continue
    units += productUnits
    productRows.push({ productId, label, lines: lines.join(' - '), units: productUnits })
  }

  return { units, productRows }
}

function groupTransferenciaItems(items) {
  const grouped = {}
  const arr = Array.isArray(items) ? items : []

  for (const item of arr) {
    const productoId = String(item?.productoId || '').trim()
    const tallaRaw = String(item?.tallaRaw || item?.talla || '').trim()
    const cantidad = asNumber(item?.cantidad, 0)

    if (!productoId || !tallaRaw || cantidad <= 0) continue

    if (!grouped[productoId]) grouped[productoId] = { tallas: {} }
    grouped[productoId].tallas[tallaRaw] = asNumber(grouped[productoId].tallas[tallaRaw], 0) + cantidad
  }

  return grouped
}

function Stepper({ value, onMinus, onPlus, disableMinus, disablePlus }) {
  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-surface-2/70 text-[16px] font-bold text-text ring-1 ring-border/20 disabled:opacity-50"
        onClick={onMinus}
        disabled={disableMinus}
        aria-label="Restar"
      >
        -
      </button>
      <div className="w-10 text-center text-[14px] font-semibold text-text">{value}</div>
      <button
        type="button"
        className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-surface-2/70 text-[16px] font-bold text-text ring-1 ring-border/20 disabled:opacity-50"
        onClick={onPlus}
        disabled={disablePlus}
        aria-label="Sumar"
      >
        +
      </button>
    </div>
  )
}

export default function Page() {
  const { user, userDB, sucursales, setSucursales, modal, setModal, setUserSuccess } = useUser()

  const admin = isAdmin(userDB)
  const personal = isPersonal(userDB)
  const mySucursalId = userDB?.sucursalId || ''

  const [transferenciaId, setTransferenciaId] = useState(() => generateUUID())

  const [desdeSucursalId, setDesdeSucursalId] = useState('')
  const [haciaSucursalId, setHaciaSucursalId] = useState('')
  const [nota, setNota] = useState('')
  const [vista, setVista] = useState('pendiente') // 'pendiente' | 'transferido' | 'anulada'

  const [searchBy, setSearchBy] = useState('nombreLower') // nombreLower|marcaLower|modeloLower|codigoLower
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const searchRef = useRef(null)

  const [results, setResults] = useState([])
  const [loadingResults, setLoadingResults] = useState(false)

  const [expandedProductoId, setExpandedProductoId] = useState('')

  const [cart, setCart] = useState({}) // { [productoId__tallaRaw]: { productoId, marca, modelo, nombre, talla, tallaRaw, cantidad, maxStock } }

  const [stockCache, setStockCache] = useState({}) // { [desde__hacia__productoId]: { origenByLabel, destinoByLabel, cargadoEn } }
  const [stockLoading, setStockLoading] = useState({}) // { [key]: true }

  const [transferenciasDB, setTransferenciasDB] = useState(undefined)
  const [transferProductMetaById, setTransferProductMetaById] = useState({})

  useEffect(() => {
    if (sucursales !== undefined) return
    const unsub = readUserData('sucursales', setSucursales, undefined, (err) => setUserSuccess?.(err?.code || err?.message || 'repeat'))
    return () => (typeof unsub === 'function' ? unsub() : null)
  }, [setSucursales, setUserSuccess, sucursales])

  useEffect(() => {
    if (transferenciasDB !== undefined) return
    const unsub = readUserData('transferencias', setTransferenciasDB, undefined, (err) => setUserSuccess?.(err?.code || err?.message || 'repeat'))
    return () => (typeof unsub === 'function' ? unsub() : null)
  }, [setUserSuccess, transferenciasDB])

  const sucursalesArr = useMemo(() => {
    const arr = sucursales && typeof sucursales === 'object' ? Object.values(sucursales) : []
    return arr.filter((s) => s?.uuid && s?.nombre)
  }, [sucursales])

  const sucursalNameById = useMemo(() => {
    const map = {}
    for (const s of sucursalesArr) map[s.uuid] = s.nombre
    return map
  }, [sucursalesArr])

  useEffect(() => {
    if (!sucursalesArr.length) return

    // Personal: siempre destino = su sucursal; origen = alguna otra.
    if (personal && mySucursalId) {
      if (!haciaSucursalId) setHaciaSucursalId(mySucursalId)
      if (!desdeSucursalId) {
        const other = sucursalesArr.find((s) => s.uuid && s.uuid !== mySucursalId)
        setDesdeSucursalId(other?.uuid || mySucursalId)
      }
      return
    }

    if (!desdeSucursalId) setDesdeSucursalId(sucursalesArr[0]?.uuid)
    if (!haciaSucursalId) {
      const other = sucursalesArr.find((s) => s.uuid !== sucursalesArr[0]?.uuid)
      setHaciaSucursalId(other?.uuid || sucursalesArr[0]?.uuid)
    }
  }, [desdeSucursalId, haciaSucursalId, mySucursalId, personal, sucursalesArr])

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 250)
    return () => clearTimeout(t)
  }, [search])

  const searchLower = lower(searchDebounced).trim()

  const searchByLabel = useMemo(() => {
    if (searchBy === 'marcaLower') return 'marca'
    if (searchBy === 'modeloLower') return 'modelo'
    if (searchBy === 'codigoLower') return 'codigo'
    return 'nombre'
  }, [searchBy])

  const searchPlaceholder = useMemo(() => {
    if (searchBy === 'marcaLower') return 'Buscar por marca...'
    if (searchBy === 'modeloLower') return 'Buscar por modelo...'
    if (searchBy === 'codigoLower') return 'Buscar por codigo...'
    return 'Buscar por nombre...'
  }, [searchBy])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      if (!searchLower) {
        setResults([])
        setLoadingResults(false)
        return
      }
      setResults([])
      setLoadingResults(true)
      try {
        const res = await getPagedData('productos', {
          orderBy: 'child',
          childKey: searchBy,
          range: { start: searchLower, end: `${searchLower}\uf8ff` },
          limit: 25,
        })
        if (!cancelled) setResults(res.items || [])
      } catch (err) {
        if (!cancelled) setUserSuccess?.(err?.code || err?.message || 'repeat')
      } finally {
        if (!cancelled) setLoadingResults(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [searchBy, searchLower, setUserSuccess])

  const cartItems = useMemo(() => {
    const arr = Object.values(cart || {})
    arr.sort((a, b) => {
      const ap = `${a?.marca || ''} ${a?.modelo || ''} ${a?.nombre || ''}`.trim()
      const bp = `${b?.marca || ''} ${b?.modelo || ''} ${b?.nombre || ''}`.trim()
      const c = ap.localeCompare(bp, undefined, { sensitivity: 'base' })
      if (c) return c
      return String(a?.talla || '').localeCompare(String(b?.talla || ''), undefined, { numeric: true })
    })
    return arr
  }, [cart])

  const cartQtyByProductoLabel = useMemo(() => {
    const map = {}
    for (const it of cartItems) {
      const pid = it?.productoId
      const label = String(it?.talla || '').trim()
      if (!pid || !label) continue
      if (!map[pid]) map[pid] = {}
      map[pid][label] = asNumber(map[pid][label], 0) + asNumber(it?.cantidad, 0)
    }
    return map
  }, [cartItems])

  const totalCartPares = useMemo(() => cartItems.reduce((acc, it) => acc + asNumber(it?.cantidad, 0), 0), [cartItems])

  const stockKeyFor = useCallback(
    (productoId) => `${desdeSucursalId}__${haciaSucursalId}__${String(productoId || '').trim()}`,
    [desdeSucursalId, haciaSucursalId]
  )

  const ensureStockLoaded = useCallback(
    async (productoId) => {
      const pid = String(productoId || '').trim()
      if (!pid) return
      if (!desdeSucursalId || !haciaSucursalId) return

      const key = stockKeyFor(pid)
      if (stockCache[key] || stockLoading[key]) return

      setStockLoading((prev) => ({ ...prev, [key]: true }))
      try {
        const [rawOrigen, rawDestino] = await Promise.all([
          getValue(`inventario/${desdeSucursalId}/${pid}/tallas`),
          getValue(`inventario/${haciaSucursalId}/${pid}/tallas`),
        ])
        const origenByLabel = normalizeTallasByLabel(rawOrigen)
        const destinoByLabel = normalizeTallasByLabel(rawDestino)
        setStockCache((prev) => ({
          ...prev,
          [key]: { origenByLabel, destinoByLabel, cargadoEn: Date.now() },
        }))
      } catch (err) {
        setUserSuccess?.(err?.code || err?.message || 'repeat')
      } finally {
        setStockLoading((prev) => {
          const next = { ...prev }
          delete next[key]
          return next
        })
      }
    },
    [desdeSucursalId, haciaSucursalId, setUserSuccess, stockCache, stockKeyFor, stockLoading]
  )

  const refreshStock = useCallback(
    async (productoId) => {
      const pid = String(productoId || '').trim()
      if (!pid) return
      if (!desdeSucursalId || !haciaSucursalId) return

      const key = stockKeyFor(pid)
      if (stockLoading[key]) return

      setStockLoading((prev) => ({ ...prev, [key]: true }))
      try {
        const [rawOrigen, rawDestino] = await Promise.all([
          getValue(`inventario/${desdeSucursalId}/${pid}/tallas`),
          getValue(`inventario/${haciaSucursalId}/${pid}/tallas`),
        ])
        const origenByLabel = normalizeTallasByLabel(rawOrigen)
        const destinoByLabel = normalizeTallasByLabel(rawDestino)
        setStockCache((prev) => ({
          ...prev,
          [key]: { origenByLabel, destinoByLabel, cargadoEn: Date.now() },
        }))
      } catch (err) {
        setUserSuccess?.(err?.code || err?.message || 'repeat')
      } finally {
        setStockLoading((prev) => {
          const next = { ...prev }
          delete next[key]
          return next
        })
      }
    },
    [desdeSucursalId, haciaSucursalId, setUserSuccess, stockKeyFor, stockLoading]
  )

  useEffect(() => {
    if (!results.length) return
    for (const p of results) {
      const pid = p?.__key
      if (pid) ensureStockLoaded(pid)
    }
  }, [ensureStockLoaded, results])

  useEffect(() => {
    if (!searchLower) {
      setExpandedProductoId('')
      return
    }
    if (!results.length) return
    const hasExpanded = results.some((p) => String(p?.__key || '') === String(expandedProductoId || ''))
    if (!hasExpanded) setExpandedProductoId(String(results[0]?.__key || ''))
  }, [expandedProductoId, results, searchLower])

  // Si cambias las sucursales, el carrito y el cache de stock quedan inconsistentes.
  const prevSucRef = useRef({ desde: '', hacia: '' })
  useEffect(() => {
    const prev = prevSucRef.current
    if (!prev.desde && !prev.hacia) {
      prevSucRef.current = { desde: desdeSucursalId, hacia: haciaSucursalId }
      return
    }
    const changed = (prev.desde && prev.desde !== desdeSucursalId) || (prev.hacia && prev.hacia !== haciaSucursalId)
    if (changed) {
      setCart({})
      setExpandedProductoId('')
      setStockCache({})
      setStockLoading({})
      setTransferenciaId(generateUUID())
      setUserSuccess?.('Se limpió el carrito por cambio de sucursal.')
    }
    prevSucRef.current = { desde: desdeSucursalId, hacia: haciaSucursalId }
  }, [desdeSucursalId, haciaSucursalId, setUserSuccess])

  const toggleExpand = useCallback(
    async (productoId) => {
      const pid = String(productoId || '').trim()
      if (!pid) return
      setExpandedProductoId((prev) => (prev === pid ? '' : pid))
      await ensureStockLoaded(pid)
    },
    [ensureStockLoaded]
  )

  const addOneToCart = useCallback((producto, label, tallaRaw, maxStock) => {
    const pid = String(producto?.__key || '').trim()
    const talla = String(label || '').trim()
    const raw = String(tallaRaw || '').trim()
    const max = asNumber(maxStock, 0)
    if (!pid || !talla || !raw) return

    const key = cartKey(pid, raw)
    setCart((prev) => {
      const current = prev?.[key]
      const nextQty = asNumber(current?.cantidad, 0) + 1
      if (max > 0 && nextQty > max) return prev
      return {
        ...(prev || {}),
        [key]: {
          productoId: pid,
          marca: producto?.marca || '',
          modelo: producto?.modelo || '',
          nombre: producto?.nombre || '',
          talla,
          tallaRaw: raw,
          cantidad: nextQty,
          maxStock: max,
        },
      }
    })
  }, [])

  const removeCartItem = useCallback((key) => {
    setCart((prev) => {
      const next = { ...(prev || {}) }
      delete next[key]
      return next
    })
  }, [])

  const setCartQty = useCallback((key, nextQty) => {
    const qty = Math.max(1, asNumber(nextQty, 1))
    setCart((prev) => {
      const current = prev?.[key]
      if (!current) return prev
      const max = asNumber(current.maxStock, 0)
      const safeQty = max > 0 ? Math.min(qty, max) : qty
      return { ...(prev || {}), [key]: { ...current, cantidad: safeQty } }
    })
  }, [])

  const qtyInCart = useCallback(
    (productoId, tallaRaw) => {
      const key = cartKey(productoId, tallaRaw)
      return asNumber(cart?.[key]?.cantidad, 0)
    },
    [cart]
  )

  const minusOne = useCallback((productoId, tallaRaw) => {
    const pid = String(productoId || '').trim()
    const raw = String(tallaRaw || '').trim()
    if (!pid || !raw) return

    const key = cartKey(pid, raw)
    setCart((prev) => {
      const current = prev?.[key]
      if (!current) return prev
      const nextQty = asNumber(current.cantidad, 0) - 1
      if (nextQty <= 0) {
        const next = { ...(prev || {}) }
        delete next[key]
        return next
      }
      return { ...(prev || {}), [key]: { ...current, cantidad: nextQty } }
    })
  }, [])

  async function confirmarTransferencia() {
    if (!desdeSucursalId || !haciaSucursalId) return setUserSuccess?.('Selecciona sucursales')
    if (desdeSucursalId === haciaSucursalId) return setUserSuccess?.('Sucursal origen y destino no pueden ser iguales')
    if (!cartItems.length) return setUserSuccess?.('noProduct')

    try {
      const creadoEn = Date.now()
      const nextTransferenciaId = generateUUID()
      const groupedItems = groupTransferenciaItems(cartItems)

      setModal('Guardando')
      await solicitarTransferencia({
        transferenciaId,
        idempotencyKey: `transferencia_${transferenciaId}`,
        desdeSucursalId,
        haciaSucursalId,
        usuarioId: user?.uid ?? null,
        items: cartItems.map((it) => ({
          productoId: it.productoId,
          marca: it.marca,
          modelo: it.modelo,
          nombre: it.nombre,
          talla: it.talla,
          tallaRaw: it.tallaRaw,
          cantidad: it.cantidad,
        })),
        nota,
      })
      setTransferenciasDB((prev) => ({
        ...((prev && typeof prev === 'object') ? prev : {}),
        [transferenciaId]: {
          desdeSucursalId,
          haciaSucursalId,
          estado: 'pendiente',
          creadoPorUsuarioId: user?.uid ?? null,
          creadoEn,
          transferidoEn: null,
          transferidoPorUsuarioId: null,
          anuladoEn: null,
          anuladoPorUsuarioId: null,
          anuladoMotivo: null,
          anuladoNota: null,
          nota: nota || null,
          items: groupedItems,
        },
      }))
      setModal('')
      setUserSuccess?.('Se ha guardado correctamente')
      setCart({})
      setSearch('')
      setNota('')
      setTransferenciaId(nextTransferenciaId)
    } catch (err) {
      setModal('')
      setUserSuccess?.(err?.code || err?.message || 'repeat')
    }
  }

  async function marcarTransferido(id) {
    if (!id) return
    try {
      const transferidoEn = Date.now()
      setModal('Transfiriendo')
      await transferirTransferencia({
        transferenciaId: id,
        idempotencyKey: `transferir_${id}`,
        usuarioId: user?.uid ?? null,
      })
      setTransferenciasDB((prev) => {
        const current = prev?.[id]
        if (!current || typeof current !== 'object') return prev
        return {
          ...prev,
          [id]: {
            ...current,
            estado: 'transferido',
            transferidoEn,
            transferidoPorUsuarioId: user?.uid ?? null,
          },
        }
      })
      setModal('')
      setUserSuccess?.('Se ha guardado correctamente')
    } catch (err) {
      setModal('')
      setUserSuccess?.(err?.code || err?.message || 'repeat')
    }
  }

  async function anularPendiente(id) {
    if (!id) return
    const ok = typeof window !== 'undefined' ? window.confirm('Anular esta transferencia pendiente?') : false
    if (!ok) return
    try {
      const anuladoEn = Date.now()
      setModal('Anulando')
      await anularTransferencia({
        transferenciaId: id,
        idempotencyKey: `anular_${id}`,
        usuarioId: user?.uid ?? null,
        motivo: 'anulada_por_usuario',
        nota: null,
      })
      setTransferenciasDB((prev) => {
        const current = prev?.[id]
        if (!current || typeof current !== 'object') return prev
        return {
          ...prev,
          [id]: {
            ...current,
            estado: 'anulada',
            anuladoEn,
            anuladoPorUsuarioId: user?.uid ?? null,
            anuladoMotivo: 'anulada_por_usuario',
            anuladoNota: null,
          },
        }
      })
      setModal('')
      setUserSuccess?.('Transferencia anulada')
    } catch (err) {
      setModal('')
      setUserSuccess?.(err?.code || err?.message || 'repeat')
    }
  }

  const transferenciasArr = useMemo(() => {
    const obj = transferenciasDB && typeof transferenciasDB === 'object' ? transferenciasDB : {}
    return Object.entries(obj)
      .map(([k, v]) => ({ __key: k, ...(v && typeof v === 'object' ? v : {}) }))
      .filter((t) => t?.__key && t?.desdeSucursalId && t?.haciaSucursalId && t?.estado)
  }, [transferenciasDB])

  const transferenciasFiltradas = useMemo(() => {
    const estado = vista === 'transferido' ? 'transferido' : vista === 'anulada' ? 'anulada' : 'pendiente'
    return transferenciasArr
      .filter((t) => String(t.estado) === estado)
      .filter((t) => (admin ? true : mySucursalId ? t.desdeSucursalId === mySucursalId || t.haciaSucursalId === mySucursalId : false))
      .sort((a, b) => Number(b.creadoEn || 0) - Number(a.creadoEn || 0))
  }, [admin, mySucursalId, transferenciasArr, vista])

  useEffect(() => {
    const productIds = Array.from(
      new Set(
        transferenciasFiltradas.flatMap((t) => {
          const items = t?.items && typeof t.items === 'object' ? Object.keys(t.items) : []
          return items.filter(Boolean)
        })
      )
    ).filter((productId) => !Object.prototype.hasOwnProperty.call(transferProductMetaById || {}, productId))

    if (!productIds.length) return

    let cancelled = false

    ;(async () => {
      try {
        const rows = await Promise.all(
          productIds.map(async (productId) => {
            const value = await getValue(`productos/${productId}`)
            return [productId, value && typeof value === 'object' ? value : null]
          })
        )
        if (cancelled) return
        setTransferProductMetaById((prev) => {
          const next = { ...(prev || {}) }
          for (const [productId, value] of rows) next[productId] = value
          return next
        })
      } catch (err) {
        if (!cancelled) setUserSuccess?.(err?.code || err?.message || 'repeat')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [setUserSuccess, transferProductMetaById, transferenciasFiltradas])

  function canTransferir(t) { 
    if (!t) return false 
    if (admin) return t.estado === 'pendiente' 
    if (!mySucursalId) return false 
    // Personal solo puede confirmar/anular transferencias que salen de su sucursal.
    return t.estado === 'pendiente' && String(t.desdeSucursalId) === String(mySucursalId) 
  } 

  function ProductCard({ p }) {
    const pid = String(p?.__key || '').trim()
    if (!pid) return null
    const skey = stockKeyFor(pid)
    const state = stockCache?.[skey] || null
    const loading = Boolean(stockLoading?.[skey])

    const origenByLabel = state?.origenByLabel || null
    const destinoByLabel = state?.destinoByLabel || null
    const labels = state
      ? Array.from(new Set([...Object.keys(origenByLabel || {}), ...Object.keys(destinoByLabel || {})])).sort((a, b) =>
          String(a).localeCompare(String(b), undefined, { numeric: true })
        )
      : []

    return (
      <div className="rounded-3xl bg-surface p-4 shadow-sm ring-1 ring-border/15 transition hover:bg-surface/95">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-text">
              {p?.marca} {p?.modelo}
            </div>
            <div className="truncate text-[12px] text-muted">{p?.nombre}</div>
            <div className="mt-1 text-[11px] text-muted">Codigo: {p?.codigo || '-'}</div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            {p?.precio != null ? (
              <div className="rounded-2xl bg-surface-2/70 px-3 py-1 text-[12px] font-semibold text-text ring-1 ring-border/15">
                {money(p.precio)}
              </div>
            ) : null}
            <button
              type="button"
              className="h-9 rounded-2xl bg-surface-2/70 px-3 text-[12px] font-semibold text-text ring-1 ring-border/15 hover:bg-surface-2/90 disabled:opacity-60"
              onClick={() => refreshStock(pid)}
              disabled={loading || !pid}
              title="Actualizar stock"
            >
              {loading ? '...' : 'Actualizar'}
            </button>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {!state ? (
            <>
              <div className="h-10 w-full rounded-2xl bg-surface-2/70 ring-1 ring-border/10" />
              <div className="h-10 w-full rounded-2xl bg-surface-2/70 ring-1 ring-border/10" />
              <div className="h-10 w-full rounded-2xl bg-surface-2/70 ring-1 ring-border/10" />
            </>
          ) : labels.length === 0 ? (
            <div className="text-[12px] text-muted">Sin stock para transferir.</div>
          ) : (
            labels.map((label) => {
              const origen = origenByLabel?.[label]
              const destino = destinoByLabel?.[label]
              const stockOrigen = asNumber(origen?.stock, 0)
              const stockDestino = asNumber(destino?.stock, 0)

              const rawKey = String(origen?.key || '').trim()
              const qty = rawKey ? qtyInCart(pid, rawKey) : 0
              const maxed = stockOrigen > 0 && qty >= stockOrigen
              const labelT = String(label).trim()

              if (stockOrigen <= 0) {
                return (
                  <button
                    key={label}
                    type="button"
                    className="inline-flex h-10 w-full items-center justify-between gap-2 rounded-2xl px-3 text-[12px] font-semibold ring-1 transition bg-surface-2/70 text-muted ring-border/10 opacity-70"
                    disabled
                    title="Sin stock en origen"
                  >
                    <span className="text-text">T{labelT}</span>
                    <span className="text-muted">{stockOrigen}</span>
                    <span className="text-muted">D {stockDestino}</span>
                    <span className="ml-auto text-[11px] text-muted">x{qty || 0}</span>
                  </button>
                )
              }

              return (
                <div
                  key={label}
                  className="grid h-10 w-full grid-cols-[40px_1fr_40px] overflow-hidden rounded-2xl bg-surface text-text shadow-sm ring-1 ring-border/15"
                >
                  <button
                    type="button"
                    className="inline-flex items-center justify-center bg-surface-2/70 text-[16px] font-bold text-text transition hover:bg-surface-2/90 active:scale-[0.98] disabled:opacity-50"
                    aria-label="Restar 1"
                    title="Restar 1"
                    disabled={qty <= 0}
                    onClick={() => minusOne(pid, rawKey)}
                  >
                    -
                  </button>

                  <button
                    type="button"
                    className="flex min-w-0 items-center gap-2 px-3 text-[12px] font-semibold transition hover:bg-surface-2/60 disabled:cursor-not-allowed disabled:opacity-70"
                    disabled={maxed || desdeSucursalId === haciaSucursalId}
                    title={maxed ? 'Maximo alcanzado' : 'Toca para sumar 1'}
                    onClick={() => addOneToCart(p, labelT, rawKey, stockOrigen)}
                  >
                    <span className="text-text">T{labelT}</span>
                    <span className="text-muted">{stockOrigen}</span>
                    <span className="text-muted">D {stockDestino}</span>
                    {qty > 0 ? (
                      <span className="ml-auto rounded-xl bg-surface-2/80 px-2 py-0.5 text-[11px] text-text ring-1 ring-border/15">x{qty}</span>
                    ) : (
                      <span className="ml-auto text-[11px] text-muted">x0</span>
                    )}
                    {maxed ? <span className="text-[11px] text-amber-400">Max</span> : null}
                  </button>

                  <button
                    type="button"
                    className="inline-flex items-center justify-center bg-surface-2/70 text-[16px] font-bold text-text transition hover:bg-surface-2/90 active:scale-[0.98] disabled:opacity-50"
                    aria-label="Sumar 1"
                    title="Sumar 1"
                    disabled={maxed || desdeSucursalId === haciaSucursalId}
                    onClick={() => addOneToCart(p, labelT, rawKey, stockOrigen)}
                  >
                    +
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>
    )
  }
 
  return ( 
    <DataPanel 
      title="Transferencias" 
      subtitle="Solicita transferencias de stock entre sucursales (auditables)." 
    >
      {modal ? <LoaderBlack>{modal}</LoaderBlack> : null}

      <div className="p-5 space-y-6">
        <div className="grid gap-5 lg:grid-cols-5">
          <div className="lg:col-span-3 rounded-3xl bg-surface/40 p-5 ring-1 ring-border/20 backdrop-blur">
            <div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[13px] font-semibold text-text">Buscar</div>
                  <div className="text-[12px] text-muted">Busca y arma la transferencia por talla.</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-[12px] font-semibold text-muted">Filtrar por</div>
                  <select
                    className="h-9 rounded-2xl bg-surface/60 px-3 text-[12px] font-semibold text-text ring-1 ring-border/20 shadow-sm outline-none transition hover:bg-surface/95 focus:ring-2 focus:ring-accent/25"
                    value={searchBy}
                    onChange={(e) => setSearchBy(e.target.value)}
                  >
                    <option value="marcaLower">Marca</option>
                    <option value="modeloLower">Modelo</option>
                    <option value="nombreLower">Nombre</option>
                    <option value="codigoLower">Codigo</option>
                  </select>
                </div>
              </div>

              <div className="relative mt-2">
                <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
                    <path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" stroke="currentColor" strokeWidth="2" />
                    <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
                <input
                  ref={searchRef}
                  className={`${inputClass()} pl-10 pr-20`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={searchPlaceholder}
                />
                {search ? (
                  <button
                    type="button"
                    className="absolute inset-y-0 right-2 inline-flex items-center justify-center rounded-xl px-2 text-[12px] font-semibold text-muted hover:bg-surface/50 hover:text-text"
                    onClick={() => setSearch('')}
                  >
                    Limpiar
                  </button>
                ) : null}
              </div>

              <div className="mt-2 flex items-center justify-between gap-3 text-[12px] text-muted">
                <div className="truncate">
                  {searchLower ? `${results.length} resultados (por ${searchByLabel})` : 'Escribe para buscar.'}
                </div>
                <div className="hidden sm:block truncate">Usa (-) y (+) en cada talla para ajustar.</div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-[12px] font-semibold text-muted">Sucursal origen</div>
                {personal ? (
                  <select className={`${inputClass()} mt-2`} value={desdeSucursalId} onChange={(e) => setDesdeSucursalId(e.target.value)}>
                    {sucursalesArr
                      .filter((s) => s.uuid && s.uuid !== mySucursalId)
                      .map((s) => (
                        <option key={s.uuid} value={s.uuid}>
                          {s.nombre}
                        </option>
                      ))}
                  </select>
                ) : (
                  <select className={`${inputClass()} mt-2`} value={desdeSucursalId} onChange={(e) => setDesdeSucursalId(e.target.value)}>
                    {sucursalesArr.map((s) => (
                      <option key={s.uuid} value={s.uuid}>
                        {s.nombre}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <div className="text-[12px] font-semibold text-muted">Sucursal destino</div>
                {personal ? (
                  <div className="mt-2 rounded-2xl bg-surface/50 px-4 py-3 text-sm text-text ring-1 ring-border/15">
                    {sucursalNameById[haciaSucursalId] || haciaSucursalId}
                  </div>
                ) : (
                  <select className={`${inputClass()} mt-2`} value={haciaSucursalId} onChange={(e) => setHaciaSucursalId(e.target.value)}>
                    {sucursalesArr.map((s) => (
                      <option key={s.uuid} value={s.uuid}>
                        {s.nombre}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="mt-4">
              <div className="text-[12px] font-semibold text-muted">Nota (opcional)</div>
              <input className={`${inputClass()} mt-2`} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: reposición urgente" />
            </div>

            {desdeSucursalId && haciaSucursalId && desdeSucursalId === haciaSucursalId ? (
              <div className="mt-4 rounded-2xl bg-amber-500/10 px-4 py-3 text-[12px] text-amber-300 ring-1 ring-amber-500/20">
                Origen y destino no pueden ser iguales.
              </div>
            ) : null}

            <div className="mt-4" data-transfer-productos>
              {!searchLower ? (
                <div className="rounded-2xl bg-surface/30 px-4 py-3 text-[12px] text-muted ring-1 ring-border/15">
                  Empieza buscando un producto.
                </div>
              ) : ( 
                <> 
                  {loadingResults ? ( 
                    <div className="rounded-2xl bg-surface/30 px-4 py-3 text-[12px] text-muted ring-1 ring-border/15"> 
                      Buscando... 
                    </div> 
                  ) : results.length === 0 ? ( 
                    <div className="rounded-2xl bg-surface/30 px-4 py-3 text-[12px] text-muted ring-1 ring-border/15"> 
                      Sin resultados. 
                    </div> 
                  ) : ( 
                    <div className="space-y-3"> 
                      {results.map((p) => ( 
                        <ProductCard key={p.__key} p={p} /> 
                      ))} 
                    </div> 
                  )} 
 
                  {false && ( 
                    <Table minWidth={900}> 
                <THead> 
                  <tr> 
                    <th className="px-3 py-3 w-[60px]">Ver</th> 
                    <th className="px-3 py-3">Producto</th> 
                    <th className="px-3 py-3">Codigo</th>
                    <th className="px-3 py-3 text-center">Accion</th>
                  </tr>
                </THead>
                <tbody>
                  {loadingResults && results.length === 0 ? (
                    <tr>
                      <td className="px-3 py-6 text-center text-sm text-muted" colSpan={4}>
                        Cargando...
                      </td>
                    </tr>
                  ) : results.length === 0 ? (
                    <tr>
                      <td className="px-3 py-6 text-center text-sm text-muted" colSpan={4}>
                        Sin resultados.
                      </td>
                    </tr>
                  ) : (
                    results.map((p) => {
                      const pid = p.__key
                      const expanded = expandedProductoId === pid
                      const skey = stockKeyFor(pid)
                      const cache = stockCache[skey]
                      const loading = Boolean(stockLoading[skey])

                      const origenName = sucursalNameById[desdeSucursalId] || desdeSucursalId
                      const destinoName = sucursalNameById[haciaSucursalId] || haciaSucursalId

                      const cartLabels = cartQtyByProductoLabel?.[pid] ? Object.keys(cartQtyByProductoLabel[pid]) : []
                      const tallasUnion = cache
                        ? Array.from(
                            new Set([
                              ...Object.keys(cache.origenByLabel || {}),
                              ...Object.keys(cache.destinoByLabel || {}),
                              ...cartLabels,
                            ])
                          ).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }))
                        : []

                      return (
                        <Fragment key={pid}>
                          <tr className="border-b border-transparent odd:bg-surface/20">
                            <td className="px-3 py-3 text-sm text-text">
                              <button
                                type="button"
                                className="h-9 w-9 rounded-xl bg-surface/60 text-[14px] font-bold text-text ring-1 ring-border/15 hover:bg-surface"
                                onClick={() => toggleExpand(pid)}
                                aria-label={expanded ? 'Ocultar stock' : 'Ver stock'}
                              >
                                {expanded ? '-' : '+'}
                              </button>
                            </td>
                            <td className="px-3 py-3 text-sm text-text">
                              <div className="font-semibold">
                                {p.marca} {p.modelo}
                              </div>
                              <div className="text-muted">{p.nombre}</div>
                            </td>
                            <td className="px-3 py-3 text-sm text-text">{p.codigo || '-'}</td>
                            <td className="px-3 py-3 text-center">
                              <button
                                type="button"
                                className="h-9 rounded-xl bg-surface/60 px-3 text-[12px] font-semibold text-text ring-1 ring-border/15 hover:bg-surface"
                                onClick={() => toggleExpand(pid)}
                              >
                                {expanded ? 'Ocultar' : 'Ver stock'}
                              </button>
                            </td>
                          </tr>

                          {expanded ? (
                            <tr className="border-b border-transparent">
                              <td className="px-3 pb-4" colSpan={4}>
                                <div className="rounded-2xl bg-surface/30 p-4 ring-1 ring-border/15">
                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                      <div className="text-[12px] font-semibold text-text">Stock por talla</div>
                                      <div className="text-[11px] text-muted">
                                        Origen: <span className="text-text">{origenName}</span> - Destino:{' '}
                                        <span className="text-text">{destinoName}</span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        className="h-9 rounded-xl bg-surface/60 px-3 text-[12px] font-semibold text-text ring-1 ring-border/15 hover:bg-surface disabled:opacity-50"
                                        onClick={() => refreshStock(pid)}
                                        disabled={loading}
                                      >
                                        Actualizar
                                      </button>
                                      <div className="text-[11px] text-muted">
                                        {cache?.cargadoEn ? `Actualizado: ${new Date(cache.cargadoEn).toLocaleString()}` : ''}
                                      </div>
                                    </div>
                                  </div>

                                  {!desdeSucursalId || !haciaSucursalId ? (
                                    <div className="mt-3 text-[12px] text-muted">Selecciona sucursales.</div>
                                  ) : loading && !cache ? (
                                    <div className="mt-3 text-[12px] text-muted">Cargando stock...</div>
                                  ) : !cache ? (
                                    <div className="mt-3 text-[12px] text-muted">Sin datos de stock. Presiona "Actualizar".</div>
                                  ) : tallasUnion.length === 0 ? (
                                    <div className="mt-3 text-[12px] text-muted">Sin stock en origen/destino para este producto.</div>
                                  ) : (
                                    <div className="mt-3 space-y-2">
                                      {tallasUnion.map((label) => {
                                        const origen = cache.origenByLabel?.[label]
                                        const destino = cache.destinoByLabel?.[label]
                                        const stockOrigen = asNumber(origen?.stock, 0)
                                        const stockDestino = asNumber(destino?.stock, 0)

                                        const rawKey = String(origen?.key || '').trim()
                                        const qty = rawKey ? qtyInCart(pid, rawKey) : 0
                                        const maxed = stockOrigen > 0 && qty >= stockOrigen
                                        const labelT = String(label).trim()

                                        if (stockOrigen <= 0) {
                                          return (
                                            <button
                                              key={label}
                                              type="button"
                                              className="inline-flex h-10 w-full items-center justify-between gap-2 rounded-2xl px-3 text-[12px] font-semibold ring-1 transition bg-surface-2/70 text-muted ring-border/10 opacity-70"
                                              disabled
                                              title="Sin stock en origen"
                                            >
                                              <span className="text-text">T{labelT}</span>
                                              <span className="text-muted">O {stockOrigen}</span>
                                              <span className="text-muted">D {stockDestino}</span>
                                              <span className="ml-auto text-[11px] text-muted">x{qty || 0}</span>
                                            </button>
                                          )
                                        }

                                        return (
                                          <div
                                            key={label}
                                            className="grid h-10 w-full grid-cols-[40px_1fr_40px] overflow-hidden rounded-2xl bg-surface text-text shadow-sm ring-1 ring-border/15"
                                          >
                                            <button
                                              type="button"
                                              className="inline-flex items-center justify-center bg-surface-2/70 text-[16px] font-bold text-text transition hover:bg-surface-2/90 active:scale-[0.98] disabled:opacity-50"
                                              aria-label="Restar 1"
                                              title="Restar 1"
                                              disabled={qty <= 0}
                                              onClick={() => minusOne(pid, rawKey)}
                                            >
                                              -
                                            </button>

                                            <button
                                              type="button"
                                              className="flex min-w-0 items-center gap-2 px-3 text-[12px] font-semibold transition hover:bg-surface-2/60 disabled:cursor-not-allowed disabled:opacity-70"
                                              disabled={maxed || desdeSucursalId === haciaSucursalId}
                                              title={maxed ? 'Maximo alcanzado' : 'Toca para sumar 1'}
                                              onClick={() => addOneToCart(p, labelT, rawKey, stockOrigen)}
                                            >
                                              <span className="text-text">T{labelT}</span>
                                              <span className="text-muted">O {stockOrigen}</span>
                                              <span className="text-muted">D {stockDestino}</span>
                                              {qty > 0 ? (
                                                <span className="ml-auto rounded-xl bg-surface-2/80 px-2 py-0.5 text-[11px] text-text ring-1 ring-border/15">
                                                  x{qty}
                                                </span>
                                              ) : (
                                                <span className="ml-auto text-[11px] text-muted">x0</span>
                                              )}
                                              {maxed ? <span className="text-[11px] text-amber-400">Max</span> : null}
                                            </button>

                                            <button
                                              type="button"
                                              className="inline-flex items-center justify-center bg-surface-2/70 text-[16px] font-bold text-text transition hover:bg-surface-2/90 active:scale-[0.98] disabled:opacity-50"
                                              aria-label="Sumar 1"
                                              title="Sumar 1"
                                              disabled={maxed || desdeSucursalId === haciaSucursalId}
                                              onClick={() => addOneToCart(p, labelT, rawKey, stockOrigen)}
                                            >
                                              +
                                            </button>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div> 
                              </td> 
                            </tr> 
                          ) : null} 
                        </Fragment>
                      )
                    })
                  )}
                </tbody> 
              </Table> 
                  )} 
                </> 
              )} 
            </div> 
          </div> 

          <div className="lg:col-span-2 rounded-3xl bg-surface/40 p-5 ring-1 ring-border/20 backdrop-blur" data-transfer-carrito>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[13px] font-semibold text-text">Carrito</div>
                <div className="text-[12px] text-muted">
                  {cartItems.length} items - <span className="text-text font-semibold">{totalCartPares}</span> pares
                </div>
                <div className="mt-1 text-[11px] text-muted">Ref: {transferenciaId.slice(0, 8)}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="h-10 rounded-2xl bg-surface/60 px-4 text-[12px] font-semibold text-text ring-1 ring-border/15 hover:bg-surface disabled:opacity-50"
                  disabled={!cartItems.length}
                  onClick={() => setCart({})}
                >
                  Vaciar
                </button>
                <Button theme="Primary" styled="whitespace-nowrap" click={confirmarTransferencia}>
                  Enviar solicitud
                </Button>
              </div>
            </div>

            <div className="mt-4">
              <Table minWidth={650}>
                <THead>
                  <tr>
                    <th className="px-3 py-3">Producto</th>
                    <th className="px-3 py-3">Talla</th>
                    <th className="px-3 py-3 text-right">Cantidad</th>
                    <th className="px-3 py-3 text-center">Accion</th>
                  </tr>
                </THead>
                <tbody>
                  {cartItems.length === 0 ? (
                    <tr>
                      <td className="px-3 py-6 text-center text-sm text-muted" colSpan={4}>
                        Sin items. Expande un producto y agrega por talla.
                      </td>
                    </tr>
                  ) : (
                    cartItems.map((it) => {
                      const key = cartKey(it.productoId, it.tallaRaw)
                      const max = asNumber(it.maxStock, 0)
                      return (
                        <tr key={key} className="border-b border-transparent odd:bg-surface/20">
                          <td className="px-3 py-3 text-sm text-text">
                            <div className="font-semibold">
                              {it.marca} {it.modelo}
                            </div>
                            <div className="text-muted">{it.nombre}</div>
                          </td>
                          <td className="px-3 py-3 text-sm text-text">{it.talla}</td> 
                          <td className="px-3 py-3 text-sm text-text text-right"> 
                            <div className="flex items-center justify-end">
                              <Stepper
                                value={it.cantidad}
                                disableMinus={asNumber(it.cantidad, 0) <= 1}
                                disablePlus={max > 0 && asNumber(it.cantidad, 0) >= max}
                                onMinus={() => setCartQty(key, asNumber(it.cantidad, 1) - 1)}
                                onPlus={() => setCartQty(key, asNumber(it.cantidad, 0) + 1)}
                              />
                            </div>
                            {max > 0 ? <div className="mt-1 text-[11px] text-muted">Max: {max}</div> : null} 
                          </td> 
                          <td className="px-3 py-3 text-center">
                            <button
                              type="button"
                              className="h-9 rounded-xl bg-surface/60 px-3 text-[12px] font-semibold text-text ring-1 ring-border/15 hover:bg-surface"
                              onClick={() => removeCartItem(key)}
                            >
                              Quitar
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </Table>
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-surface/30 p-4 ring-1 ring-border/15" data-transfer-historial>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[13px] font-semibold text-text">Historial</div>
              <div className="text-[12px] text-muted">
                {admin ? 'Todas las sucursales' : mySucursalId ? 'Solo tu sucursal' : 'Sin sucursal asignada'}
              </div>
            </div>
            <div className="flex rounded-2xl bg-surface/40 p-1 ring-1 ring-border/15">
              <button
                type="button"
                className={`px-3 py-2 text-[12px] font-semibold ${vista === 'pendiente' ? 'text-text' : 'text-muted'} rounded-2xl hover:bg-surface/60`}
                onClick={() => setVista('pendiente')}
              >
                Pendientes
              </button>
              <button
                type="button"
                className={`px-3 py-2 text-[12px] font-semibold ${vista === 'transferido' ? 'text-text' : 'text-muted'} rounded-2xl hover:bg-surface/60`}
                onClick={() => setVista('transferido')}
              >
                Transferidas
              </button>
              <button
                type="button"
                className={`px-3 py-2 text-[12px] font-semibold ${vista === 'anulada' ? 'text-text' : 'text-muted'} rounded-2xl hover:bg-surface/60`}
                onClick={() => setVista('anulada')}
              >
                Anuladas
              </button>
            </div>
          </div>

          <div className="mt-4">
            <Table minWidth={900}>
              <THead>
                <tr>
                  <th className="px-3 py-3">ID</th>
                  <th className="px-3 py-3">Origen</th>
                  <th className="px-3 py-3">Destino</th>
                  <th className="px-3 py-3">Items</th>
                  <th className="px-3 py-3">Creado</th>
                  <th className="px-3 py-3">Estado</th>
                  <th className="px-3 py-3 text-center">Accion</th>
                </tr>
              </THead>
              <tbody>
                {transferenciasDB === undefined ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-sm text-muted" colSpan={7}>
                      Cargando...
                    </td>
                  </tr>
                ) : transferenciasFiltradas.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-sm text-muted" colSpan={7}>
                      Sin transferencias.
                    </td>
                  </tr>
                ) : (
                  transferenciasFiltradas.map((t) => {
                    const id = t.__key
                    const { productos, pares } = countItems(t.items)
                    const parsed = summarizeTransferItems(t.items, transferProductMetaById)
                    const creadoEn = Number(t.creadoEn || 0)
                    return (
                      <tr key={id} className="border-b border-transparent odd:bg-surface/20">
                        <td className="px-3 py-3 text-sm text-text">{id.slice(0, 8)}</td>
                        <td className="px-3 py-3 text-sm text-text">{sucursalNameById[t.desdeSucursalId] || t.desdeSucursalId}</td>
                        <td className="px-3 py-3 text-sm text-text">{sucursalNameById[t.haciaSucursalId] || t.haciaSucursalId}</td>
                        <td className="px-3 py-3 text-sm text-text">
                          <div>
                            <span className="font-semibold">{pares}</span> pares <span className="text-muted">- {productos} productos</span>
                          </div>
                          {parsed.productRows.length ? (
                            <div className="mt-2 space-y-1">
                              {parsed.productRows.map((row) => (
                                <div key={`${id}_${row.productId}`} className="text-[12px] leading-5 text-muted">
                                  <span className="font-semibold text-text">{row.label}</span>
                                  <span>{`: ${row.lines}`}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 text-sm text-muted">{creadoEn ? new Date(creadoEn).toLocaleString() : '-'}</td>
                        <td className="px-3 py-3 text-sm">
                          <span
                            className={
                              t.estado === 'transferido' ? 'text-emerald-500' : t.estado === 'anulada' ? 'text-red-500' : 'text-amber-500'
                            }
                          >
                            {t.estado}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {canTransferir(t) ? (
                            <div className="flex items-center justify-center gap-2">
                              <Button theme="Primary" styled="text-xs px-3 py-2" click={() => marcarTransferido(id)}>
                                Marcar transferido
                              </Button>
                              <Button theme="Danger" styled="text-xs px-3 py-2" click={() => anularPendiente(id)}>
                                Anular
                              </Button>
                            </div>
                          ) : (
                            <span className="text-sm text-muted">-</span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </Table>
          </div>
        </div>
      </div>
    </DataPanel>
  )
}
