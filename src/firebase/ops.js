import { getDatabase, ref, runTransaction, update } from 'firebase/database'
import { app } from './config'
import { descontarStockSucursal, getValue, incrementarStockSucursal } from './database'
import { lower } from '@/lib/string'
import { yyyymmdd } from '@/lib/date'
import { generateUUID } from '@/utils/UIDgenerator'

const db = getDatabase(app)

function safeKey(key) {
  return String(key || '').replace(/[.#$\[\]\/]/g, '_')
}

function asNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function buildProducto(input) {
  const marca = String(input?.marca ?? '').trim()
  const modelo = String(input?.modelo ?? '').trim()
  const nombre = String(input?.nombre ?? '').trim()
  const precio = asNumber(input?.precio, 0)
  const codigo = String(input?.codigo ?? '').trim()
  const urlImagen = input?.urlImagen ?? null
  const activo = input?.activo !== false
  const now = Date.now()

  return {
    marca,
    modelo,
    nombre,
    precio,
    urlImagen,
    activo,
    codigo,
    marcaLower: lower(marca),
    modeloLower: lower(modelo),
    nombreLower: lower(nombre),
    codigoLower: lower(codigo),
    creadoEn: input?.creadoEn ?? now,
    actualizadoEn: now,
  }
}

export async function guardarProducto({ productoId, producto, marcaLowerAnterior }) {
  const id = productoId || generateUUID()
  const data = buildProducto(producto)

  const paths = {
    [`productos/${id}`]: data,
    [`productosPorMarca/${data.marcaLower}/${id}`]: true,
  }
  if (marcaLowerAnterior && marcaLowerAnterior !== data.marcaLower) {
    paths[`productosPorMarca/${marcaLowerAnterior}/${id}`] = null
  }

  await update(ref(db), paths)
  return { productoId: id, producto: data }
}

export async function eliminarProducto({ productoId }) {
  const id = String(productoId || '').trim()
  if (!id) {
    const err = new Error('productoId_required')
    err.code = 'productoId_required'
    throw err
  }
  const producto = await getValue(`productos/${id}`)
  if (!producto) {
    const err = new Error('producto_no_existe')
    err.code = 'producto_no_existe'
    throw err
  }
  const marcaLower = producto?.marcaLower
  const paths = {
    [`productos/${id}`]: null,
  }
  if (marcaLower) {
    paths[`productosPorMarca/${marcaLower}/${id}`] = null
  }
  await update(ref(db), paths)
  return { ok: true, productoId: id }
}

export async function ajustarInventarioProductoSucursal({ sucursalId, productoId, tallas, usuarioId, nota }) {
  const current = (await getValue(`inventario/${sucursalId}/${productoId}/tallas`)) || {}
  const next = tallas && typeof tallas === 'object' ? tallas : {}

  const cleaned = {}
  for (const [k, v] of Object.entries(next)) {
    const talla = String(k).trim()
    const qty = asNumber(v, 0)
    if (!talla) continue
    if (qty <= 0) continue
    cleaned[talla] = qty
  }

  const diffItems = {}
  const allKeys = new Set([...Object.keys(current || {}), ...Object.keys(cleaned)])
  for (const talla of allKeys) {
    const before = asNumber(current?.[talla], 0)
    const after = asNumber(cleaned?.[talla], 0)
    const delta = after - before
    if (delta !== 0) diffItems[talla] = delta
  }

  const total = Object.values(cleaned).reduce((acc, n) => acc + asNumber(n, 0), 0)
  const now = Date.now()

  const paths = {
    [`inventario/${sucursalId}/${productoId}/tallas`]: cleaned,
    [`inventario/${sucursalId}/${productoId}/actualizadoEn`]: now,
    [`inventarioTotales/${sucursalId}/${productoId}/total`]: total,
    [`inventarioTotales/${sucursalId}/${productoId}/actualizadoEn`]: now,
  }

  const movimientoId = generateUUID()
  paths[`movimientosInventario/${movimientoId}`] = {
    tipo: 'ajuste',
    sucursalId,
    usuarioId: usuarioId ?? null,
    creadoEn: now,
    referencia: { ventaId: null, transferenciaId: null, nota: nota ?? null },
    items: { [productoId]: { tallas: diffItems } },
  }

  await update(ref(db), paths)
  return { ok: true }
}

function groupVentaItems(items) {
  const grouped = {}
  for (const it of items || []) {
    const productoId = String(it?.productoId || '').trim()
    const label = String(it?.talla ?? '').trim()
    const cantidad = asNumber(it?.cantidad, 0)
    if (!productoId || !label || cantidad <= 0) continue

    if (!grouped[productoId]) {
      grouped[productoId] = {
        tallas: {},
        // precioUnitario queda por compatibilidad con datos viejos, pero si hay precios distintos por talla,
        // el valor real esta en `preciosPorTalla`.
        precioUnitario: asNumber(it?.precioUnitario, 0),
        preciosPorTalla: {},
        consumoLotes: {},
        marca: it?.marca ?? null,
        modelo: it?.modelo ?? null,
        nombre: it?.nombre ?? null,
      }
    }
    grouped[productoId].tallas[label] = (grouped[productoId].tallas[label] || 0) + cantidad
    grouped[productoId].preciosPorTalla[label] = asNumber(it?.precioUnitario, 0)
  }
  return grouped
}

function cleanCompraRows(rows) {
  const merged = new Map()
  for (const r of rows || []) {
    const talla = String(r?.talla ?? '').trim()
    const cantidad = asNumber(r?.cantidad, 0)
    const costoUnitario = asNumber(r?.costoUnitario, NaN)
    if (!talla) continue
    if (cantidad <= 0) continue
    if (!Number.isFinite(costoUnitario) || costoUnitario < 0) continue

    const current = merged.get(talla)
    if (!current) merged.set(talla, { talla, cantidad, costoUnitario })
    else merged.set(talla, { talla, cantidad: current.cantidad + cantidad, costoUnitario })
  }
  return Array.from(merged.values())
}

function buildLoteId(compraId, talla) {
  return `${safeKey(compraId)}_${safeKey(String(talla || '').trim())}`
}

function buildLoteMovimientoPath({ sucursalId, productoId, talla, loteId, traceId }) {
  const sid = String(sucursalId || '').trim()
  const pid = String(productoId || '').trim()
  const t = String(talla || '').trim()
  const lid = String(loteId || '').trim()
  const tid = String(traceId || '').trim()
  if (!sid || !pid || !t || !lid || !tid) return ''
  return `movimientosPorLote/${sid}/${pid}/${t}/${lid}/${tid}`
}

function buildLoteMovimientoEntry({
  kind,
  operationType,
  entityId,
  movimientoId,
  cantidad,
  costoUnitario,
  costoDesconocido,
  creadoEn,
  usuarioId,
  extra = {},
}) {
  const parsedCosto = Number(costoUnitario)
  return {
    kind: String(kind || '').trim() || null,
    operationType: String(operationType || '').trim() || null,
    entityId: entityId ? String(entityId).trim() : null,
    movimientoId: movimientoId ? String(movimientoId).trim() : null,
    cantidad: asNumber(cantidad, 0),
    costoUnitario: Number.isFinite(parsedCosto) && parsedCosto >= 0 ? parsedCosto : null,
    costoDesconocido: costoDesconocido === true ? true : null,
    creadoEn: asNumber(creadoEn, 0),
    usuarioId: usuarioId ? String(usuarioId).trim() : null,
    ...extra,
  }
}

function appendLoteMovimiento(paths, { sucursalId, productoId, talla, loteId, traceId, entry }) {
  const path = buildLoteMovimientoPath({ sucursalId, productoId, talla, loteId, traceId })
  if (!path) return
  paths[path] = entry
}

export async function registrarCompraInventarioProductoSucursal({
  sucursalId,
  productoId,
  usuarioId,
  nota,
  proveedor,
  productoSnapshot,
  rows,
}) {
  const sid = String(sucursalId || '').trim()
  const pid = String(productoId || '').trim()
  if (!sid) throw new Error('sucursalId_required')
  if (!pid) throw new Error('productoId_required')

  const cleaned = cleanCompraRows(rows)
  if (!cleaned.length) {
    const err = new Error('compra_sin_items')
    err.code = 'compra_sin_items'
    throw err
  }

  const compraId = generateUUID()
  const now = Date.now()

  // 1) Incrementa stock (atomic por producto/sucursal).
  const tallasRef = ref(db, `inventario/${sid}/${pid}/tallas`)
  const tx = await runTransaction(
    tallasRef,
    (current) => {
      const cur = current && typeof current === 'object' ? current : {}
      const next = { ...cur }
      for (const it of cleaned) {
        const before = asNumber(next[it.talla], 0)
        next[it.talla] = before + asNumber(it.cantidad, 0)
      }
      return next
    },
    { applyLocally: false }
  )

  const nextTallas = (tx.snapshot && tx.snapshot.val && tx.snapshot.val()) || {}
  const total = Object.values(nextTallas || {}).reduce((acc, n) => acc + asNumber(n, 0), 0)
  const unidades = cleaned.reduce((acc, it) => acc + asNumber(it.cantidad, 0), 0)
  const costoTotal = cleaned.reduce((acc, it) => acc + asNumber(it.cantidad, 0) * asNumber(it.costoUnitario, 0), 0)

  const compraItems = {
    [pid]: {
      tallas: Object.fromEntries(cleaned.map((it) => [it.talla, { cantidad: it.cantidad, costoUnitario: it.costoUnitario }])),
    },
  }

  const snap = productoSnapshot && typeof productoSnapshot === 'object' ? productoSnapshot : null
  const snapMarca = snap?.marca != null ? String(snap.marca) : null
  const snapModelo = snap?.modelo != null ? String(snap.modelo) : null
  const snapNombre = snap?.nombre != null ? String(snap.nombre) : null

  const movimientoId = `compra_${compraId}`
  const lotPaths = {}
  const activePaths = {}
  const loteTracePaths = {}
  for (const it of cleaned) {
    const loteId = buildLoteId(compraId, it.talla)
    lotPaths[`lotesCompra/${sid}/${pid}/${it.talla}/${loteId}`] = {
      creadoEn: now,
      cantidadInicial: asNumber(it.cantidad, 0),
      cantidadDisponible: asNumber(it.cantidad, 0),
      costoUnitario: asNumber(it.costoUnitario, 0),
      proveedor: proveedor ? String(proveedor).trim() : null,
      nota: nota ? String(nota).trim() : null,
      sourceType: 'compra',
      sourceId: compraId,
      sourceMovimientoId: movimientoId,
    }
    activePaths[`lotesCompraActivos/${sid}/${pid}/${it.talla}/${loteId}`] = now
    appendLoteMovimiento(loteTracePaths, {
      sucursalId: sid,
      productoId: pid,
      talla: it.talla,
      loteId,
      traceId: `entrada_compra_${safeKey(compraId)}_${safeKey(it.talla)}`,
      entry: buildLoteMovimientoEntry({
        kind: 'entrada',
        operationType: 'compra',
        entityId: compraId,
        movimientoId,
        cantidad: it.cantidad,
        costoUnitario: it.costoUnitario,
        creadoEn: now,
        usuarioId,
      }),
    })
  }

  const paths = {
    [`inventario/${sid}/${pid}/actualizadoEn`]: now,
    [`inventarioTotales/${sid}/${pid}/total`]: total,
    [`inventarioTotales/${sid}/${pid}/actualizadoEn`]: now,

    [`compras/${compraId}`]: {
      sucursalId: sid,
      productoId: pid,
      usuarioId: usuarioId ?? null,
      creadoEn: now,
      proveedor: proveedor ? String(proveedor).trim() : null,
      nota: nota ? String(nota).trim() : null,
      unidades,
      costoTotal,
      marca: snapMarca,
      modelo: snapModelo,
      nombre: snapNombre,
      items: compraItems,
    },
    [`comprasPorSucursal/${sid}/${compraId}`]: {
      creadoEn: now,
      unidades,
      costoTotal,
      productoId: pid,
      proveedor: proveedor ? String(proveedor).trim() : null,
      nota: nota ? String(nota).trim() : null,
      marca: snapMarca,
      modelo: snapModelo,
      nombre: snapNombre,
      items: compraItems,
    },

    [`movimientosInventario/${movimientoId}`]: {
      tipo: 'compra',
      sucursalId: sid,
      usuarioId: usuarioId ?? null,
      creadoEn: now,
      referencia: { ventaId: null, transferenciaId: null, nota: nota ?? null },
      unidades,
      costoTotal,
      items: compraItems,
    },
    ...lotPaths,
    ...activePaths,
    ...loteTracePaths,
  }

  await update(ref(db), paths)
  return { ok: true, compraId }
}

export async function anularReposicionCompra({ sucursalId, compraId, usuarioId, nota }) {
  const sidInput = String(sucursalId || '').trim()
  const cid = String(compraId || '').trim()
  if (!cid) {
    const err = new Error('compraId_required')
    err.code = 'compraId_required'
    throw err
  }

  // Preferimos leer `compras/{compraId}` (fuente de verdad). Si no existe, fallback a la vista por sucursal.
  const compra = (await getValue(`compras/${cid}`).catch(() => null)) || (sidInput ? await getValue(`comprasPorSucursal/${sidInput}/${cid}`).catch(() => null) : null)
  if (!compra) {
    const err = new Error('compra_no_existe')
    err.code = 'compra_no_existe'
    throw err
  }

  const sid = String(compra?.sucursalId || sidInput || '').trim()
  if (!sid) {
    const err = new Error('sucursalId_required')
    err.code = 'sucursalId_required'
    throw err
  }

  const estado = String(compra?.estado || '').trim()
  if (estado === 'anulada') return { ok: true, alreadyAnulada: true }

  const items = compra?.items && typeof compra.items === 'object' ? compra.items : null
  if (!items) {
    const err = new Error('compra_sin_items')
    err.code = 'compra_sin_items'
    throw err
  }

  // 1) Validar que todos los lotes de esta compra esten "nuevos" (sin consumo).
  const movId = `compra_anulada_${safeKey(cid)}`
  const loteDeletes = {}
  const loteTracePaths = {}
  const toDescontar = [] // [{ productoId, talla, cantidad }]
  let unidades = 0
  let costoTotal = 0

  for (const [productoId, detail] of Object.entries(items)) {
    const pid = String(productoId || '').trim()
    if (!pid) continue

    const tallas = detail?.tallas && typeof detail.tallas === 'object' ? detail.tallas : {}
    for (const [tallaKey, data] of Object.entries(tallas)) {
      const talla = String(tallaKey ?? '').trim()
      const qty = asNumber(data?.cantidad, 0)
      if (!talla || qty <= 0) continue

      const loteId = buildLoteId(cid, talla)
      const lotePath = `lotesCompra/${sid}/${pid}/${talla}/${loteId}`
      const lote = await getValue(lotePath).catch(() => null)
      if (!lote) {
        const err = new Error('lote_no_existe')
        err.code = 'lote_no_existe'
        err.lotePath = lotePath
        throw err
      }

      const inicial = asNumber(lote?.cantidadInicial, qty)
      const disponible = asNumber(lote?.cantidadDisponible, NaN)
      if (!Number.isFinite(disponible)) {
        const err = new Error('lote_invalido')
        err.code = 'lote_invalido'
        err.lotePath = lotePath
        throw err
      }

      // Si el lote se consumio aunque sea 1 unidad, no se permite anular reposicion.
      if (disponible !== inicial) {
        const err = new Error('compra_no_anulable_lote_consumido')
        err.code = 'compra_no_anulable_lote_consumido'
        err.loteId = loteId
        err.talla = talla
        err.productoId = pid
        err.disponible = disponible
        err.inicial = inicial
        throw err
      }

      unidades += qty
      costoTotal += qty * asNumber(lote?.costoUnitario, 0)
      toDescontar.push({ productoId: pid, talla, cantidad: qty })

      loteDeletes[lotePath] = null
      loteDeletes[`lotesCompraActivos/${sid}/${pid}/${talla}/${loteId}`] = null
      appendLoteMovimiento(loteTracePaths, {
        sucursalId: sid,
        productoId: pid,
        talla,
        loteId,
        traceId: `reversion_compra_${safeKey(cid)}_${safeKey(talla)}`,
        entry: buildLoteMovimientoEntry({
          kind: 'reversion',
          operationType: 'compra',
          entityId: cid,
          movimientoId: movId,
          cantidad: qty,
          costoUnitario: lote?.costoUnitario,
          creadoEn: Date.now(),
          usuarioId,
          extra: { nota: nota ? String(nota).trim() : null },
        }),
      })
    }
  }

  if (!toDescontar.length) {
    const err = new Error('compra_sin_items')
    err.code = 'compra_sin_items'
    throw err
  }

  // 2) Descontar inventario (si falla, no tocamos lotes/compra).
  const descontados = []
  try {
    for (const it of toDescontar) {
      await descontarStockSucursal({ sucursalId: sid, productoId: it.productoId, talla: it.talla, cantidad: it.cantidad })
      descontados.push(it)
    }
  } catch (err) {
    // Si no se pudo descontar stock, abortamos (no borramos lotes ni marcamos compra anulada).
    throw err
  }

  const now = Date.now()
  const deltaItems = {}
  for (const it of toDescontar) {
    if (!deltaItems[it.productoId]) deltaItems[it.productoId] = { tallas: {} }
    deltaItems[it.productoId].tallas[it.talla] = (deltaItems[it.productoId].tallas[it.talla] || 0) - asNumber(it.cantidad, 0)
  }

  // 3) Borrar lotes + marcar compra anulada + registrar movimiento (todo en 1 update).
  const paths = {
    ...loteDeletes,
    ...loteTracePaths,
    [`compras/${cid}/estado`]: 'anulada',
    [`compras/${cid}/anuladoEn`]: now,
    [`compras/${cid}/anuladoPorUsuarioId`]: usuarioId ?? null,
    [`compras/${cid}/anuladoNota`]: nota ? String(nota).trim() : null,

    [`comprasPorSucursal/${sid}/${cid}/estado`]: 'anulada',
    [`comprasPorSucursal/${sid}/${cid}/anuladoEn`]: now,
    [`comprasPorSucursal/${sid}/${cid}/anuladoPorUsuarioId`]: usuarioId ?? null,
    [`comprasPorSucursal/${sid}/${cid}/anuladoNota`]: nota ? String(nota).trim() : null,

    [`movimientosInventario/${movId}`]: {
      tipo: 'compra_anulada',
      sucursalId: sid,
      compraId: cid,
      usuarioId: usuarioId ?? null,
      creadoEn: now,
      unidades,
      costoTotal: asNumber(costoTotal, 0),
      nota: nota ? String(nota).trim() : null,
      items: deltaItems,
    },
  }

  try {
    await update(ref(db), paths)
    return { ok: true }
  } catch (err) {
    // Si fallamos al borrar lotes/marcar compra, devolvemos el stock.
    for (const it of descontados) {
      await incrementarStockSucursal({ sucursalId: sid, productoId: it.productoId, talla: it.talla, cantidad: it.cantidad }).catch(() => {})
    }
    throw err
  }
}

function cleanQtyRows(rows) {
  const merged = new Map()
  for (const r of rows || []) {
    const talla = String(r?.talla ?? '').trim()
    const cantidad = asNumber(r?.cantidad, 0)
    if (!talla) continue
    if (cantidad <= 0) continue

    const cur = merged.get(talla)
    merged.set(talla, { talla, cantidad: asNumber(cur?.cantidad, 0) + cantidad })
  }
  return Array.from(merged.values())
}

function cleanCostoRowsAllowUnknown(rows) {
  const merged = new Map()
  for (const r of rows || []) {
    const talla = String(r?.talla ?? '').trim()
    const cantidad = asNumber(r?.cantidad, 0)

    // Costo opcional: si viene vacio/NaN lo marcamos como desconocido y lo guardamos como 0.
    const rawCosto = r?.costoUnitario
    const parsedCosto = rawCosto === '' || rawCosto === null || rawCosto === undefined ? NaN : asNumber(rawCosto, NaN)
    const costoUnitario = Number.isFinite(parsedCosto) && parsedCosto >= 0 ? parsedCosto : 0
    const costoDesconocido = !(Number.isFinite(parsedCosto) && parsedCosto >= 0)

    if (!talla) continue
    if (cantidad <= 0) continue

    const cur = merged.get(talla)
    merged.set(talla, {
      talla,
      cantidad: asNumber(cur?.cantidad, 0) + cantidad,
      costoUnitario,
      costoDesconocido,
    })
  }
  return Array.from(merged.values())
}

export async function registrarMermaInventarioProductoSucursal({
  sucursalId,
  productoId,
  usuarioId,
  motivo,
  nota,
  productoSnapshot,
  rows,
}) {
  const sid = String(sucursalId || '').trim()
  const pid = String(productoId || '').trim()
  if (!sid) throw new Error('sucursalId_required')
  if (!pid) throw new Error('productoId_required')

  const cleaned = cleanQtyRows(rows)
  if (!cleaned.length) {
    const err = new Error('merma_sin_items')
    err.code = 'merma_sin_items'
    throw err
  }

  const now = Date.now()
  const movId = `merma_${generateUUID()}`

  const snap = productoSnapshot && typeof productoSnapshot === 'object' ? productoSnapshot : null
  const snapMarca = snap?.marca != null ? String(snap.marca) : null
  const snapModelo = snap?.modelo != null ? String(snap.modelo) : null
  const snapNombre = snap?.nombre != null ? String(snap.nombre) : null

  const reservedLotes = []
  const descontados = []
  const consumoLotes = {}
  let costoTotal = 0
  let costoIncompleto = false

  try {
    // 1) Consumir lotes FIFO (costo) antes de descontar stock.
    for (const it of cleaned) {
      const { consumos, costo, reserved, incompleto } = await consumirLotesCompraFIFO({
        sucursalId: sid,
        productoId: pid,
        talla: it.talla,
        cantidad: it.cantidad,
      })
      consumoLotes[it.talla] = consumos
      reservedLotes.push(...(reserved || []))
      costoTotal += asNumber(costo, 0)
      if (incompleto) costoIncompleto = true
    }

    // 2) Descontar stock.
    for (const it of cleaned) {
      await descontarStockSucursal({ sucursalId: sid, productoId: pid, talla: it.talla, cantidad: it.cantidad })
      descontados.push(it)
    }
  } catch (err) {
    await rollbackConsumoLotes(reservedLotes).catch(() => {})
    for (const it of descontados) {
      await incrementarStockSucursal({ sucursalId: sid, productoId: pid, talla: it.talla, cantidad: it.cantidad }).catch(() => {})
    }
    throw err
  }

  const unidades = cleaned.reduce((acc, it) => acc + asNumber(it.cantidad, 0), 0)
  const itemsDelta = {
    [pid]: {
      tallas: Object.fromEntries(cleaned.map((it) => [it.talla, -asNumber(it.cantidad, 0)])),
    },
  }
  const itemsPos = {
    [pid]: {
      tallas: Object.fromEntries(cleaned.map((it) => [it.talla, { cantidad: asNumber(it.cantidad, 0) }])),
    },
  }
  const loteTracePaths = {}
  for (const [talla, consumos] of Object.entries(consumoLotes || {})) {
    const list = Array.isArray(consumos) ? consumos : []
    for (const c of list) {
      const loteId = String(c?.loteId || '').trim()
      const cantidad = asNumber(c?.cantidad, 0)
      if (!loteId || cantidad <= 0) continue
      appendLoteMovimiento(loteTracePaths, {
        sucursalId: sid,
        productoId: pid,
        talla,
        loteId,
        traceId: `salida_merma_${safeKey(movId)}_${safeKey(talla)}_${safeKey(loteId)}`,
        entry: buildLoteMovimientoEntry({
          kind: 'salida',
          operationType: 'merma',
          entityId: movId,
          movimientoId: movId,
          cantidad,
          costoUnitario: c?.costoUnitario,
          costoDesconocido: c?.costoDesconocido === true,
          creadoEn: now,
          usuarioId,
          extra: { motivo: motivo ? String(motivo).trim() : null },
        }),
      })
    }
  }

  const paths = {
    [`movimientosInventario/${movId}`]: {
      tipo: 'merma',
      sucursalId: sid,
      productoId: pid,
      usuarioId: usuarioId ?? null,
      creadoEn: now,
      motivo: motivo ? String(motivo).trim() : null,
      nota: nota ? String(nota).trim() : null,
      unidades,
      ingresoTotal: 0,
      costoTotal: asNumber(costoTotal, 0),
      costoIncompleto: costoIncompleto ? true : null,
      items: itemsDelta,
      consumoLotes,
      marca: snapMarca,
      modelo: snapModelo,
      nombre: snapNombre,
    },
    [`movimientosPorSucursal/${sid}/${movId}`]: {
      creadoEn: now,
      tipo: 'merma',
      unidades,
      ingresoTotal: 0,
      costoTotal: asNumber(costoTotal, 0),
      costoIncompleto: costoIncompleto ? true : null,
      productoId: pid,
      motivo: motivo ? String(motivo).trim() : null,
      nota: nota ? String(nota).trim() : null,
      marca: snapMarca,
      modelo: snapModelo,
      nombre: snapNombre,
      items: itemsPos,
    },
    ...loteTracePaths,
  }

  await update(ref(db), paths)
  return { ok: true, movimientoId: movId }
}

export async function registrarRegularizacionInventarioProductoSucursal({
  sucursalId,
  productoId,
  usuarioId,
  motivo,
  nota,
  productoSnapshot,
  rows,
}) {
  const sid = String(sucursalId || '').trim()
  const pid = String(productoId || '').trim()
  if (!sid) throw new Error('sucursalId_required')
  if (!pid) throw new Error('productoId_required')

  const cleaned = cleanCostoRowsAllowUnknown(rows)
  if (!cleaned.length) {
    const err = new Error('regularizacion_sin_items')
    err.code = 'regularizacion_sin_items'
    throw err
  }

  const regId = generateUUID()
  const now = Date.now()

  // 1) Incrementa stock (atomic por producto/sucursal).
  const tallasRef = ref(db, `inventario/${sid}/${pid}/tallas`)
  const tx = await runTransaction(
    tallasRef,
    (current) => {
      const cur = current && typeof current === 'object' ? current : {}
      const next = { ...cur }
      for (const it of cleaned) {
        const before = asNumber(next[it.talla], 0)
        next[it.talla] = before + asNumber(it.cantidad, 0)
      }
      return next
    },
    { applyLocally: false }
  )

  const nextTallas = (tx.snapshot && tx.snapshot.val && tx.snapshot.val()) || {}
  const total = Object.values(nextTallas || {}).reduce((acc, n) => acc + asNumber(n, 0), 0)

  const unidades = cleaned.reduce((acc, it) => acc + asNumber(it.cantidad, 0), 0)
  const costoTotal = cleaned.reduce((acc, it) => acc + asNumber(it.cantidad, 0) * asNumber(it.costoUnitario, 0), 0)
  const costoDesconocido = cleaned.some((it) => it.costoDesconocido)

  const snap = productoSnapshot && typeof productoSnapshot === 'object' ? productoSnapshot : null
  const snapMarca = snap?.marca != null ? String(snap.marca) : null
  const snapModelo = snap?.modelo != null ? String(snap.modelo) : null
  const snapNombre = snap?.nombre != null ? String(snap.nombre) : null

  const movId = `reg_${regId}`
  const lotPaths = {}
  const activePaths = {}
  const loteTracePaths = {}
  const itemsPos = {
    [pid]: {
      tallas: Object.fromEntries(cleaned.map((it) => [it.talla, { cantidad: it.cantidad, costoUnitario: it.costoUnitario, costoDesconocido: it.costoDesconocido ? true : null }])),
    },
  }
  for (const it of cleaned) {
    const loteId = buildLoteId(`reg_${regId}`, it.talla)
    lotPaths[`lotesCompra/${sid}/${pid}/${it.talla}/${loteId}`] = {
      creadoEn: now,
      cantidadInicial: asNumber(it.cantidad, 0),
      cantidadDisponible: asNumber(it.cantidad, 0),
      costoUnitario: asNumber(it.costoUnitario, 0),
      costoDesconocido: it.costoDesconocido ? true : null,
      tipo: 'regularizacion',
      motivo: motivo ? String(motivo).trim() : null,
      nota: nota ? String(nota).trim() : null,
      sourceType: 'regularizacion',
      sourceId: regId,
      sourceMovimientoId: movId,
    }
    activePaths[`lotesCompraActivos/${sid}/${pid}/${it.talla}/${loteId}`] = now
    appendLoteMovimiento(loteTracePaths, {
      sucursalId: sid,
      productoId: pid,
      talla: it.talla,
      loteId,
      traceId: `entrada_regularizacion_${safeKey(regId)}_${safeKey(it.talla)}`,
      entry: buildLoteMovimientoEntry({
        kind: 'entrada',
        operationType: 'regularizacion',
        entityId: regId,
        movimientoId: movId,
        cantidad: it.cantidad,
        costoUnitario: it.costoUnitario,
        costoDesconocido: it.costoDesconocido ? true : null,
        creadoEn: now,
        usuarioId,
        extra: { motivo: motivo ? String(motivo).trim() : null },
      }),
    })
  }

  const paths = {
    [`inventario/${sid}/${pid}/actualizadoEn`]: now,
    [`inventarioTotales/${sid}/${pid}/total`]: total,
    [`inventarioTotales/${sid}/${pid}/actualizadoEn`]: now,

    [`movimientosInventario/${movId}`]: {
      tipo: 'regularizacion',
      sucursalId: sid,
      productoId: pid,
      usuarioId: usuarioId ?? null,
      creadoEn: now,
      motivo: motivo ? String(motivo).trim() : null,
      nota: nota ? String(nota).trim() : null,
      unidades,
      ingresoTotal: 0,
      costoTotal: asNumber(costoTotal, 0),
      costoIncompleto: costoDesconocido ? true : null,
      items: {
        [pid]: {
          tallas: Object.fromEntries(cleaned.map((it) => [it.talla, asNumber(it.cantidad, 0)])),
        },
      },
      marca: snapMarca,
      modelo: snapModelo,
      nombre: snapNombre,
    },
    [`movimientosPorSucursal/${sid}/${movId}`]: {
      creadoEn: now,
      tipo: 'regularizacion',
      unidades,
      ingresoTotal: 0,
      costoTotal: asNumber(costoTotal, 0),
      costoIncompleto: costoDesconocido ? true : null,
      productoId: pid,
      motivo: motivo ? String(motivo).trim() : null,
      nota: nota ? String(nota).trim() : null,
      marca: snapMarca,
      modelo: snapModelo,
      nombre: snapNombre,
      items: itemsPos,
    },
    ...lotPaths,
    ...activePaths,
    ...loteTracePaths,
  }

  await update(ref(db), paths)
  return { ok: true, movimientoId: movId }
}

async function consumirLotesCompraFIFO({ sucursalId, productoId, talla, cantidad }) {
  const sid = String(sucursalId || '').trim()
  const pid = String(productoId || '').trim()
  const t = String(talla || '').trim()
  const qty = asNumber(cantidad, 0)
  if (!sid || !pid || !t || qty <= 0) return { consumos: [], costo: 0, reserved: [] }

  const idx = (await getValue(`lotesCompraActivos/${sid}/${pid}/${t}`)) || {}
  const ordered = Object.entries(idx || {})
    .map(([loteId, creadoEn]) => ({ loteId, creadoEn: asNumber(creadoEn, 0) }))
    .filter((x) => x.loteId && x.creadoEn > 0)
    .sort((a, b) => (a.creadoEn - b.creadoEn) || String(a.loteId).localeCompare(String(b.loteId)))

  let remaining = qty
  const consumos = []
  const reserved = []
  const cleanupPaths = {}
  let costoDesconocido = false

  for (const entry of ordered) {
    if (remaining <= 0) break

    const lotePath = `lotesCompra/${sid}/${pid}/${t}/${entry.loteId}`
    const lote = await getValue(lotePath).catch(() => null)
    const disponible = asNumber(lote?.cantidadDisponible, 0)
    if (disponible <= 0) {
      cleanupPaths[`lotesCompraActivos/${sid}/${pid}/${t}/${entry.loteId}`] = null
      continue
    }
    const costoUnitario = asNumber(lote?.costoUnitario, NaN)
    if (!Number.isFinite(costoUnitario) || costoUnitario < 0) {
      const err = new Error('lote_sin_costo')
      err.code = 'lote_sin_costo'
      throw err
    }
    if (lote?.costoDesconocido === true) costoDesconocido = true

    let taken = 0
    const cantidadRef = ref(db, `${lotePath}/cantidadDisponible`)
    const res = await runTransaction(
      cantidadRef,
      (current) => {
        const cur = asNumber(current, 0)
        if (cur <= 0) return current
        taken = Math.min(cur, remaining)
        if (taken <= 0) return current
        return cur - taken
      },
      { applyLocally: false }
    )

    const after = asNumber(res.snapshot?.val?.(), NaN)
    if (!res.committed || taken <= 0) continue

    reserved.push({ sucursalId: sid, productoId: pid, talla: t, loteId: entry.loteId, cantidad: taken, creadoEn: entry.creadoEn })
    consumos.push({ loteId: entry.loteId, cantidad: taken, costoUnitario, costoDesconocido: lote?.costoDesconocido === true })
    remaining -= taken

    if (Number.isFinite(after) && after <= 0) {
      cleanupPaths[`lotesCompraActivos/${sid}/${pid}/${t}/${entry.loteId}`] = null
    }
  }

  if (Object.keys(cleanupPaths).length) await update(ref(db), cleanupPaths).catch(() => {})

  // Compatibilidad: si hay stock viejo sin lotes (o lotes incompletos), no bloqueamos la venta.
  // Se marca costo incompleto para que el reporte lo refleje.
  const incompleto = remaining > 0 || costoDesconocido

  const costo = consumos.reduce((acc, x) => acc + asNumber(x.cantidad, 0) * asNumber(x.costoUnitario, 0), 0)
  return { consumos, costo, reserved, incompleto, remaining }
}

async function rollbackConsumoLotes(reserved = []) {
  for (const r of reserved || []) {
    const sid = String(r?.sucursalId || '').trim()
    const pid = String(r?.productoId || '').trim()
    const t = String(r?.talla || '').trim()
    const loteId = String(r?.loteId || '').trim()
    const qty = asNumber(r?.cantidad, 0)
    if (!sid || !pid || !t || !loteId || qty <= 0) continue

    const lotePath = `lotesCompra/${sid}/${pid}/${t}/${loteId}/cantidadDisponible`
    await runTransaction(
      ref(db, lotePath),
      (current) => asNumber(current, 0) + qty,
      { applyLocally: false }
    ).catch(() => {})

    const creadoEn = asNumber(r?.creadoEn, 0)
    if (creadoEn > 0) {
      await update(ref(db), { [`lotesCompraActivos/${sid}/${pid}/${t}/${loteId}`]: creadoEn }).catch(() => {})
    }
  }
}

async function incrementarReporteVentaDia({ sucursalId, ts, total, ventaId, costoTotal = 0, margenBruto = 0 }) {
  const dia = yyyymmdd(ts)
  const reportRef = ref(db, `reportes/ventasPorSucursalDia/${sucursalId}/${dia}`)
  const now = Date.now()

  await runTransaction(reportRef, (current) => {
    const cur = current && typeof current === 'object' ? current : {}
    const curTotal = asNumber(cur.total, 0)
    const curCosto = asNumber(cur.costoTotal, 0)
    const curMargen = asNumber(cur.margenBruto, 0)
    const curCount = asNumber(cur.cantidadVentas, 0)
    const ventas = cur.ventas && typeof cur.ventas === 'object' ? cur.ventas : {}

    if (ventaId && ventas[ventaId]) return { ...cur, actualizadoEn: now }

    return {
      ...cur,
      total: curTotal + asNumber(total, 0),
      costoTotal: curCosto + asNumber(costoTotal, 0),
      margenBruto: curMargen + asNumber(margenBruto, 0),
      cantidadVentas: curCount + 1,
      actualizadoEn: now,
      ventas: ventaId ? { ...ventas, [ventaId]: true } : ventas,
    }
  })
}

async function decrementarReporteVentaDia({ sucursalId, ts, total, ventaId, costoTotal = 0, margenBruto = 0 }) {
  const dia = yyyymmdd(ts)
  const reportRef = ref(db, `reportes/ventasPorSucursalDia/${sucursalId}/${dia}`)
  const now = Date.now()

  await runTransaction(reportRef, (current) => {
    const cur = current && typeof current === 'object' ? current : {}
    const ventas = cur.ventas && typeof cur.ventas === 'object' ? cur.ventas : {}

    // Idempotencia: si la venta no estaba registrada, no restamos otra vez.
    if (!ventaId || !ventas[ventaId]) return { ...cur, actualizadoEn: now }

    const curTotal = asNumber(cur.total, 0)
    const curCosto = asNumber(cur.costoTotal, 0)
    const curMargen = asNumber(cur.margenBruto, 0)
    const curCount = asNumber(cur.cantidadVentas, 0)

    const nextVentas = { ...ventas }
    delete nextVentas[ventaId]

    return {
      ...cur,
      total: Math.max(0, curTotal - asNumber(total, 0)),
      costoTotal: Math.max(0, curCosto - asNumber(costoTotal, 0)),
      margenBruto: curMargen - asNumber(margenBruto, 0),
      cantidadVentas: Math.max(0, curCount - 1),
      actualizadoEn: now,
      ventas: nextVentas,
    }
  })
}

async function reservarIdempotencia({ idempotencyKey, tipo, entityId, usuarioId }) {
  const key = safeKey(idempotencyKey)
  if (!key) throw new Error('idempotencyKey_required')
  const now = Date.now()

  const idemRef = ref(db, `idempotencias/${key}`)
  const res = await runTransaction(idemRef, (current) => {
    if (current == null) {
      return {
        tipo,
        entityId,
        usuarioId: usuarioId ?? null,
        estado: 'processing',
        etapa: 'reservada',
        creadoEn: now,
        actualizadoEn: now,
      }
    }
    if (current && typeof current === 'object') return current
    return current
  })

  const val = res.snapshot.val() || {}
  return { key, ...val }
}

export async function registrarVenta({ ventaId, sucursalId, usuarioId, items, total, metodoPago, idempotencyKey }) {
  const desiredId = ventaId || generateUUID()
  const lock = await reservarIdempotencia({
    idempotencyKey: idempotencyKey || `venta_${desiredId}`,
    tipo: 'venta',
    entityId: desiredId,
    usuarioId,
  })

  const id = lock?.entityId || desiredId
  const now = Date.now()

  const venta = await getValue(`ventas/${id}`)
  if (venta?.estado === 'confirmada') {
    await update(ref(db), {
      [`idempotencias/${lock.key}/estado`]: 'confirmada',
      [`idempotencias/${lock.key}/etapa`]: 'confirmada',
      [`idempotencias/${lock.key}/actualizadoEn`]: now,
      [`idempotencias/${lock.key}/confirmadoEn`]: venta?.confirmadoEn ?? now,
    }).catch(() => {})

    await incrementarReporteVentaDia({
      sucursalId: venta?.sucursalId || sucursalId,
      ts: venta?.creadoEn || now,
      total: venta?.total ?? total,
      costoTotal: venta?.costoTotal ?? 0,
      margenBruto: venta?.margenBruto ?? 0,
      ventaId: id,
    }).catch(() => {})

    return { ventaId: id, alreadyProcessed: true }
  }

  const creadoEn = venta?.creadoEn ?? now

  const grouped = groupVentaItems(items)
  const stockFlat = items
    .map((it) => {
      const productoId = String(it?.productoId || '').trim()
      const tallaRaw = String(it?.tallaRaw ?? it?.talla ?? '')
      const tallaKey = tallaRaw
      const cantidad = asNumber(it?.cantidad, 0)
      if (!productoId || !tallaKey.trim() || cantidad <= 0) return null
      return { productoId, talla: tallaKey, cantidad }
    })
    .filter(Boolean)

  if (!venta) {
    await update(ref(db), {
      [`ventas/${id}`]: {
        sucursalId,
        usuarioId: usuarioId ?? null,
        estado: 'pendiente',
        creadoEn,
        confirmadoEn: null,
        total: asNumber(total, 0),
        metodoPago: metodoPago ?? null,
        items: grouped,
      },
      [`idempotencias/${lock.key}/etapa`]: 'venta_creada',
      [`idempotencias/${lock.key}/actualizadoEn`]: now,
    })
  } else if (venta?.estado === 'anulada') {
    const err = new Error('venta_anulada')
    err.code = 'venta_anulada'
    throw err
  }

  const etapa = lock?.etapa || 'reservada'
  if (etapa !== 'stock_descontado' && etapa !== 'confirmada') {
    const descontados = []
    const reservedLotes = []
    const consumoLotesByProducto = {}
    let costoTotal = 0
    let costoIncompleto = false
    try {
      // 1) Consumir lotes FIFO (costo de compra) antes de descontar stock.
      for (const it of items || []) {
        const productoId = String(it?.productoId || '').trim()
        const talla = String(it?.talla ?? '').trim()
        const cantidad = asNumber(it?.cantidad, 0)
        if (!productoId || !talla || cantidad <= 0) continue

        const { consumos, costo, reserved, incompleto } = await consumirLotesCompraFIFO({ sucursalId, productoId, talla, cantidad })
        if (!consumoLotesByProducto[productoId]) consumoLotesByProducto[productoId] = {}
        consumoLotesByProducto[productoId][talla] = consumos
        reservedLotes.push(...(reserved || []))
        costoTotal += asNumber(costo, 0)
        if (incompleto) costoIncompleto = true
      }

      // 2) Descontar stock (inventario por sucursal).
      for (const it of stockFlat) {
        await descontarStockSucursal({
          sucursalId,
          productoId: it.productoId,
          talla: it.talla,
          cantidad: it.cantidad,
        })
        descontados.push(it)
      }

      // 3) Persistir costo/captura de lotes consumidos en la venta.
      const itemsNext = { ...(grouped || {}) }
      for (const [productoId, tallasConsumo] of Object.entries(consumoLotesByProducto || {})) {
        if (!itemsNext[productoId]) continue
        itemsNext[productoId].consumoLotes = tallasConsumo
      }
      const margin = asNumber(total, 0) - asNumber(costoTotal, 0)
      await update(ref(db), {
        [`ventas/${id}/items`]: itemsNext,
        [`ventas/${id}/costoTotal`]: asNumber(costoTotal, 0),
        [`ventas/${id}/margenBruto`]: margin,
        [`ventas/${id}/costoIncompleto`]: costoIncompleto ? true : null,
      }).catch(() => {})

      await update(ref(db), {
        [`idempotencias/${lock.key}/etapa`]: 'stock_descontado',
        [`idempotencias/${lock.key}/actualizadoEn`]: Date.now(),
      }).catch(() => {})
    } catch (err) {
      await rollbackConsumoLotes(reservedLotes).catch(() => {})
      for (const it of descontados) {
        try {
          await incrementarStockSucursal({
            sucursalId,
            productoId: it.productoId,
            talla: it.talla,
            cantidad: it.cantidad,
          })
        } catch {}
      }
      await update(ref(db), {
        [`ventas/${id}/estado`]: 'anulada',
        [`idempotencias/${lock.key}/estado`]: 'fallida',
        [`idempotencias/${lock.key}/etapa`]: 'fallida',
        [`idempotencias/${lock.key}/actualizadoEn`]: Date.now(),
        [`idempotencias/${lock.key}/error`]: err?.code || err?.message || 'repeat',
      }).catch(() => {})
      throw err
    }
  }

  const confirmadoEn = Date.now()
  const movimientoId = `venta_${id}`
  const movimientoItems = {}
  for (const it of stockFlat) {
    if (!movimientoItems[it.productoId]) movimientoItems[it.productoId] = { tallas: {} }
    movimientoItems[it.productoId].tallas[it.talla] = (movimientoItems[it.productoId].tallas[it.talla] || 0) - asNumber(it.cantidad, 0)
  }
  const loteTracePaths = {}
  const ventaItemsFinal = (await getValue(`ventas/${id}/items`).catch(() => null)) || grouped || {}
  for (const [productoId, detail] of Object.entries(ventaItemsFinal || {})) {
    const consumo = detail?.consumoLotes && typeof detail.consumoLotes === 'object' ? detail.consumoLotes : {}
    for (const [talla, consumos] of Object.entries(consumo || {})) {
      const list = Array.isArray(consumos) ? consumos : []
      for (const c of list) {
        const loteId = String(c?.loteId || '').trim()
        const cantidad = asNumber(c?.cantidad, 0)
        if (!loteId || cantidad <= 0) continue
        appendLoteMovimiento(loteTracePaths, {
          sucursalId,
          productoId,
          talla,
          loteId,
          traceId: `salida_venta_${safeKey(id)}_${safeKey(productoId)}_${safeKey(talla)}_${safeKey(loteId)}`,
          entry: buildLoteMovimientoEntry({
            kind: 'salida',
            operationType: 'venta',
            entityId: id,
            movimientoId,
            cantidad,
            costoUnitario: c?.costoUnitario,
            costoDesconocido: c?.costoDesconocido === true,
            creadoEn: confirmadoEn,
            usuarioId,
            extra: { metodoPago: metodoPago ?? null },
          }),
        })
      }
    }
  }

  // Lee la venta para obtener costo/margen persistidos (puede venir de un reintento con etapa stock_descontado).
  const ventaFinal = (await getValue(`ventas/${id}`).catch(() => null)) || venta || {}
  const costoFinal = asNumber(ventaFinal?.costoTotal, 0)
  const margenFinal = asNumber(ventaFinal?.margenBruto, asNumber(total, 0) - costoFinal)

  await update(ref(db), {
    [`ventas/${id}/estado`]: 'confirmada',
    [`ventas/${id}/confirmadoEn`]: confirmadoEn,
    [`ventasPorSucursal/${sucursalId}/${id}`]: {
      creadoEn,
      total: asNumber(total, 0),
      costoTotal: costoFinal,
      margenBruto: margenFinal,
      estado: 'confirmada',
      metodoPago: metodoPago ?? null,
    },
    [`movimientosInventario/${movimientoId}`]: {
      tipo: 'venta_salida',
      sucursalId,
      usuarioId: usuarioId ?? null,
      creadoEn: confirmadoEn,
      referencia: { ventaId: id, transferenciaId: null, nota: null },
      items: movimientoItems,
    },
    ...loteTracePaths,
    [`idempotencias/${lock.key}/estado`]: 'confirmada',
    [`idempotencias/${lock.key}/etapa`]: 'confirmada',
    [`idempotencias/${lock.key}/actualizadoEn`]: confirmadoEn,
    [`idempotencias/${lock.key}/confirmadoEn`]: confirmadoEn,
  })

  await incrementarReporteVentaDia({
    sucursalId,
    ts: creadoEn,
    total: asNumber(total, 0),
    costoTotal: costoFinal,
    margenBruto: margenFinal,
    ventaId: id,
  })
  return { ventaId: id }
}

async function ajustarCantidadDisponibleLote({ sucursalId, productoId, talla, loteId, delta, creadoEn }) {
  const sid = String(sucursalId || '').trim()
  const pid = String(productoId || '').trim()
  const t = String(talla || '').trim()
  const lid = String(loteId || '').trim()
  const d = asNumber(delta, 0)
  if (!sid || !pid || !t || !lid || !d) return { ok: false }

  const cantidadRef = ref(db, `lotesCompra/${sid}/${pid}/${t}/${lid}/cantidadDisponible`)
  let after = NaN
  const res = await runTransaction(
    cantidadRef,
    (current) => {
      const cur = asNumber(current, NaN)
      if (!Number.isFinite(cur)) return
      const next = cur + d
      if (next < 0) return
      after = next
      return next
    },
    { applyLocally: false }
  )

  if (!res.committed) {
    const err = new Error('no_commit_lote')
    err.code = 'no_commit_lote'
    err.path = `lotesCompra/${sid}/${pid}/${t}/${lid}/cantidadDisponible`
    throw err
  }

  const activePath = `lotesCompraActivos/${sid}/${pid}/${t}/${lid}`
  if (Number.isFinite(after) && after <= 0) {
    await update(ref(db), { [activePath]: null }).catch(() => {})
  } else if (d > 0) {
    const ce = asNumber(creadoEn, 0)
    if (ce > 0) await update(ref(db), { [activePath]: ce }).catch(() => {})
  }

  return { ok: true, after: Number.isFinite(after) ? after : asNumber(res.snapshot?.val?.(), 0) }
}

export async function anularVenta({ ventaId, sucursalId, usuarioId, motivo, nota, idempotencyKey }) {
  const desiredId = String(ventaId || '').trim()
  if (!desiredId) {
    const err = new Error('ventaId_required')
    err.code = 'ventaId_required'
    throw err
  }

  const lock = await reservarIdempotencia({
    idempotencyKey: idempotencyKey || `anular_venta_${desiredId}`,
    tipo: 'venta_anulada',
    entityId: desiredId,
    usuarioId,
  })

  const id = lock?.entityId || desiredId
  const now = Date.now()

  const venta = await getValue(`ventas/${id}`)
  if (!venta) {
    const err = new Error('venta_no_existe')
    err.code = 'venta_no_existe'
    throw err
  }

  const sid = String(venta?.sucursalId || sucursalId || '').trim()
  if (!sid) {
    const err = new Error('sucursalId_required')
    err.code = 'sucursalId_required'
    throw err
  }

  const estado = String(venta?.estado || '').trim()
  if (estado === 'anulada') {
    await update(ref(db), {
      [`idempotencias/${lock.key}/estado`]: 'confirmada',
      [`idempotencias/${lock.key}/etapa`]: 'confirmada',
      [`idempotencias/${lock.key}/actualizadoEn`]: now,
      [`idempotencias/${lock.key}/confirmadoEn`]: venta?.anuladoEn ?? now,
    }).catch(() => {})
    return { ok: true, alreadyAnulada: true }
  }
  if (estado !== 'confirmada') {
    const err = new Error('venta_no_confirmada')
    err.code = 'venta_no_confirmada'
    throw err
  }

  const creadoEn = asNumber(venta?.creadoEn, now)
  const total = asNumber(venta?.total, 0)
  const costoTotal = asNumber(venta?.costoTotal, 0)
  const margenBruto = asNumber(venta?.margenBruto, total - costoTotal)

  const items = venta?.items && typeof venta.items === 'object' ? venta.items : {}
  const stockToRestore = [] // [{ productoId, talla, cantidad }]
  const lotToRestore = [] // [{ productoId, talla, loteId, cantidad, creadoEn }]

  for (const [productoId, detail] of Object.entries(items)) {
    const pid = String(productoId || '').trim()
    if (!pid) continue

    const tallas = detail?.tallas && typeof detail.tallas === 'object' ? detail.tallas : {}
    for (const [tallaKey, qtyRaw] of Object.entries(tallas)) {
      const talla = String(tallaKey ?? '').trim()
      const qty = asNumber(qtyRaw, 0)
      if (!talla || qty <= 0) continue
      stockToRestore.push({ productoId: pid, talla, cantidad: qty })
    }

    const consumo = detail?.consumoLotes && typeof detail.consumoLotes === 'object' ? detail.consumoLotes : {}
    for (const [tallaKey, consumos] of Object.entries(consumo || {})) {
      const talla = String(tallaKey ?? '').trim()
      if (!talla) continue
      const list = Array.isArray(consumos) ? consumos : []
      for (const c of list) {
        const loteId = String(c?.loteId || '').trim()
        const qty = asNumber(c?.cantidad, 0)
        if (!loteId || qty <= 0) continue
        lotToRestore.push({ productoId: pid, talla, loteId, cantidad: qty, creadoEn: 0 })
      }
    }
  }

  // Resolver creadoEn por lote para re-activar indice `lotesCompraActivos` correctamente.
  if (lotToRestore.length) {
    const unique = new Map()
    for (const it of lotToRestore) unique.set(`${it.productoId}::${it.talla}::${it.loteId}`, it)

    const resolved = await Promise.all(
      Array.from(unique.values()).map(async (it) => {
        const lotePath = `lotesCompra/${sid}/${it.productoId}/${it.talla}/${it.loteId}`
        const lote = await getValue(lotePath).catch(() => null)
        if (!lote) {
          const err = new Error('lote_no_existe')
          err.code = 'lote_no_existe'
          err.lotePath = lotePath
          throw err
        }
        const ce = asNumber(lote?.creadoEn, 0) || creadoEn
        return { ...it, creadoEn: ce }
      })
    )

    const byKey = new Map(resolved.map((x) => [`${x.productoId}::${x.talla}::${x.loteId}`, x]))
    for (let i = 0; i < lotToRestore.length; i++) {
      const k = `${lotToRestore[i].productoId}::${lotToRestore[i].talla}::${lotToRestore[i].loteId}`
      const r = byKey.get(k)
      if (r) lotToRestore[i].creadoEn = r.creadoEn
    }
  }

  const lotesRestaurados = []
  const stockRestaurado = []

  try {
    // 1) Devolver consumo de lotes (FIFO).
    for (const it of lotToRestore) {
      await ajustarCantidadDisponibleLote({
        sucursalId: sid,
        productoId: it.productoId,
        talla: it.talla,
        loteId: it.loteId,
        delta: it.cantidad,
        creadoEn: it.creadoEn,
      })
      lotesRestaurados.push(it)
    }

    // 2) Devolver inventario.
    for (const it of stockToRestore) {
      await incrementarStockSucursal({ sucursalId: sid, productoId: it.productoId, talla: it.talla, cantidad: it.cantidad })
      stockRestaurado.push(it)
    }
  } catch (err) {
    // rollback best-effort para mantener consistencia
    for (const it of stockRestaurado) {
      await descontarStockSucursal({ sucursalId: sid, productoId: it.productoId, talla: it.talla, cantidad: it.cantidad }).catch(() => {})
    }
    for (const it of lotesRestaurados) {
      await ajustarCantidadDisponibleLote({
        sucursalId: sid,
        productoId: it.productoId,
        talla: it.talla,
        loteId: it.loteId,
        delta: -asNumber(it.cantidad, 0),
        creadoEn: it.creadoEn,
      }).catch(() => {})
    }
    await update(ref(db), {
      [`idempotencias/${lock.key}/estado`]: 'fallida',
      [`idempotencias/${lock.key}/etapa`]: 'fallida',
      [`idempotencias/${lock.key}/actualizadoEn`]: Date.now(),
      [`idempotencias/${lock.key}/error`]: err?.code || err?.message || 'repeat',
    }).catch(() => {})
    throw err
  }

  const anuladoEn = Date.now()
  const movId = `venta_anulada_${safeKey(id)}`

  const movimientoItems = {}
  for (const it of stockToRestore) {
    if (!movimientoItems[it.productoId]) movimientoItems[it.productoId] = { tallas: {} }
    movimientoItems[it.productoId].tallas[it.talla] = (movimientoItems[it.productoId].tallas[it.talla] || 0) + asNumber(it.cantidad, 0)
  }
  const loteTracePaths = {}
  for (const it of lotToRestore) {
    appendLoteMovimiento(loteTracePaths, {
      sucursalId: sid,
      productoId: it.productoId,
      talla: it.talla,
      loteId: it.loteId,
      traceId: `reversion_venta_${safeKey(id)}_${safeKey(it.productoId)}_${safeKey(it.talla)}_${safeKey(it.loteId)}`,
      entry: buildLoteMovimientoEntry({
        kind: 'reversion',
        operationType: 'venta',
        entityId: id,
        movimientoId: movId,
        cantidad: it.cantidad,
        creadoEn: anuladoEn,
        usuarioId,
        extra: { motivo: motivo ? String(motivo).trim() : null },
      }),
    })
  }

  await update(ref(db), {
    [`ventas/${id}/estado`]: 'anulada',
    [`ventas/${id}/anuladoEn`]: anuladoEn,
    [`ventas/${id}/anuladoPorUsuarioId`]: usuarioId ?? null,
    [`ventas/${id}/anuladoMotivo`]: motivo ? String(motivo).trim() : null,
    [`ventas/${id}/anuladoNota`]: nota ? String(nota).trim() : null,

    [`ventasPorSucursal/${sid}/${id}/estado`]: 'anulada',
    [`ventasPorSucursal/${sid}/${id}/anuladoEn`]: anuladoEn,
    [`ventasPorSucursal/${sid}/${id}/anuladoPorUsuarioId`]: usuarioId ?? null,
    [`ventasPorSucursal/${sid}/${id}/anuladoNota`]: nota ? String(nota).trim() : null,

    [`movimientosInventario/${movId}`]: {
      tipo: 'venta_anulada',
      sucursalId: sid,
      usuarioId: usuarioId ?? null,
      creadoEn: anuladoEn,
      referencia: { ventaId: id, transferenciaId: null, nota: nota ?? null },
      unidades: stockToRestore.reduce((acc, x) => acc + asNumber(x.cantidad, 0), 0),
      total,
      costoTotal,
      margenBruto,
      items: movimientoItems,
      consumoLotesRestaurado: lotToRestore.length ? true : null,
    },
    ...loteTracePaths,

    [`idempotencias/${lock.key}/estado`]: 'confirmada',
    [`idempotencias/${lock.key}/etapa`]: 'confirmada',
    [`idempotencias/${lock.key}/actualizadoEn`]: anuladoEn,
    [`idempotencias/${lock.key}/confirmadoEn`]: anuladoEn,
  })

  await decrementarReporteVentaDia({
    sucursalId: sid,
    ts: creadoEn,
    total,
    costoTotal,
    margenBruto,
    ventaId: id,
  }).catch(() => {})

  return { ok: true, ventaId: id }
}

function groupTransferenciaItems(items) {
  const grouped = {}
  for (const it of items || []) {
    const productoId = String(it?.productoId || '').trim()
    const tallaRaw = String(it?.tallaRaw ?? it?.talla ?? '')
    const talla = tallaRaw
    const cantidad = asNumber(it?.cantidad, 0)
    if (!productoId || !tallaRaw.trim() || cantidad <= 0) continue
    grouped[productoId] = grouped[productoId] || { tallas: {} }
    grouped[productoId].tallas[talla] = (grouped[productoId].tallas[talla] || 0) + cantidad
  }
  return grouped
}

function flattenTransferenciaItems(grouped) {
  const flat = []
  const obj = grouped && typeof grouped === 'object' ? grouped : {}
  for (const [productoId, data] of Object.entries(obj)) {
    const tallas = data?.tallas && typeof data.tallas === 'object' ? data.tallas : {}
    for (const [talla, cantidad] of Object.entries(tallas)) {
      const qty = asNumber(cantidad, 0)
      if (!talla || qty <= 0) continue
      flat.push({ productoId, talla: String(talla), cantidad: qty })
    }
  }
  return flat
}

export async function solicitarTransferencia({
  transferenciaId,
  desdeSucursalId,
  haciaSucursalId,
  usuarioId,
  items,
  nota,
  idempotencyKey,
}) {
  const uid = String(usuarioId || '').trim()
  if (!uid) {
    const err = new Error('auth_required')
    err.code = 'auth_required'
    throw err
  }

  const desiredId = transferenciaId || generateUUID()
  const lock = await reservarIdempotencia({
    idempotencyKey: idempotencyKey || `transferencia_${desiredId}`,
    tipo: 'transferencia',
    entityId: desiredId,
    usuarioId: uid,
  })

  const id = lock?.entityId || desiredId
  const now = Date.now()

  const grouped = groupTransferenciaItems(items)
  if (!Object.keys(grouped).length) {
    const err = new Error('transferencia_sin_items')
    err.code = 'transferencia_sin_items'
    throw err
  }

  const transferencia = await getValue(`transferencias/${id}`)
  if (transferencia?.estado === 'transferido') {
    await update(ref(db), {
      [`idempotencias/${lock.key}/estado`]: 'confirmada',
      [`idempotencias/${lock.key}/etapa`]: 'confirmada',
      [`idempotencias/${lock.key}/actualizadoEn`]: now,
      [`idempotencias/${lock.key}/confirmadoEn`]: transferencia?.transferidoEn ?? now,
    }).catch(() => {})
    return { transferenciaId: id, alreadyProcessed: true }
  }

  const creadoEn = transferencia?.creadoEn ?? now

  if (!transferencia) {
    await update(ref(db), {
      [`transferencias/${id}`]: {
        desdeSucursalId,
        haciaSucursalId,
        estado: 'pendiente',
        creadoPorUsuarioId: uid,
        creadoEn,
        transferidoEn: null,
        transferidoPorUsuarioId: null,
        anuladoEn: null,
        anuladoPorUsuarioId: null,
        anuladoMotivo: null,
        anuladoNota: null,
        nota: nota ?? null,
        items: grouped,
      },
      [`idempotencias/${lock.key}/estado`]: 'confirmada',
      [`idempotencias/${lock.key}/etapa`]: 'confirmada',
      [`idempotencias/${lock.key}/actualizadoEn`]: now,
      [`idempotencias/${lock.key}/confirmadoEn`]: now,
    })
  } else if (transferencia?.estado !== 'pendiente') {
    const err = new Error('transferencia_estado_invalido')
    err.code = 'transferencia_estado_invalido'
    throw err
  } else {
    await update(ref(db), {
      [`idempotencias/${lock.key}/estado`]: 'confirmada',
      [`idempotencias/${lock.key}/etapa`]: 'confirmada',
      [`idempotencias/${lock.key}/actualizadoEn`]: now,
      [`idempotencias/${lock.key}/confirmadoEn`]: now,
    }).catch(() => {})
  }

  return { transferenciaId: id }
}

export async function anularTransferencia({ transferenciaId, usuarioId, motivo, nota, idempotencyKey }) {
  const desiredId = String(transferenciaId || '').trim()
  if (!desiredId) {
    const err = new Error('transferenciaId_required')
    err.code = 'transferenciaId_required'
    throw err
  }

  const uid = String(usuarioId || '').trim()
  if (!uid) {
    const err = new Error('auth_required')
    err.code = 'auth_required'
    throw err
  }

  const lock = await reservarIdempotencia({
    idempotencyKey: idempotencyKey || `anular_${desiredId}`,
    tipo: 'transferencia_anulada',
    entityId: desiredId,
    usuarioId: uid,
  })

  const id = lock?.entityId || desiredId
  const now = Date.now()

  const transferencia = await getValue(`transferencias/${id}`)
  if (!transferencia) {
    const err = new Error('transferencia_no_existe')
    err.code = 'transferencia_no_existe'
    throw err
  }

  const estado = String(transferencia?.estado || '').trim()
  if (estado === 'anulada') {
    await update(ref(db), {
      [`idempotencias/${lock.key}/estado`]: 'confirmada',
      [`idempotencias/${lock.key}/etapa`]: 'confirmada',
      [`idempotencias/${lock.key}/actualizadoEn`]: now,
      [`idempotencias/${lock.key}/confirmadoEn`]: transferencia?.anuladoEn ?? now,
    }).catch(() => {})
    return { ok: true, alreadyAnulada: true }
  }
  if (estado === 'transferido') {
    const err = new Error('transferencia_ya_transferida')
    err.code = 'transferencia_ya_transferida'
    throw err
  }
  if (estado !== 'pendiente') {
    const err = new Error('transferencia_estado_invalido')
    err.code = 'transferencia_estado_invalido'
    throw err
  }

  const movId = `transferencia_anulada_${id}`

  await update(ref(db), {
    [`transferencias/${id}/estado`]: 'anulada',
    [`transferencias/${id}/anuladoEn`]: now,
    [`transferencias/${id}/anuladoPorUsuarioId`]: uid,
    [`transferencias/${id}/anuladoMotivo`]: motivo ?? 'sin_motivo',
    [`transferencias/${id}/anuladoNota`]: nota ?? null,
    [`movimientosInventario/${movId}`]: {
      tipo: 'transferencia_anulada',
      transferenciaId: id,
      sucursalId: transferencia?.haciaSucursalId ?? null,
      desdeSucursalId: transferencia?.desdeSucursalId ?? null,
      haciaSucursalId: transferencia?.haciaSucursalId ?? null,
      creadoEn: now,
      creadoPorUsuarioId: uid,
      motivo: motivo ?? null,
      nota: nota ?? null,
    },
    [`idempotencias/${lock.key}/estado`]: 'confirmada',
    [`idempotencias/${lock.key}/etapa`]: 'confirmada',
    [`idempotencias/${lock.key}/actualizadoEn`]: now,
    [`idempotencias/${lock.key}/confirmadoEn`]: now,
  })

  return { ok: true, transferenciaId: id }
}

export async function transferirTransferencia({ transferenciaId, usuarioId, idempotencyKey }) {
  const desiredId = String(transferenciaId || '').trim()
  if (!desiredId) throw new Error('transferenciaId_required')

  const uid = String(usuarioId || '').trim()
  if (!uid) {
    const err = new Error('auth_required')
    err.code = 'auth_required'
    throw err
  }

  const lock = await reservarIdempotencia({
    idempotencyKey: idempotencyKey || `transferir_${desiredId}`,
    tipo: 'transferir_transferencia',
    entityId: desiredId,
    usuarioId: uid,
  })

  const id = lock?.entityId || desiredId
  const now = Date.now()

  if (lock?.estado === 'processing' && lock?.usuarioId && lock.usuarioId !== uid) {
    const err = new Error('transferencia_en_proceso')
    err.code = 'transferencia_en_proceso'
    throw err
  }

  if (lock?.estado === 'fallida') {
    await update(ref(db), {
      [`idempotencias/${lock.key}/estado`]: 'processing',
      [`idempotencias/${lock.key}/etapa`]: 'reservada',
      [`idempotencias/${lock.key}/actualizadoEn`]: now,
      [`idempotencias/${lock.key}/error`]: null,
    }).catch(() => {})
  }

  const transferencia = await getValue(`transferencias/${id}`)
  if (!transferencia) {
    const err = new Error('transferencia_no_existe')
    err.code = 'transferencia_no_existe'
    throw err
  }

  if (transferencia?.estado === 'transferido') {
    await update(ref(db), {
      [`idempotencias/${lock.key}/estado`]: 'confirmada',
      [`idempotencias/${lock.key}/etapa`]: 'confirmada',
      [`idempotencias/${lock.key}/actualizadoEn`]: now,
      [`idempotencias/${lock.key}/confirmadoEn`]: transferencia?.transferidoEn ?? now,
    }).catch(() => {})
    return { transferenciaId: id, alreadyProcessed: true }
  }

  if (transferencia?.estado !== 'pendiente') {
    const err = new Error('transferencia_estado_invalido')
    err.code = 'transferencia_estado_invalido'
    throw err
  }

  const desdeSucursalId = String(transferencia?.desdeSucursalId || '').trim()
  const haciaSucursalId = String(transferencia?.haciaSucursalId || '').trim()
  if (!desdeSucursalId || !haciaSucursalId) {
    const err = new Error('transferencia_sucursales_invalidas')
    err.code = 'transferencia_sucursales_invalidas'
    throw err
  }

  const flat = flattenTransferenciaItems(transferencia?.items)
  if (!flat.length) {
    const err = new Error('transferencia_sin_items')
    err.code = 'transferencia_sin_items'
    throw err
  }

  const transferidoEn = Date.now()
  const movSalidaId = `tr_salida_${id}`
  const movEntradaId = `tr_entrada_${id}`
  const descontados = []
  const incrementados = []
  const reservedLotes = []
  const consumoLotesByProducto = {}
  let costoTotalTransferido = 0
  let costoIncompleto = false
  const destLotPaths = {}
  const destActivePaths = {}
  const loteTracePaths = {}
  try {
    // 1) Consumir lotes FIFO en sucursal origen (para mantener costo/margen por lotes).
    for (const it of flat) {
      const { consumos, costo, reserved, incompleto, remaining } = await consumirLotesCompraFIFO({
        sucursalId: desdeSucursalId,
        productoId: it.productoId,
        talla: it.talla,
        cantidad: it.cantidad,
      })

      if (!consumoLotesByProducto[it.productoId]) consumoLotesByProducto[it.productoId] = {}
      consumoLotesByProducto[it.productoId][it.talla] = consumos
      reservedLotes.push(...(reserved || []))
      costoTotalTransferido += asNumber(costo, 0)
      if (incompleto) costoIncompleto = true

      // 1.a) Crear lotes en destino por cada consumo (trazabilidad lote->transferencia->nuevo lote).
      for (const c of consumos || []) {
        const origenLoteId = String(c?.loteId || '').trim()
        if (!origenLoteId) continue
        const loteIdDestino = `${safeKey(id)}_${safeKey(origenLoteId)}`
        destLotPaths[`lotesCompra/${haciaSucursalId}/${it.productoId}/${it.talla}/${loteIdDestino}`] = {
          creadoEn: transferidoEn,
          cantidadInicial: asNumber(c?.cantidad, 0),
          cantidadDisponible: asNumber(c?.cantidad, 0),
          costoUnitario: asNumber(c?.costoUnitario, 0),
          costoDesconocido: c?.costoDesconocido ? true : null,
          tipo: 'transferencia',
          transferenciaId: id,
          origenSucursalId: desdeSucursalId,
          origenLoteId,
          nota: transferencia?.nota ?? null,
          sourceType: 'transferencia_entrada',
          sourceId: id,
          sourceMovimientoId: movEntradaId,
        }
        destActivePaths[`lotesCompraActivos/${haciaSucursalId}/${it.productoId}/${it.talla}/${loteIdDestino}`] = transferidoEn
        appendLoteMovimiento(loteTracePaths, {
          sucursalId: haciaSucursalId,
          productoId: it.productoId,
          talla: it.talla,
          loteId: loteIdDestino,
          traceId: `entrada_transferencia_${safeKey(id)}_${safeKey(origenLoteId)}`,
          entry: buildLoteMovimientoEntry({
            kind: 'entrada',
            operationType: 'transferencia',
            entityId: id,
            movimientoId: movEntradaId,
            cantidad: c?.cantidad,
            costoUnitario: c?.costoUnitario,
            costoDesconocido: c?.costoDesconocido === true,
            creadoEn: transferidoEn,
            usuarioId: uid,
            extra: { desdeSucursalId, haciaSucursalId, origenLoteId },
          }),
        })
        appendLoteMovimiento(loteTracePaths, {
          sucursalId: desdeSucursalId,
          productoId: it.productoId,
          talla: it.talla,
          loteId: origenLoteId,
          traceId: `salida_transferencia_${safeKey(id)}_${safeKey(it.productoId)}_${safeKey(it.talla)}_${safeKey(origenLoteId)}`,
          entry: buildLoteMovimientoEntry({
            kind: 'salida',
            operationType: 'transferencia',
            entityId: id,
            movimientoId: movSalidaId,
            cantidad: c?.cantidad,
            costoUnitario: c?.costoUnitario,
            costoDesconocido: c?.costoDesconocido === true,
            creadoEn: transferidoEn,
            usuarioId: uid,
            extra: { desdeSucursalId, haciaSucursalId },
          }),
        })
      }

      // 1.b) Si habia stock viejo sin lotes, creamos un lote "legacy" con costo desconocido para cuadrar.
      const rem = asNumber(remaining, 0)
      if (rem > 0) {
        const loteIdDestino = `${safeKey(id)}_legacy_${safeKey(it.productoId)}_${safeKey(it.talla)}`
        destLotPaths[`lotesCompra/${haciaSucursalId}/${it.productoId}/${it.talla}/${loteIdDestino}`] = {
          creadoEn: transferidoEn,
          cantidadInicial: rem,
          cantidadDisponible: rem,
          costoUnitario: 0,
          costoDesconocido: true,
          tipo: 'transferencia',
          transferenciaId: id,
          origenSucursalId: desdeSucursalId,
          origenLoteId: null,
          nota: 'Stock sin lote en origen (legacy)',
          sourceType: 'transferencia_entrada',
          sourceId: id,
          sourceMovimientoId: movEntradaId,
        }
        destActivePaths[`lotesCompraActivos/${haciaSucursalId}/${it.productoId}/${it.talla}/${loteIdDestino}`] = transferidoEn
        appendLoteMovimiento(loteTracePaths, {
          sucursalId: haciaSucursalId,
          productoId: it.productoId,
          talla: it.talla,
          loteId: loteIdDestino,
          traceId: `entrada_transferencia_legacy_${safeKey(id)}_${safeKey(it.productoId)}_${safeKey(it.talla)}`,
          entry: buildLoteMovimientoEntry({
            kind: 'entrada',
            operationType: 'transferencia',
            entityId: id,
            movimientoId: movEntradaId,
            cantidad: rem,
            costoUnitario: 0,
            costoDesconocido: true,
            creadoEn: transferidoEn,
            usuarioId: uid,
            extra: { desdeSucursalId, haciaSucursalId, origenLoteId: null },
          }),
        })
      }
    }

    // 2) Descontar stock en sucursal origen.
    for (const it of flat) {
      await descontarStockSucursal({
        sucursalId: desdeSucursalId,
        productoId: it.productoId,
        talla: it.talla,
        cantidad: it.cantidad,
      })
      descontados.push(it)
    }

    // 3) Incrementar stock en sucursal destino.
    for (const it of flat) {
      await incrementarStockSucursal({
        sucursalId: haciaSucursalId,
        productoId: it.productoId,
        talla: it.talla,
        cantidad: it.cantidad,
      })
      incrementados.push(it)
    }

    const itemsSalida = {}
    const itemsEntrada = {}
    for (const it of flat) {
      itemsSalida[it.productoId] = itemsSalida[it.productoId] || { tallas: {} }
      itemsEntrada[it.productoId] = itemsEntrada[it.productoId] || { tallas: {} }
      itemsSalida[it.productoId].tallas[it.talla] = (itemsSalida[it.productoId].tallas[it.talla] || 0) - it.cantidad
      itemsEntrada[it.productoId].tallas[it.talla] = (itemsEntrada[it.productoId].tallas[it.talla] || 0) + it.cantidad
    }

    const transferenciaUnidades = flat.reduce((acc, it) => acc + asNumber(it?.cantidad, 0), 0)

    await update(ref(db), {
      [`transferencias/${id}/estado`]: 'transferido',
      [`transferencias/${id}/transferidoEn`]: transferidoEn,
      [`transferencias/${id}/transferidoPorUsuarioId`]: uid,
      [`transferencias/${id}/costoTotalTransferido`]: asNumber(costoTotalTransferido, 0),
      [`transferencias/${id}/costoIncompleto`]: costoIncompleto ? true : null,
      [`transferencias/${id}/consumoLotes`]: consumoLotesByProducto,

      [`movimientosInventario/${movSalidaId}`]: {
        tipo: 'transferencia_salida',
        sucursalId: desdeSucursalId,
        usuarioId: uid,
        creadoEn: transferidoEn,
        referencia: { ventaId: null, transferenciaId: id, nota: transferencia?.nota ?? null },
        costoTotal: asNumber(costoTotalTransferido, 0),
        costoIncompleto: costoIncompleto ? true : null,
        consumoLotes: consumoLotesByProducto,
        items: itemsSalida,
      },
      [`movimientosInventario/${movEntradaId}`]: {
        tipo: 'transferencia_entrada',
        sucursalId: haciaSucursalId,
        usuarioId: uid,
        creadoEn: transferidoEn,
        referencia: { ventaId: null, transferenciaId: id, nota: transferencia?.nota ?? null },
        costoTotal: asNumber(costoTotalTransferido, 0),
        costoIncompleto: costoIncompleto ? true : null,
        items: itemsEntrada,
      },

      // Indice para reportes por sucursal/fecha.
      [`movimientosPorSucursal/${desdeSucursalId}/${movSalidaId}`]: {
        creadoEn: transferidoEn,
        tipo: 'transferencia_salida',
        unidades: transferenciaUnidades,
        costoTotal: asNumber(costoTotalTransferido, 0),
        costoIncompleto: costoIncompleto ? true : null,
        transferenciaId: id,
        desdeSucursalId,
        haciaSucursalId,
        nota: transferencia?.nota ?? null,
      },
      [`movimientosPorSucursal/${haciaSucursalId}/${movEntradaId}`]: {
        creadoEn: transferidoEn,
        tipo: 'transferencia_entrada',
        unidades: transferenciaUnidades,
        costoTotal: asNumber(costoTotalTransferido, 0),
        costoIncompleto: costoIncompleto ? true : null,
        transferenciaId: id,
        desdeSucursalId,
        haciaSucursalId,
        nota: transferencia?.nota ?? null,
      },

      ...destLotPaths,
      ...destActivePaths,
      ...loteTracePaths,

      [`idempotencias/${lock.key}/estado`]: 'confirmada',
      [`idempotencias/${lock.key}/etapa`]: 'confirmada',
      [`idempotencias/${lock.key}/actualizadoEn`]: transferidoEn,
      [`idempotencias/${lock.key}/confirmadoEn`]: transferidoEn,
    })
  } catch (err) {
    await rollbackConsumoLotes(reservedLotes).catch(() => {})
    for (const it of incrementados) {
      try {
        await descontarStockSucursal({
          sucursalId: haciaSucursalId,
          productoId: it.productoId,
          talla: it.talla,
          cantidad: it.cantidad,
        })
      } catch {}
    }
    for (const it of descontados) {
      try {
        await incrementarStockSucursal({
          sucursalId: desdeSucursalId,
          productoId: it.productoId,
          talla: it.talla,
          cantidad: it.cantidad,
        })
      } catch {}
    }

    await update(ref(db), {
      [`idempotencias/${lock.key}/estado`]: 'fallida',
      [`idempotencias/${lock.key}/etapa`]: 'fallida',
      [`idempotencias/${lock.key}/actualizadoEn`]: Date.now(),
      [`idempotencias/${lock.key}/error`]: err?.code || err?.message || 'repeat',
    }).catch(() => {})

    throw err
  }

  return { transferenciaId: id }
}
