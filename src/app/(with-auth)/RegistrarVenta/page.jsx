'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import DataPanel from '@/components/DataPanel'
import Button from '@/components/Button'
import BottomSheet from '@/components/BottomSheet'
import Drawer from '@/components/Drawer'
import LoaderBlack from '@/components/LoaderBlack'
import { useUser } from '@/context'
import { getPagedData, getValue, readUserData } from '@/firebase/database'
import { registrarVenta, solicitarTransferencia } from '@/firebase/ops'
import { lower } from '@/lib/string'
import { isAdmin, isPersonal } from '@/lib/roles'
import { generateUUID } from '@/utils/UIDgenerator'

function inputClass() {
  return 'h-10 w-full rounded-2xl bg-surface px-4 text-sm text-text placeholder:text-muted ring-1 ring-border/20 shadow-sm outline-none focus:ring-2 focus:ring-accent/25'
}

function asNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function safeId(value) {
  return String(value || '').trim()
}

function money(n) {
  return new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 }).format(asNumber(n, 0))
}

function cartKey(productoId, talla) {
  return `${productoId}__${talla}`
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

function MetodoPagoToggle({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 rounded-2xl bg-surface-2/70 p-1 ring-1 ring-border/15">
      <button
        type="button"
        className={`inline-flex items-center justify-center gap-2 rounded-2xl px-3 py-2 text-[12px] font-semibold transition ${value === 'efectivo' ? 'bg-surface text-text shadow-sm ring-1 ring-border/20' : 'text-muted hover:bg-surface/70 hover:text-text'
          }`}
        onClick={() => onChange('efectivo')}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
          <path d="M4 7h16v10H4V7Z" stroke="currentColor" strokeWidth="2" />
          <path d="M7 10h3M7 14h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M15 12a2 2 0 1 0 0.01 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Efectivo
      </button>
      <button
        type="button"
        className={`inline-flex items-center justify-center gap-2 rounded-2xl px-3 py-2 text-[12px] font-semibold transition ${value === 'qr' ? 'bg-surface text-text shadow-sm ring-1 ring-border/20' : 'text-muted hover:bg-surface/70 hover:text-text'
          }`}
        onClick={() => onChange('qr')}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
          <path d="M4 4h6v6H4V4ZM14 4h6v6h-6V4ZM4 14h6v6H4v-6Z" stroke="currentColor" strokeWidth="2" />
          <path d="M14 14h2v2h-2v-2ZM18 14h2v2h-2v-2ZM14 18h2v2h-2v-2ZM18 18h2v2h-2v-2Z" fill="currentColor" />
        </svg>
        QR
      </button>
    </div>
  )
}

function PaymentQRCode({ url, sucursalName }) {
  const displayName = sucursalName ? `de ${sucursalName}` : 'de la sucursal'

  return (
    <div className="mt-4 flex flex-col items-center gap-2 rounded-3xl border border-border/30 bg-white/90 p-4 text-center shadow-sm">
      <div className="text-[12px] font-semibold text-text">Escanea el QR {displayName}</div>
      {url ? (
        <div className="flex h-44 w-44 items-center justify-center overflow-hidden rounded-3xl border border-border/30 bg-white/80 p-3 shadow-inner">
          <img src={url} alt={`QR ${displayName}`} className="h-full w-full object-contain" />
        </div>
      ) : (
        <div className="flex h-32 w-32 items-center justify-center rounded-2xl border border-border/40 bg-surface/50 text-[12px] text-muted">
          QR no disponible
        </div>
      )}
      <p className="text-[11px] text-muted">
        Abre la app de pagos QR y apunta la cámara a este código para enviar el pago directamente a la sucursal.
      </p>
    </div>
  )
}

export default function Page() {
  const { user, userDB, sucursales, setSucursales, modal, setModal, setUserSuccess } = useUser()

  const admin = isAdmin(userDB)
  const personal = isPersonal(userDB)
  const mySucursalId = safeId(userDB?.sucursalId)

  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const [ventaId, setVentaId] = useState(() => generateUUID())
  const [sucursalId, setSucursalId] = useState('')
  const activeSucursalId = personal && mySucursalId ? mySucursalId : sucursalId

  const [metodoPago, setMetodoPago] = useState('efectivo') // 'efectivo' | 'qr'
  const [cartOpen, setCartOpen] = useState(false)

  const searchRef = useRef(null)
  const [searchBy, setSearchBy] = useState('marcaLower') // 'nombreLower' | 'marcaLower' | 'modeloLower'
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [results, setResults] = useState([])

  const [stockCache, setStockCache] = useState({}) // { [productoId]: { loading: bool, tallas: { [talla]: stock } } }
  const stockCacheRef = useRef({})
  useEffect(() => {
    stockCacheRef.current = stockCache
  }, [stockCache])

  const [cart, setCart] = useState({}) // { [key]: { productoId, talla, cantidad, precioUnitario, precioRef, marca, modelo, nombre, maxStock } }

  const [drawer, setDrawer] = useState(null) // { producto, talla, stockBySucursal, sucursalSel, cantidadSel, max }
  const confirmingRef = useRef(false)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (sucursales !== undefined) return
    const unsub = readUserData('sucursales', setSucursales, undefined, (err) => setUserSuccess?.(err?.code || err?.message || 'repeat'))
    return () => (typeof unsub === 'function' ? unsub() : null)
  }, [setSucursales, setUserSuccess, sucursales])

  const sucursalesArr = useMemo(() => {
    const arr = sucursales && typeof sucursales === 'object' ? Object.values(sucursales) : []
    return arr.filter((s) => s?.uuid && s?.nombre)
  }, [sucursales])

  const sucursalNameById = useMemo(() => {
    const map = {}
    for (const s of sucursalesArr) map[s.uuid] = s.nombre
    return map
  }, [sucursalesArr])

  const activeSucursal = useMemo(() => {
    if (!sucursales || typeof sucursales !== 'object') return null
    return sucursales[activeSucursalId] || null
  }, [activeSucursalId, sucursales])
  const sucursalQrUrl = activeSucursal?.qrUrl || null
  const activeSucursalName = activeSucursal?.nombre || sucursalNameById[activeSucursalId] || ''

  useEffect(() => {
    if (!sucursalesArr.length) return
    if (personal && mySucursalId) {
      if (sucursalId !== mySucursalId) setSucursalId(mySucursalId)
      return
    }
    if (!sucursalId && sucursalesArr[0]?.uuid) setSucursalId(sucursalesArr[0].uuid)
  }, [mySucursalId, personal, sucursalId, sucursalesArr])

  useEffect(() => {
    setSearch('')
    setResults([])
    setStockCache({})
    setCart({})
    setDrawer(null)
    setCartOpen(false)
  }, [activeSucursalId])

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 200)
    return () => clearTimeout(t)
  }, [search])

  const searchByLabel =
    searchBy === 'marcaLower' ? 'marca' : searchBy === 'modeloLower' ? 'modelo' : searchBy === 'codigoLower' ? 'codigo' : 'nombre'
  const searchPlaceholder =
    searchBy === 'marcaLower'
      ? 'Buscar por marca...'
      : searchBy === 'modeloLower'
        ? 'Buscar por modelo...'
        : searchBy === 'codigoLower'
          ? 'Buscar por codigo...'
          : 'Buscar por nombre...'

  const searchLower = lower(searchDebounced).trim()

  useEffect(() => {
    let cancelled = false
      ; (async () => {
        if (!searchLower) return setResults([])
        try {
          const res = await getPagedData('productos', {
            orderBy: 'child',
            childKey: searchBy,
            range: { start: searchLower, end: `${searchLower}\uf8ff` },
            limit: 20,
          })
          if (!cancelled) setResults(res.items || [])
        } catch (err) {
          if (!cancelled) setUserSuccess?.(err?.code || err?.message || 'repeat')
        }
      })()
    return () => {
      cancelled = true
    }
  }, [searchLower, searchBy, setUserSuccess])

  useEffect(() => {
    if (!activeSucursalId) return
    let cancelled = false
      ; (async () => {
        for (const p of results || []) {
          if (cancelled) return
          const pid = safeId(p?.__key)
          if (!pid) continue
          await loadStock(pid)
        }
      })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSucursalId, results])

  useEffect(() => {
    const t = setTimeout(() => searchRef.current?.focus?.(), 80)
    return () => clearTimeout(t)
  }, [])

  const cartItems = useMemo(() => Object.values(cart || {}), [cart])

  const cartQtyTotal = useMemo(() => {
    return cartItems.reduce((acc, it) => acc + asNumber(it.cantidad, 0), 0)
  }, [cartItems])

  const total = useMemo(() => {
    return cartItems.reduce((acc, it) => acc + asNumber(it.cantidad, 0) * asNumber(it.precioUnitario, 0), 0)
  }, [cartItems])

  async function loadStock(productoId) {
    const pid = safeId(productoId)
    if (!pid || !activeSucursalId) return

    const cur = stockCacheRef.current?.[pid]
    if (cur?.loading || cur?.tallas) return

    setStockCache((prev) => ({ ...(prev || {}), [pid]: { loading: true, tallas: null, tallasMap: null } }))
    try {
      const raw = (await getValue(`inventario/${activeSucursalId}/${pid}/tallas`)) || {}
      const tallas = {}
      const tallasMap = {}
      for (const [t, q] of Object.entries(raw)) {
        const rawKey = String(t ?? '')
        const label = rawKey.trim()
        if (!label) continue
        const qty = asNumber(q, 0)
        // Si existen llaves duplicadas por espacios (ej: "40" y "40 "), usamos la que tenga mayor stock.
        // Esto evita que el UI muestre stock de una llave pero el descuento intente otra.
        if (tallas[label] === undefined || qty > tallas[label]) {
          tallas[label] = qty
          tallasMap[label] = rawKey
        }
      }
      setStockCache((prev) => ({ ...(prev || {}), [pid]: { loading: false, tallas, tallasMap } }))
    } catch (err) {
      setStockCache((prev) => ({ ...(prev || {}), [pid]: { loading: false, tallas: {}, tallasMap: {} } }))
    }
  }

  function qtyInCart(productoId, talla) {
    return asNumber(cart?.[cartKey(productoId, talla)]?.cantidad, 0)
  }

  function setPrecioUnitarioItem(productoId, talla, nextPrice) {
    const pid = safeId(productoId)
    const t = String(talla ?? '')
    if (!pid) return
    if (!t.trim()) return
    const price = Math.max(0, asNumber(nextPrice, 0))

    setCart((prev) => {
      const key = cartKey(pid, t)
      const cur = prev?.[key]
      if (!cur) return prev
      const before = asNumber(cur?.precioUnitario, 0)
      if (before === price) return prev
      return { ...(prev || {}), [key]: { ...cur, precioUnitario: price } }
    })
  }

  function setPrecioUnitarioProducto(productoId, nextPrice) {
    const pid = safeId(productoId)
    if (!pid) return
    const price = Math.max(0, asNumber(nextPrice, 0))

    setCart((prev) => {
      const current = prev || {}
      let changed = false
      const next = { ...current }
      for (const [key, it] of Object.entries(current)) {
        if (safeId(it?.productoId) !== pid) continue
        const before = asNumber(it?.precioUnitario, 0)
        if (before === price) continue
        next[key] = { ...(it || {}), precioUnitario: price }
        changed = true
      }
      return changed ? next : prev
    })
  }

  function addOne(producto, talla, stock, tallaRaw) {
    const pid = safeId(producto?.__key)
    const t = String(talla ?? '')
    const raw = String(tallaRaw ?? talla ?? '')
    const max = asNumber(stock, 0)
    if (!pid || !t.trim()) return
    if (max <= 0) return

    setCart((prev) => {
      const key = cartKey(pid, t)
      const cur = prev?.[key]
      const nextQty = asNumber(cur?.cantidad, 0) + 1
      if (nextQty > max) return prev

      const precioRef = asNumber(cur?.precioRef ?? producto?.precio, 0)
      const precioUnitario = asNumber(cur?.precioUnitario ?? precioRef, 0)

      return {
        ...(prev || {}),
        [key]: {
          productoId: pid,
          talla: t,
          cantidad: nextQty,
          precioUnitario,
          precioRef,
          marca: producto?.marca ?? cur?.marca,
          modelo: producto?.modelo ?? cur?.modelo,
          nombre: producto?.nombre ?? cur?.nombre,
          maxStock: max,
          tallaRaw: cur?.tallaRaw ?? raw,
        },
      }
    })
  }

  function changeCartItem(it, delta) {
    const pid = safeId(it?.productoId)
    const t = String(it?.talla ?? '')
    const d = asNumber(delta, 0)
    if (!pid || !t.trim() || d === 0) return

    setCart((prev) => {
      const key = cartKey(pid, t)
      const cur = prev?.[key]
      const nextQty = asNumber(cur?.cantidad, 0) + d
      if (nextQty <= 0) {
        const next = { ...(prev || {}) }
        delete next[key]
        return next
      }
      const max = asNumber(cur?.maxStock, 0)
      if (max > 0 && nextQty > max) return prev
      return { ...(prev || {}), [key]: { ...cur, cantidad: nextQty } }
    })
  }

  function removeItem(it) {
    const pid = safeId(it?.productoId)
    const t = String(it?.talla ?? '')
    if (!pid || !t.trim()) return
    setCart((prev) => {
      const next = { ...(prev || {}) }
      delete next[cartKey(pid, t)]
      return next
    })
  }

  async function openSolicitud(producto, talla) {
    if (!personal || !mySucursalId) return
    const productoId = safeId(producto?.__key)
    const t = String(talla ?? '')
    if (!productoId || !t.trim()) return

    const others = sucursalesArr.filter((s) => s.uuid && s.uuid !== mySucursalId)
    if (!others.length) return setUserSuccess?.('No hay otras sucursales')

    setDrawer({ producto, talla: t, stockBySucursal: null, sucursalSel: '', cantidadSel: 1, max: 0 })
    try {
      const pairs = await Promise.all(
        others.map(async (s) => {
          const val = await getValue(`inventario/${s.uuid}/${productoId}/tallas/${t}`).catch(() => 0)
          return [s.uuid, asNumber(val, 0)]
        })
      )
      const stockBySucursal = Object.fromEntries(pairs)
      const first = others.find((s) => asNumber(stockBySucursal[s.uuid], 0) > 0)
      const sucursalSel = first?.uuid || ''
      const max = sucursalSel ? asNumber(stockBySucursal[sucursalSel], 0) : 0
      setDrawer({ producto, talla: t, stockBySucursal, sucursalSel, cantidadSel: max > 0 ? 1 : 0, max })
    } catch (err) {
      setDrawer(null)
      setUserSuccess?.(err?.code || err?.message || 'repeat')
    }
  }

  async function enviarSolicitud() {
    if (!drawer) return
    if (!personal || !mySucursalId) return setUserSuccess?.('No tienes permisos')

    const productoId = safeId(drawer?.producto?.__key)
    const talla = String(drawer?.talla ?? '')
    const desdeSucursalId = safeId(drawer?.sucursalSel)
    const cantidad = asNumber(drawer?.cantidadSel, 0)
    if (!productoId || !talla.trim() || !desdeSucursalId || cantidad <= 0) return setUserSuccess?.('Complete')

    const max = asNumber(drawer?.stockBySucursal?.[desdeSucursalId], 0)
    if (cantidad > max) return setUserSuccess?.('stock_insuficiente')

    try {
      setModal('Guardando')
      const transferenciaId = generateUUID()
      await solicitarTransferencia({
        transferenciaId,
        idempotencyKey: `transferencia_${transferenciaId}`,
        desdeSucursalId,
        haciaSucursalId: mySucursalId,
        usuarioId: user?.uid ?? null,
        nota: `Solicitud desde venta (${ventaId.slice(0, 8)})`,
        items: [{ productoId, talla, cantidad }],
      })
      setModal('')
      setUserSuccess?.('Se ha guardado correctamente')
      setDrawer(null)
    } catch (err) {
      setModal('')
      setUserSuccess?.(err?.code || err?.message || 'repeat')
    }
  }

  async function confirmarVenta() {
    if (confirmingRef.current) return
    confirmingRef.current = true
    setConfirming(true)

    if (!activeSucursalId) return setUserSuccess?.('Selecciona una sucursal')
    if (!cartItems.length) return setUserSuccess?.('noProduct')
    if (personal && mySucursalId && activeSucursalId !== mySucursalId) return setUserSuccess?.('No tienes permisos')

    const items = cartItems.map((it) => ({
      productoId: it.productoId,
      talla: String(it.talla ?? '').trim(),
      // tallaRaw es la llave real en RTDB (puede incluir espacios si existen datos viejos).
      // No la trimeamos para poder descontar exactamente la misma ruta que leímos en `loadStock`.
      tallaRaw: String(it.tallaRaw ?? it.talla ?? ''),
      cantidad: it.cantidad,
      precioUnitario: it.precioUnitario,
      marca: it.marca ?? null,
      modelo: it.modelo ?? null,
      nombre: it.nombre ?? null,
    }))

    try {
      // Pre-check UX: evita intentar confirmar si el stock ya no alcanza (cambios concurrentes o cache viejo).
      for (const it of items) {
        const productoId = safeId(it.productoId)
        const tallaLabel = String(it.talla ?? '').trim()
        const tallaKey = String(it.tallaRaw ?? it.talla ?? '')
        const qty = asNumber(it.cantidad, 0)
        if (!productoId || !tallaLabel || !tallaKey.trim() || qty <= 0) continue
        const path = `inventario/${activeSucursalId}/${productoId}/tallas/${tallaKey}`
        const current = asNumber(await getValue(path).catch(() => null), 0)
        if (current < qty) {
          setUserSuccess?.(`Sin stock en la sucursal (T${tallaLabel}). Disponible: ${current}, solicitado: ${qty}`)
          setVentaId(generateUUID())
          return
        }
      }

      setModal('Guardando')
      await registrarVenta({
        ventaId,
        idempotencyKey: `venta_${ventaId}`,
        sucursalId: activeSucursalId,
        usuarioId: user?.uid ?? null,
        items,
        total,
        metodoPago,
      })
      setModal('')
      setUserSuccess?.('Se ha guardado correctamente')
      setCart({})
      setCartOpen(false)
      setSearch('')
      setResults([])
      setVentaId(generateUUID())
      setTimeout(() => searchRef.current?.focus?.(), 50)
    } catch (err) {
      setModal('')
      const code = err?.code || err?.message || 'repeat'
      if (code === 'sin_stock_en_sucursal' || code === 'stock_insuficiente') setVentaId(generateUUID())
      if (code === 'sin_stock_en_sucursal') {
        const path = err?.path ? ` (${err.path})` : ''
        const direct = typeof err?.directNumber === 'number' ? err.directNumber : null
        const extra = direct != null ? ` (Disponible: ${direct})` : ''
        setUserSuccess?.(`Sin stock en la sucursal${path}${extra}`)
      } else if (code === 'stock_insuficiente') {
        const cur = typeof err?.current === 'number' ? err.current : null
        const req = typeof err?.requested === 'number' ? err.requested : null
        const extra = cur != null && req != null ? ` (Disponible: ${cur}, solicitado: ${req})` : ''
        setUserSuccess?.(`Stock insuficiente${extra}`)
      } else {
        setUserSuccess?.(code)
      }
    } finally {
      confirmingRef.current = false
      setConfirming(false)
    }
  }

  return (
    <DataPanel
      title="Registrar venta"
      subtitle={personal && mySucursalId ? `Sucursal: ${sucursalNameById[mySucursalId] || mySucursalId}` : 'Carrito de venta'}
      panelClassName="bg-transparent shadow-none ring-0 backdrop-blur-0 rounded-none"
      actions={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <div className="rounded-2xl bg-surface-2/70 px-3 py-2 text-[12px] text-muted ring-1 ring-border/20">
            Venta ID: <span className="font-semibold text-text">{ventaId.slice(0, 8)}</span>
          </div>
          {admin ? <div className="rounded-2xl bg-surface-2/70 px-3 py-2 text-[12px] text-muted ring-1 ring-border/20">Admin</div> : null}
        </div>
      }
    >
      {modal ? <LoaderBlack>{modal}</LoaderBlack> : null}

      {cartQtyTotal > 0 ? (
        mounted && typeof document !== 'undefined' && !cartOpen
          ? createPortal(
            <div className="fixed inset-x-0 bottom-[2px] z-40 px-4 pb-[env(safe-area-inset-bottom)] lg:bottom-4 xl:hidden pointer-events-none">
              <div className="mx-auto max-w-[520px] pointer-events-auto">
                <div className="rounded-[28px] bg-surface/95 p-2 text-text shadow-2xl ring-1 ring-border/25 backdrop-blur">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded-[22px] bg-surface-2/70 px-4 py-3 ring-1 ring-border/15 transition hover:bg-surface-2 active:scale-[0.99]"
                    onClick={() => setCartOpen(true)}
                    aria-label="Abrir carrito"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-surface ring-1 ring-border/15">
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
                          <path d="M6 6h15l-1.5 9H7.2L6 6Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                          <path d="M6 6 5 3H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          <path d="M9 20a1 1 0 100-2 1 1 0 000 2ZM18 20a1 1 0 100-2 1 1 0 000 2Z" fill="currentColor" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold">Carrito</div>
                        <div className="truncate text-[12px] text-muted">
                          {cartQtyTotal} unid. - Total {money(total)}
                        </div>
                      </div>
                    </div>

                    <div className="inline-flex items-center gap-1 rounded-2xl bg-accent px-3 py-2 text-[12px] font-semibold text-black ring-1 ring-accent/25">
                      Ver
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                        <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
          : null
      ) : null}


      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-7 overflow-hidden rounded-3xl bg-surface-2 shadow-sm ring-1 ring-border/25 backdrop-blur">
          <div className="sticky top-0 z-10 bg-surface/95 px-4 py-4 backdrop-blur border-b border-border/15">
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[13px] font-semibold text-text">Buscar</div>
                  <div className="flex items-center gap-2">
                    <div className="text-[12px] font-semibold text-muted">Filtrar por</div>
                    <select
                      className="h-9 rounded-2xl bg-surface px-3 text-[12px] font-semibold text-text ring-1 ring-border/20 shadow-sm outline-none transition hover:bg-surface/95 focus:ring-2 focus:ring-accent/25"
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
                      className="absolute inset-y-0 right-2 inline-flex items-center justify-center rounded-xl px-2 text-[12px] font-semibold text-muted hover:bg-surface-2/70 hover:text-text"
                      onClick={() => setSearch('')}
                    >
                      Limpiar
                    </button>
                  ) : null}
                </div>
              </div>

              <div className='flex flex-col justify-end'>
                <div className="text-[13px] font-semibold text-text">Sucursal</div>
                {personal && mySucursalId ? (
                  <div className="mt-2 rounded-2xl bg-surface px-4 py-3 text-sm text-text ring-1 ring-border/20 shadow-sm">
                    {sucursalNameById[mySucursalId] || mySucursalId || 'No asignado'}
                  </div>
                ) : (
                  <select className={`${inputClass()} mt-2`} value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
                    {sucursalesArr.map((s) => (
                      <option key={s.uuid} value={s.uuid}>
                        {s.nombre}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 text-[12px] text-muted">
              <div className="truncate">
                {searchLower
                  ? `${results.length} resultados (por ${searchByLabel})`
                  : 'Escribe para buscar.'}
              </div>
              <div className="hidden sm:block truncate">Toca una talla para agregar. Usa (-) y (+) para ajustar.</div>
            </div>
          </div>

          <div className="p-4">
            {!searchLower ? (
              <div className="rounded-3xl bg-surface p-6 text-sm text-muted shadow-sm ring-1 ring-border/15">
                Empieza buscando un producto. Luego toca una talla para agregar al carrito.
              </div>
            ) : results.length === 0 ? (
              <div className="rounded-3xl bg-surface p-6 text-sm text-muted shadow-sm ring-1 ring-border/15">Sin resultados.</div>
            ) : (
              <div className="space-y-3">
                {results.map((p) => {
                  const pid = safeId(p.__key)
                  const state = stockCache?.[pid]
                  const tallas = state?.tallas || null
                  const keys = tallas
                    ? Object.keys(tallas).sort((a, b) =>
                      String(a).trim().localeCompare(String(b).trim(), undefined, { numeric: true })
                    )
                    : []
                  const imgSrc = p?.urlImagen || p?.url || p?.imagen || ''

                  return (
                    <div key={pid} className="rounded-3xl bg-surface p-4 shadow-sm ring-1 ring-border/15 transition hover:bg-surface/95">
                      <div className="flex items-start gap-3">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-surface-2/60 ring-1 ring-border/10">
                          {imgSrc ? (
                            <img src={imgSrc} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted">
                              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
                                <path
                                  d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                />
                                <path d="M8 14l2-2 3 3 3-4 2 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              </svg>
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-[14px] font-semibold text-text">
                                {p.marca} {p.modelo}
                              </div>
                              <div className="truncate text-[12px] text-muted">{p.nombre}</div>
                            </div>
                            <div className="shrink-0 rounded-2xl bg-surface-2/70 px-3 py-1 text-[12px] font-semibold text-text ring-1 ring-border/15">
                              {money(p.precio || 0)}
                            </div>
                          </div>

                          <div className="mt-3 space-y-4">
                            {!tallas ? (
                              <>
                                <div className="h-10 w-full rounded-2xl bg-surface-2/70 ring-1 ring-border/10" />
                                <div className="h-10 w-full rounded-2xl bg-surface-2/70 ring-1 ring-border/10" />
                                <div className="h-10 w-full rounded-2xl bg-surface-2/70 ring-1 ring-border/10" />
                              </>
                            ) : keys.length === 0 ? (
                              <div className="text-[12px] text-muted">Sin stock.</div>
                            ) : (
                              keys.map((t) => {
                                const stock = asNumber(tallas?.[t], 0)
                                const qty = qtyInCart(pid, t)
                                const maxed = stock > 0 && qty >= stock
                                const canRequest = personal && mySucursalId && stock === 0
                                const labelT = String(t).trim()
                                const rawKey = state?.tallasMap?.[t] || t

                                if (stock === 0) {
                                  return (
                                    <button
                                      key={t}
                                      type="button"
                                      className={`inline-flex h-10 w-full items-center justify-between gap-2 rounded-2xl px-3 text-[12px] font-semibold ring-1 transition active:scale-[0.99] ${canRequest ? 'bg-surface text-text ring-border/15 shadow-sm hover:bg-surface/95' : 'bg-surface-2/70 text-muted ring-border/10 opacity-70'
                                        }`}
                                      disabled={!canRequest}
                                      title={canRequest ? 'Sin stock. Click para solicitar transferencia.' : 'Sin stock'}
                                      onClick={() => {
                                        if (canRequest) return openSolicitud(p, t)
                                      }}
                                    >
                                      <span className="text-text">T{labelT}</span>
                                      <span className="text-muted">{stock}</span>
                                      {canRequest ? <span className="ml-1 text-[11px] text-muted">Solicitar</span> : null}
                                    </button>
                                  )
                                }

                                return (
                                  <div
                                    key={t}
                                    className="grid h-10 w-full grid-cols-[40px_1fr_40px] overflow-hidden rounded-2xl bg-surface text-text shadow-sm ring-1 ring-border/15"
                                  >
                                    <button
                                      type="button"
                                      className="inline-flex items-center justify-center bg-surface-2/70 text-[16px] font-bold text-text transition hover:bg-surface-2/90 active:scale-[0.98] disabled:opacity-50"
                                      aria-label="Restar 1"
                                      title="Restar 1"
                                      disabled={qty <= 0}
                                      onClick={() => changeCartItem({ productoId: pid, talla: t }, -1)}
                                    >
                                      -
                                    </button>

                                    <button
                                      type="button"
                                      className="flex min-w-0 items-center gap-2 px-3 text-[12px] font-semibold transition hover:bg-surface-2/60 disabled:cursor-not-allowed disabled:opacity-70"
                                      disabled={maxed}
                                      title={maxed ? 'Maximo alcanzado' : 'Toca para sumar 1'}
                                      onClick={() => addOne(p, t, stock, rawKey)}
                                    >
                                      <span className="text-text">T{labelT}</span>
                                      <span className="text-muted">{stock}</span>
                                      {qty > 0 ? (
                                        <span className="ml-auto rounded-xl bg-surface-2/80 px-2 py-0.5 text-[11px] text-text ring-1 ring-border/15">
                                          x{qty}
                                        </span>
                                      ) : (
                                        <span className="ml-auto text-[11px] text-muted">x0</span>
                                      )}
                                      {maxed ? <span className="text-[11px] text-muted">Max</span> : null}
                                    </button>

                                    <button
                                      type="button"
                                      className="inline-flex items-center justify-center bg-surface-2/70 text-[16px] font-bold text-text transition hover:bg-surface-2/90 active:scale-[0.98] disabled:opacity-50"
                                      aria-label="Sumar 1"
                                      title={maxed ? 'Maximo alcanzado' : 'Sumar 1'}
                                      disabled={maxed}
                                      onClick={() => addOne(p, t, stock, rawKey)}
                                    >
                                      +
                                    </button>
                                  </div>
                                )
                              })
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="hidden xl:block xl:col-span-5 rounded-3xl bg-surface-2 p-5 shadow-sm ring-1 ring-border/25 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[13px] font-semibold text-text">Carrito</div>
              <div className="text-[12px] text-muted">{cartItems.length} items</div>
            </div>
            <MetodoPagoToggle value={metodoPago} onChange={setMetodoPago} />
          </div>
          {metodoPago === 'qr' ? (
            <PaymentQRCode url={sucursalQrUrl} sucursalName={activeSucursalName} />
          ) : null}

          <div className="mt-4 space-y-3">
            {cartItems.length === 0 ? (
              <div className="rounded-3xl bg-surface p-6 text-sm text-muted shadow-sm ring-1 ring-border/15">Vacio. Agrega tallas desde la lista.</div>
            ) : (
              cartItems.map((it) => (
                <div key={cartKey(it.productoId, it.talla)} className="rounded-3xl bg-surface p-4 shadow-sm ring-1 ring-border/15 transition hover:bg-surface/95">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold text-text">
                        {it.marca} {it.modelo} - T{String(it.talla).trim()}
                      </div>
                      <div className="truncate text-[12px] text-muted">{it.nombre}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-muted">
                        <span className="font-semibold text-text">Precio unit.</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          step="1"
                          className="h-9 w-28 rounded-2xl bg-surface-2/70 px-3 text-[12px] font-semibold text-text ring-1 ring-border/20 shadow-sm outline-none focus:ring-2 focus:ring-accent/25"
                          value={String(asNumber(it.precioUnitario, 0))}
                          onChange={(e) => setPrecioUnitarioItem(it.productoId, it.talla, e.target.value)}
                        />
                        <button
                          type="button"
                          className="h-9 rounded-2xl bg-surface-2/70 px-3 text-[12px] font-semibold text-muted ring-1 ring-border/20 hover:bg-surface-2/90 hover:text-text"
                          onClick={() => setPrecioUnitarioProducto(it.productoId, asNumber(it.precioUnitario, 0))}
                          title="Aplicar este precio a todas las tallas del mismo producto"
                        >
                          Todas
                        </button>
                        {it.precioRef != null && asNumber(it.precioUnitario, 0) !== asNumber(it.precioRef, 0) ? (
                          <button
                            type="button"
                            className="h-9 rounded-2xl bg-surface-2/70 px-3 text-[12px] font-semibold text-muted ring-1 ring-border/20 hover:bg-surface-2/90 hover:text-text"
                            onClick={() => setPrecioUnitarioItem(it.productoId, it.talla, asNumber(it.precioRef, 0))}
                            title="Volver al precio referencial"
                          >
                            Ref {money(it.precioRef)}
                          </button>
                        ) : (
                          <span className="text-[11px] text-muted">Ref {money(it.precioRef)}</span>
                        )}
                        <span className="ml-auto">Stock max: {asNumber(it.maxStock, 0) || '-'}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[12px] font-semibold text-text">{money(asNumber(it.cantidad, 0) * asNumber(it.precioUnitario, 0))}</div>
                      <button type="button" className="mt-2 text-[12px] font-semibold text-muted hover:text-text" onClick={() => removeItem(it)}>
                        Quitar
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <Stepper
                      value={it.cantidad}
                      disableMinus={it.cantidad <= 0}
                      disablePlus={asNumber(it.maxStock, 0) > 0 && it.cantidad >= asNumber(it.maxStock, 0)}
                      onMinus={() => changeCartItem(it, -1)}
                      onPlus={() => changeCartItem(it, +1)}
                    />
                    <div className="text-[12px] text-muted">Total item: {money(asNumber(it.cantidad, 0) * asNumber(it.precioUnitario, 0))}</div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="sticky bottom-0 mt-4 rounded-3xl bg-surface p-4 shadow-sm ring-1 ring-border/15 backdrop-blur">
            <div className="flex items-center justify-between">
              <div className="text-[13px] font-semibold text-text">Total</div>
              <div className="text-[16px] font-semibold text-text">{money(total)}</div>
            </div>
            <div className="mt-3">
              <Button theme="Primary" styled="w-full h-11" click={confirmarVenta} disabled={Boolean(modal) || confirming}>
                Confirmar venta
              </Button>
            </div>
          </div>
        </div>
      </div>

      <BottomSheet
        open={cartOpen}
        title="Carrito"
        subtitle={`${cartItems.length} items - Total ${money(total)}`}
        onClose={() => setCartOpen(false)}
        footer={
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[12px] font-semibold text-muted">Metodo de pago</div>
              <MetodoPagoToggle value={metodoPago} onChange={setMetodoPago} />
            </div>
            {metodoPago === 'qr' ? (
              <PaymentQRCode url={sucursalQrUrl} sucursalName={activeSucursalName} />
            ) : null}
            <div className="flex items-center justify-between">
              <div className="text-[13px] font-semibold text-text">Total</div>
              <div className="text-[16px] font-semibold text-text">{money(total)}</div>
            </div>
            <Button theme="Primary" styled="w-full h-11" click={confirmarVenta} disabled={Boolean(modal) || confirming}>
              Confirmar venta
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          {cartItems.length === 0 ? (
            <div className="rounded-3xl bg-surface-2/60 p-6 text-sm text-muted shadow-sm ring-1 ring-border/15">Vacio. Agrega tallas desde la lista.</div>
          ) : (
            cartItems.map((it) => (
              <div key={cartKey(it.productoId, it.talla)} className="rounded-3xl bg-surface-2/60 p-4 shadow-sm ring-1 ring-border/15">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold text-text">
                      {it.marca} {it.modelo} - T{String(it.talla).trim()}
                    </div>
                    <div className="truncate text-[12px] text-muted">{it.nombre}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-muted">
                      <span className="font-semibold text-text">Precio unit.</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        step="1"
                        className="h-9 w-28 rounded-2xl bg-surface px-3 text-[12px] font-semibold text-text ring-1 ring-border/20 shadow-sm outline-none focus:ring-2 focus:ring-accent/25"
                        value={String(asNumber(it.precioUnitario, 0))}
                        onChange={(e) => setPrecioUnitarioItem(it.productoId, it.talla, e.target.value)}
                      />
                      <button
                        type="button"
                        className="h-9 rounded-2xl bg-surface px-3 text-[12px] font-semibold text-muted ring-1 ring-border/20 hover:bg-surface/95 hover:text-text"
                        onClick={() => setPrecioUnitarioProducto(it.productoId, asNumber(it.precioUnitario, 0))}
                        title="Aplicar este precio a todas las tallas del mismo producto"
                      >
                        Todas
                      </button>
                      {it.precioRef != null && asNumber(it.precioUnitario, 0) !== asNumber(it.precioRef, 0) ? (
                        <button
                          type="button"
                          className="h-9 rounded-2xl bg-surface px-3 text-[12px] font-semibold text-muted ring-1 ring-border/20 hover:bg-surface/95 hover:text-text"
                          onClick={() => setPrecioUnitarioItem(it.productoId, it.talla, asNumber(it.precioRef, 0))}
                          title="Volver al precio referencial"
                        >
                          Ref {money(it.precioRef)}
                        </button>
                      ) : (
                        <span className="text-[11px] text-muted">Ref {money(it.precioRef)}</span>
                      )}
                      <span className="ml-auto">Stock max: {asNumber(it.maxStock, 0) || '-'}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[12px] font-semibold text-text">{money(asNumber(it.cantidad, 0) * asNumber(it.precioUnitario, 0))}</div>
                    <button type="button" className="mt-2 text-[12px] font-semibold text-muted hover:text-text" onClick={() => removeItem(it)}>
                      Quitar
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <Stepper
                    value={it.cantidad}
                    disableMinus={it.cantidad <= 0}
                    disablePlus={asNumber(it.maxStock, 0) > 0 && it.cantidad >= asNumber(it.maxStock, 0)}
                    onMinus={() => changeCartItem(it, -1)}
                    onPlus={() => changeCartItem(it, +1)}
                  />
                  <div className="text-[12px] text-muted">Total item: {money(asNumber(it.cantidad, 0) * asNumber(it.precioUnitario, 0))}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </BottomSheet>



      <div className="h-24 xl:hidden" />

      <Drawer
        open={Boolean(drawer)}
        title="Solicitar transferencia"
        subtitle={drawer ? `${drawer.producto?.marca || ''} ${drawer.producto?.modelo || ''} - Talla ${String(drawer.talla || '').trim()}` : ''}
        onClose={() => setDrawer(null)}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="h-10 rounded-2xl bg-surface px-4 text-[12px] font-semibold text-text ring-1 ring-border/20 shadow-sm hover:bg-surface/95"
              onClick={() => setDrawer(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="h-10 rounded-2xl bg-accent px-4 text-[12px] font-semibold text-black ring-1 ring-accent/30 hover:brightness-105 disabled:opacity-60"
              disabled={!drawer?.stockBySucursal || !drawer?.sucursalSel || asNumber(drawer?.cantidadSel, 0) <= 0}
              onClick={enviarSolicitud}
            >
              Enviar solicitud
            </button>
          </div>
        }
      >
        {drawer ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-surface-2/60 p-4 ring-1 ring-border/15">
              <div className="text-[13px] font-semibold text-text">Destino</div>
              <div className="mt-1 text-[12px] text-muted">{sucursalNameById[mySucursalId] || mySucursalId}</div>
            </div>

            <div className="rounded-2xl bg-surface-2/60 p-4 ring-1 ring-border/15">
              <div className="text-[13px] font-semibold text-text">Origen</div>
              {!drawer.stockBySucursal ? (
                <div className="mt-2 text-sm text-muted">Cargando...</div>
              ) : (
                <select
                  className={`${inputClass()} mt-2`}
                  value={drawer.sucursalSel}
                  onChange={(e) => {
                    const sucursalSel = e.target.value
                    const max = asNumber(drawer.stockBySucursal?.[sucursalSel], 0)
                    setDrawer((prev) => (prev ? { ...prev, sucursalSel, max, cantidadSel: max > 0 ? 1 : 0 } : prev))
                  }}
                >
                  <option value="">Selecciona</option>
                  {sucursalesArr
                    .filter((s) => s.uuid !== mySucursalId)
                    .map((s) => {
                      const stock = asNumber(drawer.stockBySucursal?.[s.uuid], 0)
                      return (
                        <option key={s.uuid} value={s.uuid} disabled={stock <= 0}>
                          {s.nombre} (stock {stock})
                        </option>
                      )
                    })}
                </select>
              )}
            </div>

            <div className="rounded-2xl bg-surface-2/60 p-4 ring-1 ring-border/15">
              <div className="text-[13px] font-semibold text-text">Cantidad</div>
              <input
                className={`${inputClass()} mt-2`}
                type="number"
                min={1}
                max={drawer.max || 1}
                value={drawer.cantidadSel}
                onChange={(e) => setDrawer((prev) => (prev ? { ...prev, cantidadSel: asNumber(e.target.value, 1) } : prev))}
                disabled={!drawer.sucursalSel}
              />
              {drawer.sucursalSel ? <div className="mt-2 text-[12px] text-muted">Máximo: {drawer.max}</div> : null}
            </div>
          </div>
        ) : null}
      </Drawer>
    </DataPanel>
  )
}
