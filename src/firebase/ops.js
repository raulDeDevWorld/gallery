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
    marcaLower: lower(marca),
    modeloLower: lower(modelo),
    nombreLower: lower(nombre),
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
        precioUnitario: asNumber(it?.precioUnitario, 0),
        marca: it?.marca ?? null,
        modelo: it?.modelo ?? null,
        nombre: it?.nombre ?? null,
      }
    }
    grouped[productoId].tallas[label] = (grouped[productoId].tallas[label] || 0) + cantidad
  }
  return grouped
}

async function incrementarReporteVentaDia({ sucursalId, ts, total, ventaId }) {
  const dia = yyyymmdd(ts)
  const reportRef = ref(db, `reportes/ventasPorSucursalDia/${sucursalId}/${dia}`)
  const now = Date.now()

  await runTransaction(reportRef, (current) => {
    const cur = current && typeof current === 'object' ? current : {}
    const curTotal = asNumber(cur.total, 0)
    const curCount = asNumber(cur.cantidadVentas, 0)
    const ventas = cur.ventas && typeof cur.ventas === 'object' ? cur.ventas : {}

    if (ventaId && ventas[ventaId]) return { ...cur, actualizadoEn: now }

    return {
      ...cur,
      total: curTotal + asNumber(total, 0),
      cantidadVentas: curCount + 1,
      actualizadoEn: now,
      ventas: ventaId ? { ...ventas, [ventaId]: true } : ventas,
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
    try {
      for (const it of stockFlat) {
        await descontarStockSucursal({
          sucursalId,
          productoId: it.productoId,
          talla: it.talla,
          cantidad: it.cantidad,
        })
        descontados.push(it)
      }
      await update(ref(db), {
        [`idempotencias/${lock.key}/etapa`]: 'stock_descontado',
        [`idempotencias/${lock.key}/actualizadoEn`]: Date.now(),
      }).catch(() => {})
    } catch (err) {
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

  await update(ref(db), {
    [`ventas/${id}/estado`]: 'confirmada',
    [`ventas/${id}/confirmadoEn`]: confirmadoEn,
    [`ventasPorSucursal/${sucursalId}/${id}`]: { creadoEn, total: asNumber(total, 0), estado: 'confirmada' },
    [`movimientosInventario/${movimientoId}`]: {
      tipo: 'venta_salida',
      sucursalId,
      usuarioId: usuarioId ?? null,
      creadoEn: confirmadoEn,
      referencia: { ventaId: id, transferenciaId: null, nota: null },
      items: movimientoItems,
    },
    [`idempotencias/${lock.key}/estado`]: 'confirmada',
    [`idempotencias/${lock.key}/etapa`]: 'confirmada',
    [`idempotencias/${lock.key}/actualizadoEn`]: confirmadoEn,
    [`idempotencias/${lock.key}/confirmadoEn`]: confirmadoEn,
  })

  await incrementarReporteVentaDia({ sucursalId, ts: creadoEn, total: asNumber(total, 0), ventaId: id })
  return { ventaId: id }
}

function groupTransferenciaItems(items) {
  const grouped = {}
  for (const it of items || []) {
    const productoId = String(it?.productoId || '').trim()
    const tallaRaw = String(it?.talla ?? '')
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

  const descontados = []
  const incrementados = []
  try {
    for (const it of flat) {
      await descontarStockSucursal({
        sucursalId: desdeSucursalId,
        productoId: it.productoId,
        talla: it.talla,
        cantidad: it.cantidad,
      })
      descontados.push(it)
    }

    for (const it of flat) {
      await incrementarStockSucursal({
        sucursalId: haciaSucursalId,
        productoId: it.productoId,
        talla: it.talla,
        cantidad: it.cantidad,
      })
      incrementados.push(it)
    }
  } catch (err) {
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

  const transferidoEn = Date.now()
  const movSalidaId = `tr_salida_${id}`
  const movEntradaId = `tr_entrada_${id}`

  const itemsSalida = {}
  const itemsEntrada = {}
  for (const it of flat) {
    itemsSalida[it.productoId] = itemsSalida[it.productoId] || { tallas: {} }
    itemsEntrada[it.productoId] = itemsEntrada[it.productoId] || { tallas: {} }
    itemsSalida[it.productoId].tallas[it.talla] = (itemsSalida[it.productoId].tallas[it.talla] || 0) - it.cantidad
    itemsEntrada[it.productoId].tallas[it.talla] = (itemsEntrada[it.productoId].tallas[it.talla] || 0) + it.cantidad
  }

  await update(ref(db), {
    [`transferencias/${id}/estado`]: 'transferido',
    [`transferencias/${id}/transferidoEn`]: transferidoEn,
    [`transferencias/${id}/transferidoPorUsuarioId`]: uid,
    [`movimientosInventario/${movSalidaId}`]: {
      tipo: 'transferencia_salida',
      sucursalId: desdeSucursalId,
      usuarioId: uid,
      creadoEn: transferidoEn,
      referencia: { ventaId: null, transferenciaId: id, nota: transferencia?.nota ?? null },
      items: itemsSalida,
    },
    [`movimientosInventario/${movEntradaId}`]: {
      tipo: 'transferencia_entrada',
      sucursalId: haciaSucursalId,
      usuarioId: uid,
      creadoEn: transferidoEn,
      referencia: { ventaId: null, transferenciaId: id, nota: transferencia?.nota ?? null },
      items: itemsEntrada,
    },
    [`idempotencias/${lock.key}/estado`]: 'confirmada',
    [`idempotencias/${lock.key}/etapa`]: 'confirmada',
    [`idempotencias/${lock.key}/actualizadoEn`]: transferidoEn,
    [`idempotencias/${lock.key}/confirmadoEn`]: transferidoEn,
  })

  return { transferenciaId: id }
}
