'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import DataPanel from '@/components/DataPanel'
import Table, { THead } from '@/components/Table'
import LoaderBlack from '@/components/LoaderBlack'
import Drawer from '@/components/Drawer'
import Button from '@/components/Button'
import { useUser } from '@/context/'
import { getRangeByChild, getRangeByKey, getValue, readUserData } from '@/firebase/database'
import { isAdmin } from '@/lib/roles'

function inputClass() {
  return 'h-10 rounded-2xl bg-surface/60 px-3 text-[12px] text-text ring-1 ring-border/25 outline-none focus:ring-2 focus:ring-accent/25'
}

function formatISODate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toKey(dateStr) {
  return String(dateStr || '').replaceAll('-', '')
}

function startOfDayTs(isoDate) {
  const v = String(isoDate || '').trim()
  if (!v) return null
  const d = new Date(`${v}T00:00:00`)
  const ts = d.getTime()
  return Number.isFinite(ts) ? ts : null
}

function endOfDayTs(isoDate) {
  const start = startOfDayTs(isoDate)
  if (start == null) return null
  return start + 24 * 60 * 60 * 1000 - 1
}

function keyToISO(key) {
  const raw = String(key || '')
  if (raw.length !== 8) return ''
  const y = raw.slice(0, 4)
  const m = raw.slice(4, 6)
  const d = raw.slice(6, 8)
  return `${y}-${m}-${d}`
}

function keyToLabel(key) {
  const iso = keyToISO(key)
  if (!iso) return String(key || '')
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function asNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function money(n) {
  return new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 }).format(asNumber(n, 0))
}

