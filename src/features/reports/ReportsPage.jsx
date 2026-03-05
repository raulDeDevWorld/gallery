'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import DataPanel from '@/components/DataPanel'
import Table, { THead } from '@/components/Table'
import LoaderBlack from '@/components/LoaderBlack'
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

function safeKey(key) {
  return String(key || '').replace(/[.#$\[\]\/]/g, '_')
}

function summarizeItems(items = {}) {
  const rows = []
  const productRows = []
  let units = 0
  const iterator = items && typeof items === 'object' ? Object.entries(items) : []
  for (const [productId, detail] of iterator) {
    const tallas = detail?.tallas && typeof detail.tallas === 'object' ? detail.tallas : {}
    const preciosPorTalla = detail?.preciosPorTalla && typeof detail.preciosPorTalla === 'object' ? detail.preciosPorTalla : null

    const tallasList = []
    const tallasLines = []
    let productUnits = 0
    let subtotal = 0

    for (const [label, qtyRaw] of Object.entries(tallas)) {
      const qty = asNumber(qtyRaw, 0)
      if (qty <= 0) continue
      productUnits += qty
      tallasList.push(`${label}T—${qty}`)

      const unitPrice = asNumber(preciosPorTalla?.[label], NaN)
      const price = Number.isFinite(unitPrice) ? unitPrice : asNumber(detail?.precioUnitario, 0)
      subtotal += price * qty
      if (price) tallasLines.push(`${label}T—${qty} (${money(price)} c/u) = ${money(price * qty)}`)
      else tallasLines.push(`${label}T—${qty}`)
    }

    if (productUnits <= 0) continue
    units += productUnits
    const nameParts = [detail?.marca, detail?.modelo, detail?.nombre].filter(Boolean).join(' ').trim()
    const label = nameParts || productId || 'Producto'
    rows.push(tallasList.length ? `${label} (${tallasList.join(', ')})` : label)

    productRows.push({
      productId,
      label,
      tallas: tallasList.join(', '),
      lines: tallasLines.join('\n'),
      units: productUnits,
      subtotal,
    })
  }
  return { description: rows.join(' â€¢ '), units, productRows }
}

function summarizeCompraItems(items = {}) {
  const productRows = []
  let units = 0
  let total = 0

  const iterator = items && typeof items === 'object' ? Object.entries(items) : []
  for (const [productId, detail] of iterator) {
    const tallas = detail?.tallas && typeof detail.tallas === 'object' ? detail.tallas : {}
    const lines = []
    let productUnits = 0
    let subtotal = 0

    for (const [t, data] of Object.entries(tallas)) {
      const talla = String(t ?? '').trim()
      const qty = asNumber(data?.cantidad, 0)
      const costo = asNumber(data?.costoUnitario, 0)
      if (!talla || qty <= 0) continue
      productUnits += qty
      const lineTotal = qty * costo
      subtotal += lineTotal
      lines.push(`${talla}T—${qty} (${money(costo)} c/u) = ${money(lineTotal)}`)
    }

    if (productUnits <= 0) continue
    units += productUnits
    total += subtotal
    productRows.push({ productId, lines: lines.join('\n'), units: productUnits, total: subtotal })
  }

  return { units, total, productRows }
}

function summarizeInvMovimientoItems(items = {}) {
  const productRows = []
  let units = 0

  const iterator = items && typeof items === 'object' ? Object.entries(items) : []
  for (const [productId, detail] of iterator) {
    const tallas = detail?.tallas && typeof detail.tallas === 'object' ? detail.tallas : {}
    const lines = []
    let productUnits = 0

    for (const [t, data] of Object.entries(tallas)) {
      const talla = String(t ?? '').trim()
      const qty = asNumber(data?.cantidad ?? data, 0)
      const costo = data && typeof data === 'object' ? asNumber(data?.costoUnitario, NaN) : NaN
      if (!talla || qty <= 0) continue
      productUnits += qty
      if (Number.isFinite(costo)) lines.push(`${talla}T—${qty} (costo ${money(costo)})`)
      else lines.push(`${talla}T—${qty}`)
    }

    if (productUnits <= 0) continue
    units += productUnits
    productRows.push({ productId, lines: lines.join('\n'), units: productUnits })
  }

  return { units, productRows }
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
  const [summary, setSummary] = useState({ total: 0, cantidadVentas: 0, costoTotal: 0, margenBruto: 0 })
  const [loading, setLoading] = useState(false)

  const [detailTab, setDetailTab] = useState('ventas') // ventas|compras|inventario|transferencias
  const [drawerSucursal, setDrawerSucursal] = useState(null) // { id, nombre }
  const [drawerDayKey, setDrawerDayKey] = useState(null) // yyyymmdd|null
  const [detailPanelOpen, setDetailPanelOpen] = useState(false)
  const [ventaDetailsById, setVentaDetailsById] = useState({})
  const detailItemsQueryRef = useRef('')

  // Expand rows (audit drill-down) - loaded on demand to avoid heavy reads.
  const [expandedVentasById, setExpandedVentasById] = useState({}) // { [ventaId]: true }
  const [ventaLotesById, setVentaLotesById] = useState({}) // { [ventaId]: { rows: [], costoIncompleto } | null }
  const [ventaLotesLoadingById, setVentaLotesLoadingById] = useState({}) // { [ventaId]: true }

  const [expandedComprasById, setExpandedComprasById] = useState({}) // { [compraId]: true }
  const [compraLotesById, setCompraLotesById] = useState({}) // { [compraId]: { rows: [] } | null }
  const [compraLotesLoadingById, setCompraLotesLoadingById] = useState({}) // { [compraId]: true }

  const [expandedInvMovsById, setExpandedInvMovsById] = useState({}) // { [movId]: true }
  const [invMovDetalleById, setInvMovDetalleById] = useState({}) // { [movId]: movimientoInventario | null }
  const [invMovDetalleLoadingById, setInvMovDetalleLoadingById] = useState({}) // { [movId]: true }
  const [invMovLotesById, setInvMovLotesById] = useState({}) // { [movId]: { rows: [] } | null }
  const [invMovLotesLoadingById, setInvMovLotesLoadingById] = useState({}) // { [movId]: true }

  const [ventasLoading, setVentasLoading] = useState(false)
  const [ventas, setVentas] = useState([]) // [{ ventaId, creadoEn, total, estado }]
  const [ventaSel, setVentaSel] = useState(null)
  const [ventaDetailLoading, setVentaDetailLoading] = useState(false)
  const [ventaDetail, setVentaDetail] = useState(null)

  const [productosLoading, setProductosLoading] = useState(false)
  const [productosAgg, setProductosAgg] = useState(null) // { processed, total, rows }

  const [comprasLoading, setComprasLoading] = useState(false)
  const [compras, setCompras] = useState([]) // [{ compraId, creadoEn, unidades, costoTotal, proveedor, nota, productoId, marca, modelo, nombre, items }]

  const [invMovsLoading, setInvMovsLoading] = useState(false)
  const [invMovs, setInvMovs] = useState([]) // [{ movId, creadoEn, tipo, unidades, costoTotal, motivo, nota, marca, modelo, nombre, items }]
  const [transferMovs, setTransferMovs] = useState([]) // [{ movId, creadoEn, tipo, unidades|null, costoTotal, costoIncompleto, transferenciaId, desdeSucursalId, haciaSucursalId, nota }]

  const [movsLoading, setMovsLoading] = useState(false)
  const [movsByVentaId, setMovsByVentaId] = useState({})
  const [exportingExcel, setExportingExcel] = useState(false)

  const lastDrawerQueryRef = useRef('')
  const lastComprasQueryRef = useRef('')

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
    const next = {}
    for (const s of sucursalesArr) next[s.uuid] = s.nombre
    return next
  }, [sucursalesArr])

  useEffect(() => {
    if (!admin) return
    const startKey = toKey(desde)
    const endKey = toKey(hasta)
    if (!startKey || !endKey) return

    let cancelled = false
    setLoading(true)

      ; (async () => {
        try {
          if (sucursalId === 'all') {
            const perSucursal = await Promise.all(
              sucursalesArr.map(async (s) => {
                const items = await getRangeByKey(`reportes/ventasPorSucursalDia/${s.uuid}`, { start: startKey, end: endKey })
                const total = items.reduce((acc, r) => acc + Number(r?.total || 0), 0)
                const costoTotal = items.reduce((acc, r) => acc + Number(r?.costoTotal || 0), 0)
                const margenBruto = items.reduce((acc, r) => acc + Number(r?.margenBruto || 0), 0)
                const cantidadVentas = items.reduce((acc, r) => acc + Number(r?.cantidadVentas || 0), 0)
                return { sucursalId: s.uuid, sucursalNombre: s.nombre, total, costoTotal, margenBruto, cantidadVentas }
              })
            )

            const total = perSucursal.reduce((acc, r) => acc + Number(r.total || 0), 0)
            const costoTotal = perSucursal.reduce((acc, r) => acc + Number(r.costoTotal || 0), 0)
            const margenBruto = perSucursal.reduce((acc, r) => acc + Number(r.margenBruto || 0), 0)
            const cantidadVentas = perSucursal.reduce((acc, r) => acc + Number(r.cantidadVentas || 0), 0)

            if (!cancelled) {
              setRows(perSucursal)
              setSummary({ total, costoTotal, margenBruto, cantidadVentas })
            }
            return
          }

          const items = await getRangeByKey(`reportes/ventasPorSucursalDia/${sucursalId}`, { start: startKey, end: endKey })
          const dayRows = items
            .map((r) => ({
              dia: r.__key,
              total: Number(r?.total || 0),
              costoTotal: Number(r?.costoTotal || 0),
              margenBruto: Number(r?.margenBruto || 0),
              cantidadVentas: Number(r?.cantidadVentas || 0),
            }))
            .sort((a, b) => String(a.dia).localeCompare(String(b.dia)))

          const total = dayRows.reduce((acc, r) => acc + Number(r.total || 0), 0)
          const costoTotal = dayRows.reduce((acc, r) => acc + Number(r.costoTotal || 0), 0)
          const margenBruto = dayRows.reduce((acc, r) => acc + Number(r.margenBruto || 0), 0)
          const cantidadVentas = dayRows.reduce((acc, r) => acc + Number(r.cantidadVentas || 0), 0)

          if (!cancelled) {
            setRows(dayRows)
            setSummary({ total, costoTotal, margenBruto, cantidadVentas })
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

  function closeDetailPanel() {
    setDetailPanelOpen(false)
    setDetailTab('ventas')
    setDrawerSucursal(null)
    setDrawerDayKey(null)
    setVentas([])
    setCompras([])
    setInvMovs([])
    setTransferMovs([])
    setVentaSel(null)
    setVentaDetail(null)
    setProductosAgg(null)
    setMovsByVentaId({})
    setVentasLoading(false)
    setVentaDetailLoading(false)
    setProductosLoading(false)
    setComprasLoading(false)
    setInvMovsLoading(false)
    setMovsLoading(false)
    setVentaDetailsById({})
    setExpandedVentasById({})
    setVentaLotesById({})
    setVentaLotesLoadingById({})
    setExpandedComprasById({})
    setCompraLotesById({})
    setCompraLotesLoadingById({})
    setExpandedInvMovsById({})
    setInvMovDetalleById({})
    setInvMovDetalleLoadingById({})
    setInvMovLotesById({})
    setInvMovLotesLoadingById({})
  }

  function initDetailView({ id, nombre, dayKey = null }) {
    if (!id) return
    setDrawerSucursal({ id, nombre })
    setDrawerDayKey(dayKey)
    setDetailPanelOpen(true)
    setDetailTab('ventas')
    setVentas([])
    setCompras([])
    setInvMovs([])
    setTransferMovs([])
    setVentaSel(null)
    setVentaDetail(null)
    setProductosAgg(null)
    setMovsByVentaId({})
    setExpandedVentasById({})
    setVentaLotesById({})
    setVentaLotesLoadingById({})
    setExpandedComprasById({})
    setCompraLotesById({})
    setCompraLotesLoadingById({})
    setExpandedInvMovsById({})
    setInvMovDetalleById({})
    setInvMovDetalleLoadingById({})
    setInvMovLotesById({})
    setInvMovLotesLoadingById({})
  }
  const detailRows = useMemo(() => {
    const base = Array.isArray(ventas) ? ventas : []
    return base
      .map((v) => {
        const created = asNumber(v?.creadoEn, 0)
        const dateLabel = created ? dateTimeFormatter.format(new Date(created)) : ''
        const detalleVenta = ventaDetailsById?.[v?.ventaId]
        const parsed = summarizeItems(detalleVenta?.items || v?.items)
        const metodo = String(v?.metodoPago || v?.metodo || v?.formaPago || '').trim() || 'efectivo'
        const costoTotal = asNumber(v?.costoTotal, NaN)
        const margenBruto = asNumber(v?.margenBruto, NaN)
        const costoFromDetail = asNumber(detalleVenta?.costoTotal, 0)
        const margenFromDetail = asNumber(detalleVenta?.margenBruto, asNumber(detalleVenta?.total, 0) - costoFromDetail)
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
          costoTotal: Number.isFinite(costoTotal) ? costoTotal : costoFromDetail,
          margenBruto: Number.isFinite(margenBruto) ? margenBruto : margenFromDetail,
          costoIncompleto: Boolean(detalleVenta?.costoIncompleto),
        }
      })
      .sort((a, b) => (b.created || 0) - (a.created || 0))
  }, [ventas, ventaDetailsById])

  const comprasRows = useMemo(() => {
    const base = Array.isArray(compras) ? compras : []
    return base
      .map((c) => {
        const created = asNumber(c?.creadoEn, 0)
        const dateLabel = created ? dateTimeFormatter.format(new Date(created)) : ''
        const parsed = summarizeCompraItems(c?.items || {})
        const labelParts = [c?.marca, c?.modelo, c?.nombre].filter(Boolean).join(' ').trim()
        const label = labelParts || c?.productoId || c?.compraId || 'Producto'
        const proveedor = String(c?.proveedor || '').trim()
        const nota = String(c?.nota || '').trim()

        let lines = ''
        if (parsed.productRows.length) lines = parsed.productRows[0]?.lines || ''

        return {
          compraId: c?.compraId || c?.__key || '',
          created,
          dateLabel,
          productoId: String(c?.productoId || parsed.productRows?.[0]?.productId || '').trim(),
          productoLabel: label,
          proveedor: proveedor || 'â€”',
          nota: nota || '',
          unidades: asNumber(c?.unidades, parsed.units || 0),
          costoTotal: asNumber(c?.costoTotal, parsed.total || 0),
          lines,
          items: c?.items && typeof c.items === 'object' ? c.items : {},
        }
      })
      .sort((a, b) => (b.created || 0) - (a.created || 0))
  }, [compras])

  const comprasSummary = useMemo(() => {
    const totalCompras = comprasRows.length
    const totalUnidades = comprasRows.reduce((acc, r) => acc + asNumber(r.unidades, 0), 0)
    const totalInversion = comprasRows.reduce((acc, r) => acc + asNumber(r.costoTotal, 0), 0)
    return { totalCompras, totalUnidades, totalInversion }
  }, [comprasRows])

  const invMovsSummary = useMemo(() => {
    const mermas = invMovs.filter((m) => m.tipo === 'merma')
    const regs = invMovs.filter((m) => m.tipo === 'regularizacion')
    const mermaUnidades = mermas.reduce((acc, m) => acc + asNumber(m.unidades, 0), 0)
    const mermaCosto = mermas.reduce((acc, m) => acc + asNumber(m.costoTotal, 0), 0)
    const regUnidades = regs.reduce((acc, m) => acc + asNumber(m.unidades, 0), 0)
    const regCosto = regs.reduce((acc, m) => acc + asNumber(m.costoTotal, 0), 0)
    return { mermaUnidades, mermaCosto, regUnidades, regCosto, total: invMovs.length }
  }, [invMovs])

  const transferSummary = useMemo(() => {
    const entradas = transferMovs.filter((m) => m.tipo === 'transferencia_entrada')
    const salidas = transferMovs.filter((m) => m.tipo === 'transferencia_salida')
    const entradaUnidades = entradas.reduce((acc, m) => acc + asNumber(m.unidades, 0), 0)
    const salidaUnidades = salidas.reduce((acc, m) => acc + asNumber(m.unidades, 0), 0)
    const entradaCosto = entradas.reduce((acc, m) => acc + asNumber(m.costoTotal, 0), 0)
    const salidaCosto = salidas.reduce((acc, m) => acc + asNumber(m.costoTotal, 0), 0)
    const sinCosto = transferMovs.filter((m) => Boolean(m.costoIncompleto)).length
    return { entradaUnidades, salidaUnidades, entradaCosto, salidaCosto, total: transferMovs.length, sinCosto }
  }, [transferMovs])

  const detailSummary = useMemo(() => {
    const totalSales = detailRows.length
    const totalAmount = detailRows.reduce((acc, row) => acc + row.total, 0)
    const totalCost = detailRows.reduce((acc, row) => acc + asNumber(row.costoTotal, 0), 0)
    const totalMargin = detailRows.reduce((acc, row) => acc + asNumber(row.margenBruto, 0), 0)
    const totalUnits = detailRows.reduce((acc, row) => acc + row.units, 0)
    const qrPayments = detailRows.filter((row) => String(row.metodoPago).toLowerCase() === 'qr').length
    const average = totalSales ? totalAmount / totalSales : 0
    const sinCosto = detailRows.filter((row) => row.costoIncompleto).length
    return { totalSales, totalAmount, totalCost, totalMargin, totalUnits, average, qrPayments, sinCosto }
  }, [detailRows])

  const detailSectionOpen = detailPanelOpen && Boolean(drawerSucursal?.id)

  function loteStatus(initialQty, availableQty) {
    const initial = asNumber(initialQty, NaN)
    const available = asNumber(availableQty, NaN)
    if (!Number.isFinite(initial) || !Number.isFinite(available)) return { label: 'Desconocido', tone: 'muted', pct: null }
    if (initial <= 0) return { label: 'Desconocido', tone: 'muted', pct: null }
    if (available <= 0) return { label: 'Agotado', tone: 'danger', pct: 100 }
    if (available >= initial) return { label: 'Nuevo', tone: 'ok', pct: 0 }
    const consumed = initial - available
    const pct = Math.round((consumed / initial) * 100)
    return { label: 'Parcial', tone: 'warn', pct }
  }

  async function ensureVentaLotes(ventaId) {
    const id = String(ventaId || '').trim()
    if (!id) return
    if (ventaLotesById[id] !== undefined) return
    if (ventaLotesLoadingById[id]) return

    setVentaLotesLoadingById((prev) => ({ ...prev, [id]: true }))
    try {
      const venta = await getValue(`ventas/${id}`)
      const items = venta?.items && typeof venta.items === 'object' ? venta.items : {}

      const rows = []
      for (const [productoId, detail] of Object.entries(items)) {
        const labelParts = [detail?.marca, detail?.modelo, detail?.nombre].filter(Boolean).join(' ').trim()
        const productoLabel = labelParts || String(productoId || '').trim() || 'Producto'
        const consumo = detail?.consumoLotes && typeof detail.consumoLotes === 'object' ? detail.consumoLotes : {}

        for (const [talla, consumos] of Object.entries(consumo || {})) {
          const list = Array.isArray(consumos) ? consumos : []
          for (const c of list) {
            const loteId = String(c?.loteId || '').trim()
            const cantidad = asNumber(c?.cantidad, 0)
            const costoUnitario = asNumber(c?.costoUnitario, 0)
            if (!loteId || cantidad <= 0) continue
            rows.push({
              productoId,
              productoLabel,
              talla: String(talla || '').trim(),
              loteId,
              cantidad,
              costoUnitario,
              costoDesconocido: c?.costoDesconocido === true,
            })
          }
        }
      }

      setVentaLotesById((prev) => ({
        ...prev,
        [id]: {
          rows,
          costoIncompleto: venta?.costoIncompleto === true,
        },
      }))
    } catch (err) {
      setUserSuccess?.(err?.code || err?.message || 'repeat')
      setVentaLotesById((prev) => ({ ...prev, [id]: null }))
    } finally {
      setVentaLotesLoadingById((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }
  }

  async function ensureCompraLotes(compra) {
    const compraId = String(compra?.compraId || '').trim()
    if (!compraId) return
    if (!drawerSucursal?.id) return
    if (compraLotesById[compraId] !== undefined) return
    if (compraLotesLoadingById[compraId]) return

    setCompraLotesLoadingById((prev) => ({ ...prev, [compraId]: true }))
    try {
      const sid = String(drawerSucursal.id)
      const items = compra?.items && typeof compra.items === 'object' ? compra.items : {}
      const tasks = []

      for (const [productoId, detail] of Object.entries(items)) {
        const tallas = detail?.tallas && typeof detail.tallas === 'object' ? detail.tallas : {}
        for (const [talla, data] of Object.entries(tallas)) {
          const t = String(talla ?? '').trim()
          if (!t) continue
          const loteId = `${safeKey(compraId)}_${safeKey(t)}`
          tasks.push({
            productoId,
            talla: t,
            loteId,
            initialFallback: asNumber(data?.cantidad, 0),
            path: `lotesCompra/${sid}/${productoId}/${t}/${loteId}`,
          })
        }
      }

      const results = await Promise.all(
        tasks.map(async (t) => {
          const lote = await getValue(t.path).catch(() => null)
          const initial = lote?.cantidadInicial ?? t.initialFallback
          const available = lote?.cantidadDisponible
          return {
            productoId: t.productoId,
            talla: t.talla,
            loteId: t.loteId,
            cantidadInicial: asNumber(initial, NaN),
            cantidadDisponible: asNumber(available, NaN),
            creadoEn: asNumber(lote?.creadoEn, 0),
            costoUnitario: asNumber(lote?.costoUnitario, NaN),
          }
        })
      )

      setCompraLotesById((prev) => ({ ...prev, [compraId]: { rows: results } }))
    } catch (err) {
      setUserSuccess?.(err?.code || err?.message || 'repeat')
      setCompraLotesById((prev) => ({ ...prev, [compraId]: null }))
    } finally {
      setCompraLotesLoadingById((prev) => {
        const next = { ...prev }
        delete next[compraId]
        return next
      })
    }
  }

  async function ensureInvMovDetalle(movId) {
    const id = String(movId || '').trim()
    if (!id) return
    if (invMovDetalleById[id] !== undefined) return
    if (invMovDetalleLoadingById[id]) return

    setInvMovDetalleLoadingById((prev) => ({ ...prev, [id]: true }))
    try {
      const mov = await getValue(`movimientosInventario/${id}`)
      setInvMovDetalleById((prev) => ({ ...prev, [id]: mov || null }))
    } catch (err) {
      setUserSuccess?.(err?.code || err?.message || 'repeat')
      setInvMovDetalleById((prev) => ({ ...prev, [id]: null }))
    } finally {
      setInvMovDetalleLoadingById((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }
  }

  async function ensureInvMovLotes(mov) {
    const movId = String(mov?.movId || '').trim()
    if (!movId) return
    if (!drawerSucursal?.id) return
    if (invMovLotesById[movId] !== undefined) return
    if (invMovLotesLoadingById[movId]) return

    setInvMovLotesLoadingById((prev) => ({ ...prev, [movId]: true }))
    try {
      const sid = String(drawerSucursal.id)
      const items = mov?.items && typeof mov.items === 'object' ? mov.items : {}
      const tasks = []

      for (const [productoId, detail] of Object.entries(items)) {
        const tallas = detail?.tallas && typeof detail.tallas === 'object' ? detail.tallas : {}
        for (const [talla, data] of Object.entries(tallas)) {
          const t = String(talla ?? '').trim()
          if (!t) continue
          const loteId = `${safeKey(movId)}_${safeKey(t)}`
          tasks.push({
            productoId,
            talla: t,
            loteId,
            initialFallback: asNumber(data?.cantidad, 0),
            path: `lotesCompra/${sid}/${productoId}/${t}/${loteId}`,
          })
        }
      }

      const results = await Promise.all(
        tasks.map(async (t) => {
          const lote = await getValue(t.path).catch(() => null)
          const initial = lote?.cantidadInicial ?? t.initialFallback
          const available = lote?.cantidadDisponible
          return {
            productoId: t.productoId,
            talla: t.talla,
            loteId: t.loteId,
            cantidadInicial: asNumber(initial, NaN),
            cantidadDisponible: asNumber(available, NaN),
            creadoEn: asNumber(lote?.creadoEn, 0),
            costoUnitario: asNumber(lote?.costoUnitario, NaN),
          }
        })
      )

      setInvMovLotesById((prev) => ({ ...prev, [movId]: { rows: results } }))
    } catch (err) {
      setUserSuccess?.(err?.code || err?.message || 'repeat')
      setInvMovLotesById((prev) => ({ ...prev, [movId]: null }))
    } finally {
      setInvMovLotesLoadingById((prev) => {
        const next = { ...prev }
        delete next[movId]
        return next
      })
    }
  }

  async function exportDetailExcel() {
    if (!detailSectionOpen) return
    if (!detailRows.length) {
      setUserSuccess?.('Espera a que se cargue el detalle antes de exportar.')
      return
    }
    setExportingExcel(true)
    try {
      const rangeLabel = drawerDayKey ? keyToLabel(drawerDayKey) : `${desde} â€” ${hasta}`
      const title = `Detalle ${drawerSucursal?.nombre || drawerSucursal?.id || 'de la sucursal'} Â· ${rangeLabel}`
      const statsOrder = [
        { label: 'Ventas', value: detailSummary.totalSales },
        { label: 'Recaudado', value: money(detailSummary.totalAmount) },
        { label: 'Costo', value: money(detailSummary.totalCost) },
        { label: 'Margen', value: money(detailSummary.totalMargin) },
        { label: 'Reposiciones', value: comprasSummary.totalCompras },
        { label: 'Inversion', value: money(comprasSummary.totalInversion) },
        { label: 'Mermas (uds)', value: invMovsSummary.mermaUnidades },
        { label: 'Costo mermas', value: money(invMovsSummary.mermaCosto) },
        { label: 'Regularizaciones (uds)', value: invMovsSummary.regUnidades },
        { label: 'Costo regularizaciones', value: money(invMovsSummary.regCosto) },
        { label: 'Transferencias entrada (uds)', value: transferSummary.entradaUnidades },
        { label: 'Costo transferencias entrada', value: money(transferSummary.entradaCosto) },
        { label: 'Transferencias salida (uds)', value: transferSummary.salidaUnidades },
        { label: 'Costo transferencias salida', value: money(transferSummary.salidaCosto) },
        { label: 'Transferencias sin costo', value: transferSummary.sinCosto },
        { label: 'Unidades', value: detailSummary.totalUnits },
        { label: 'Promedio', value: money(detailSummary.average) },
        { label: 'Pagos QR', value: detailSummary.qrPayments },
        { label: 'Ventas sin costo', value: detailSummary.sinCosto },
      ]

      const summarySheetData = [
        [title],
        [],
        ['Resumen', 'Valor'],
        ...statsOrder.map((stat) => [stat.label, stat.value]),
      ]

      const detailHeaders = ['Venta', 'Fecha', 'MÃ©todo', 'Productos', 'Unidades', 'Total', 'Costo', 'Margen']
      const detailRowsData = []
      detailRows.forEach((row) => {
        detailRowsData.push([
          row.ventaId ? `Venta ${String(row.ventaId).slice(0, 8)}` : '',
          row.dateLabel || '',
          row.metodoPago || '',
          '',
          row.units,
          row.total,
          row.costoTotal,
          row.margenBruto,
        ])
          ; (row.productRows || []).forEach((product) => {
            const productLines = [product.label]
            if (product.lines) productLines.push(product.lines)
            else if (product.tallas) productLines.push(product.tallas)
            productLines.push(`${product.units || 0} uds`)
            productLines.push(money(product.subtotal))

            detailRowsData.push([
              '',
              '',
              '',
              productLines.join('\n'),
              product.units,
              product.subtotal,
              '',
              '',
            ])
          })
      })

      const workbook = XLSX.utils.book_new()
      const summarySheet = XLSX.utils.aoa_to_sheet(summarySheetData)
      const detailSheet = XLSX.utils.aoa_to_sheet([detailHeaders, ...detailRowsData])
      summarySheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }]
      const styleTitle = {
        font: { name: 'Calibri', sz: 14, bold: true, color: { rgb: '1B2430' } },
        alignment: { horizontal: 'left' },
      }
      const styleHeader = {
        font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
        fill: {
          patternType: 'solid',
          fgColor: { rgb: '1B2430' },
        },
        alignment: { horizontal: 'center', vertical: 'center' },
      }
      const styleKey = {
        font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '1B2430' } },
        alignment: { horizontal: 'left' },
      }
      summarySheet['A1'].s = styleTitle
      summarySheet['A3'].s = styleKey
      summarySheet['B3'].s = { font: styleKey.font, alignment: { horizontal: 'left' } }
      for (let row = 4; row < 4 + statsOrder.length; row += 1) {
        const cellKey = summarySheet[`A${row}`]
        const cellVal = summarySheet[`B${row}`]
        if (cellKey) cellKey.s = styleKey
        if (cellVal) cellVal.s = { font: { name: 'Calibri', sz: 11 }, alignment: { horizontal: 'right' } }
      }
      detailHeaders.forEach((_, idx) => {
        const cellRef = `${String.fromCharCode(65 + idx)}1`
        detailSheet[cellRef] = {
          v: detailHeaders[idx],
          t: 's',
          s: styleHeader,
        }
      })
      detailSheet['!cols'] = [
        { wch: 22 },
        { wch: 20 },
        { wch: 18 },
        { wch: 40 },
        { wch: 10 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
      ]
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen')
      XLSX.utils.book_append_sheet(workbook, detailSheet, 'Detalle ventas')

      if (comprasRows.length) {
        const comprasHeaders = ['Compra', 'Fecha', 'Proveedor', 'Producto', 'Detalle', 'Unidades', 'Costo']
        const comprasData = [
          comprasHeaders,
          ...comprasRows.map((c) => [
            c.compraId ? `Compra ${String(c.compraId).slice(0, 8)}` : '',
            c.dateLabel || '',
            c.proveedor || '',
            c.productoLabel || '',
            c.lines || '',
            c.unidades || 0,
            c.costoTotal || 0,
          ]),
        ]
        const comprasSheet = XLSX.utils.aoa_to_sheet(comprasData)
        comprasHeaders.forEach((_, idx) => {
          const cellRef = `${String.fromCharCode(65 + idx)}1`
          comprasSheet[cellRef] = { v: comprasHeaders[idx], t: 's', s: styleHeader }
        })
        comprasSheet['!cols'] = [{ wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 35 }, { wch: 48 }, { wch: 10 }, { wch: 12 }]
        XLSX.utils.book_append_sheet(workbook, comprasSheet, 'Reposiciones')
      }

      if (invMovs.length) {
        const invHeaders = ['Tipo', 'Fecha', 'Producto', 'Motivo', 'Detalle', 'Unidades', 'Costo']
        const invData = [
          invHeaders,
          ...invMovs.map((m) => {
            const created = asNumber(m.creadoEn, 0)
            const dateLabel = created ? dateTimeFormatter.format(new Date(created)) : ''
            const label = [m.marca, m.modelo, m.nombre].filter(Boolean).join(' ').trim() || m.movId || ''
            const parsed = summarizeInvMovimientoItems(m.items || {})
            const lines = parsed.productRows.map((p) => p.lines).filter(Boolean).join('\n')

            return [
              m.tipo === 'merma' ? 'Merma' : 'Regularizacion',
              dateLabel,
              label,
              m.motivo || '',
              lines,
              asNumber(m.unidades, parsed.units || 0),
              asNumber(m.costoTotal, 0),
            ]
          }),
        ]

        const invSheet = XLSX.utils.aoa_to_sheet(invData)
        invHeaders.forEach((_, idx) => {
          const cellRef = `${String.fromCharCode(65 + idx)}1`
          invSheet[cellRef] = { v: invHeaders[idx], t: 's', s: styleHeader }
        })
        invSheet['!cols'] = [{ wch: 16 }, { wch: 20 }, { wch: 40 }, { wch: 18 }, { wch: 52 }, { wch: 10 }, { wch: 12 }]
        XLSX.utils.book_append_sheet(workbook, invSheet, 'Inventario')
      }

      if (transferMovs.length) {
        const nameById = {}
        for (const s of sucursalesArr || []) nameById[s.uuid] = s.nombre

        const trHeaders = ['Direccion', 'Fecha', 'Transferencia', 'Desde', 'Hacia', 'Unidades', 'Costo', 'Nota', 'Sin costo']
        const trData = [
          trHeaders,
          ...transferMovs.map((m) => {
            const created = asNumber(m.creadoEn, 0)
            const dateLabel = created ? dateTimeFormatter.format(new Date(created)) : ''
            const dir = m.tipo === 'transferencia_entrada' ? 'Entrada' : m.tipo === 'transferencia_salida' ? 'Salida' : String(m.tipo || '')
            const trId = m.transferenciaId ? `TR ${String(m.transferenciaId).slice(0, 10)}` : m.movId ? String(m.movId).slice(0, 14) : ''
            const desdeId = m.desdeSucursalId || ''
            const haciaId = m.haciaSucursalId || ''
            const desde = nameById[desdeId] || desdeId
            const hacia = nameById[haciaId] || haciaId
            const units = m.unidades == null ? '' : asNumber(m.unidades, 0)
            const sinCosto = m.costoIncompleto ? 'Si' : ''

            return [dir, dateLabel, trId, desde, hacia, units, asNumber(m.costoTotal, 0), m.nota || '', sinCosto]
          }),
        ]

        const trSheet = XLSX.utils.aoa_to_sheet(trData)
        trHeaders.forEach((_, idx) => {
          const cellRef = `${String.fromCharCode(65 + idx)}1`
          trSheet[cellRef] = { v: trHeaders[idx], t: 's', s: styleHeader }
        })
        trSheet['!cols'] = [
          { wch: 12 },
          { wch: 20 },
          { wch: 16 },
          { wch: 18 },
          { wch: 18 },
          { wch: 10 },
          { wch: 12 },
          { wch: 40 },
          { wch: 10 },
        ]
        XLSX.utils.book_append_sheet(workbook, trSheet, 'Transferencias')
      }

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
    if (!detailPanelOpen) return
    if (!drawerSucursal?.id) return

    const startTs = drawerDayKey ? startOfDayTs(keyToISO(drawerDayKey)) : startOfDayTs(desde)
    const endTs = drawerDayKey ? endOfDayTs(keyToISO(drawerDayKey)) : endOfDayTs(hasta)
    if (startTs == null || endTs == null) return

    const q = `${drawerSucursal.id}|${drawerDayKey || 'range'}|${startTs}|${endTs}`
    lastDrawerQueryRef.current = q

    let cancelled = false
    setVentasLoading(true)

      ; (async () => {
        try {
          const items = await getRangeByChild(`ventasPorSucursal/${drawerSucursal.id}`, 'creadoEn', { start: startTs, end: endTs })
          const mapped = (items || []).map((r) => ({
            ventaId: r.__key,
            creadoEn: asNumber(r?.creadoEn, 0),
            total: asNumber(r?.total, 0),
            costoTotal: asNumber(r?.costoTotal, 0),
            margenBruto: asNumber(r?.margenBruto, 0),
            metodoPago: r?.metodoPago ?? null,
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
  }, [desde, hasta, drawerDayKey, detailPanelOpen, drawerSucursal?.id, setUserSuccess])

  useEffect(() => {
    if (!detailPanelOpen) return
    if (!drawerSucursal?.id) return

    const startTs = drawerDayKey ? startOfDayTs(keyToISO(drawerDayKey)) : startOfDayTs(desde)
    const endTs = drawerDayKey ? endOfDayTs(keyToISO(drawerDayKey)) : endOfDayTs(hasta)
    if (startTs == null || endTs == null) return

    const q = `${drawerSucursal.id}|${drawerDayKey || 'range'}|${startTs}|${endTs}`
    lastComprasQueryRef.current = q

    let cancelled = false
    setComprasLoading(true)

      ; (async () => {
        try {
          const items = await getRangeByChild(`comprasPorSucursal/${drawerSucursal.id}`, 'creadoEn', { start: startTs, end: endTs })
          const mapped = (items || []).map((r) => ({
            compraId: r.__key,
            creadoEn: asNumber(r?.creadoEn, 0),
            unidades: asNumber(r?.unidades, 0),
            costoTotal: asNumber(r?.costoTotal, 0),
            productoId: r?.productoId ?? null,
            proveedor: r?.proveedor ?? null,
            nota: r?.nota ?? null,
            marca: r?.marca ?? null,
            modelo: r?.modelo ?? null,
            nombre: r?.nombre ?? null,
            items: r?.items ?? null,
          }))

          mapped.sort((a, b) => (b.creadoEn || 0) - (a.creadoEn || 0))
          if (!cancelled && lastComprasQueryRef.current === q) setCompras(mapped)
        } catch (err) {
          if (!cancelled) setUserSuccess?.(err?.code || err?.message || 'repeat')
        } finally {
          if (!cancelled) setComprasLoading(false)
        }
      })()

    return () => {
      cancelled = true
    }
  }, [desde, hasta, drawerDayKey, detailPanelOpen, drawerSucursal?.id, setUserSuccess])

  useEffect(() => {
    if (!detailPanelOpen) return
    if (!drawerSucursal?.id) return

    const startTs = drawerDayKey ? startOfDayTs(keyToISO(drawerDayKey)) : startOfDayTs(desde)
    const endTs = drawerDayKey ? endOfDayTs(keyToISO(drawerDayKey)) : endOfDayTs(hasta)
    if (startTs == null || endTs == null) return

    let cancelled = false
    setInvMovsLoading(true)

      ; (async () => {
        try {
          const items = await getRangeByChild(`movimientosPorSucursal/${drawerSucursal.id}`, 'creadoEn', { start: startTs, end: endTs })
          const mappedAll = (items || []).map((r) => ({
            movId: r.__key,
            creadoEn: asNumber(r?.creadoEn, 0),
            tipo: String(r?.tipo || ''),
            unidades: r?.unidades == null ? null : asNumber(r?.unidades, 0),
            costoTotal: asNumber(r?.costoTotal, 0),
            costoIncompleto: Boolean(r?.costoIncompleto),
            transferenciaId: r?.transferenciaId ?? null,
            desdeSucursalId: r?.desdeSucursalId ?? null,
            haciaSucursalId: r?.haciaSucursalId ?? null,
            motivo: r?.motivo ?? null,
            nota: r?.nota ?? null,
            marca: r?.marca ?? null,
            modelo: r?.modelo ?? null,
            nombre: r?.nombre ?? null,
            items: r?.items ?? null,
          }))

          const inv = mappedAll.filter((x) => x.tipo === 'merma' || x.tipo === 'regularizacion')
          const transfers = mappedAll.filter((x) => x.tipo === 'transferencia_entrada' || x.tipo === 'transferencia_salida')

          inv.sort((a, b) => (b.creadoEn || 0) - (a.creadoEn || 0))
          transfers.sort((a, b) => (b.creadoEn || 0) - (a.creadoEn || 0))

          if (!cancelled) setInvMovs(inv)
          if (!cancelled) setTransferMovs(transfers)
        } catch (err) {
          if (!cancelled) setUserSuccess?.(err?.code || err?.message || 'repeat')
          if (!cancelled) setInvMovs([])
          if (!cancelled) setTransferMovs([])
        } finally {
          if (!cancelled) setInvMovsLoading(false)
        }
      })()

    return () => {
      cancelled = true
    }
  }, [desde, hasta, drawerDayKey, detailPanelOpen, drawerSucursal?.id, setUserSuccess])

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

      ; (async () => {
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
    if (!detailPanelOpen) return
    if (!ventaSel) {
      setVentaDetail(null)
      return
    }

    let cancelled = false
    setVentaDetailLoading(true)

      ; (async () => {
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
  }, [detailPanelOpen, setUserSuccess, ventaSel])

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

          const precios = it?.preciosPorTalla && typeof it.preciosPorTalla === 'object' ? it.preciosPorTalla : null
          let monto = 0
          if (precios) {
            for (const [t, q] of Object.entries(tallas)) {
              const qty = asNumber(q, 0)
              if (qty <= 0) continue
              const unit = asNumber(precios?.[t], asNumber(it?.precioUnitario, 0))
              monto += qty * asNumber(unit, 0)
            }
          } else {
            const precioUnitario = asNumber(it?.precioUnitario, 0)
            monto = unidades * precioUnitario
          }


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
          <p className="mt-2 text-[14px] text-muted">El reporte histÃ³rico solo estÃ¡ disponible para administradores.</p>
        </div>
      </div>
    )
  }

  return (
    <DataPanel
      title="Reporte histÃ³rico"
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
            Total: <span className="font-semibold text-text">{money(summary.total)}</span> Â· Ventas:{' '}
            <span className="font-semibold text-text">{summary.cantidadVentas}</span>
          </div>
        </div>
      }
      scroll="x"
    >
      {loading ? <LoaderBlack>Cargando</LoaderBlack> : null}

      {detailSectionOpen ? (
        <div className="mb-4 space-y-4 rounded-3xl border border-border/40 bg-surface/50 p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[12px] text-muted">
                Detalle {drawerSucursal?.nombre || drawerSucursal?.id || 'de la sucursal'} Â·
                {drawerDayKey ? ` ${keyToLabel(drawerDayKey)}` : ` ${desde} â€” ${hasta}`}
              </div>
              <div className="mt-1 text-[13px] font-semibold text-text">
                {detailRows.length} ventas Â· {money(detailSummary.totalAmount)}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button theme="Secondary" styled="w-full sm:w-auto" click={closeDetailPanel}>
                Cerrar detalle
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

          <div className="grid grid-cols-4 gap-2 rounded-2xl bg-surface-2/60 p-1 ring-1 ring-border/15">
            <button
              type="button"
              className={`rounded-2xl px-3 py-2 text-[12px] font-semibold transition ${detailTab === 'ventas' ? 'bg-surface text-text shadow-sm ring-1 ring-border/20' : 'text-muted hover:bg-surface/60 hover:text-text'}`}
              onClick={() => setDetailTab('ventas')}
            >
              Ventas
            </button>
            <button
              type="button"
              className={`rounded-2xl px-3 py-2 text-[12px] font-semibold transition ${detailTab === 'compras' ? 'bg-surface text-text shadow-sm ring-1 ring-border/20' : 'text-muted hover:bg-surface/60 hover:text-text'}`}
              onClick={() => setDetailTab('compras')}
            >
              Reposiciones
            </button>
            <button
              type="button"
              className={`rounded-2xl px-3 py-2 text-[12px] font-semibold transition ${detailTab === 'inventario' ? 'bg-surface text-text shadow-sm ring-1 ring-border/20' : 'text-muted hover:bg-surface/60 hover:text-text'}`}
              onClick={() => setDetailTab('inventario')}
            >
              Inventario
            </button>
            <button
              type="button"
              className={`rounded-2xl px-3 py-2 text-[12px] font-semibold transition ${detailTab === 'transferencias' ? 'bg-surface text-text shadow-sm ring-1 ring-border/20' : 'text-muted hover:bg-surface/60 hover:text-text'}`}
              onClick={() => setDetailTab('transferencias')}
            >
              Transferencias
            </button>
          </div>

          {detailTab === 'ventas' ? (
            <div className="grid gap-3 md:grid-cols-7">
              {[
                { label: 'Ventas', value: detailSummary.totalSales },
                { label: 'Recaudado', value: money(detailSummary.totalAmount) },
                { label: 'Costo', value: money(detailSummary.totalCost) },
                { label: 'Margen', value: money(detailSummary.totalMargin) },
                { label: 'Unidades', value: detailSummary.totalUnits },
                { label: 'Promedio', value: money(detailSummary.average) },
                { label: 'Pagos QR', value: detailSummary.qrPayments },
                { label: 'Ventas sin costo', value: detailSummary.sinCosto },
              ].map((stat) => (
                <div key={stat.label} className="rounded-2xl bg-white/80 p-3 text-center shadow-sm ring-1 ring-border/20">
                  <div className="text-[11px] uppercase tracking-wide text-muted">{stat.label}</div>
                  <div className="mt-1 text-[16px] font-semibold text-text">{stat.value}</div>
                </div>
              ))}
            </div>
          ) : null}

          {detailTab === 'ventas' ? (
            <div className="overflow-x-auto">
              <Table className="min-w-[1100px]">
                <THead>
                  <tr>
                    <th className="px-3 py-3 text-left text-[11px] uppercase tracking-wide text-muted">Venta</th>
                    <th className="px-3 py-3 text-left text-[11px] uppercase tracking-wide text-muted">Fecha</th>
                    <th className="px-3 py-3 text-left text-[11px] uppercase tracking-wide text-muted">MÃ©todo</th>
                    <th className="px-3 py-3 text-left text-[11px] uppercase tracking-wide text-muted">Productos</th>
                    <th className="px-3 py-3 text-right text-[11px] uppercase tracking-wide text-muted">Unidades</th>
                    <th className="px-3 py-3 text-right text-[11px] uppercase tracking-wide text-muted">Total</th>
                    <th className="px-3 py-3 text-right text-[11px] uppercase tracking-wide text-muted">Costo</th>
                    <th className="px-3 py-3 text-right text-[11px] uppercase tracking-wide text-muted">Margen</th>
                    <th className="px-3 py-3 text-right text-[11px] uppercase tracking-wide text-muted">Lotes</th>
                  </tr>
                </THead>
                <tbody>
                  {!detailRows.length ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-[13px] text-muted">
                        Sin ventas en el rango.
                      </td>
                    </tr>
                  ) : (
                    detailRows.map((row) => {
                      const id = String(row.ventaId || '').trim()
                      const expanded = Boolean(expandedVentasById[id])
                      const loadingLotes = Boolean(ventaLotesLoadingById[id])
                      const lotes = ventaLotesById[id]

                      const toggle = async (e) => {
                        e?.preventDefault?.()
                        e?.stopPropagation?.()
                        if (!id) return

                        setExpandedVentasById((prev) => {
                          const next = { ...prev }
                          const nextValue = !Boolean(prev[id])
                          if (nextValue) next[id] = true
                          else delete next[id]
                          return next
                        })

                        if (!expanded) await ensureVentaLotes(id)
                      }

                      return (
                        <Fragment key={id || row.dateLabel}>
                          <tr className="border-b border-transparent odd:bg-surface/10 hover:bg-surface/30 cursor-pointer" onClick={toggle}>
                            <td className="px-3 py-2 text-[13px] font-semibold text-text">
                              {id ? `Venta ${String(id).slice(0, 8)}` : 'â€”'}
                            </td>
                            <td className="px-3 py-2 text-[13px] text-text">{row.dateLabel || 'â€”'}</td>
                            <td className="px-3 py-2 text-[13px] text-text">{row.metodoPago}</td>
                            <td className="px-3 py-2 text-[12px] text-text">
                              {row.productRows.length ? (
                                <div className="space-y-1">
                                  {row.productRows.map((product) => (
                                    <div
                                      key={`${product.productId}-${product.label}`}
                                      className="rounded-2xl bg-surface/70 p-2 ring-1 ring-border/10"
                                    >
                                      <div className="text-[12px] font-semibold text-text">{product.label}</div>
                                      {product.lines ? (
                                        <>
                                          <div className="mt-1 whitespace-pre-line text-[11px] text-muted">{product.lines}</div>
                                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                                            <span>{product.units} uds</span>
                                            <span className="font-semibold text-text">{money(product.subtotal)}</span>
                                          </div>
                                        </>
                                      ) : (
                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                                          {product.tallas ? <span>{product.tallas}</span> : null}
                                          <span>{product.units} uds</span>
                                          <span className="font-semibold text-text">{money(product.subtotal)}</span>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-[12px] text-muted">Sin items</div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right text-[13px] text-text">{row.units}</td>
                            <td className="px-3 py-2 text-right text-[13px] font-semibold text-text">{money(row.total)}</td>
                            <td className="px-3 py-2 text-right text-[13px] text-text">
                              {row.costoIncompleto ? 'Sin costo' : money(row.costoTotal)}
                            </td>
                            <td className="px-3 py-2 text-right text-[13px] text-text">
                              {row.costoIncompleto ? 'â€”' : money(row.margenBruto)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                className="inline-flex h-8 items-center justify-center rounded-xl bg-surface/60 px-3 text-[12px] font-semibold text-text ring-1 ring-border/20 hover:bg-surface"
                                onClick={toggle}
                              >
                                {expanded ? 'Ocultar' : loadingLotes ? 'Cargando...' : 'Ver'}
                              </button>
                            </td>
                          </tr>

                          {expanded ? (
                            <tr className="border-b border-transparent odd:bg-surface/10">
                              <td colSpan={9} className="px-3 pb-4">
                                <div className="mt-2 rounded-2xl bg-surface/30 p-3 ring-1 ring-border/15">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="text-[12px] font-semibold text-text">Consumo por lotes (snapshot)</div>
                                    {row.costoIncompleto || lotes?.costoIncompleto ? (
                                      <div className="rounded-xl bg-yellow-500/15 px-2 py-1 text-[11px] font-semibold text-yellow-700 ring-1 ring-yellow-500/20">
                                        Sin costo completo
                                      </div>
                                    ) : null}
                                  </div>

                                  {loadingLotes ? (
                                    <div className="mt-2 text-[12px] text-muted">Cargando lotes...</div>
                                  ) : lotes === null ? (
                                    <div className="mt-2 text-[12px] text-muted">No se pudo cargar el detalle de lotes.</div>
                                  ) : !lotes?.rows?.length ? (
                                    <div className="mt-2 text-[12px] text-muted">
                                      Esta venta no tiene `consumoLotes` guardado (venta vieja o stock sin lotes).
                                    </div>
                                  ) : (
                                    <div className="mt-3 overflow-x-auto">
                                      <table className="min-w-[860px] w-full text-left">
                                        <thead>
                                          <tr className="text-[11px] uppercase tracking-wide text-muted">
                                            <th className="px-2 py-2">Producto</th>
                                            <th className="px-2 py-2">Talla</th>
                                            <th className="px-2 py-2">Lote</th>
                                            <th className="px-2 py-2 text-right">Cantidad</th>
                                            <th className="px-2 py-2 text-right">Costo u.</th>
                                            <th className="px-2 py-2 text-right">Costo</th>
                                            <th className="px-2 py-2 text-right">Desconocido</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {lotes.rows.map((r, idx) => {
                                            const parcial = asNumber(r.cantidad, 0) * asNumber(r.costoUnitario, 0)
                                            return (
                                              <tr key={`${r.loteId}_${idx}`} className="border-t border-border/10">
                                                <td className="px-2 py-2 text-[12px] text-text">{r.productoLabel}</td>
                                                <td className="px-2 py-2 text-[12px] text-text">{r.talla || 'â€”'}</td>
                                                <td className="px-2 py-2 text-[12px] text-muted">{String(r.loteId).slice(0, 18)}</td>
                                                <td className="px-2 py-2 text-[12px] text-text text-right">{r.cantidad}</td>
                                                <td className="px-2 py-2 text-[12px] text-text text-right">{money(r.costoUnitario)}</td>
                                                <td className="px-2 py-2 text-[12px] font-semibold text-text text-right">{money(parcial)}</td>
                                                <td className="px-2 py-2 text-[12px] text-text text-right">{r.costoDesconocido ? 'Si' : ''}</td>
                                              </tr>
                                            )
                                          })}
                                        </tbody>
                                      </table>
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
            </div>
          ) : null}

          {detailTab === 'compras' ? (
            <div className="rounded-3xl border border-border/40 bg-surface/40 p-4 shadow-sm">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-[13px] font-semibold text-text">Reposiciones</div>
                  <div className="mt-1 text-[12px] text-muted">Compras registradas como lotes (Inventario).</div>
                </div>
                {comprasLoading ? <div className="text-[12px] text-muted">Cargando...</div> : null}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {[
                  { label: 'Compras', value: comprasSummary.totalCompras },
                  { label: 'Unidades', value: comprasSummary.totalUnidades },
                  { label: 'Inversion', value: money(comprasSummary.totalInversion) },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-2xl bg-white/80 p-3 text-center shadow-sm ring-1 ring-border/20">
                    <div className="text-[11px] uppercase tracking-wide text-muted">{stat.label}</div>
                    <div className="mt-1 text-[16px] font-semibold text-text">{stat.value}</div>
                  </div>
                ))}
              </div>

              <div className="mt-4 overflow-x-auto">
                <Table className="min-w-[1000px]">
                  <THead>
                    <tr>
                      <th className="px-3 py-3 text-left text-[11px] uppercase tracking-wide text-muted">Compra</th>
                      <th className="px-3 py-3 text-left text-[11px] uppercase tracking-wide text-muted">Fecha</th>
                      <th className="px-3 py-3 text-left text-[11px] uppercase tracking-wide text-muted">Proveedor</th>
                      <th className="px-3 py-3 text-left text-[11px] uppercase tracking-wide text-muted">Producto</th>
                      <th className="px-3 py-3 text-left text-[11px] uppercase tracking-wide text-muted">Detalle</th>
                      <th className="px-3 py-3 text-right text-[11px] uppercase tracking-wide text-muted">Unidades</th>
                      <th className="px-3 py-3 text-right text-[11px] uppercase tracking-wide text-muted">Costo</th>
                      <th className="px-3 py-3 text-right text-[11px] uppercase tracking-wide text-muted">Lotes</th>
                    </tr>
                  </THead>
                  <tbody>
                    {!comprasRows.length ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-[13px] text-muted">
                          Sin reposiciones en el rango.
                        </td>
                      </tr>
                    ) : (
                      comprasRows.map((c) => {
                        const id = String(c.compraId || '').trim()
                        const expanded = Boolean(expandedComprasById[id])
                        const loading = Boolean(compraLotesLoadingById[id])
                        const lotes = compraLotesById[id]

                        const toggle = async (e) => {
                          e?.preventDefault?.()
                          e?.stopPropagation?.()
                          if (!id) return

                          setExpandedComprasById((prev) => {
                            const next = { ...prev }
                            const nextValue = !Boolean(prev[id])
                            if (nextValue) next[id] = true
                            else delete next[id]
                            return next
                          })

                          if (!expanded) await ensureCompraLotes(c)
                        }

                        return (
                          <Fragment key={id || c.dateLabel}>
                            <tr className="border-b border-transparent odd:bg-surface/10 hover:bg-surface/30 cursor-pointer" onClick={toggle}>
                              <td className="px-3 py-2 text-[13px] font-semibold text-text">
                                {id ? `Compra ${String(id).slice(0, 8)}` : 'â€”'}
                              </td>
                              <td className="px-3 py-2 text-[13px] text-text">{c.dateLabel || 'â€”'}</td>
                              <td className="px-3 py-2 text-[13px] text-text">{c.proveedor}</td>
                              <td className="px-3 py-2 text-[12px] text-text">{c.productoLabel}</td>
                              <td className="px-3 py-2 whitespace-pre-line text-[12px] text-muted">{c.lines || 'â€”'}</td>
                              <td className="px-3 py-2 text-right text-[13px] text-text">{c.unidades}</td>
                              <td className="px-3 py-2 text-right text-[13px] font-semibold text-text">{money(c.costoTotal)}</td>
                              <td className="px-3 py-2 text-right">
                                <button
                                  type="button"
                                  className="inline-flex h-8 items-center justify-center rounded-xl bg-surface/60 px-3 text-[12px] font-semibold text-text ring-1 ring-border/20 hover:bg-surface"
                                  onClick={toggle}
                                >
                                  {expanded ? 'Ocultar' : loading ? 'Cargando...' : 'Ver'}
                                </button>
                              </td>
                            </tr>

                            {expanded ? (
                              <tr className="border-b border-transparent odd:bg-surface/10">
                                <td colSpan={8} className="px-3 pb-4">
                                  <div className="mt-2 rounded-2xl bg-surface/30 p-3 ring-1 ring-border/15">
                                    <div className="text-[12px] font-semibold text-text">Lotes de esta compra</div>

                                    {loading ? (
                                      <div className="mt-2 text-[12px] text-muted">Cargando lotes...</div>
                                    ) : lotes === null ? (
                                      <div className="mt-2 text-[12px] text-muted">No se pudo cargar el estado de lotes.</div>
                                    ) : !lotes?.rows?.length ? (
                                      <div className="mt-2 text-[12px] text-muted">No se encontraron lotes para esta compra.</div>
                                    ) : (
                                      <div className="mt-3 overflow-x-auto">
                                        <table className="min-w-[860px] w-full text-left">
                                          <thead>
                                            <tr className="text-[11px] uppercase tracking-wide text-muted">
                                              <th className="px-2 py-2">Talla</th>
                                              <th className="px-2 py-2">Lote</th>
                                              <th className="px-2 py-2 text-right">Inicial</th>
                                              <th className="px-2 py-2 text-right">Disponible</th>
                                              <th className="px-2 py-2 text-right">Consumido</th>
                                              <th className="px-2 py-2 text-right">% Cons.</th>
                                              <th className="px-2 py-2">Estado</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {lotes.rows.map((r, idx) => {
                                              const initial = asNumber(r.cantidadInicial, NaN)
                                              const available = asNumber(r.cantidadDisponible, NaN)
                                              const consumed = Number.isFinite(initial) && Number.isFinite(available) ? Math.max(0, initial - available) : null
                                              const st = loteStatus(initial, available)
                                              const toneClass =
                                                st.tone === 'danger'
                                                  ? 'bg-red-500/15 text-red-700 ring-red-500/20'
                                                  : st.tone === 'warn'
                                                    ? 'bg-yellow-500/15 text-yellow-700 ring-yellow-500/20'
                                                    : st.tone === 'ok'
                                                      ? 'bg-emerald-500/15 text-emerald-700 ring-emerald-500/20'
                                                      : 'bg-surface/60 text-muted ring-border/10'

                                              return (
                                                <tr key={`${r.loteId}_${idx}`} className="border-t border-border/10">
                                                  <td className="px-2 py-2 text-[12px] text-text">{r.talla || 'â€”'}</td>
                                                  <td className="px-2 py-2 text-[12px] text-muted">{String(r.loteId).slice(0, 18)}</td>
                                                  <td className="px-2 py-2 text-[12px] text-text text-right">
                                                    {Number.isFinite(initial) ? initial : 'â€”'}
                                                  </td>
                                                  <td className="px-2 py-2 text-[12px] text-text text-right">
                                                    {Number.isFinite(available) ? available : 'â€”'}
                                                  </td>
                                                  <td className="px-2 py-2 text-[12px] text-text text-right">
                                                    {consumed == null ? 'â€”' : consumed}
                                                  </td>
                                                  <td className="px-2 py-2 text-[12px] text-text text-right">
                                                    {st.pct == null ? 'â€”' : `${st.pct}%`}
                                                  </td>
                                                  <td className="px-2 py-2">
                                                    <span className={`inline-flex rounded-xl px-2 py-1 text-[11px] font-semibold ring-1 ${toneClass}`}>
                                                      {st.label}
                                                    </span>
                                                  </td>
                                                </tr>
                                              )
                                            })}
                                          </tbody>
                                        </table>
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
              </div>
            </div>
          ) : null}

          {detailTab === 'inventario' ? (
            <div className="rounded-3xl border border-border/40 bg-surface/40 p-4 shadow-sm">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-[13px] font-semibold text-text">Inventario</div>
                  <div className="mt-1 text-[12px] text-muted">Mermas y regularizaciones (auditables).</div>
                </div>
                {invMovsLoading ? <div className="text-[12px] text-muted">Cargando...</div> : null}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-4">
                {[
                  { label: 'Mermas (uds)', value: invMovsSummary.mermaUnidades },
                  { label: 'Costo mermas', value: money(invMovsSummary.mermaCosto) },
                  { label: 'Regs (uds)', value: invMovsSummary.regUnidades },
                  { label: 'Costo regs', value: money(invMovsSummary.regCosto) },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-2xl bg-white/80 p-3 text-center shadow-sm ring-1 ring-border/20">
                    <div className="text-[11px] uppercase tracking-wide text-muted">{stat.label}</div>
                    <div className="mt-1 text-[16px] font-semibold text-text">{stat.value}</div>
                  </div>
                ))}
              </div>

              <div className="mt-4 overflow-x-auto">
                <Table className="min-w-[1100px]">
                  <THead>
                    <tr>
                      <th className="px-3 py-3 text-left text-[11px] uppercase tracking-wide text-muted">Tipo</th>
                      <th className="px-3 py-3 text-left text-[11px] uppercase tracking-wide text-muted">Fecha</th>
                      <th className="px-3 py-3 text-left text-[11px] uppercase tracking-wide text-muted">Producto</th>
                      <th className="px-3 py-3 text-left text-[11px] uppercase tracking-wide text-muted">Motivo</th>
                      <th className="px-3 py-3 text-left text-[11px] uppercase tracking-wide text-muted">Detalle</th>
                      <th className="px-3 py-3 text-right text-[11px] uppercase tracking-wide text-muted">Unidades</th>
                      <th className="px-3 py-3 text-right text-[11px] uppercase tracking-wide text-muted">Costo</th>
                      <th className="px-3 py-3 text-right text-[11px] uppercase tracking-wide text-muted">Lotes</th>
                    </tr>
                  </THead>
                  <tbody>
                    {!invMovs.length ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-[13px] text-muted">
                          Sin mermas/regularizaciones en el rango.
                        </td>
                      </tr>
                    ) : (
                      invMovs.slice(0, 200).map((m) => {
                        const created = asNumber(m.creadoEn, 0)
                        const dateLabel = created ? dateTimeFormatter.format(new Date(created)) : ''
                        const label = [m.marca, m.modelo, m.nombre].filter(Boolean).join(' ').trim() || 'Producto'
                        const parsed = summarizeInvMovimientoItems(m.items || {})
                        const lines = parsed.productRows.map((p) => p.lines).filter(Boolean).join('\n')
                        const tipoLabel = m.tipo === 'merma' ? 'Merma' : m.tipo === 'regularizacion' ? 'Regularizacion' : String(m.tipo || '')
                        const id = String(m.movId || '').trim()
                        const expanded = Boolean(expandedInvMovsById[id])
                        const loadingDetalle = Boolean(invMovDetalleLoadingById[id])
                        const detalle = invMovDetalleById[id]
                        const loadingLotes = Boolean(invMovLotesLoadingById[id])
                        const lotes = invMovLotesById[id]

                        const toggle = async (e) => {
                          e?.preventDefault?.()
                          e?.stopPropagation?.()
                          if (!id) return

                          setExpandedInvMovsById((prev) => {
                            const next = { ...prev }
                            const nextValue = !Boolean(prev[id])
                            if (nextValue) next[id] = true
                            else delete next[id]
                            return next
                          })

                          if (!expanded) {
                            if (m.tipo === 'merma') await ensureInvMovDetalle(id)
                            if (m.tipo === 'regularizacion') await ensureInvMovLotes(m)
                          }
                        }

                        const renderMermaConsumo = () => {
                          if (loadingDetalle) return <div className="mt-2 text-[12px] text-muted">Cargando lotes...</div>
                          if (detalle === null) return <div className="mt-2 text-[12px] text-muted">No se pudo cargar el detalle.</div>
                          const consumo = detalle?.consumoLotes && typeof detalle.consumoLotes === 'object' ? detalle.consumoLotes : {}
                          const rows = []
                          for (const [talla, consumos] of Object.entries(consumo || {})) {
                            const list = Array.isArray(consumos) ? consumos : []
                            for (const c of list) {
                              const loteId = String(c?.loteId || '').trim()
                              const cantidad = asNumber(c?.cantidad, 0)
                              const costoUnitario = asNumber(c?.costoUnitario, 0)
                              if (!loteId || cantidad <= 0) continue
                              rows.push({ talla: String(talla || '').trim(), loteId, cantidad, costoUnitario, costoDesconocido: c?.costoDesconocido === true })
                            }
                          }

                          if (!rows.length) return <div className="mt-2 text-[12px] text-muted">Sin consumo de lotes registrado.</div>

                          return (
                            <div className="mt-3 overflow-x-auto">
                              <table className="min-w-[760px] w-full text-left">
                                <thead>
                                  <tr className="text-[11px] uppercase tracking-wide text-muted">
                                    <th className="px-2 py-2">Talla</th>
                                    <th className="px-2 py-2">Lote</th>
                                    <th className="px-2 py-2 text-right">Cantidad</th>
                                    <th className="px-2 py-2 text-right">Costo u.</th>
                                    <th className="px-2 py-2 text-right">Costo</th>
                                    <th className="px-2 py-2 text-right">Desconocido</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {rows.map((r, idx) => {
                                    const parcial = asNumber(r.cantidad, 0) * asNumber(r.costoUnitario, 0)
                                    return (
                                      <tr key={`${r.loteId}_${idx}`} className="border-t border-border/10">
                                        <td className="px-2 py-2 text-[12px] text-text">{r.talla || 'â€”'}</td>
                                        <td className="px-2 py-2 text-[12px] text-muted">{String(r.loteId).slice(0, 18)}</td>
                                        <td className="px-2 py-2 text-[12px] text-text text-right">{r.cantidad}</td>
                                        <td className="px-2 py-2 text-[12px] text-text text-right">{money(r.costoUnitario)}</td>
                                        <td className="px-2 py-2 text-[12px] font-semibold text-text text-right">{money(parcial)}</td>
                                        <td className="px-2 py-2 text-[12px] text-text text-right">{r.costoDesconocido ? 'Si' : ''}</td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )
                        }

                        const renderRegLotes = () => {
                          if (loadingLotes) return <div className="mt-2 text-[12px] text-muted">Cargando lotes...</div>
                          if (lotes === null) return <div className="mt-2 text-[12px] text-muted">No se pudo cargar el estado de lotes.</div>
                          if (!lotes?.rows?.length) return <div className="mt-2 text-[12px] text-muted">No se encontraron lotes para esta regularizacion.</div>

                          return (
                            <div className="mt-3 overflow-x-auto">
                              <table className="min-w-[860px] w-full text-left">
                                <thead>
                                  <tr className="text-[11px] uppercase tracking-wide text-muted">
                                    <th className="px-2 py-2">Talla</th>
                                    <th className="px-2 py-2">Lote</th>
                                    <th className="px-2 py-2 text-right">Inicial</th>
                                    <th className="px-2 py-2 text-right">Disponible</th>
                                    <th className="px-2 py-2 text-right">Consumido</th>
                                    <th className="px-2 py-2 text-right">% Cons.</th>
                                    <th className="px-2 py-2">Estado</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {lotes.rows.map((r, idx) => {
                                    const initial = asNumber(r.cantidadInicial, NaN)
                                    const available = asNumber(r.cantidadDisponible, NaN)
                                    const consumed = Number.isFinite(initial) && Number.isFinite(available) ? Math.max(0, initial - available) : null
                                    const st = loteStatus(initial, available)
                                    const toneClass =
                                      st.tone === 'danger'
                                        ? 'bg-red-500/15 text-red-700 ring-red-500/20'
                                        : st.tone === 'warn'
                                          ? 'bg-yellow-500/15 text-yellow-700 ring-yellow-500/20'
                                          : st.tone === 'ok'
                                            ? 'bg-emerald-500/15 text-emerald-700 ring-emerald-500/20'
                                            : 'bg-surface/60 text-muted ring-border/10'

                                    return (
                                      <tr key={`${r.loteId}_${idx}`} className="border-t border-border/10">
                                        <td className="px-2 py-2 text-[12px] text-text">{r.talla || 'â€”'}</td>
                                        <td className="px-2 py-2 text-[12px] text-muted">{String(r.loteId).slice(0, 18)}</td>
                                        <td className="px-2 py-2 text-[12px] text-text text-right">{Number.isFinite(initial) ? initial : 'â€”'}</td>
                                        <td className="px-2 py-2 text-[12px] text-text text-right">{Number.isFinite(available) ? available : 'â€”'}</td>
                                        <td className="px-2 py-2 text-[12px] text-text text-right">{consumed == null ? 'â€”' : consumed}</td>
                                        <td className="px-2 py-2 text-[12px] text-text text-right">{st.pct == null ? 'â€”' : `${st.pct}%`}</td>
                                        <td className="px-2 py-2">
                                          <span className={`inline-flex rounded-xl px-2 py-1 text-[11px] font-semibold ring-1 ${toneClass}`}>{st.label}</span>
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )
                        }

                        return (
                          <Fragment key={id}>
                            <tr className="border-b border-transparent odd:bg-surface/10 hover:bg-surface/30 cursor-pointer" onClick={toggle}>
                              <td className="px-3 py-2 text-[13px] font-semibold text-text">{tipoLabel}</td>
                              <td className="px-3 py-2 text-[13px] text-text">{dateLabel || '—'}</td>
                              <td className="px-3 py-2 text-[12px] text-text">{label}</td>
                              <td className="px-3 py-2 text-[12px] text-text">{m.motivo || '—'}</td>
                              <td className="px-3 py-2 whitespace-pre-line text-[12px] text-muted">{lines || '—'}</td>
                              <td className="px-3 py-2 text-right text-[13px] text-text">{asNumber(m.unidades, parsed.units || 0)}</td>
                              <td className="px-3 py-2 text-right text-[13px] font-semibold text-text">{money(asNumber(m.costoTotal, 0))}</td>
                              <td className="px-3 py-2 text-right">
                                <button
                                  type="button"
                                  className="inline-flex h-8 items-center justify-center rounded-xl bg-surface/60 px-3 text-[12px] font-semibold text-text ring-1 ring-border/20 hover:bg-surface"
                                  onClick={toggle}
                                >
                                  {expanded ? 'Ocultar' : (m.tipo === 'merma' ? loadingDetalle : loadingLotes) ? 'Cargando...' : 'Ver'}
                                </button>
                              </td>
                            </tr>

                            {expanded ? (
                              <tr className="border-b border-transparent odd:bg-surface/10">
                                <td colSpan={8} className="px-3 pb-4">
                                  <div className="mt-2 rounded-2xl bg-surface/30 p-3 ring-1 ring-border/15">
                                    <div className="text-[12px] font-semibold text-text">
                                      {m.tipo === 'merma' ? 'Consumo por lotes (merma)' : m.tipo === 'regularizacion' ? 'Lotes creados (regularizacion)' : 'Detalle'}
                                    </div>
                                    {m.tipo === 'merma' ? renderMermaConsumo() : m.tipo === 'regularizacion' ? renderRegLotes() : <div className="mt-2 text-[12px] text-muted">Sin detalle.</div>}
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
              </div>
            </div>
          ) : null}

          {detailTab === 'transferencias' ? (
            <div className="rounded-3xl border border-border/40 bg-surface/40 p-4 shadow-sm">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-[13px] font-semibold text-text">Transferencias</div>
                  <div className="mt-1 text-[12px] text-muted">Entradas y salidas entre sucursales.</div>
                </div>
                {invMovsLoading ? <div className="text-[12px] text-muted">Cargando...</div> : null}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-5">
                {[
                  { label: 'Entrada (uds)', value: transferSummary.entradaUnidades },
                  { label: 'Costo entrada', value: money(transferSummary.entradaCosto) },
                  { label: 'Salida (uds)', value: transferSummary.salidaUnidades },
                  { label: 'Costo salida', value: money(transferSummary.salidaCosto) },
                  { label: 'Sin costo', value: transferSummary.sinCosto },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-2xl bg-white/80 p-3 text-center shadow-sm ring-1 ring-border/20">
                    <div className="text-[11px] uppercase tracking-wide text-muted">{stat.label}</div>
                    <div className="mt-1 text-[16px] font-semibold text-text">{stat.value}</div>
                  </div>
                ))}
              </div>

              <div className="mt-4 overflow-x-auto">
                <Table className="min-w-[1100px]">
                  <THead>
                    <tr>
                      <th className="px-3 py-3 text-left text-[11px] uppercase tracking-wide text-muted">Direccion</th>
                      <th className="px-3 py-3 text-left text-[11px] uppercase tracking-wide text-muted">Fecha</th>
                      <th className="px-3 py-3 text-left text-[11px] uppercase tracking-wide text-muted">Transferencia</th>
                      <th className="px-3 py-3 text-left text-[11px] uppercase tracking-wide text-muted">Desde</th>
                      <th className="px-3 py-3 text-left text-[11px] uppercase tracking-wide text-muted">Hacia</th>
                      <th className="px-3 py-3 text-right text-[11px] uppercase tracking-wide text-muted">Unidades</th>
                      <th className="px-3 py-3 text-right text-[11px] uppercase tracking-wide text-muted">Costo</th>
                      <th className="px-3 py-3 text-left text-[11px] uppercase tracking-wide text-muted">Nota</th>
                      <th className="px-3 py-3 text-right text-[11px] uppercase tracking-wide text-muted">Sin costo</th>
                    </tr>
                  </THead>
                  <tbody>
                    {!transferMovs.length ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-10 text-center text-[13px] text-muted">
                          Sin transferencias en el rango.
                        </td>
                      </tr>
                    ) : (
                      transferMovs.slice(0, 200).map((m) => {
                        const created = asNumber(m.creadoEn, 0)
                        const dateLabel = created ? dateTimeFormatter.format(new Date(created)) : ''
                        const dir = m.tipo === 'transferencia_entrada' ? 'Entrada' : m.tipo === 'transferencia_salida' ? 'Salida' : String(m.tipo || '')
                        const trId = m.transferenciaId ? String(m.transferenciaId) : ''
                        const shortId = trId ? trId.slice(0, 10) : m.movId ? String(m.movId).slice(0, 14) : ''
                        const desdeId = m.desdeSucursalId || ''
                        const haciaId = m.haciaSucursalId || ''
                        const desde = sucursalNameById[desdeId] || desdeId || '—'
                        const hacia = sucursalNameById[haciaId] || haciaId || '—'
                        const units = m.unidades == null ? '—' : asNumber(m.unidades, 0)
                        return (
                          <tr key={m.movId} className="border-b border-transparent odd:bg-surface/10 hover:bg-surface/30">
                            <td className="px-3 py-2 text-[13px] font-semibold text-text">{dir}</td>
                            <td className="px-3 py-2 text-[13px] text-text">{dateLabel || '—'}</td>
                            <td className="px-3 py-2 text-[13px] text-text">{shortId || '—'}</td>
                            <td className="px-3 py-2 text-[13px] text-text">{desde}</td>
                            <td className="px-3 py-2 text-[13px] text-text">{hacia}</td>
                            <td className="px-3 py-2 text-right text-[13px] text-text">{units}</td>
                            <td className="px-3 py-2 text-right text-[13px] font-semibold text-text">{money(asNumber(m.costoTotal, 0))}</td>
                            <td className="px-3 py-2 text-[12px] text-muted">{m.nota || '—'}</td>
                            <td className="px-3 py-2 text-right text-[13px] text-text">{m.costoIncompleto ? 'Si' : ''}</td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </Table>
              </div>
            </div>
          ) : null}
        </div>
      ) :
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
                  <th className="px-3 py-3">DÃ­a</th>
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
        </Table>}
    </DataPanel>
  )
}
