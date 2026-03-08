'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import DataPanel from '@/components/DataPanel'
import Table, { THead } from '@/components/Table'
import LoaderBlack from '@/components/LoaderBlack'
import Button from '@/components/Button'
import * as XLSX from 'xlsx'
import { useUser } from '@/context/'
import { getRangeByChild, getRangeByKey, getValue, readUserData } from '@/firebase/database'
import { anularReposicionCompra, anularVenta } from '@/firebase/ops'
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
      tallasList.push(`${label}T-${qty}`)

      const unitPrice = asNumber(preciosPorTalla?.[label], NaN)
      const price = Number.isFinite(unitPrice) ? unitPrice : asNumber(detail?.precioUnitario, 0)
      subtotal += price * qty
      if (price) tallasLines.push(`${label}T-${qty} (${money(price)} c/u) = ${money(price * qty)}`)
      else tallasLines.push(`${label}T-${qty}`)
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
  return { description: rows.join(' - '), units, productRows }
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
      lines.push(`${talla}T-${qty} (${money(costo)} c/u) = ${money(lineTotal)}`)
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
      if (Number.isFinite(costo)) lines.push(`${talla}T-${qty} (costo ${money(costo)})`)
      else lines.push(`${talla}T-${qty}`)
    }

    if (productUnits <= 0) continue
    units += productUnits
    productRows.push({ productId, lines: lines.join('\n'), units: productUnits })
  }

  return { units, productRows }
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
      const qty = Math.abs(asNumber(qtyRaw, 0))
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
  const [extraBySucursalId, setExtraBySucursalId] = useState({})
  const [extraLoading, setExtraLoading] = useState(false)

  const [detailTab, setDetailTab] = useState('ventas') // ventas|compras|ajustes|transferencias|stock
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
  const [transferMovs, setTransferMovs] = useState([]) // [{ movId, creadoEn, tipo, unidades|null, costoTotal, costoIncompleto, transferenciaId, desdeSucursalId, haciaSucursalId, nota, items }]
  const [transferProductMetaById, setTransferProductMetaById] = useState({})
  const [stockCurrentLoading, setStockCurrentLoading] = useState(false)
  const [stockCurrentRows, setStockCurrentRows] = useState([])

  const [anularCompraConfirmId, setAnularCompraConfirmId] = useState(null)
  const [anularCompraLoading, setAnularCompraLoading] = useState(false)
  const [anularCompraNotaById, setAnularCompraNotaById] = useState({})

  const [anularVentaConfirmId, setAnularVentaConfirmId] = useState(null)
  const [anularVentaLoading, setAnularVentaLoading] = useState(false)
  const [anularVentaNotaById, setAnularVentaNotaById] = useState({})

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

  useEffect(() => {
    if (!admin) return
    if (sucursalId !== 'all') {
      setExtraBySucursalId({})
      setExtraLoading(false)
      return
    }
    if (!sucursalesArr.length) return

    const startTs = startOfDayTs(desde)
    const endTs = endOfDayTs(hasta)
    if (startTs == null || endTs == null) return

    let cancelled = false
    setExtraLoading(true)

      ; (async () => {
        try {
          const results = await Promise.all(
            sucursalesArr.map(async (s) => {
              const sid = s.uuid

              const [compras, movs] = await Promise.all([
                getRangeByChild(`comprasPorSucursal/${sid}`, 'creadoEn', { start: startTs, end: endTs }).catch(() => []),
                getRangeByChild(`movimientosPorSucursal/${sid}`, 'creadoEn', { start: startTs, end: endTs }).catch(() => []),
              ])
              const totalesActuales = (await getValue(`inventarioTotales/${sid}`).catch(() => null)) || {}

              const comprasArr = Array.isArray(compras) ? compras : []
              const comprasActive = comprasArr.filter((c) => String(c?.estado || '').trim() !== 'anulada')
              const comprasCount = comprasActive.length
              const comprasUnidades = comprasActive.reduce((acc, c) => acc + asNumber(c?.unidades, 0), 0)
              const comprasInversion = comprasActive.reduce((acc, c) => acc + asNumber(c?.costoTotal, 0), 0)

              const movsArr = Array.isArray(movs) ? movs : []
              const mermaMovs = movsArr.filter((m) => String(m?.tipo || '') === 'merma')
              const regMovs = movsArr.filter((m) => String(m?.tipo || '') === 'regularizacion')
              const tInMovs = movsArr.filter((m) => String(m?.tipo || '') === 'transferencia_entrada')
              const tOutMovs = movsArr.filter((m) => String(m?.tipo || '') === 'transferencia_salida')

              const mermaUnidades = mermaMovs.reduce((acc, m) => acc + asNumber(m?.unidades, 0), 0)
              const mermaCosto = mermaMovs.reduce((acc, m) => acc + asNumber(m?.costoTotal, 0), 0)
              const regUnidades = regMovs.reduce((acc, m) => acc + asNumber(m?.unidades, 0), 0)
              const regCosto = regMovs.reduce((acc, m) => acc + asNumber(m?.costoTotal, 0), 0)

              const tInUnidades = tInMovs.reduce((acc, m) => acc + asNumber(m?.unidades, 0), 0)
              const tOutUnidades = tOutMovs.reduce((acc, m) => acc + asNumber(m?.unidades, 0), 0)
              const tInCosto = tInMovs.reduce((acc, m) => acc + asNumber(m?.costoTotal, 0), 0)
              const tOutCosto = tOutMovs.reduce((acc, m) => acc + asNumber(m?.costoTotal, 0), 0)
              const transferSinCosto = movsArr.filter(
                (m) =>
                  (String(m?.tipo || '') === 'transferencia_entrada' || String(m?.tipo || '') === 'transferencia_salida') &&
                  Boolean(m?.costoIncompleto)
              ).length
              const stockEntries = Object.entries(totalesActuales && typeof totalesActuales === 'object' ? totalesActuales : {})
                .filter(([, detail]) => asNumber(detail?.total, 0) > 0)
              const stockUnits = stockEntries.reduce((acc, [, detail]) => acc + asNumber(detail?.total, 0), 0)
              const stockProductIds = stockEntries.map(([productId]) => productId)
              const stockLastUpdated = stockEntries.reduce((acc, [, detail]) => Math.max(acc, asNumber(detail?.actualizadoEn, 0)), 0)

              return [
                sid,
                {
                  comprasCount,
                  comprasUnidades,
                  comprasInversion,
                  mermaUnidades,
                  mermaCosto,
                  regUnidades,
                  regCosto,
                  tInUnidades,
                  tOutUnidades,
                  tInCosto,
                  tOutCosto,
                  transferSinCosto,
                  stockUnits,
                  stockProductIds,
                  stockLastUpdated,
                },
              ]
            })
          )

          const next = {}
          for (const [sid, payload] of results) next[sid] = payload
          if (!cancelled) setExtraBySucursalId(next)
        } catch (err) {
          if (!cancelled) setUserSuccess?.(err?.code || err?.message || 'repeat')
          if (!cancelled) setExtraBySucursalId({})
        } finally {
          if (!cancelled) setExtraLoading(false)
        }
      })()

    return () => {
      cancelled = true
    }
  }, [admin, desde, hasta, sucursalId, sucursalesArr, setUserSuccess])

  const extraGlobal = useMemo(() => {
    const list = extraBySucursalId && typeof extraBySucursalId === 'object' ? Object.values(extraBySucursalId) : []
    const comprasCount = list.reduce((acc, x) => acc + asNumber(x?.comprasCount, 0), 0)
    const comprasUnidades = list.reduce((acc, x) => acc + asNumber(x?.comprasUnidades, 0), 0)
    const comprasInversion = list.reduce((acc, x) => acc + asNumber(x?.comprasInversion, 0), 0)

    const mermaUnidades = list.reduce((acc, x) => acc + asNumber(x?.mermaUnidades, 0), 0)
    const mermaCosto = list.reduce((acc, x) => acc + asNumber(x?.mermaCosto, 0), 0)
    const regUnidades = list.reduce((acc, x) => acc + asNumber(x?.regUnidades, 0), 0)
    const regCosto = list.reduce((acc, x) => acc + asNumber(x?.regCosto, 0), 0)

    const tInUnidades = list.reduce((acc, x) => acc + asNumber(x?.tInUnidades, 0), 0)
    const tOutUnidades = list.reduce((acc, x) => acc + asNumber(x?.tOutUnidades, 0), 0)
    const tInCosto = list.reduce((acc, x) => acc + asNumber(x?.tInCosto, 0), 0)
    const tOutCosto = list.reduce((acc, x) => acc + asNumber(x?.tOutCosto, 0), 0)
    const transferSinCosto = list.reduce((acc, x) => acc + asNumber(x?.transferSinCosto, 0), 0)
    const stockUnits = list.reduce((acc, x) => acc + asNumber(x?.stockUnits, 0), 0)
    const stockProducts = new Set(
      list.flatMap((x) => (Array.isArray(x?.stockProductIds) ? x.stockProductIds.filter(Boolean) : []))
    ).size
    const stockLastUpdated = list.reduce((acc, x) => Math.max(acc, asNumber(x?.stockLastUpdated, 0)), 0)

    return {
      comprasCount,
      comprasUnidades,
      comprasInversion,
      mermaUnidades,
      mermaCosto,
      regUnidades,
      regCosto,
      tInUnidades,
      tOutUnidades,
      tInCosto,
      tOutCosto,
      transferSinCosto,
      stockUnits,
      stockProducts,
      stockLastUpdated,
    }
  }, [extraBySucursalId])

  function closeDetailPanel() {
    setDetailPanelOpen(false)
    setDetailTab('ventas')
    setDrawerSucursal(null)
    setDrawerDayKey(null)
    setVentas([])
    setCompras([])
    setInvMovs([])
    setTransferMovs([])
    setStockCurrentRows([])
    setVentaSel(null)
    setVentaDetail(null)
    setProductosAgg(null)
    setMovsByVentaId({})
    setVentasLoading(false)
    setVentaDetailLoading(false)
    setProductosLoading(false)
    setComprasLoading(false)
    setInvMovsLoading(false)
    setStockCurrentLoading(false)
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
    setTransferProductMetaById({})
    setAnularCompraConfirmId(null)
    setAnularCompraLoading(false)
    setAnularCompraNotaById({})
    setAnularVentaConfirmId(null)
    setAnularVentaLoading(false)
    setAnularVentaNotaById({})
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
    setStockCurrentRows([])
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
    setTransferProductMetaById({})
    setAnularCompraConfirmId(null)
    setAnularCompraLoading(false)
    setAnularCompraNotaById({})
    setAnularVentaConfirmId(null)
    setAnularVentaLoading(false)
    setAnularVentaNotaById({})
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
        const estado = String(c?.estado || '').trim()

        let lines = ''
        if (parsed.productRows.length) lines = parsed.productRows[0]?.lines || ''

        return {
          compraId: c?.compraId || c?.__key || '',
          created,
          dateLabel,
          productoId: String(c?.productoId || parsed.productRows?.[0]?.productId || '').trim(),
          productoLabel: label,
          proveedor: proveedor || '-',
          nota: nota || '',
          unidades: asNumber(c?.unidades, parsed.units || 0),
          costoTotal: asNumber(c?.costoTotal, parsed.total || 0),
          lines,
          items: c?.items && typeof c.items === 'object' ? c.items : {},
          estado,
          anuladoEn: c?.anuladoEn ?? null,
          anuladoNota: c?.anuladoNota ?? null,
        }
      })
      .sort((a, b) => (b.created || 0) - (a.created || 0))
  }, [compras])

  const comprasSummary = useMemo(() => {
    const active = comprasRows.filter((r) => String(r?.estado || '').trim() !== 'anulada')
    const totalCompras = active.length
    const totalUnidades = active.reduce((acc, r) => acc + asNumber(r.unidades, 0), 0)
    const totalInversion = active.reduce((acc, r) => acc + asNumber(r.costoTotal, 0), 0)
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

  const stockCurrentSummary = useMemo(() => {
    const totalProducts = stockCurrentRows.length
    const totalUnits = stockCurrentRows.reduce((acc, row) => acc + asNumber(row.total, 0), 0)
    const totalTallas = stockCurrentRows.reduce((acc, row) => acc + (Array.isArray(row.tallasRows) ? row.tallasRows.length : 0), 0)
    const lastUpdated = stockCurrentRows.reduce((acc, row) => Math.max(acc, asNumber(row.actualizadoEn, 0)), 0)
    return { totalProducts, totalUnits, totalTallas, lastUpdated }
  }, [stockCurrentRows])

  const detailSummary = useMemo(() => {
    const active = detailRows.filter((row) => String(row?.estado || '').trim() !== 'anulada')
    const totalSales = active.length
    const totalAmount = active.reduce((acc, row) => acc + row.total, 0)
    const totalCost = active.reduce((acc, row) => acc + asNumber(row.costoTotal, 0), 0)
    const totalMargin = active.reduce((acc, row) => acc + asNumber(row.margenBruto, 0), 0)
    const totalUnits = active.reduce((acc, row) => acc + row.units, 0)
    const qrPayments = active.filter((row) => String(row.metodoPago).toLowerCase() === 'qr').length
    const average = totalSales ? totalAmount / totalSales : 0
    const sinCosto = active.filter((row) => row.costoIncompleto).length
    return { totalSales, totalAmount, totalCost, totalMargin, totalUnits, average, qrPayments, sinCosto }
  }, [detailRows])

  const detailHeadline = useMemo(() => {
    if (detailTab === 'compras') return `${comprasSummary.totalCompras} reposiciones - ${money(comprasSummary.totalInversion)}`
    if (detailTab === 'ajustes') return `${invMovs.length} ajustes - ${invMovsSummary.mermaUnidades + invMovsSummary.regUnidades} uds`
    if (detailTab === 'transferencias') return `${transferMovs.length} movimientos - ${transferSummary.entradaUnidades + transferSummary.salidaUnidades} uds`
    if (detailTab === 'stock') return `${stockCurrentSummary.totalProducts} productos con stock - ${stockCurrentSummary.totalUnits} uds`
    return `${detailRows.length} ventas - ${money(detailSummary.totalAmount)}`
  }, [comprasSummary.totalCompras, comprasSummary.totalInversion, detailRows.length, detailSummary.totalAmount, detailTab, invMovs.length, invMovsSummary.mermaUnidades, invMovsSummary.regUnidades, stockCurrentSummary.totalProducts, stockCurrentSummary.totalUnits, transferMovs.length, transferSummary.entradaUnidades, transferSummary.salidaUnidades])

  const canExportDetail = detailRows.length || comprasRows.length || invMovs.length || transferMovs.length || stockCurrentRows.length

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
          const trace = (await getValue(`movimientosPorLote/${sid}/${t.productoId}/${t.talla}/${t.loteId}`).catch(() => null)) || {}
          const initial = lote?.cantidadInicial ?? t.initialFallback
          const available = lote?.cantidadDisponible
          const stats = { venta: 0, merma: 0, transferencia: 0, regularizacion: 0, compra: 0 }
          for (const item of Object.values(trace && typeof trace === 'object' ? trace : {})) {
            const operationType = String(item?.operationType || '').trim()
            const qty = asNumber(item?.cantidad, 0)
            if (qty <= 0) continue
            const sign = item?.kind === 'salida' ? 1 : item?.kind === 'reversion' ? -1 : 0
            if (!sign) continue
            if (Object.prototype.hasOwnProperty.call(stats, operationType)) stats[operationType] += sign * qty
          }
          const consumed = Number.isFinite(asNumber(initial, NaN)) && Number.isFinite(asNumber(available, NaN)) ? Math.max(0, asNumber(initial, 0) - asNumber(available, 0)) : 0
          const traced = Math.max(0, stats.venta) + Math.max(0, stats.merma) + Math.max(0, stats.transferencia)
          return {
            productoId: t.productoId,
            talla: t.talla,
            loteId: t.loteId,
            cantidadInicial: asNumber(initial, NaN),
            cantidadDisponible: asNumber(available, NaN),
            creadoEn: asNumber(lote?.creadoEn, 0),
            costoUnitario: asNumber(lote?.costoUnitario, NaN),
            consumidoVenta: Math.max(0, stats.venta),
            consumidoMerma: Math.max(0, stats.merma),
            consumidoTransferencia: Math.max(0, stats.transferencia),
            consumidoSinTraza: Math.max(0, consumed - traced),
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
      const rangeLabel = drawerDayKey ? keyToLabel(drawerDayKey) : `${desde} - ${hasta}`
      const title = `Detalle ${drawerSucursal?.nombre || drawerSucursal?.id || 'de la sucursal'} - ${rangeLabel}`
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

      const detailHeaders = ['Venta', 'Fecha', 'Metodo', 'Productos', 'Unidades', 'Total', 'Costo', 'Margen']
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
        XLSX.utils.book_append_sheet(workbook, invSheet, 'Ajustes')
      }

      if (transferMovs.length) {
        const nameById = {}
        for (const s of sucursalesArr || []) nameById[s.uuid] = s.nombre

        const trHeaders = ['Direccion', 'Fecha', 'Transferencia', 'Desde', 'Hacia', 'Detalle', 'Unidades', 'Costo', 'Nota', 'Sin costo']
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
            const parsed = summarizeTransferItems(m.items || {}, transferProductMetaById)
            const detail = parsed.productRows.map((row) => `${row.label}: ${row.lines}`).join('\n')
            const units = m.unidades == null ? parsed.units || '' : asNumber(m.unidades, 0)
            const sinCosto = m.costoIncompleto ? 'Si' : ''

            return [dir, dateLabel, trId, desde, hacia, detail, units, asNumber(m.costoTotal, 0), m.nota || '', sinCosto]
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
          { wch: 52 },
          { wch: 10 },
          { wch: 12 },
          { wch: 40 },
          { wch: 10 },
        ]
        XLSX.utils.book_append_sheet(workbook, trSheet, 'Transferencias')
      }

      if (stockCurrentRows.length) {
        const stockHeaders = ['Producto', 'Tallas', 'Total', 'Actualizado']
        const stockData = [
          stockHeaders,
          ...stockCurrentRows.map((row) => [
            row.label || row.productoId || '',
            (row.tallasRows || []).map(([talla, qty]) => `T${talla} x${qty}`).join(' - '),
            asNumber(row.total, 0),
            row.actualizadoEn ? dateTimeFormatter.format(new Date(row.actualizadoEn)) : '',
          ]),
        ]
        const stockSheet = XLSX.utils.aoa_to_sheet(stockData)
        stockHeaders.forEach((_, idx) => {
          const cellRef = `${String.fromCharCode(65 + idx)}1`
          stockSheet[cellRef] = { v: stockHeaders[idx], t: 's', s: styleHeader }
        })
        stockSheet['!cols'] = [{ wch: 40 }, { wch: 52 }, { wch: 10 }, { wch: 20 }]
        XLSX.utils.book_append_sheet(workbook, stockSheet, 'Stock actual')
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
            estado: String(r?.estado || ''),
            anuladoEn: r?.anuladoEn ?? null,
            anuladoPorUsuarioId: r?.anuladoPorUsuarioId ?? null,
            anuladoNota: r?.anuladoNota ?? null,
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
          const mappedAllBase = (items || []).map((r) => ({
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

          const mappedAll = await Promise.all(
            mappedAllBase.map(async (row) => {
              if (row.tipo !== 'transferencia_entrada' && row.tipo !== 'transferencia_salida') return row
              const detail = await getValue(`movimientosInventario/${row.movId}`).catch(() => null)
              return {
                ...row,
                items: detail?.items && typeof detail.items === 'object' ? detail.items : null,
              }
            })
          )

          const inv = mappedAll.filter((x) => x.tipo === 'merma' || x.tipo === 'regularizacion')
          const transfers = mappedAll.filter((x) => x.tipo === 'transferencia_entrada' || x.tipo === 'transferencia_salida')

          const transferProductIds = Array.from(
            new Set(
              transfers.flatMap((row) => {
                const detailItems = row?.items && typeof row.items === 'object' ? Object.keys(row.items) : []
                return detailItems.filter(Boolean)
              })
            )
          )

          if (transferProductIds.length) {
            const metaRows = await Promise.all(
              transferProductIds.map(async (productId) => {
                const value = await getValue(`productos/${productId}`).catch(() => null)
                return [productId, value && typeof value === 'object' ? value : null]
              })
            )
            if (!cancelled) {
              setTransferProductMetaById((prev) => {
                const next = { ...(prev || {}) }
                for (const [productId, value] of metaRows) next[productId] = value
                return next
              })
            }
          }

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
    if (!detailPanelOpen || !drawerSucursal?.id) {
      setStockCurrentRows([])
      setStockCurrentLoading(false)
      return
    }

    let cancelled = false
    setStockCurrentLoading(true)

    ;(async () => {
      try {
        const sid = String(drawerSucursal.id)
        const [totalesRaw, inventarioRaw] = await Promise.all([
          getValue(`inventarioTotales/${sid}`).catch(() => null),
          getValue(`inventario/${sid}`).catch(() => null),
        ])

        const totalesObj = totalesRaw && typeof totalesRaw === 'object' ? totalesRaw : {}
        const inventarioObj = inventarioRaw && typeof inventarioRaw === 'object' ? inventarioRaw : {}
        const productIds = Object.entries(totalesObj)
          .filter(([, value]) => asNumber(value?.total, 0) > 0)
          .map(([productId]) => productId)

        if (!productIds.length) {
          if (!cancelled) setStockCurrentRows([])
          return
        }

        const metas = await Promise.all(
          productIds.map(async (productId) => {
            const producto = await getValue(`productos/${productId}`).catch(() => null)
            return [productId, producto && typeof producto === 'object' ? producto : null]
          })
        )

        if (cancelled) return

        const metaById = Object.fromEntries(metas)
        const rows = productIds
          .map((productId) => {
            const totalData = totalesObj?.[productId]
            const tallas = inventarioObj?.[productId]?.tallas
            const tallasRows = Object.entries(tallas && typeof tallas === 'object' ? tallas : {})
              .map(([talla, qty]) => [String(talla), asNumber(qty, 0)])
              .filter(([, qty]) => qty > 0)
              .sort((a, b) => String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true }))
            const meta = metaById?.[productId]
            return {
              productoId: productId,
              label: [meta?.marca, meta?.modelo, meta?.nombre].filter(Boolean).join(' ').trim() || productId || 'Producto',
              marca: meta?.marca ?? null,
              modelo: meta?.modelo ?? null,
              nombre: meta?.nombre ?? null,
              total: asNumber(totalData?.total, 0),
              actualizadoEn: asNumber(totalData?.actualizadoEn, 0),
              tallasRows,
            }
          })
          .filter((row) => row.total > 0)
          .sort((a, b) => {
            const diff = b.total - a.total
            if (diff) return diff
            return String(a.label).localeCompare(String(b.label), 'es', { sensitivity: 'base' })
          })

        if (!cancelled) setStockCurrentRows(rows)
      } catch (err) {
        if (!cancelled) setUserSuccess?.(err?.code || err?.message || 'repeat')
        if (!cancelled) setStockCurrentRows([])
      } finally {
        if (!cancelled) setStockCurrentLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [detailPanelOpen, drawerSucursal?.id, setUserSuccess])

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
          <p className="mt-2 text-[14px] text-muted">El reporte historico solo esta disponible para administradores.</p>
        </div>
      </div>
    )
  }

  return (
    <DataPanel
      title="Reporte historico"
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
            Total: <span className="font-semibold text-text">{money(summary.total)}</span> - Ventas:{' '}
            <span className="font-semibold text-text">{summary.cantidadVentas}</span>
          </div>
        </div>
      }
      scroll="x"
    >
      {loading ? <LoaderBlack>Cargando</LoaderBlack> : null}

      {detailSectionOpen ? (
        <div className="mb-4 overflow-hidden rounded-3xl bg-surface/40 shadow-sm ring-1 ring-border/20">
          <div
            className={[
              'h-1 w-full',
              detailTab === 'ventas'
                ? 'bg-emerald-500/25'
                : detailTab === 'compras'
                  ? 'bg-sky-500/25'
                  : detailTab === 'ajustes'
                    ? 'bg-amber-500/25'
                    : detailTab === 'stock'
                      ? 'bg-cyan-500/25'
                      : 'bg-violet-500/25',
            ].join(' ')}
          />
          <div className="space-y-4 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[12px] text-muted">
                Detalle {drawerSucursal?.nombre || drawerSucursal?.id || 'de la sucursal'} -
                {drawerDayKey ? ` ${keyToLabel(drawerDayKey)}` : ` ${desde} - ${hasta}`}
              </div>
              <div className="mt-1 text-[13px] font-semibold text-text">{detailHeadline}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button theme="Secondary" styled="w-full sm:w-auto" click={closeDetailPanel}>
                Cerrar detalle
              </Button>
              <Button
                theme="Primary"
                styled="w-full sm:w-auto"
                click={exportDetailExcel}
                disabled={exportingExcel || !canExportDetail}
              >
                {exportingExcel ? 'Exportando...' : canExportDetail ? 'Exportar Excel' : 'Sin datos para exportar'}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-2 rounded-2xl bg-surface-2/60 p-1 ring-1 ring-border/15">
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
              className={`rounded-2xl px-3 py-2 text-[12px] font-semibold transition ${detailTab === 'ajustes' ? 'bg-surface text-text shadow-sm ring-1 ring-border/20' : 'text-muted hover:bg-surface/60 hover:text-text'}`}
              onClick={() => setDetailTab('ajustes')}
            >
              Ajustes
            </button>
            <button
              type="button"
              className={`rounded-2xl px-3 py-2 text-[12px] font-semibold transition ${detailTab === 'transferencias' ? 'bg-surface text-text shadow-sm ring-1 ring-border/20' : 'text-muted hover:bg-surface/60 hover:text-text'}`}
              onClick={() => setDetailTab('transferencias')}
            >
              Transferencias
            </button>
            <button
              type="button"
              className={`rounded-2xl px-3 py-2 text-[12px] font-semibold transition ${detailTab === 'stock' ? 'bg-surface text-text shadow-sm ring-1 ring-border/20' : 'text-muted hover:bg-surface/60 hover:text-text'}`}
              onClick={() => setDetailTab('stock')}
            >
              Stock actual
            </button>
          </div>

          {detailTab === 'ventas' ? (
            <div className="grid gap-3 md:grid-cols-8">
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
                <div key={stat.label} className="rounded-2xl bg-surface/60 p-3 text-center shadow-sm ring-1 ring-border/15">
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
                    <th className="px-3 py-3 text-left text-[11px] uppercase tracking-wide text-muted">Metodo</th>
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
                              <div className="flex items-center gap-2">
                                <span>{id ? `Venta ${String(id).slice(0, 8)}` : '-'}</span>
                                {String(row.estado || '').trim() === 'anulada' ? (
                                  <span className="inline-flex rounded-xl bg-red-500/15 px-2 py-1 text-[11px] font-semibold text-red-700 ring-1 ring-red-500/20 dark:text-red-300">
                                    Anulada
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-[13px] text-text">{row.dateLabel || '-'}</td>
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
                              {row.costoIncompleto ? '-' : money(row.margenBruto)}
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
                                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                    <div className="text-[12px] font-semibold text-text">Consumo por lotes (snapshot)</div>
                                    <div className="flex items-center gap-2">
                                      {row.costoIncompleto || lotes?.costoIncompleto ? (
                                        <div className="rounded-xl bg-amber-500/15 px-2 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-500/20 dark:text-amber-300">
                                          Sin costo completo
                                        </div>
                                      ) : null}
                                      {String(row.estado || '').trim() === 'anulada' ? null : (
                                        <button
                                          type="button"
                                          className="inline-flex h-9 items-center justify-center rounded-2xl bg-red-500/14 px-4 text-[12px] font-semibold text-red-600 ring-1 ring-red-500/25 transition hover:bg-red-500/18 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-300"
                                          onClick={(e) => {
                                            e?.preventDefault?.()
                                            e?.stopPropagation?.()
                                            setAnularVentaConfirmId(id)
                                          }}
                                          disabled={anularVentaLoading}
                                        >
                                          Anular venta
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {anularVentaConfirmId === id ? (
                                    <div className="mt-3 rounded-2xl bg-red-500/10 p-3 ring-1 ring-red-500/20">
                                      <div className="text-[12px] font-semibold text-text">Confirmar anulacion</div>
                                      <div className="mt-1 text-[12px] text-muted">
                                        Se devolveran <span className="font-semibold text-text">{row.units}</span> unidades al inventario y se ajustaran los reportes.
                                        {lotes?.rows?.length ? (
                                          <>
                                            {' '}
                                            Se revertira el consumo de <span className="font-semibold text-text">{lotes.rows.length}</span> lotes.
                                          </>
                                        ) : null}
                                      </div>
                                      <div className="mt-3 grid gap-2 md:grid-cols-[1fr,auto,auto] md:items-center">
                                        <input
                                          className="h-10 rounded-2xl bg-surface/60 px-3 text-[12px] text-text ring-1 ring-border/25 outline-none focus:ring-2 focus:ring-red-500/20"
                                          placeholder="Motivo/nota (opcional). Ej: Venta por accidente"
                                          value={String(anularVentaNotaById[id] || '')}
                                          onChange={(e) => setAnularVentaNotaById((prev) => ({ ...prev, [id]: e.target.value }))}
                                        />
                                        <button
                                          type="button"
                                          className="h-10 rounded-2xl bg-surface/60 px-4 text-[12px] font-semibold text-text ring-1 ring-border/20 hover:bg-surface"
                                          onClick={(e) => {
                                            e?.preventDefault?.()
                                            e?.stopPropagation?.()
                                            setAnularVentaConfirmId(null)
                                          }}
                                          disabled={anularVentaLoading}
                                        >
                                          Cancelar
                                        </button>
                                        <button
                                          type="button"
                                          className="h-10 rounded-2xl bg-red-500/14 px-4 text-[12px] font-semibold text-red-600 ring-1 ring-red-500/25 transition hover:bg-red-500/18 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-300"
                                          onClick={async (e) => {
                                            e?.preventDefault?.()
                                            e?.stopPropagation?.()
                                            if (!drawerSucursal?.id) return
                                            if (!id) return
                                            setAnularVentaLoading(true)
                                            try {
                                              const nota = String(anularVentaNotaById[id] || '').trim() || null
                                              await anularVenta({
                                                sucursalId: drawerSucursal.id,
                                                ventaId: id,
                                                usuarioId: userDB?.uid ?? null,
                                                nota,
                                                motivo: null,
                                              })

                                              setVentas((prev) =>
                                                (prev || []).map((x) =>
                                                  String(x?.ventaId || x?.__key || '').trim() === id ? { ...x, estado: 'anulada' } : x
                                                )
                                              )
                                              setAnularVentaConfirmId(null)
                                              setUserSuccess?.('Actualizado correctamente')
                                            } catch (err) {
                                              setUserSuccess?.(err?.code || err?.message || 'repeat')
                                            } finally {
                                              setAnularVentaLoading(false)
                                            }
                                          }}
                                          disabled={anularVentaLoading}
                                        >
                                          {anularVentaLoading ? 'Anulando...' : 'Confirmar'}
                                        </button>
                                      </div>
                                    </div>
                                  ) : null}

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
                                                <td className="px-2 py-2 text-[12px] text-text">{r.talla || '-'}</td>
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
                  <div key={stat.label} className="rounded-2xl bg-surface/60 p-3 text-center shadow-sm ring-1 ring-border/15">
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
                                <div className="flex items-center gap-2">
                                  <span>{id ? `Compra ${String(id).slice(0, 8)}` : '-'}</span>
                                  {String(c.estado || '').trim() === 'anulada' ? (
                                    <span className="inline-flex rounded-xl bg-red-500/15 px-2 py-1 text-[11px] font-semibold text-red-700 ring-1 ring-red-500/20 dark:text-red-300">
                                      Anulada
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-[13px] text-text">{c.dateLabel || '-'}</td>
                              <td className="px-3 py-2 text-[13px] text-text">{c.proveedor}</td>
                              <td className="px-3 py-2 text-[12px] text-text">{c.productoLabel}</td>
                              <td className="px-3 py-2 whitespace-pre-line text-[12px] text-muted">{c.lines || '-'}</td>
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
                                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                      <div className="text-[12px] font-semibold text-text">Lotes de esta compra</div>
                                      {(() => {
                                        const isAnulada = String(c.estado || '').trim() === 'anulada'
                                        const rows = lotes?.rows || []
                                        const allNew =
                                          rows.length > 0 &&
                                          rows.every((r) => {
                                            const initial = asNumber(r?.cantidadInicial, NaN)
                                            const available = asNumber(r?.cantidadDisponible, NaN)
                                            return Number.isFinite(initial) && Number.isFinite(available) && initial > 0 && available === initial
                                          })

                                        if (isAnulada) return null
                                        if (!allNew) return null
                                        return (
                                          <button
                                            type="button"
                                            className="inline-flex h-9 items-center justify-center rounded-2xl bg-red-500/14 px-4 text-[12px] font-semibold text-red-600 ring-1 ring-red-500/25 transition hover:bg-red-500/18 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-300"
                                            onClick={(e) => {
                                              e?.preventDefault?.()
                                              e?.stopPropagation?.()
                                              setAnularCompraConfirmId(id)
                                            }}
                                            disabled={anularCompraLoading}
                                          >
                                            Anular reposicion
                                          </button>
                                        )
                                      })()}
                                    </div>

                                    {anularCompraConfirmId === id ? (
                                      <div className="mt-3 rounded-2xl bg-red-500/10 p-3 ring-1 ring-red-500/20">
                                        {(() => {
                                          const rows = lotes?.rows || []
                                          const unidadesImpacto = rows.reduce((acc, r) => acc + asNumber(r?.cantidadInicial, 0), 0)
                                          const lotesCount = rows.length
                                          return (
                                            <>
                                              <div className="text-[12px] font-semibold text-text">Confirmar anulacion</div>
                                              <div className="mt-1 text-[12px] text-muted">
                                                Se quitaran <span className="font-semibold text-text">{unidadesImpacto}</span> unidades del inventario y se eliminaran{' '}
                                                <span className="font-semibold text-text">{lotesCount}</span> lotes. Esta accion no se puede deshacer.
                                              </div>
                                              <div className="mt-3 grid gap-2 md:grid-cols-[1fr,auto,auto] md:items-center">
                                                <input
                                                  className="h-10 rounded-2xl bg-surface/60 px-3 text-[12px] text-text ring-1 ring-border/25 outline-none focus:ring-2 focus:ring-red-500/20"
                                                  placeholder="Nota (opcional). Ej: Error de talla/costo"
                                                  value={String(anularCompraNotaById[id] || '')}
                                                  onChange={(e) =>
                                                    setAnularCompraNotaById((prev) => ({ ...prev, [id]: e.target.value }))
                                                  }
                                                />
                                                <button
                                                  type="button"
                                                  className="h-10 rounded-2xl bg-surface/60 px-4 text-[12px] font-semibold text-text ring-1 ring-border/20 hover:bg-surface"
                                                  onClick={(e) => {
                                                    e?.preventDefault?.()
                                                    e?.stopPropagation?.()
                                                    setAnularCompraConfirmId(null)
                                                  }}
                                                  disabled={anularCompraLoading}
                                                >
                                                  Cancelar
                                                </button>
                                                <button
                                                  type="button"
                                                  className="h-10 rounded-2xl bg-red-500/14 px-4 text-[12px] font-semibold text-red-600 ring-1 ring-red-500/25 transition hover:bg-red-500/18 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-300"
                                                  onClick={async (e) => {
                                                    e?.preventDefault?.()
                                                    e?.stopPropagation?.()
                                                    if (!drawerSucursal?.id) return
                                                    if (!id) return
                                                    setAnularCompraLoading(true)
                                                    try {
                                                      const nota = String(anularCompraNotaById[id] || '').trim() || null
                                                      await anularReposicionCompra({
                                                        sucursalId: drawerSucursal.id,
                                                        compraId: id,
                                                        usuarioId: userDB?.uid ?? null,
                                                        nota,
                                                      })
                                                      const now = Date.now()
                                                      setCompras((prev) =>
                                                        (prev || []).map((x) =>
                                                          String(x?.compraId || x?.__key || '').trim() === id
                                                            ? { ...x, estado: 'anulada', anuladoEn: now, anuladoNota: nota }
                                                            : x
                                                        )
                                                      )
                                                      setCompraLotesById((prev) => ({ ...prev, [id]: { rows: [] } }))
                                                      setAnularCompraConfirmId(null)
                                                      setUserSuccess?.('Actualizado correctamente')
                                                    } catch (err) {
                                                      setUserSuccess?.(err?.code || err?.message || 'repeat')
                                                    } finally {
                                                      setAnularCompraLoading(false)
                                                    }
                                                  }}
                                                  disabled={anularCompraLoading}
                                                >
                                                  {anularCompraLoading ? 'Anulando...' : 'Confirmar'}
                                                </button>
                                              </div>
                                            </>
                                          )
                                        })()}
                                      </div>
                                    ) : null}

                                    {loading ? (
                                      <div className="mt-2 text-[12px] text-muted">Cargando lotes...</div>
                                    ) : lotes === null ? (
                                      <div className="mt-2 text-[12px] text-muted">No se pudo cargar el estado de lotes.</div>
                                    ) : !lotes?.rows?.length ? (
                                      <div className="mt-2 text-[12px] text-muted">
                                        {String(c.estado || '').trim() === 'anulada' ? 'Compra anulada. Lotes eliminados.' : 'No se encontraron lotes para esta compra.'}
                                      </div>
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
                                              <th className="px-2 py-2 text-right">Venta</th>
                                              <th className="px-2 py-2 text-right">Merma</th>
                                              <th className="px-2 py-2 text-right">Transfer.</th>
                                              <th className="px-2 py-2 text-right">Sin traza</th>
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
                                                  ? 'bg-red-500/15 text-red-700 ring-red-500/20 dark:text-red-300'
                                                  : st.tone === 'warn'
                                                    ? 'bg-amber-500/15 text-amber-700 ring-amber-500/20 dark:text-amber-300'
                                                    : st.tone === 'ok'
                                                      ? 'bg-emerald-500/15 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300'
                                                      : 'bg-surface/60 text-muted ring-border/10'

                                              return (
                                                <tr key={`${r.loteId}_${idx}`} className="border-t border-border/10">
                                                  <td className="px-2 py-2 text-[12px] text-text">{r.talla || '-'}</td>
                                                  <td className="px-2 py-2 text-[12px] text-muted">{String(r.loteId).slice(0, 18)}</td>
                                                  <td className="px-2 py-2 text-[12px] text-text text-right">
                                                    {Number.isFinite(initial) ? initial : '-'}
                                                  </td>
                                                  <td className="px-2 py-2 text-[12px] text-text text-right">
                                                    {Number.isFinite(available) ? available : '-'}
                                                  </td>
                                                  <td className="px-2 py-2 text-[12px] text-text text-right">
                                                    {consumed == null ? '-' : consumed}
                                                  </td>
                                                  <td className="px-2 py-2 text-[12px] text-text text-right">{asNumber(r.consumidoVenta, 0) || '-'}</td>
                                                  <td className="px-2 py-2 text-[12px] text-text text-right">{asNumber(r.consumidoMerma, 0) || '-'}</td>
                                                  <td className="px-2 py-2 text-[12px] text-text text-right">{asNumber(r.consumidoTransferencia, 0) || '-'}</td>
                                                  <td className="px-2 py-2 text-[12px] text-text text-right">{asNumber(r.consumidoSinTraza, 0) || '-'}</td>
                                                  <td className="px-2 py-2 text-[12px] text-text text-right">
                                                    {st.pct == null ? '-' : `${st.pct}%`}
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

          {detailTab === 'ajustes' ? (
            <div className="rounded-3xl border border-border/40 bg-surface/40 p-4 shadow-sm">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-[13px] font-semibold text-text">Ajustes</div>
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
                  <div key={stat.label} className="rounded-2xl bg-surface/60 p-3 text-center shadow-sm ring-1 ring-border/15">
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
                                        <td className="px-2 py-2 text-[12px] text-text">{r.talla || '-'}</td>
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
                                        ? 'bg-red-500/15 text-red-700 ring-red-500/20 dark:text-red-300'
                                        : st.tone === 'warn'
                                          ? 'bg-amber-500/15 text-amber-700 ring-amber-500/20 dark:text-amber-300'
                                          : st.tone === 'ok'
                                            ? 'bg-emerald-500/15 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300'
                                            : 'bg-surface/60 text-muted ring-border/10'

                                    return (
                                      <tr key={`${r.loteId}_${idx}`} className="border-t border-border/10">
                                        <td className="px-2 py-2 text-[12px] text-text">{r.talla || '-'}</td>
                                        <td className="px-2 py-2 text-[12px] text-muted">{String(r.loteId).slice(0, 18)}</td>
                                        <td className="px-2 py-2 text-[12px] text-text text-right">{Number.isFinite(initial) ? initial : '-'}</td>
                                        <td className="px-2 py-2 text-[12px] text-text text-right">{Number.isFinite(available) ? available : '-'}</td>
                                        <td className="px-2 py-2 text-[12px] text-text text-right">{consumed == null ? '-' : consumed}</td>
                                        <td className="px-2 py-2 text-[12px] text-text text-right">{st.pct == null ? '-' : `${st.pct}%`}</td>
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
                              <td className="px-3 py-2 text-[13px] text-text">{dateLabel || '-'}</td>
                              <td className="px-3 py-2 text-[12px] text-text">{label}</td>
                              <td className="px-3 py-2 text-[12px] text-text">{m.motivo || '-'}</td>
                              <td className="px-3 py-2 whitespace-pre-line text-[12px] text-muted">{lines || '-'}</td>
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

          {detailTab === 'stock' ? (
            <div className="rounded-3xl border border-border/40 bg-surface/40 p-4 shadow-sm">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-[13px] font-semibold text-text">Stock actual</div>
                  <div className="mt-1 text-[12px] text-muted">Foto actual del inventario de la sucursal seleccionada.</div>
                </div>
                {stockCurrentLoading ? <div className="text-[12px] text-muted">Cargando...</div> : null}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-4">
                {[
                  { label: 'Productos con stock', value: stockCurrentSummary.totalProducts },
                  { label: 'Unidades actuales', value: stockCurrentSummary.totalUnits },
                  { label: 'Tallas activas', value: stockCurrentSummary.totalTallas },
                  {
                    label: 'Ult. actualizacion',
                    value: stockCurrentSummary.lastUpdated ? dateTimeFormatter.format(new Date(stockCurrentSummary.lastUpdated)) : '-',
                  },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-2xl bg-surface/60 p-3 text-center shadow-sm ring-1 ring-border/15">
                    <div className="text-[11px] uppercase tracking-wide text-muted">{stat.label}</div>
                    <div className="mt-1 text-[16px] font-semibold text-text">{stat.value}</div>
                  </div>
                ))}
              </div>

              <div className="mt-4 overflow-x-auto">
                <Table className="min-w-[1100px]">
                  <THead>
                    <tr>
                      <th className="px-3 py-3 text-left text-[11px] uppercase tracking-wide text-muted">Producto</th>
                      <th className="px-3 py-3 text-left text-[11px] uppercase tracking-wide text-muted">Tallas</th>
                      <th className="px-3 py-3 text-right text-[11px] uppercase tracking-wide text-muted">Total</th>
                      <th className="px-3 py-3 text-left text-[11px] uppercase tracking-wide text-muted">Actualizado</th>
                    </tr>
                  </THead>
                  <tbody>
                    {!stockCurrentRows.length ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-10 text-center text-[13px] text-muted">
                          {stockCurrentLoading ? 'Cargando stock...' : 'Sin stock actual en la sucursal.'}
                        </td>
                      </tr>
                    ) : (
                      stockCurrentRows.map((row) => (
                        <tr key={row.productoId} className="border-b border-transparent odd:bg-surface/10 hover:bg-surface/30">
                          <td className="px-3 py-2 text-[13px] text-text">{row.label}</td>
                          <td className="px-3 py-2 text-[12px] text-muted">
                            {row.tallasRows.length ? (
                              <div className="space-y-1">
                                {row.tallasRows.map(([talla, qty]) => (
                                  <div key={`${row.productoId}_${talla}`} className="leading-5">
                                    <span className="font-semibold text-text">{`T${talla}`}</span>
                                    <span>{` x${qty}`}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-[13px] font-semibold text-text">{row.total}</td>
                          <td className="px-3 py-2 text-[12px] text-muted">
                            {row.actualizadoEn ? dateTimeFormatter.format(new Date(row.actualizadoEn)) : '-'}
                          </td>
                        </tr>
                      ))
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
                  <div key={stat.label} className="rounded-2xl bg-surface/60 p-3 text-center shadow-sm ring-1 ring-border/15">
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
                      <th className="px-3 py-3 text-left text-[11px] uppercase tracking-wide text-muted">Detalle</th>
                      <th className="px-3 py-3 text-right text-[11px] uppercase tracking-wide text-muted">Unidades</th>
                      <th className="px-3 py-3 text-right text-[11px] uppercase tracking-wide text-muted">Costo</th>
                      <th className="px-3 py-3 text-left text-[11px] uppercase tracking-wide text-muted">Nota</th>
                      <th className="px-3 py-3 text-right text-[11px] uppercase tracking-wide text-muted">Sin costo</th>
                    </tr>
                  </THead>
                  <tbody>
                    {!transferMovs.length ? (
                      <tr>
                        <td colSpan={10} className="px-4 py-10 text-center text-[13px] text-muted">
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
                        const desde = sucursalNameById[desdeId] || desdeId || '-'
                        const hacia = sucursalNameById[haciaId] || haciaId || '-'
                        const parsed = summarizeTransferItems(m.items || {}, transferProductMetaById)
                        const units = m.unidades == null ? (parsed.units || '-') : asNumber(m.unidades, 0)
                        return (
                          <tr key={m.movId} className="border-b border-transparent odd:bg-surface/10 hover:bg-surface/30">
                            <td className="px-3 py-2 text-[13px] font-semibold text-text">{dir}</td>
                            <td className="px-3 py-2 text-[13px] text-text">{dateLabel || '-'}</td>
                            <td className="px-3 py-2 text-[13px] text-text">{shortId || '-'}</td>
                            <td className="px-3 py-2 text-[13px] text-text">{desde}</td>
                            <td className="px-3 py-2 text-[13px] text-text">{hacia}</td>
                            <td className="px-3 py-2 text-[12px] text-muted">
                              {parsed.productRows.length ? (
                                <div className="space-y-1">
                                  {parsed.productRows.map((row) => (
                                    <div key={`${m.movId}_${row.productId}`} className="leading-5">
                                      <span className="font-semibold text-text">{row.label}</span>
                                      <span>{`: ${row.lines}`}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="px-3 py-2 text-right text-[13px] text-text">{units}</td>
                            <td className="px-3 py-2 text-right text-[13px] font-semibold text-text">{money(asNumber(m.costoTotal, 0))}</td>
                            <td className="px-3 py-2 text-[12px] text-muted">{m.nota || '-'}</td>
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
        </div>
      ) : sucursalId === 'all' ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-5">
            <div className="rounded-3xl bg-surface/40 p-4 shadow-sm ring-1 ring-border/15">
              <div className="text-[11px] uppercase tracking-wide text-muted">Ventas</div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-text">
                <div className="text-muted">Ventas</div>
                <div className="text-right font-semibold">{asNumber(summary.cantidadVentas, 0)}</div>
                <div className="text-muted">Recaudado</div>
                <div className="text-right font-semibold">{money(summary.total)}</div>
                <div className="text-muted">Costo</div>
                <div className="text-right font-semibold">{money(summary.costoTotal)}</div>
                <div className="text-muted">Margen</div>
                <div className="text-right font-semibold">{money(summary.margenBruto)}</div>
              </div>
            </div>

            <div className="rounded-3xl bg-surface/40 p-4 shadow-sm ring-1 ring-border/15">
              <div className="text-[11px] uppercase tracking-wide text-muted">Reposiciones</div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-text">
                <div className="text-muted">Compras</div>
                <div className="text-right font-semibold">{extraLoading ? '...' : asNumber(extraGlobal.comprasCount, 0)}</div>
                <div className="text-muted">Unidades</div>
                <div className="text-right font-semibold">{extraLoading ? '...' : asNumber(extraGlobal.comprasUnidades, 0)}</div>
                <div className="text-muted">Inversion</div>
                <div className="text-right font-semibold">{extraLoading ? '...' : money(extraGlobal.comprasInversion)}</div>
              </div>
            </div>

            <div className="rounded-3xl bg-surface/40 p-4 shadow-sm ring-1 ring-border/15">
              <div className="text-[11px] uppercase tracking-wide text-muted">Ajustes</div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-text">
                <div className="text-muted">Mermas (uds)</div>
                <div className="text-right font-semibold">{extraLoading ? '...' : asNumber(extraGlobal.mermaUnidades, 0)}</div>
                <div className="text-muted">Costo mermas</div>
                <div className="text-right font-semibold">{extraLoading ? '...' : money(extraGlobal.mermaCosto)}</div>
                <div className="text-muted">Regs (uds)</div>
                <div className="text-right font-semibold">{extraLoading ? '...' : asNumber(extraGlobal.regUnidades, 0)}</div>
                <div className="text-muted">Costo regs</div>
                <div className="text-right font-semibold">{extraLoading ? '...' : money(extraGlobal.regCosto)}</div>
              </div>
            </div>

            <div className="rounded-3xl bg-surface/40 p-4 shadow-sm ring-1 ring-border/15">
              <div className="text-[11px] uppercase tracking-wide text-muted">Transferencias</div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-text">
                <div className="text-muted">Entrada (uds)</div>
                <div className="text-right font-semibold">{extraLoading ? '...' : asNumber(extraGlobal.tInUnidades, 0)}</div>
                <div className="text-muted">Costo entrada</div>
                <div className="text-right font-semibold">{extraLoading ? '...' : money(extraGlobal.tInCosto)}</div>
                <div className="text-muted">Salida (uds)</div>
                <div className="text-right font-semibold">{extraLoading ? '...' : asNumber(extraGlobal.tOutUnidades, 0)}</div>
                <div className="text-muted">Costo salida</div>
                <div className="text-right font-semibold">{extraLoading ? '...' : money(extraGlobal.tOutCosto)}</div>
                <div className="text-muted">Sin costo</div>
                <div className="text-right font-semibold">{extraLoading ? '...' : asNumber(extraGlobal.transferSinCosto, 0)}</div>
              </div>
            </div>

            <div className="rounded-3xl bg-surface/40 p-4 shadow-sm ring-1 ring-border/15">
              <div className="text-[11px] uppercase tracking-wide text-muted">Stock actual</div>
              <div className="mt-1 text-[11px] text-muted">Foto viva, no depende del rango.</div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-text">
                <div className="text-muted">Productos</div>
                <div className="text-right font-semibold">{extraLoading ? '...' : asNumber(extraGlobal.stockProducts, 0)}</div>
                <div className="text-muted">Unidades</div>
                <div className="text-right font-semibold">{extraLoading ? '...' : asNumber(extraGlobal.stockUnits, 0)}</div>
                <div className="text-muted">Actualizado</div>
                <div className="text-right font-semibold">
                  {extraLoading ? '...' : extraGlobal.stockLastUpdated ? dateTimeFormatter.format(new Date(extraGlobal.stockLastUpdated)) : '-'}
                </div>
              </div>
            </div>
          </div>

          <Table minWidth={1320}>
            <THead>
              <tr>
                <th className="px-3 py-3">Sucursal</th>
                <th className="px-3 py-3">Ventas</th>
                <th className="px-3 py-3">Reposiciones</th>
                <th className="px-3 py-3">Ajustes</th>
                <th className="px-3 py-3">Transferencias</th>
                <th className="px-3 py-3">Stock actual</th>
                <th className="px-3 py-3 text-right">Accion</th>
              </tr>
            </THead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-[13px] text-muted">
                    Sin datos en el rango seleccionado.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const extra = extraBySucursalId?.[r.sucursalId] || null
                  return (
                    <tr key={r.sucursalId} className="border-b border-transparent odd:bg-surface/20 hover:bg-surface/35">
                      <td className="px-3 py-3 text-text font-semibold">{r.sucursalNombre}</td>

                      <td className="px-3 py-3 text-[12px] text-text">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted">Ventas</span>
                          <span className="font-semibold">{asNumber(r.cantidadVentas, 0)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted">Recaudado</span>
                          <span className="font-semibold">{money(r.total)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted">Margen</span>
                          <span className="font-semibold">{money(r.margenBruto)}</span>
                        </div>
                      </td>

                      <td className="px-3 py-3 text-[12px] text-text">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted">Compras</span>
                          <span className="font-semibold">{extraLoading ? '...' : asNumber(extra?.comprasCount, 0)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted">Unidades</span>
                          <span className="font-semibold">{extraLoading ? '...' : asNumber(extra?.comprasUnidades, 0)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted">Inversion</span>
                          <span className="font-semibold">{extraLoading ? '...' : money(extra?.comprasInversion)}</span>
                        </div>
                      </td>

                      <td className="px-3 py-3 text-[12px] text-text">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted">Merma (uds)</span>
                          <span className="font-semibold">{extraLoading ? '...' : asNumber(extra?.mermaUnidades, 0)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted">Merma (costo)</span>
                          <span className="font-semibold">{extraLoading ? '...' : money(extra?.mermaCosto)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted">Reg (uds)</span>
                          <span className="font-semibold">{extraLoading ? '...' : asNumber(extra?.regUnidades, 0)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted">Reg (costo)</span>
                          <span className="font-semibold">{extraLoading ? '...' : money(extra?.regCosto)}</span>
                        </div>
                      </td>

                      <td className="px-3 py-3 text-[12px] text-text">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted">Entrada (uds)</span>
                          <span className="font-semibold">{extraLoading ? '...' : asNumber(extra?.tInUnidades, 0)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted">Salida (uds)</span>
                          <span className="font-semibold">{extraLoading ? '...' : asNumber(extra?.tOutUnidades, 0)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted">Sin costo</span>
                          <span className="font-semibold">{extraLoading ? '...' : asNumber(extra?.transferSinCosto, 0)}</span>
                        </div>
                      </td>

                      <td className="px-3 py-3 text-[12px] text-text">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted">Productos</span>
                          <span className="font-semibold">
                            {extraLoading ? '...' : Array.isArray(extra?.stockProductIds) ? extra.stockProductIds.length : 0}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted">Unidades</span>
                          <span className="font-semibold">{extraLoading ? '...' : asNumber(extra?.stockUnits, 0)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted">Actualizado</span>
                          <span className="font-semibold">
                            {extraLoading ? '...' : extra?.stockLastUpdated ? dateTimeFormatter.format(new Date(extra.stockLastUpdated)) : '-'}
                          </span>
                        </div>
                      </td>

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
                  )
                })
              )}
            </tbody>
          </Table>
        </div>
      ) : (
        <Table minWidth={900}>
          <THead>
            <tr>
              <th className="px-3 py-3">Dia</th>
              <th className="px-3 py-3 text-right">Ventas</th>
              <th className="px-3 py-3 text-right">Total</th>
              <th className="px-3 py-3 text-right">Detalle</th>
            </tr>
          </THead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-[13px] text-muted">
                  Sin datos en el rango seleccionado.
                </td>
              </tr>
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
      )}
    </DataPanel>
  )
}