export default function ReportsPage() {
  const { userDB, sucursales, setSucursales, setUserSuccess, modal, setModal } = useUser()
  const admin = isAdmin(userDB)

  const [sucursalId, setSucursalId] = useState('all')
  const [desde, setDesde] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 6)
    return formatISODate(d)
  })
  const [hasta, setHasta] = useState(() => formatISODate(new Date()))

  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState({ total: 0, cantidadVentas: 0 })
  const [loading, setLoading] = useState(false)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerTab, setDrawerTab] = useState('ventas') // ventas|productos|movimientos
  const [drawerSucursal, setDrawerSucursal] = useState(null) // { id, nombre }
  const [drawerDayKey, setDrawerDayKey] = useState(null) // yyyymmdd|null

  const [ventasLoading, setVentasLoading] = useState(false)
  const [ventas, setVentas] = useState([]) // [{ ventaId, creadoEn, total, estado }]
  const [ventaSel, setVentaSel] = useState(null)
  const [ventaDetailLoading, setVentaDetailLoading] = useState(false)
  const [ventaDetail, setVentaDetail] = useState(null)

  const [productosLoading, setProductosLoading] = useState(false)
  const [productosAgg, setProductosAgg] = useState(null) // { processed, total, rows }

  const [movsLoading, setMovsLoading] = useState(false)
  const [movsByVentaId, setMovsByVentaId] = useState({})

  const lastDrawerQueryRef = useRef('')

  useEffect(() => {
    if (sucursales !== undefined) return
    const unsub = readUserData('sucursales', setSucursales, undefined, (err) => setUserSuccess?.(err?.code || err?.message || 'repeat'))
    return () => (typeof unsub === 'function' ? unsub() : null)
  }, [setSucursales, setUserSuccess, sucursales])

  const sucursalesArr = useMemo(() => {
    const arr = sucursales && typeof sucursales === 'object' ? Object.values(sucursales) : []
    return arr.filter((s) => s?.uuid && s?.nombre)
  }, [sucursales])

  useEffect(() => {
    if (!admin) return
    const startKey = toKey(desde)
    const endKey = toKey(hasta)
    if (!startKey || !endKey) return

    let cancelled = false
    setLoading(true)

    ;(async () => {
      try {
        if (sucursalId === 'all') {
          const perSucursal = await Promise.all(
            sucursalesArr.map(async (s) => {
              const items = await getRangeByKey(`reportes/ventasPorSucursalDia/${s.uuid}`, { start: startKey, end: endKey })
              const total = items.reduce((acc, r) => acc + Number(r?.total || 0), 0)
              const cantidadVentas = items.reduce((acc, r) => acc + Number(r?.cantidadVentas || 0), 0)
              return { sucursalId: s.uuid, sucursalNombre: s.nombre, total, cantidadVentas }
            })
          )

          const total = perSucursal.reduce((acc, r) => acc + Number(r.total || 0), 0)
          const cantidadVentas = perSucursal.reduce((acc, r) => acc + Number(r.cantidadVentas || 0), 0)

          if (!cancelled) {
            setRows(perSucursal)
            setSummary({ total, cantidadVentas })
          }
          return
        }

        const items = await getRangeByKey(`reportes/ventasPorSucursalDia/${sucursalId}`, { start: startKey, end: endKey })
        const dayRows = items
          .map((r) => ({
            dia: r.__key,
            total: Number(r?.total || 0),
            cantidadVentas: Number(r?.cantidadVentas || 0),
          }))
          .sort((a, b) => String(a.dia).localeCompare(String(b.dia)))

        const total = dayRows.reduce((acc, r) => acc + Number(r.total || 0), 0)
        const cantidadVentas = dayRows.reduce((acc, r) => acc + Number(r.cantidadVentas || 0), 0)

        if (!cancelled) {
          setRows(dayRows)
          setSummary({ total, cantidadVentas })
        }
      } catch (err) {
        if (!cancelled) setUserSuccess?.(err?.code || err?.message || 'repeat')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [desde, hasta, admin, setUserSuccess, sucursalId, sucursalesArr])

  function closeDrawer() {
    setDrawerOpen(false)
    setDrawerTab('ventas')
    setDrawerSucursal(null)
    setDrawerDayKey(null)
    setVentas([])
    setVentaSel(null)
    setVentaDetail(null)
    setProductosAgg(null)
    setMovsByVentaId({})
    setVentasLoading(false)
    setVentaDetailLoading(false)
    setProductosLoading(false)
    setMovsLoading(false)
  }

  function openDrawerForSucursal({ id, nombre, dayKey = null }) {
    setDrawerSucursal({ id, nombre })
    setDrawerDayKey(dayKey)
    setDrawerTab('ventas')
    setDrawerOpen(true)
    setVentas([])
    setVentaSel(null)
    setVentaDetail(null)
    setProductosAgg(null)
    setMovsByVentaId({})
  }

  const drawerTitle = drawerSucursal?.nombre ? `Sucursal: ${drawerSucursal.nombre}` : 'Detalle'
  const drawerSubtitle = drawerDayKey ? `DÃ­a: ${keyToLabel(drawerDayKey)}` : `Rango: ${desde} â†’ ${hasta}`

  useEffect(() => {
    if (!drawerOpen) return
    if (!drawerSucursal?.id) return

    const startTs = drawerDayKey ? startOfDayTs(keyToISO(drawerDayKey)) : startOfDayTs(desde)
    const endTs = drawerDayKey ? endOfDayTs(keyToISO(drawerDayKey)) : endOfDayTs(hasta)
    if (startTs == null || endTs == null) return

    const q = `${drawerSucursal.id}|${drawerDayKey || 'range'}|${startTs}|${endTs}`
    lastDrawerQueryRef.current = q

    let cancelled = false
    setVentasLoading(true)

    ;(async () => {
      try {
        const items = await getRangeByChild(`ventasPorSucursal/${drawerSucursal.id}`, 'creadoEn', { start: startTs, end: endTs })
        const mapped = (items || []).map((r) => ({
          ventaId: r.__key,
          creadoEn: asNumber(r?.creadoEn, 0),
          total: asNumber(r?.total, 0),
          estado: String(r?.estado || ''),
        }))

        mapped.sort((a, b) => (b.creadoEn || 0) - (a.creadoEn || 0))
        if (!cancelled && lastDrawerQueryRef.current === q) setVentas(mapped)
      } catch (err) {
        if (!cancelled) setUserSuccess?.(err?.code || err?.message || 'repeat')
      } finally {
        if (!cancelled) setVentasLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [desde, hasta, drawerDayKey, drawerOpen, drawerSucursal?.id, setUserSuccess])

  useEffect(() => {
    if (!drawerOpen) return
    if (!ventaSel) {
      setVentaDetail(null)
      return
    }

    let cancelled = false
    setVentaDetailLoading(true)

    ;(async () => {
      try {
        const v = await getValue(`ventas/${ventaSel}`)
        if (!cancelled) setVentaDetail(v ? { ...v, __key: ventaSel } : null)
      } catch (err) {
        if (!cancelled) setUserSuccess?.(err?.code || err?.message || 'repeat')
        if (!cancelled) setVentaDetail(null)
      } finally {
        if (!cancelled) setVentaDetailLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [drawerOpen, setUserSuccess, ventaSel])

  async function ensureProductosAgg({ batch = 40 } = {}) {
    if (productosLoading) return
    if (!ventas?.length) return setProductosAgg({ processed: 0, total: 0, rows: [] })

    setProductosLoading(true)
    try {
      const current = productosAgg || { processed: 0, total: ventas.length, rows: [] }
      const start = current.processed || 0
      const end = Math.min(ventas.length, start + Math.max(1, batch))
      const slice = ventas.slice(start, end)

      const agg = new Map()
      for (const r of current.rows || []) agg.set(r.productoId, r)

      const details = await Promise.all(slice.map((x) => getValue(`ventas/${x.ventaId}`).catch(() => null)))
      for (let i = 0; i < details.length; i++) {
        const v = details[i]
        if (!v || v.estado !== 'confirmada') continue

        const items = v.items && typeof v.items === 'object' ? v.items : {}
        for (const [productoId, it] of Object.entries(items)) {
          const tallas = it?.tallas && typeof it.tallas === 'object' ? it.tallas : {}
          const unidades = Object.values(tallas).reduce((acc, n) => acc + asNumber(n, 0), 0)
          if (unidades <= 0) continue

          const precioUnitario = asNumber(it?.precioUnitario, 0)
          const monto = unidades * precioUnitario

          const prev = agg.get(productoId) || {
            productoId,
            marca: it?.marca ?? null,
            modelo: it?.modelo ?? null,
            nombre: it?.nombre ?? null,
            unidades: 0,
            monto: 0,
            tallas: {},
          }

          const nextTallas = { ...(prev.tallas || {}) }
          for (const [t, q] of Object.entries(tallas)) {
            const label = String(t ?? '').trim()
            if (!label) continue
            nextTallas[label] = asNumber(nextTallas[label], 0) + asNumber(q, 0)
          }

          agg.set(productoId, {
            ...prev,
            marca: prev.marca ?? it?.marca ?? null,
            modelo: prev.modelo ?? it?.modelo ?? null,
            nombre: prev.nombre ?? it?.nombre ?? null,
            unidades: asNumber(prev.unidades, 0) + unidades,
            monto: asNumber(prev.monto, 0) + monto,
            tallas: nextTallas,
          })
        }
      }

      const nextRows = Array.from(agg.values()).sort((a, b) => asNumber(b.monto, 0) - asNumber(a.monto, 0))
      setProductosAgg({ processed: end, total: ventas.length, rows: nextRows })
    } finally {
      setProductosLoading(false)
    }
  }

  async function ensureMovimientos({ batch = 50 } = {}) {
    if (movsLoading) return
    if (!ventas?.length) return

    setMovsLoading(true)
    try {
      const ids = ventas.slice(0, Math.min(ventas.length, Math.max(1, batch))).map((v) => v.ventaId)
      const pairs = await Promise.all(
        ids.map(async (id) => {
          const mov = await getValue(`movimientosInventario/venta_${id}`).catch(() => null)
          return [id, mov]
        })
      )
      const next = { ...(movsByVentaId || {}) }
      for (const [id, mov] of pairs) next[id] = mov
      setMovsByVentaId(next)
    } finally {
      setMovsLoading(false)
    }
  }

  if (!admin) {
    return (
      <div className="min-h-[60vh] w-full grid place-items-center px-4">
        <div className="w-full max-w-[520px] rounded-3xl bg-surface/50 p-6 text-center shadow-sm ring-1 ring-border/15 backdrop-blur">
          <h2 className="text-[18px] font-semibold text-text">Sin permisos</h2>
          <p className="mt-2 text-[14px] text-muted">El reporte histórico solo está disponible para administradores.</p>
        </div>
      </div>
    )
  }

  return (
    <DataPanel
      title="Reporte histórico"
      subtitle="Ventas por sucursal y por fecha (agregado diario)"
      actions={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <select className={inputClass()} value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
            <option value="all">Todas las sucursales</option>
            {sucursalesArr.map((s) => (
              <option key={s.uuid} value={s.uuid}>
                {s.nombre}
              </option>
            ))}
          </select>

          <input className={inputClass()} type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          <input className={inputClass()} type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />

          <div className="rounded-2xl bg-surface/40 px-3 py-2 text-[12px] text-muted ring-1 ring-border/15">
            Total: <span className="font-semibold text-text">{money(summary.total)}</span> · Ventas:{' '}
            <span className="font-semibold text-text">{summary.cantidadVentas}</span>
          </div>
        </div>
      }
      scroll="x"
    >
      {loading ? <LoaderBlack>Cargando</LoaderBlack> : null}

      <Drawer
        open={drawerOpen}
        title={drawerTitle}
        subtitle={drawerSubtitle}
        onClose={closeDrawer}
        footer={
          <div className="flex items-center justify-between gap-3">
            <div className="text-[12px] text-muted">
              Ventas: <span className="font-semibold text-text">{ventas.length}</span>
            </div>
            <Button theme="Secondary" click={closeDrawer}>
              Cerrar
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-surface-2/60 p-1 ring-1 ring-border/15">
            <button
              type="button"
              className={`rounded-2xl px-3 py-2 text-[12px] font-semibold transition ${drawerTab === 'ventas' ? 'bg-surface text-text shadow-sm ring-1 ring-border/20' : 'text-muted hover:bg-surface/60 hover:text-text'}`}
              onClick={() => setDrawerTab('ventas')}
            >
              Ventas
            </button>
            <button
              type="button"
              className={`rounded-2xl px-3 py-2 text-[12px] font-semibold transition ${drawerTab === 'productos' ? 'bg-surface text-text shadow-sm ring-1 ring-border/20' : 'text-muted hover:bg-surface/60 hover:text-text'}`}
              onClick={() => {
                setDrawerTab('productos')
                ensureProductosAgg().catch(() => {})
              }}
            >
              Productos
            </button>
            <button
              type="button"
              className={`rounded-2xl px-3 py-2 text-[12px] font-semibold transition ${drawerTab === 'movimientos' ? 'bg-surface text-text shadow-sm ring-1 ring-border/20' : 'text-muted hover:bg-surface/60 hover:text-text'}`}
              onClick={() => {
                setDrawerTab('movimientos')
                ensureMovimientos().catch(() => {})
              }}
            >
              Movimientos
            </button>
          </div>

          {ventasLoading ? <div className="rounded-2xl bg-surface/50 p-4 text-[13px] text-muted ring-1 ring-border/15">Cargando ventas...</div> : null}

          {drawerTab === 'ventas' ? (
            <div className="space-y-3">
              {!ventas.length ? (
                <div className="rounded-2xl bg-surface/50 p-4 text-[13px] text-muted ring-1 ring-border/15">Sin ventas en el rango.</div>
              ) : (
                <div className="grid gap-2">
                  {ventas.slice(0, 120).map((v) => {
                    const selected = v.ventaId === ventaSel
                    const estado = String(v.estado || '')
                    return (
                      <button
                        key={v.ventaId}
                        type="button"
                        className={`flex w-full items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3 text-left ring-1 transition hover:bg-surface/95 ${selected ? 'ring-accent/35' : 'ring-border/15'}`}
                        onClick={() => setVentaSel(v.ventaId)}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-semibold text-text">Venta {String(v.ventaId).slice(0, 8)}</div>
                          <div className="mt-1 text-[12px] text-muted">
                            {new Date(asNumber(v.creadoEn, 0)).toLocaleString('es-BO')} â€¢{' '}
                            <span className={estado === 'anulada' ? 'text-rose-400' : 'text-muted'}>{estado || 'â€”'}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[13px] font-semibold text-text">{money(v.total)}</div>
                          <div className="mt-1 text-[12px] text-muted">Total</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {ventaSel ? (
                <div className="rounded-3xl bg-surface-2/60 p-4 ring-1 ring-border/15">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[13px] font-semibold text-text">Detalle</div>
                      <div className="mt-1 text-[12px] text-muted">Venta {String(ventaSel).slice(0, 8)}</div>
                    </div>
                    <button type="button" className="text-[12px] font-semibold text-muted hover:text-text" onClick={() => setVentaSel(null)}>
                      Cerrar
                    </button>
                  </div>

                  {ventaDetailLoading ? (
                    <div className="mt-3 text-[13px] text-muted">Cargando detalle...</div>
                  ) : !ventaDetail ? (
                    <div className="mt-3 text-[13px] text-muted">No se pudo cargar la venta.</div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-2xl bg-surface px-3 py-2 ring-1 ring-border/15">
                          <div className="text-[11px] font-semibold text-muted">Estado</div>
                          <div className="mt-0.5 text-[13px] font-semibold text-text">{String(ventaDetail.estado || 'â€”')}</div>
                        </div>
                        <div className="rounded-2xl bg-surface px-3 py-2 ring-1 ring-border/15">
                          <div className="text-[11px] font-semibold text-muted">MÃ©todo</div>
                          <div className="mt-0.5 text-[13px] font-semibold text-text">{String(ventaDetail.metodoPago || 'â€”')}</div>
                        </div>
                      </div>

                      <div className="rounded-2xl bg-surface px-3 py-2 ring-1 ring-border/15">
                        <div className="text-[11px] font-semibold text-muted">Total</div>
                        <div className="mt-0.5 text-[15px] font-semibold text-text">{money(ventaDetail.total)}</div>
                      </div>

                      <div className="rounded-2xl bg-surface px-3 py-2 ring-1 ring-border/15">
                        <div className="text-[11px] font-semibold text-muted">Items</div>
                        <div className="mt-2 space-y-2">
                          {Object.entries(ventaDetail.items || {}).length === 0 ? (
                            <div className="text-[12px] text-muted">Sin items.</div>
                          ) : (
                            Object.entries(ventaDetail.items || {}).map(([pid, it]) => {
                              const tallas = it?.tallas && typeof it.tallas === 'object' ? it.tallas : {}
                              const unidades = Object.values(tallas).reduce((acc, n) => acc + asNumber(n, 0), 0)
                              return (
                                <div key={pid} className="rounded-2xl bg-surface-2/60 p-3 ring-1 ring-border/10">
                                  <div className="text-[13px] font-semibold text-text">
                                    {(it?.marca || '') + ' ' + (it?.modelo || '')} <span className="text-muted">â€¢</span>{' '}
                                    <span className="text-muted">{it?.nombre || ''}</span>
                                  </div>
                                  <div className="mt-1 text-[12px] text-muted">
                                    Unidades: <span className="font-semibold text-text">{unidades}</span> â€¢ P/U:{' '}
                                    <span className="font-semibold text-text">{money(it?.precioUnitario)}</span>
                                  </div>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {Object.entries(tallas)
                                      .sort((a, b) => String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true }))
                                      .map(([t, q]) => (
                                        <div key={`${pid}-${t}`} className="inline-flex items-center gap-2 rounded-xl bg-surface px-2.5 py-1 text-[12px] font-semibold ring-1 ring-border/15">
                                          <span className="text-muted">T{String(t).trim()}</span>
                                          <span className="text-text">{asNumber(q, 0)}</span>
                                        </div>
                                      ))}
                                  </div>
                                </div>
                              )
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          {drawerTab === 'productos' ? (
            <div className="space-y-3">
              {productosLoading ? <div className="rounded-2xl bg-surface/50 p-4 text-[13px] text-muted ring-1 ring-border/15">Calculando...</div> : null}
              {!productosAgg ? (
                <div className="rounded-2xl bg-surface/50 p-4 text-[13px] text-muted ring-1 ring-border/15">Listo para calcular top productos.</div>
              ) : productosAgg.rows.length === 0 ? (
                <div className="rounded-2xl bg-surface/50 p-4 text-[13px] text-muted ring-1 ring-border/15">Sin datos de productos (solo ventas confirmadas).</div>
              ) : (
                <div className="space-y-2">
                  {productosAgg.rows.slice(0, 30).map((p) => (
                    <div key={p.productoId} className="rounded-2xl bg-surface px-4 py-3 ring-1 ring-border/15">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-semibold text-text">
                            {(p.marca || '') + ' ' + (p.modelo || '')} <span className="text-muted">â€¢</span>{' '}
                            <span className="text-muted">{p.nombre || ''}</span>
                          </div>
                          <div className="mt-1 text-[12px] text-muted">
                            Unidades: <span className="font-semibold text-text">{asNumber(p.unidades, 0)}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[13px] font-semibold text-text">{money(p.monto)}</div>
                          <div className="mt-1 text-[12px] text-muted">Monto</div>
                        </div>
                      </div>
                    </div>
                  ))}

                  <div className="flex items-center justify-between gap-3 pt-2">
                    <div className="text-[12px] text-muted">
                      Procesadas: <span className="font-semibold text-text">{productosAgg.processed}</span> /{' '}
                      <span className="font-semibold text-text">{productosAgg.total}</span>
                    </div>
                    {productosAgg.processed < productosAgg.total ? (
                      <Button theme="Secondary" click={() => ensureProductosAgg({ batch: 60 })}>
                        Cargar mÃ¡s
                      </Button>
                    ) : (
                      <div className="text-[12px] text-muted">Completado</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {drawerTab === 'movimientos' ? (
            <div className="space-y-3">
              {movsLoading ? <div className="rounded-2xl bg-surface/50 p-4 text-[13px] text-muted ring-1 ring-border/15">Cargando movimientos...</div> : null}
              {!ventas.length ? (
                <div className="rounded-2xl bg-surface/50 p-4 text-[13px] text-muted ring-1 ring-border/15">Sin movimientos.</div>
              ) : (
                <div className="space-y-2">
                  {ventas.slice(0, 80).map((v) => {
                    const mov = movsByVentaId?.[v.ventaId]
                    const has = !!mov
                    return (
                      <div key={`mov-${v.ventaId}`} className="rounded-2xl bg-surface px-4 py-3 ring-1 ring-border/15">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-semibold text-text">venta_{String(v.ventaId).slice(0, 8)}</div>
                            <div className="mt-1 text-[12px] text-muted">{has ? new Date(asNumber(mov?.creadoEn, 0)).toLocaleString('es-BO') : 'Sin movimiento registrado'}</div>
                          </div>
                          <div className="text-right text-[12px] text-muted">{has ? String(mov?.tipo || 'â€”') : 'â€”'}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="text-[12px] text-muted">Tip: se crean como `movimientosInventario/venta_{{ventaId}}`.</div>
            </div>
          ) : null}
        </div>
      </Drawer>

      <Table minWidth={900}>
        <THead>
          <tr>
            {sucursalId === 'all' ? (
              <>
                <th className="px-3 py-3">Sucursal</th>
                <th className="px-3 py-3 text-right">Ventas</th>
                <th className="px-3 py-3 text-right">Total</th>
                <th className="px-3 py-3 text-right">Detalle</th>
              </>
            ) : (
              <>
                <th className="px-3 py-3">Día</th>
                <th className="px-3 py-3 text-right">Ventas</th>
                <th className="px-3 py-3 text-right">Total</th>
                <th className="px-3 py-3 text-right">Detalle</th>
              </>
            )}
          </tr>
        </THead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-4 py-10 text-center text-[13px] text-muted">
                Sin datos en el rango seleccionado.
              </td>
            </tr>
          ) : sucursalId === 'all' ? (
            rows.map((r) => (
              <tr key={r.sucursalId} className="border-b border-transparent odd:bg-surface/20 hover:bg-surface/35">
                <td className="px-3 py-3 text-text">{r.sucursalNombre}</td>
                <td className="px-3 py-3 text-text text-right">{r.cantidadVentas}</td>
                <td className="px-3 py-3 text-text text-right">{money(r.total)}</td>
                <td className="px-3 py-3 text-right">
                  <button
                    type="button"
                    className="text-[12px] font-semibold text-muted hover:text-text"
                    onClick={() => openDrawerForSucursal({ id: r.sucursalId, nombre: r.sucursalNombre, dayKey: null })}
                  >
                    Ver
                  </button>
                </td>
              </tr>
            ))
          ) : (
            rows.map((r) => (
              <tr key={r.dia} className="border-b border-transparent odd:bg-surface/20 hover:bg-surface/35">
                <td className="px-3 py-3 text-text">{keyToLabel(r.dia)}</td>
                <td className="px-3 py-3 text-text text-right">{r.cantidadVentas}</td>
                <td className="px-3 py-3 text-text text-right">{money(r.total)}</td>
                <td className="px-3 py-3 text-right">
                  <button
                    type="button"
                    className="text-[12px] font-semibold text-muted hover:text-text"
                    onClick={() => {
                      const s = sucursalesArr.find((x) => x.uuid === sucursalId)
                      openDrawerForSucursal({ id: sucursalId, nombre: s?.nombre || sucursalId, dayKey: r.dia })
                    }}
                  >
                    Ver
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
    </DataPanel>
  )
}
