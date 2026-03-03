'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import DataPanel from '@/components/DataPanel'
import Table, { THead } from '@/components/Table'
import LoaderBlack from '@/components/LoaderBlack'
import Drawer from '@/components/Drawer'
import Button from '@/components/Button'
import * as XLSX from 'xlsx'
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

function summarizeItems(items = {}) {
  const rows = []
  const productRows = []
  let units = 0
  const iterator = items && typeof items === 'object' ? Object.entries(items) : []
  for (const [productId, detail] of iterator) {
    const tallas = detail?.tallas && typeof detail.tallas === 'object' ? detail.tallas : {}
    const tallasList = []
    let productUnits = 0
    for (const [label, qtyRaw] of Object.entries(tallas)) {
      const qty = asNumber(qtyRaw, 0)
      if (qty <= 0) continue
      productUnits += qty
      tallasList.push(`${label}×${qty}`)
    }
    if (productUnits <= 0) continue
    units += productUnits
    const nameParts = [detail?.marca, detail?.modelo, detail?.nombre].filter(Boolean).join(' ').trim()
    const label = nameParts || productId || 'Producto'
    rows.push(tallasList.length ? `${label} (${tallasList.join(', ')})` : label)
    const unitPrice = asNumber(detail?.precioUnitario, 0)
    productRows.push({
      productId,
      label,
      tallas: tallasList.join(', '),
      units: productUnits,
      unitPrice,
      subtotal: unitPrice * productUnits,
    })
  }
  return { description: rows.join(' • '), units, productRows }
}

