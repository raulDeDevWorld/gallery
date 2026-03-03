'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import DataPanel from '@/components/DataPanel'
import Table, { THead } from '@/components/Table'
import Button from '@/components/Button'
import LoaderBlack from '@/components/LoaderBlack'
import TablePager from '@/components/TablePager'
import Drawer from '@/components/Drawer'
import { useCursorPagination } from '@/hooks/useCursorPagination'
import { getPagedData, getValue, readUserData } from '@/firebase/database'
import { ajustarInventarioProductoSucursal } from '@/firebase/ops'
import { lower } from '@/lib/string'
import { isAdmin } from '@/lib/roles'
import { useUser } from '@/context/'

function normalizeSucursalList(sucursales) {
  if (!sucursales || typeof sucursales !== 'object') return []
  return Object.values(sucursales)
    .map((s) => ({ uuid: s?.uuid, nombre: s?.nombre }))
    .filter((s) => s.uuid && s.nombre)
}

export default function InventoryPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, userDB, sucursales, setSucursales, modal, setModal, setUserSuccess } = useUser()
  const admin = isAdmin(userDB)

  const [searchBy, setSearchBy] = useState('nombreLower') // nombreLower|marcaLower|modeloLower
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')

  const openedFromQueryRef = useRef(false)

  const [totales, setTotales] = useState({}) // { [sucursalId]: { [productoId]: number|null } }
  const [totalesLoading, setTotalesLoading] = useState(false)

  const [productoDetalle, setProductoDetalle] = useState(null) // producto (con __key)
  const [detalle, setDetalle] = useState(null) // { sucursalId, sucursalNombre, producto } (sucursal seleccionada)
  const [tallasRows, setTallasRows] = useState([]) // [{ talla, cantidad }]
  const [detalleLoading, setDetalleLoading] = useState(false)
  const [fullLoading, setFullLoading] = useState(false)
  const [fullInventario, setFullInventario] = useState({}) // { [sucursalId]: { [talla]: number } }
  const [expandedSucursales, setExpandedSucursales] = useState({})

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 250)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    if (sucursales !== undefined) return
    const unsub = readUserData('sucursales', setSucursales, undefined, (err) => setUserSuccess?.(err?.code || err?.message || 'repeat'))
    return () => (typeof unsub === 'function' ? unsub() : null)
  }, [setSucursales, setUserSuccess, sucursales])

  const sucursalesArr = useMemo(() => normalizeSucursalList(sucursales), [sucursales])

  const searchLower = lower(searchDebounced).trim()

  const fetchPage = useCallback(
    async ({ after, limit }) => {
      if (searchLower) {
        return getPagedData('productos', {
          orderBy: 'child',
          childKey: searchBy,
          range: { start: searchLower, end: `${searchLower}\uf8ff` },
          after,
          limit,
        })
      }
      return getPagedData('productos', {
        orderBy: 'child',
        childKey: 'nombreLower',
        after,
        limit,
      })
    },
    [searchBy, searchLower]
  )

  const cursor = useCursorPagination(fetchPage, { initialPageSize: 10, resetOn: [searchBy, searchLower] })

  const productoIds = useMemo(() => cursor.items.map((p) => p?.__key).filter(Boolean), [cursor.items])
  const productoIdsKey = useMemo(() => productoIds.join('|'), [productoIds])
  const sucursalIds = useMemo(() => sucursalesArr.map((s) => s.uuid).filter(Boolean), [sucursalesArr])
  const sucursalIdsKey = useMemo(() => sucursalIds.join('|'), [sucursalIds])

  useEffect(() => {
    if (!productoIds.length || !sucursalIds.length) {
      setTotales((prev) => (prev && Object.keys(prev).length ? {} : prev))
      setTotalesLoading(false)
      return
    }

    let cancelled = false
    setTotalesLoading(true)

    ;(async () => {
      try {
        const pairs = []
        for (const sucursalId of sucursalIds) {
          for (const productoId of productoIds) {
            pairs.push({ sucursalId, productoId })
          }
        }

        const values = await Promise.all(
          pairs.map(async ({ sucursalId, productoId }) => {
            const v = await getValue(`inventarioTotales/${sucursalId}/${productoId}/total`)
            return { sucursalId, productoId, total: v == null ? null : Number(v) }
          })
        )

        const next = {}
        for (const { sucursalId, productoId, total } of values) {
          if (!next[sucursalId]) next[sucursalId] = {}
          next[sucursalId][productoId] = Number.isFinite(total) ? total : null
        }

        if (!cancelled) setTotales(next)
      } catch (err) {
        if (!cancelled) setUserSuccess?.(err?.code || err?.message || 'repeat')
      } finally {
        if (!cancelled) setTotalesLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [productoIdsKey, sucursalIdsKey, setUserSuccess])

  const actions = useMemo(() => {
    return (
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        <label className="inline-flex items-center gap-2 text-[12px] text-muted">
          <span className="hidden sm:inline">Buscar en</span>
          <select
            value={searchBy}
            onChange={(e) => setSearchBy(e.target.value)}
            className="h-10 rounded-2xl bg-surface/60 px-3 text-[12px] text-text ring-1 ring-border/25 outline-none focus:ring-2 focus:ring-accent/25"
          >
            <option value="nombreLower">Nombre</option>
            <option value="marcaLower">Marca</option>
            <option value="modeloLower">Modelo</option>
            <option value="codigoLower">Código</option>
          </select>
        </label>

        <div className="flex gap-2">
          <Button theme="Primary" styled="whitespace-nowrap" click={() => router.push('/RegistrarVenta')}>
            Registrar venta
          </Button>
          <Button theme="Secondary" styled="whitespace-nowrap" click={() => router.push('/Transferencias')}>
            Transferencias
          </Button>
        </div>
      </div>
    )
  }, [admin, router, searchBy])

  async function openDetalle({ sucursalId, sucursalNombre, producto }) {
    setDetalle({ sucursalId, sucursalNombre, producto })
    setTallasRows([{ talla: '', cantidad: '' }])
    setDetalleLoading(true)
    try {
      const productoId = producto?.__key
      const raw = (await getValue(`inventario/${sucursalId}/${productoId}/tallas`)) || {}
      const rows = Object.entries(raw || {}).map(([k, v]) => ({ talla: String(k), cantidad: String(v) }))
      setTallasRows(rows.length ? rows : [{ talla: '', cantidad: '' }])
    } catch (err) {
      setUserSuccess?.(err?.code || err?.message || 'repeat')
    } finally {
      setDetalleLoading(false)
    }
  }

  const openProductoDrawer = useCallback(
    async (producto, preferredSucursalId = null) => {
      if (!producto?.__key) return
      setProductoDetalle(producto)

      const chosen =
        preferredSucursalId && sucursalesArr.some((s) => s.uuid === preferredSucursalId)
          ? sucursalesArr.find((s) => s.uuid === preferredSucursalId)
          : userDB?.sucursalId && sucursalesArr.some((s) => s.uuid === userDB.sucursalId)
            ? sucursalesArr.find((s) => s.uuid === userDB.sucursalId)
            : sucursalesArr[0]

      if (!chosen?.uuid) return
      await openDetalle({ sucursalId: chosen.uuid, sucursalNombre: chosen.nombre, producto })
    },
    [sucursalesArr, userDB?.sucursalId]
  )

  const closeProductoDrawer = useCallback(() => {
    setProductoDetalle(null)
    setDetalle(null)
    setTallasRows([])
    setDetalleLoading(false)
    setFullLoading(false)
    setFullInventario({})
    setExpandedSucursales({})
  }, [])

  const query = searchParams?.toString() || ''
  useEffect(() => {
    if (openedFromQueryRef.current) return
    const params = new URLSearchParams(query)
    const stock = params.get('stock')
    const productoId = params.get('productoId')
    if (stock !== '1' || !productoId) return
    if (!sucursalesArr.length) {
      if (sucursales !== undefined) {
        openedFromQueryRef.current = true
        setUserSuccess?.('Primero registra una sucursal para cargar stock')
        if (typeof window !== 'undefined') window.history.replaceState(null, '', window.location.pathname)
      }
      return
    }

    openedFromQueryRef.current = true

    ;(async () => {
      try {
        const preferSucursalId = userDB?.sucursalId
        const chosenSucursal =
          preferSucursalId && sucursalesArr.some((s) => s.uuid === preferSucursalId)
            ? sucursalesArr.find((s) => s.uuid === preferSucursalId)
            : sucursalesArr[0]

        const p = await getValue(`productos/${productoId}`)
        if (!p || !chosenSucursal?.uuid) {
          setUserSuccess?.('Producto no encontrado')
          if (typeof window !== 'undefined') window.history.replaceState(null, '', window.location.pathname)
          return
        }

        await openProductoDrawer({ ...p, __key: productoId }, chosenSucursal.uuid)
      } catch (err) {
        setUserSuccess?.(err?.code || err?.message || 'repeat')
      } finally {
        if (typeof window !== 'undefined') window.history.replaceState(null, '', window.location.pathname)
      }
    })()
  }, [query, sucursales, sucursalesArr, userDB?.sucursalId, setUserSuccess, openProductoDrawer])

  useEffect(() => {
    const productoId = productoDetalle?.__key
    if (!productoId) return
    if (!sucursalesArr.length) return

    let cancelled = false
    setFullLoading(true)

    ;(async () => {
      try {
        const values = await Promise.all(
          sucursalesArr.map(async (s) => {
            const tallas = (await getValue(`inventario/${s.uuid}/${productoId}/tallas`)) || {}
            return { sucursalId: s.uuid, tallas }
          })
        )
        if (cancelled) return
        const next = {}
        for (const { sucursalId, tallas } of values) {
          next[sucursalId] = tallas && typeof tallas === 'object' ? tallas : {}
        }
        setFullInventario(next)
      } catch (err) {
        if (!cancelled) setUserSuccess?.(err?.code || err?.message || 'repeat')
      } finally {
        if (!cancelled) setFullLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [productoDetalle?.__key, sucursalesArr, setUserSuccess])

  async function saveDetalle() {
    if (!admin) return setUserSuccess?.('No tienes permisos')
    if (!detalle?.producto?.__key) return setModal('')
    if (detalleLoading) return

    const productoId = detalle.producto.__key
    const sucursalId = detalle.sucursalId

    const cleaned = {}
    for (const r of tallasRows || []) {
      const talla = String(r?.talla || '').trim()
      const qty = Number(String(r?.cantidad || '').trim())
      if (!talla) continue
      if (!Number.isFinite(qty) || qty < 0) continue
      if (qty === 0) continue
      cleaned[talla] = qty
    }

    try {
      setModal('Guardando')
      await ajustarInventarioProductoSucursal({
        sucursalId,
        productoId,
        tallas: cleaned,
        usuarioId: user?.uid ?? null,
        nota: 'Ajuste desde Inventario',
      })
      setModal('')
      setUserSuccess?.('Se ha guardado correctamente')
      setFullInventario((prev) => ({ ...(prev || {}), [sucursalId]: cleaned }))
      setTotales((prev) => ({
        ...(prev || {}),
        [sucursalId]: { ...((prev || {})[sucursalId] || {}), [productoId]: Object.values(cleaned).reduce((acc, n) => acc + Number(n || 0), 0) },
      }))
    } catch (err) {
      setModal('')
      setUserSuccess?.(err?.code || err?.message || 'repeat')
    }
  }

  const branchCount = sucursalesArr.length
  const tableMinWidth = branchCount > 0 ? branchCount * 180 + 900 : 900
  const tableColSpan = 7 + branchCount

  const detalleTotalTallas = useMemo(() => {
    return (tallasRows || []).reduce((acc, r) => {
      const n = Number(String(r?.cantidad ?? '').trim())
      return acc + (Number.isFinite(n) ? n : 0)
    }, 0)
  }, [tallasRows])

  const detalleTotalGeneral = useMemo(() => {
    if (!detalle?.producto?.__key) return null
    const productoId = detalle.producto.__key
    let sum = 0
    for (const s of sucursalesArr) {
      const v = totales?.[s.uuid]?.[productoId]
      if (v == null) continue
      sum += Number(v) || 0
    }
    return sum
  }, [detalle?.producto?.__key, sucursalesArr, totales])

  return (
    <DataPanel
      title="Inventario"
      subtitle="Stock por sucursal (totales por producto)"
      actions={actions}
      scroll="x"
      filter={{
        value: search,
        onChange: (e) => setSearch(e.target.value),
        placeholder:
          searchBy === 'marcaLower'
            ? 'Buscar por marca...'
            : searchBy === 'modeloLower'
            ? 'Buscar por modelo...'
            : searchBy === 'codigoLower'
            ? 'Buscar por código...'
            : 'Buscar por nombre...',
      }}
      footer={
        <TablePager
          mode="cursor"
          page={cursor.page}
          total={null}
          from={cursor.from}
          to={cursor.to}
          pageSize={cursor.pageSize}
          pageSizeOptions={[10, 25, 50, 100]}
          canPrev={cursor.canPrev}
          canNext={cursor.canNext}
          onPageChange={(nextPage) => {
            if (Number(nextPage) > cursor.page) cursor.next()
            else cursor.prev()
          }}
          onPageSizeChange={cursor.setPageSize}
        />
      }
    >
      {modal === 'Guardando' ? <LoaderBlack>{modal}</LoaderBlack> : null}

      <Drawer
        open={Boolean(productoDetalle)}
        title={productoDetalle ? 'Detalle de inventario' : ''}
        subtitle={
          productoDetalle
            ? `${productoDetalle?.marca || ''} ${productoDetalle?.modelo || ''} · ${productoDetalle?.nombre || ''}`
            : ''
        }
        onClose={closeProductoDrawer}
        footer={
          admin && detalle ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                className="h-10 rounded-2xl bg-surface/60 px-4 text-[12px] font-semibold text-text ring-1 ring-border/15 hover:bg-surface"
                onClick={closeProductoDrawer}
              >
                Cerrar
              </button>
              <button
                type="button"
                disabled={detalleLoading}
                className="h-10 rounded-2xl bg-accent px-4 text-[12px] font-semibold text-black ring-1 ring-accent/30 hover:brightness-105 disabled:opacity-60"
                onClick={saveDetalle}
              >
                Guardar cambios
              </button>
            </div>
          ) : (
            <div className="flex justify-end">
              <button
                type="button"
                className="h-10 rounded-2xl bg-surface/60 px-4 text-[12px] font-semibold text-text ring-1 ring-border/15 hover:bg-surface"
                onClick={closeProductoDrawer}
              >
                Cerrar
              </button>
            </div>
          )
        }
      >
        {productoDetalle ? (
          <div className="flex flex-col gap-5">
            <div className="order-0 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-surface/50 p-4 ring-1 ring-border/15">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Total general</div>
                <div className="mt-1 text-[20px] font-semibold text-text">
                  {(() => {
                    const productoId = productoDetalle.__key
                    return sucursalesArr.reduce((acc, s) => acc + Number(totales?.[s.uuid]?.[productoId] || 0), 0)
                  })()}
                </div>
                <div className="mt-1 text-[12px] text-muted">Sumando todas las sucursales</div>
              </div>
              <div className="rounded-2xl bg-surface/50 p-4 ring-1 ring-border/15">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Sucursal seleccionada</div>
                <div className="mt-1 text-[14px] font-semibold text-text">{detalle?.sucursalNombre || '—'}</div>
                <div className="mt-1 text-[12px] text-muted">
                  Total (tallas): <span className="font-semibold text-text">{detalleTotalTallas}</span>
                </div>
              </div>
            </div>

            <div className="order-3 rounded-3xl bg-surface/30 p-4 ring-1 ring-border/15">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[13px] font-semibold text-text">Editar tallas por sucursal</div>
                  <div className="text-[12px] text-muted">Selecciona una sucursal y ajusta cantidades por talla.</div>
                </div>
                <select
                  className="h-10 rounded-2xl bg-surface/60 px-3 text-[12px] text-text ring-1 ring-border/25 outline-none focus:ring-2 focus:ring-accent/25"
                  value={detalle?.sucursalId || ''}
                  onChange={(e) => {
                    const nextId = e.target.value
                    const s = sucursalesArr.find((x) => x.uuid === nextId)
                    if (!s) return
                    openDetalle({ sucursalId: s.uuid, sucursalNombre: s.nombre, producto: productoDetalle })
                  }}
                >
                  {sucursalesArr.map((s) => (
                    <option key={s.uuid} value={s.uuid}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4 space-y-3">
                {detalleLoading ? (
                  <div className="inline-flex items-center gap-2 rounded-2xl bg-surface/60 px-3 py-2 text-[12px] font-semibold text-muted ring-1 ring-border/15">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M12 2a10 10 0 1010 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                    Cargando tallas...
                  </div>
                ) : null}

                <div className="grid grid-cols-3 gap-2">
                  <div className="text-[11px] font-semibold text-muted uppercase tracking-wide">Talla</div>
                  <div className="text-[11px] font-semibold text-muted uppercase tracking-wide">Cantidad</div>
                  <div />

                  {(tallasRows || []).map((r, idx) => (
                    <div key={`${idx}`} className="contents">
                      <input
                        disabled={!admin || detalleLoading}
                        className="h-9 rounded-xl bg-surface/60 px-3 text-[12px] text-text ring-1 ring-border/15 outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-60"
                        value={r.talla}
                        onChange={(e) =>
                          setTallasRows((prev) => {
                            const next = [...prev]
                            next[idx] = { ...(next[idx] || {}), talla: e.target.value }
                            return next
                          })
                        }
                        placeholder="40"
                      />
                      <input
                        disabled={!admin || detalleLoading}
                        className="h-9 rounded-xl bg-surface/60 px-3 text-[12px] text-text ring-1 ring-border/15 outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-60"
                        value={r.cantidad}
                        onChange={(e) =>
                          setTallasRows((prev) => {
                            const next = [...prev]
                            next[idx] = { ...(next[idx] || {}), cantidad: e.target.value }
                            return next
                          })
                        }
                        inputMode="numeric"
                        placeholder="0"
                      />
                      <button
                        type="button"
                        disabled={!admin || detalleLoading}
                        className="h-9 rounded-xl bg-surface/50 px-3 text-[12px] font-semibold text-text ring-1 ring-border/15 hover:bg-surface disabled:opacity-50"
                        onClick={() =>
                          setTallasRows((prev) =>
                            prev.filter((_, i) => i !== idx).length ? prev.filter((_, i) => i !== idx) : [{ talla: '', cantidad: '' }]
                          )
                        }
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>

                {admin ? (
                  <button
                    type="button"
                    disabled={detalleLoading}
                    className="h-10 w-full rounded-2xl bg-surface/60 px-3 text-[12px] font-semibold text-text ring-1 ring-border/15 hover:bg-surface disabled:opacity-60"
                    onClick={() => setTallasRows((prev) => [...(prev || []), { talla: '', cantidad: '' }])}
                  >
                    Agregar talla
                  </button>
                ) : null}
              </div>
            </div>

            <div className="order-1 rounded-3xl bg-surface/30 p-4 ring-1 ring-border/15">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[13px] font-semibold text-text">Totales por talla (global)</div>
                  <div className="text-[12px] text-muted">Sumando todas las sucursales.</div>
                </div>
                {fullLoading ? <div className="text-[12px] text-muted">Cargando...</div> : null}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {(() => {
                  const next = {}
                  for (const [sucursalId, tallas] of Object.entries(fullInventario || {})) {
                    if (!tallas || typeof tallas !== 'object') continue
                    for (const [t, v] of Object.entries(tallas)) {
                      const talla = String(t)
                      const n = Number(v)
                      if (!Number.isFinite(n) || n <= 0) continue
                      next[talla] = (next[talla] || 0) + n
                    }
                  }
                  const entries = Object.entries(next).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
                  if (!entries.length) {
                    return <div className="text-[12px] text-muted">Sin stock registrado.</div>
                  }
                  return entries.map(([t, n]) => (
                    <div key={t} className="inline-flex items-center gap-2 rounded-xl bg-surface/60 px-3 py-2 text-[12px] font-semibold ring-1 ring-border/15">
                      <span className="text-muted">T{t}</span>
                      <span className="text-text">{n}</span>
                    </div>
                  ))
                })()}
              </div>
            </div>

            {/* <div className="order-2 rounded-3xl bg-surface/30 p-4 ring-1 ring-border/15">
              <div className="text-[13px] font-semibold text-text">Por sucursal</div>
              <div className="mt-1 text-[12px] text-muted">Stock por talla en cada sucursal.</div>

              <div className="mt-3 space-y-2">
                {sucursalesArr.map((s) => {
                  const tallas = fullInventario?.[s.uuid] || {}
                  const total = Object.values(tallas || {}).reduce((acc, n) => acc + Number(n || 0), 0)
                  const open = Boolean(expandedSucursales[s.uuid])
                  return (
                    <div key={s.uuid} className="rounded-2xl bg-surface/20 ring-1 ring-border/10">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                        onClick={() => setExpandedSucursales((prev) => ({ ...(prev || {}), [s.uuid]: !open }))}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-semibold text-text">{s.nombre}</div>
                          <div className="text-[12px] text-muted">
                            Total: <span className="font-semibold text-text">{total}</span>
                          </div>
                        </div>
                        <svg viewBox="0 0 24 24" className="h-5 w-5 text-muted" fill="none" aria-hidden="true">
                          <path
                            d={open ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'}
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>

                      {open ? (
                        <div className="border-t border-border/10 px-4 pb-4 pt-4">
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(tallas || {})
                              .filter(([, v]) => Number(v || 0) > 0)
                              .sort((a, b) => String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true }))
                              .map(([t, v]) => (
                                <div
                                  key={`${s.uuid}-${t}`}
                                  className="inline-flex items-center gap-2 rounded-xl bg-surface/60 px-3 py-2 text-[12px] font-semibold ring-1 ring-border/15"
                                >
                                  <span className="text-muted">T{t}</span>
                                  <span className="text-text">{Number(v || 0)}</span>
                                </div>
                              ))}
                            {!Object.keys(tallas || {}).length ? <div className="text-[12px] text-muted">Sin tallas.</div> : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div> */}
          </div>
        ) : null}
      </Drawer>

      <Table minWidth={tableMinWidth}>
        <THead>
          <tr>
            <th scope="col" className="min-w-[50px] px-3 py-3">
              #
            </th>
            <th scope="col" className="min-w-[90px] px-3 py-3">
              Marca
            </th>
            <th scope="col" className="min-w-[120px] px-3 py-3">
              Modelo
            </th>
            <th scope="col" className="min-w-[140px] px-3 py-3">
              Nombre
            </th>
            <th scope="col" className="min-w-[90px] px-3 py-3 text-right">
              Precio
            </th>
            <th scope="col" className="min-w-[160px] px-3 py-3">
              Total general
            </th>
            {sucursalesArr.map((s) => (
              <th key={s.uuid} scope="col" className="min-w-[160px] px-3 py-3">
                {s.nombre}
              </th>
            ))}
          </tr>
        </THead>
        <tbody>
          {cursor.loading && cursor.items.length === 0 ? (
            <tr>
              <td colSpan={tableColSpan} className="px-4 py-10 text-center text-[13px] text-muted">
                Cargando...
              </td>
            </tr>
          ) : cursor.items.length === 0 ? (
            <tr>
              <td colSpan={tableColSpan} className="px-4 py-10 text-center text-[13px] text-muted">
                Sin resultados.
              </td>
            </tr>
          ) : (
            cursor.items.map((p, index) => {
              const productoId = p?.__key
              const totalGeneral = sucursalesArr.reduce((acc, s) => {
                const v = totales?.[s.uuid]?.[productoId]
                if (v == null) return acc
                return acc + (Number(v) || 0)
              }, 0)

              return (
                <tr
                  key={productoId}
                  className="text-[13px] border-b border-transparent hover:bg-surface/50 odd:bg-surface/20 even:bg-surface/10"
                >
                  <td className="min-w-[50px] px-3 py-4 text-text align-middle">{cursor.from + index}</td>
                  <td className="px-3 py-4 text-text">
                    <button
                      type="button"
                      className="text-left font-semibold text-text hover:underline"
                      onClick={() => openProductoDrawer(p)}
                      title="Ver detalle"
                    >
                      {p?.marca}
                    </button>
                  </td>
                  <td className="px-3 py-4 text-text">{p?.modelo}</td>
                  <td className="px-3 py-4 text-text">{p?.nombre}</td>
                  <td className="px-3 py-4 text-text text-right">{Number(p?.precio || 0)}</td>
                  <td className="px-3 py-4 text-text">
                    <span className="inline-flex items-center rounded-xl bg-surface/60 px-3 py-2 text-[12px] font-semibold ring-1 ring-border/15">
                      {totalesLoading ? 'Total: …' : `Total: ${totalGeneral}`}
                    </span>
                  </td>

                  {sucursalesArr.map((s) => {
                    const total = totales?.[s.uuid]?.[productoId]
                    return (
                      <td key={`${productoId}-${s.uuid}`} className="px-3 py-4 text-text">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-xl bg-surface/60 px-3 py-2 text-[12px] font-semibold ring-1 ring-border/15 hover:bg-surface disabled:opacity-60"
                          disabled={totalesLoading}
                          onClick={() => openProductoDrawer(p, s.uuid)}
                        >
                          <span>Total: {total == null ? '—' : total}</span>
                        </button>
                      </td>
                    )
                  })}
                </tr>
              )
            })
          )}
        </tbody>
      </Table>
    </DataPanel>
  )
}