const dateTimeFormatter = new Intl.DateTimeFormat('es-BO', { dateStyle: 'short', timeStyle: 'short' })

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
  const [detailPanelOpen, setDetailPanelOpen] = useState(false)
  const [ventaDetailsById, setVentaDetailsById] = useState({})
  const detailItemsQueryRef = useRef('')

  const [ventasLoading, setVentasLoading] = useState(false)
  const [ventas, setVentas] = useState([]) // [{ ventaId, creadoEn, total, estado }]
  const [ventaSel, setVentaSel] = useState(null)
  const [ventaDetailLoading, setVentaDetailLoading] = useState(false)
  const [ventaDetail, setVentaDetail] = useState(null)

  const [productosLoading, setProductosLoading] = useState(false)
  const [productosAgg, setProductosAgg] = useState(null) // { processed, total, rows }

  const [movsLoading, setMovsLoading] = useState(false)
  const [movsByVentaId, setMovsByVentaId] = useState({})
  const [exportingExcel, setExportingExcel] = useState(false)

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
  }

  function closeDetailPanel() {
    setDetailPanelOpen(false)
    setDrawerOpen(false)
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
    setVentaDetailsById({})
  }

  function initDetailView({ id, nombre, dayKey = null }) {
    if (!id) return
    setDrawerSucursal({ id, nombre })
    setDrawerDayKey(dayKey)
    setDetailPanelOpen(true)
    setVentas([])
    setVentaSel(null)
    setVentaDetail(null)
    setProductosAgg(null)
    setMovsByVentaId({})
  }

  function openDrawerForSucursal({ id, nombre, dayKey = null }) {
    const payload = { id, nombre, dayKey }
    initDetailView(payload)
    setDrawerOpen(true)
    setDrawerTab('ventas')
  }

  const drawerTitle = drawerSucursal?.nombre ? `Sucursal: ${drawerSucursal.nombre}` : 'Detalle'
  const drawerSubtitle = drawerDayKey ? `DÃ­a: ${keyToLabel(drawerDayKey)}` : `Rango: ${desde} â†’ ${hasta}`
  const detailRows = useMemo(() => {
    const base = Array.isArray(ventas) ? ventas : []
    return base
      .map((v) => {
        const created = asNumber(v?.creadoEn, 0)
        const dateLabel = created ? dateTimeFormatter.format(new Date(created)) : ''
        const detalleVenta = ventaDetailsById?.[v?.ventaId]
        const parsed = summarizeItems(detalleVenta?.items || v?.items)
        const metodo = String(v?.metodoPago || v?.metodo || v?.formaPago || '').trim() || 'efectivo'
        return {
          ventaId: v?.ventaId || v?.__key || '',
          created,
          dateLabel,
          total: asNumber(v?.total, 0),
          estado: String(v?.estado || '').trim() || 'pendiente',
          metodoPago: metodo,
          itemsDescription: parsed.description || 'Sin items',
          units: parsed.units || 0,
          productRows: parsed.productRows || [],
        }
      })
      .sort((a, b) => (b.created || 0) - (a.created || 0))
  }, [ventas, ventaDetailsById])

  const detailSummary = useMemo(() => {
    const totalSales = detailRows.length
    const totalAmount = detailRows.reduce((acc, row) => acc + row.total, 0)
    const totalUnits = detailRows.reduce((acc, row) => acc + row.units, 0)
    const qrPayments = detailRows.filter((row) => String(row.metodoPago).toLowerCase() === 'qr').length
    const average = totalSales ? totalAmount / totalSales : 0
    return { totalSales, totalAmount, totalUnits, average, qrPayments }
  }, [detailRows])

  const detailSectionOpen = detailPanelOpen && Boolean(drawerSucursal?.id)

  async function exportDetailExcel() {
    if (!detailSectionOpen) return
    if (!detailRows.length) {
      setUserSuccess?.('Espera a que se cargue el detalle antes de exportar.')
      return
    }
    setExportingExcel(true)
    try {
      const rangeLabel = drawerDayKey ? keyToLabel(drawerDayKey) : `${desde} — ${hasta}`
      const summarySheetData = [
        ['Clave', 'Valor'],
        ['Sucursal', drawerSucursal?.nombre || drawerSucursal?.id || ''],
        ['Rango', rangeLabel],
        ['Total ventas', detailSummary.totalSales],
        ['Total monto', money(detailSummary.totalAmount)],
        ['Total unidades', detailSummary.totalUnits],
        ['Promedio por venta', money(detailSummary.average)],
        ['Pagos QR', detailSummary.qrPayments],
      ]

      const detailHeaders = ['Venta', 'Fecha', 'Método', 'Producto', 'Tallas', 'Unidades', 'Precio unitario', 'Subtotal']
      const detailRowsData = []
      detailRows.forEach((row) => {
        detailRowsData.push([
          row.ventaId ? `Venta ${String(row.ventaId).slice(0, 8)}` : '',
          row.dateLabel || '',
          row.metodoPago || '',
          '',
          '',
          row.units,
          '',
          row.total,
        ])
        ;(row.productRows || []).forEach((product) => {
          detailRowsData.push([
            '',
            '',
            '',
            product.label,
            product.tallas,
            product.units,
            product.unitPrice,
            product.subtotal,
          ])
        })
      })

      const workbook = XLSX.utils.book_new()
      const summarySheet = XLSX.utils.aoa_to_sheet(summarySheetData)
      const detailSheet = XLSX.utils.aoa_to_sheet([detailHeaders, ...detailRowsData])
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen')
      XLSX.utils.book_append_sheet(workbook, detailSheet, 'Detalle ventas')

      const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const safeSucursal = (drawerSucursal?.nombre || drawerSucursal?.id || 'sucursal').replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase()
      const rangeSegment = drawerDayKey || `${desde.replace(/-/g, '')}-${hasta.replace(/-/g, '')}`
      const fileName = `reporte_${safeSucursal}_${rangeSegment}.xlsx`
      const anchor = document.createElement('a')
      anchor.href = URL.createObjectURL(blob)
      anchor.download = fileName
      anchor.style.display = 'none'
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(anchor.href)
    } catch (err) {
      setUserSuccess?.(err?.code || err?.message || 'repeat')
    } finally {
      setExportingExcel(false)
    }
  }

  useEffect(() => {
    if (!drawerOpen && !detailPanelOpen) return
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
  }, [desde, hasta, drawerDayKey, drawerOpen, detailPanelOpen, drawerSucursal?.id, setUserSuccess])

  useEffect(() => {
    if (!detailPanelOpen || !ventas?.length) {
      setVentaDetailsById({})
      detailItemsQueryRef.current = ''
      return
    }

    const ids = ventas.map((v) => v.ventaId).filter(Boolean)
    if (!ids.length || !drawerSucursal?.id) {
      setVentaDetailsById({})
      return
    }

    const queryId = `${drawerSucursal.id}|${drawerDayKey || 'range'}|${ids.join(',')}`
    detailItemsQueryRef.current = queryId
    let cancelled = false

    ;(async () => {
      try {
        const pairs = await Promise.all(ids.map((id) => getValue(`ventas/${id}`).catch(() => null)))
        if (cancelled || detailItemsQueryRef.current !== queryId) return
        const next = {}
        for (let i = 0; i < ids.length; i++) {
          if (pairs[i]) next[ids[i]] = pairs[i]
        }
        setVentaDetailsById(next)
      } catch (err) {
        if (!cancelled) setUserSuccess?.(err?.code || err?.message || 'repeat')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [ventas, detailPanelOpen, drawerSucursal?.id, drawerDayKey, setUserSuccess])

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
              <div className="text-[12px] text-muted">
                Tip: se crean como <span className="font-mono">movimientosInventario/venta_&lt;ventaId&gt;</span>.
              </div>
            </div>
          ) : null}
        </div>
      </Drawer>

      {detailSectionOpen ? (
        <div className="mb-4 space-y-4 rounded-3xl border border-border/40 bg-surface/50 p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[12px] text-muted">
                Detalle {drawerSucursal?.nombre || drawerSucursal?.id || 'de la sucursal'} ·
                {drawerDayKey ? ` ${keyToLabel(drawerDayKey)}` : ` ${desde} — ${hasta}`}
              </div>
              <div className="mt-1 text-[13px] font-semibold text-text">
                {detailRows.length} ventas · {money(detailSummary.totalAmount)}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button theme="Secondary" styled="w-full sm:w-auto" click={closeDetailPanel}>
                Cerrar detalle
              </Button>
              <Button
                theme="Secondary"
                styled="w-full sm:w-auto"
                disabled={!drawerSucursal?.id}
                click={() =>
                  openDrawerForSucursal({ id: drawerSucursal?.id, nombre: drawerSucursal?.nombre, dayKey: drawerDayKey })
                }
              >
                Ver ventas (modal)
              </Button>
              <Button
                theme="Primary"
                styled="w-full sm:w-auto"
                click={exportDetailExcel}
                disabled={exportingExcel || !detailRows.length}
              >
                {exportingExcel ? 'Exportando...' : detailRows.length ? 'Exportar Excel' : 'Sin ventas para exportar'}
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            {[
              { label: 'Ventas', value: detailSummary.totalSales },
              { label: 'Recaudado', value: money(detailSummary.totalAmount) },
              { label: 'Unidades', value: detailSummary.totalUnits },
              { label: 'Promedio', value: money(detailSummary.average) },
              { label: 'Pagos QR', value: detailSummary.qrPayments },
            ].map((stat) => (
              <div key={stat.label} className="rounded-2xl bg-white/80 p-3 text-center shadow-sm ring-1 ring-border/20">
                <div className="text-[11px] uppercase tracking-wide text-muted">{stat.label}</div>
                <div className="mt-1 text-[16px] font-semibold text-text">{stat.value}</div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <Table className="min-w-[900px]">
              <THead>
                <tr>
                  <th className="px-3 py-3 text-left text-[11px] uppercase tracking-wide text-muted">Venta</th>
                  <th className="px-3 py-3 text-left text-[11px] uppercase tracking-wide text-muted">Fecha</th>
                  <th className="px-3 py-3 text-left text-[11px] uppercase tracking-wide text-muted">Método</th>
                  <th className="px-3 py-3 text-left text-[11px] uppercase tracking-wide text-muted">Productos</th>
                  <th className="px-3 py-3 text-right text-[11px] uppercase tracking-wide text-muted">Unidades</th>
                  <th className="px-3 py-3 text-right text-[11px] uppercase tracking-wide text-muted">Total</th>
                </tr>
              </THead>
              <tbody>
                {detailRows.map((row) => (
                  <tr
                    key={row.ventaId || row.dateLabel}
                    className="border-b border-transparent odd:bg-surface/10 hover:bg-surface/30"
                  >
                    <td className="px-3 py-2 text-[13px] font-semibold text-text">
                      {row.ventaId ? `Venta ${String(row.ventaId).slice(0, 8)}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-[13px] text-text">{row.dateLabel || '—'}</td>
                    <td className="px-3 py-2 text-[13px] text-text">{row.metodoPago}</td>
                    <td className="px-3 py-2 text-[12px] text-text">
                      {row.productRows.length ? (
                        <div className="space-y-1">
                          {row.productRows.map((product) => (
                            <div key={`${product.productId}-${product.label}`} className="rounded-2xl bg-surface/70 p-2 ring-1 ring-border/10">
                              <div className="text-[12px] font-semibold text-text">{product.label}</div>
                              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                                {product.tallas ? <span>{product.tallas}</span> : null}
                                <span>{product.units} uds</span>
                                <span>{money(product.subtotal)}</span>
                                {product.unitPrice ? <span className="text-[10px] text-muted">({money(product.unitPrice)} c/u)</span> : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[12px] text-muted">Sin items</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-[13px] text-text">{row.units}</td>
                    <td className="px-3 py-2 text-right text-[13px] font-semibold text-text">{money(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </div>
      ) : null}

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
                      onClick={() => initDetailView({ id: r.sucursalId, nombre: r.sucursalNombre, dayKey: null })}
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
                        initDetailView({ id: sucursalId, nombre: s?.nombre || sucursalId, dayKey: r.dia })
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
