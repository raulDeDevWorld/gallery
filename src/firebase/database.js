import { app } from './config'
import {
  getDatabase,
  ref,
  onValue,
  child,
  get,
  remove,
  runTransaction,
  update,
  query,
  orderByChild,
  orderByKey,
  equalTo,
  limitToFirst,
  startAt,
  endAt,
} from 'firebase/database'

const db = getDatabase(app)
const dbRef = ref(db)
// -------------------------------Firebase Realtime Database------------------------------------



async function getSpecificData(query, setUserSpecificData, callback) {
  try {
    const snapshot = await get(child(dbRef, `${query}`))
    console.log(query, snapshot.exists())
    if (snapshot.exists()) {
      setUserSpecificData(snapshot.val())
      callback && callback !== undefined ? callback() : ''
      return snapshot.val()
    } else {
      callback && callback !== undefined ? callback() : ''
      setUserSpecificData(null)
      return null
    }
  } catch (error) {
    console.error(error);
  }
}

async function getValue(path) {
  const snapshot = await get(child(dbRef, `${path}`))
  return snapshot.exists() ? snapshot.val() : null
}

function updatePaths(paths, callback, setUserSuccess) {
  return update(ref(db), paths)
    .then(() => {
      if (typeof callback === 'function') callback()
      if (typeof setUserSuccess === 'function') setUserSuccess('Se ha guardado correctamente')
      return { ok: true }
    })
    .catch((err) => {
      console.log(err)
      if (typeof setUserSuccess === 'function') setUserSuccess(err?.code || err?.message || 'repeat')
      return { ok: false, error: err }
    })
}


function getSpecificDataEq(route, children, eq, setUserData, callback) {

  get(query(ref(db, route), orderByChild(children), equalTo(eq)))
    .then(async (snapshot) => {

      if (snapshot.exists()) {
        let snap = snapshot.val()
        console.log(snap)
        setUserData(snap)
        callback && callback()
      }

    })

}

function getLate(setUserData, callback) {
  get(query(ref(db, i), limitToLast(1), orderByChild('date'), endAt(new Date().getTime()),))
    .then((snapshot) => {
      if (snapshot.exists()) {
        let snap = snapshot.val()
        setUserData(snap)
        callback && callback()
      }
    });
}

function writeUserData(rute, object, arg3, arg4, arg5) {
  const isFn = (v) => typeof v === 'function'

  // Supported calls:
  // - writeUserData(route, obj, callback)
  // - writeUserData(route, obj, setUserData, setUserSuccess)
  // - writeUserData(route, obj, setUserData, setUserSuccess, callback)
  const callback =
    isFn(arg3) && arg4 === undefined
      ? arg3
      : isFn(arg3) && isFn(arg4) && isFn(arg5)
        ? arg5
        : undefined

  const setUserData = isFn(arg3) && isFn(arg4) ? arg3 : undefined
  const setUserSuccess = isFn(arg4) ? arg4 : undefined

  return update(ref(db, rute), object)
    .then(() => {
      if (typeof callback === 'function') callback()

      if (typeof setUserData === 'function') {
        setUserData((prev) => {
          if (prev == null) return { ...object }
          if (prev && typeof prev === 'object' && !Array.isArray(prev)) return { ...prev, ...object }
          return object
        })
      }

      if (typeof setUserSuccess === 'function') setUserSuccess('Se ha guardado correctamente')
      return { ok: true }
    })
    .catch((err) => {
      console.log(err)
      if (typeof setUserSuccess === 'function') setUserSuccess(err?.code || err?.message || 'repeat')
      return { ok: false, error: err }
    })
}
function readUserData(route, setUserData, callback, onError) {
  return onValue(
    ref(db, route),
    (snapshot) => {
      if (snapshot.exists()) {
        setUserData(snapshot.val());
        callback && callback !== undefined ? callback() : ''
      } else {
        setUserData(null)
        callback && callback !== undefined ? callback() : ''
      }
    },
    (error) => {
      console.error(error)
      setUserData(null)
      if (typeof onError === 'function') onError(error)
      callback && callback !== undefined ? callback() : ''
    }
  );
}
function readUserDataLength(route, callback, onError) {
  return onValue(
    ref(db, route),
    (snapshot) => {
      if (snapshot.exists()) {
        const length = typeof snapshot.numChildren === 'function' ? snapshot.numChildren() : 0
        callback && callback !== undefined ? callback(length) : ''
      } else {
        callback && callback !== undefined ? callback() : ''
      }
    },
    (error) => {
      console.error(error)
      if (typeof onError === 'function') onError(error)
      callback && callback !== undefined ? callback() : ''
    }
  );
}

async function getPagedData(route, opts = {}) {
  const {
    orderBy = 'key', // 'key' | 'child'
    childKey,
    after = null, // for key: string key. for child: { key, value }
    range = null, // { start, end } for child prefix searches etc.
    limit = 25,
  } = opts

  const baseRef = ref(db, route)

  const parts = []
  if (orderBy === 'child') {
    if (!childKey) throw new Error('childKey is required when orderBy="child"')
    parts.push(orderByChild(childKey))
  } else {
    parts.push(orderByKey())
  }

  const hasAfter = after !== null && after !== undefined && after !== ''
  if (hasAfter) {
    if (orderBy === 'child') parts.push(startAt(after.value, after.key))
    else parts.push(startAt(after))
  } else if (range && range.start !== undefined) {
    parts.push(startAt(range.start))
  }

  if (range && range.end !== undefined) parts.push(endAt(range.end))

  const desired = Math.max(1, Number(limit) || 25)
  parts.push(limitToFirst(desired + (hasAfter ? 1 : 0)))

  const snap = await get(query(baseRef, ...parts))
  const raw = snap.val()
  const entries = raw && typeof raw === 'object' ? Object.entries(raw) : []

  let items = entries.map(([key, value]) => ({
    ...(value && typeof value === 'object' ? value : { value }),
    uuid: value?.uuid ?? key,
    __key: key,
  }))

  if (hasAfter) items = items.slice(1)

  const hasMore = items.length > desired
  if (hasMore) items = items.slice(0, desired)

  const last = items.at(-1)
  const nextAfter =
    last
      ? orderBy === 'child'
        ? last?.[childKey] == null
          ? null
          : { key: last.__key, value: last[childKey] }
        : last.__key
      : null

  return { items, nextAfter, hasMore }
}

async function getRangeByChild(route, childKey, { start, end, limit } = {}) {
  const parts = [orderByChild(childKey)]
  if (start !== undefined) parts.push(startAt(start))
  if (end !== undefined) parts.push(endAt(end))
  if (limit != null) parts.push(limitToFirst(Math.max(1, Number(limit) || 1)))

  const snap = await get(query(ref(db, route), ...parts))
  const raw = snap.val()
  const entries = raw && typeof raw === 'object' ? Object.entries(raw) : []
  return entries.map(([key, value]) => ({ __key: key, ...(value && typeof value === 'object' ? value : { value }) }))
}

async function getRangeByKey(route, { start, end, limit } = {}) {
  const parts = [orderByKey()]
  if (start !== undefined) parts.push(startAt(start))
  if (end !== undefined) parts.push(endAt(end))
  if (limit != null) parts.push(limitToFirst(Math.max(1, Number(limit) || 1)))

  const snap = await get(query(ref(db, route), ...parts))
  const raw = snap.val()
  const entries = raw && typeof raw === 'object' ? Object.entries(raw) : []
  return entries.map(([key, value]) => ({ __key: key, ...(value && typeof value === 'object' ? value : { value }) }))
}

async function descontarStockSucursal({ sucursalId, productoId, talla, cantidad }) {
  const qty = Number(cantidad)
  const tallaRaw = String(talla ?? '')
  const tallaLabel = tallaRaw.trim()
  const tallaKey = tallaRaw
  if (!sucursalId || !productoId || !tallaLabel) throw new Error('missing_args')
  if (!Number.isFinite(qty) || qty <= 0) throw new Error('cantidad_invalida')

  const totalPath = `inventarioTotales/${sucursalId}/${productoId}/total`
  const totalBefore = await getValue(totalPath)

  const stockRef = ref(db, `inventario/${sucursalId}/${productoId}/tallas/${tallaKey}`)

  // Warm-up: `runTransaction` puede recibir `current=null` desde cache local y si devolvemos `undefined`
  // se aborta la transacción sin consultar el valor real del servidor. Esto evita falsos "sin stock"
  // cuando el dato existe en RTDB pero aún no está sincronizado localmente.
  let warmCur = null
  try {
    const warmSnap = await get(stockRef)
    const warmVal = warmSnap.exists() ? warmSnap.val() : null
    const warmNum = Number(warmVal ?? NaN)
    warmCur = Number.isFinite(warmNum) ? warmNum : null
  } catch {
    warmCur = null
  }

  const res = await runTransaction(stockRef, (current) => {
    const curNum = Number(current ?? NaN)
    const cur = Number.isFinite(curNum) ? curNum : current == null && warmCur != null ? warmCur : NaN
    if (!Number.isFinite(cur)) return
    if (cur < qty) return
    return cur - qty
  })

  if (!res.committed) {
    const cur = Number(res.snapshot?.val?.() ?? 0)
    const err = new Error(cur > 0 ? 'stock_insuficiente' : 'sin_stock_en_sucursal')
    err.code = cur > 0 ? 'stock_insuficiente' : 'sin_stock_en_sucursal'
    err.path = `inventario/${sucursalId}/${productoId}/tallas/${tallaKey}`
    err.tallaKey = tallaKey
    err.tallaLabel = tallaLabel
    try {
      const raw = res.snapshot?.val?.()
      err.valueType = raw === null ? 'null' : Array.isArray(raw) ? 'array' : typeof raw
    } catch {}
    try {
      const snap = await get(stockRef)
      const direct = snap.exists() ? snap.val() : null
      err.direct = direct
      const directNumber = Number(direct ?? 0)
      err.directNumber = Number.isFinite(directNumber) ? directNumber : null
      err.directType = direct === null ? 'null' : Array.isArray(direct) ? 'array' : typeof direct
    } catch {}
    err.current = Number.isFinite(cur) ? cur : 0
    err.requested = qty
    throw err
  }

  const now = Date.now()

  const totalRef = ref(db, `inventarioTotales/${sucursalId}/${productoId}/total`)
  await runTransaction(totalRef, (current) => {
    const curTotal = Number(current ?? 0)
    if (!Number.isFinite(curTotal)) return
    const next = curTotal - qty
    return next < 0 ? 0 : next
  })

  if (totalBefore == null) {
    const tallas = (await getValue(`inventario/${sucursalId}/${productoId}/tallas`)) || {}
    const total = Object.values(tallas).reduce((acc, n) => acc + (Number.isFinite(Number(n)) ? Number(n) : 0), 0)
    update(ref(db), { [totalPath]: total }).catch(() => {})
  }

  update(ref(db), {
    [`inventario/${sucursalId}/${productoId}/actualizadoEn`]: now,
    [`inventarioTotales/${sucursalId}/${productoId}/actualizadoEn`]: now,
  }).catch(() => {})

  return { ok: true, nuevoStock: Number(res.snapshot.val() ?? 0) }
}

async function incrementarStockSucursal({ sucursalId, productoId, talla, cantidad }) {
  const qty = Number(cantidad)
  const tallaRaw = String(talla ?? '')
  const tallaLabel = tallaRaw.trim()
  const tallaKey = tallaRaw
  if (!sucursalId || !productoId || !tallaLabel) throw new Error('missing_args')
  if (!Number.isFinite(qty) || qty <= 0) throw new Error('cantidad_invalida')

  const totalPath = `inventarioTotales/${sucursalId}/${productoId}/total`
  const totalBefore = await getValue(totalPath)

  const stockRef = ref(db, `inventario/${sucursalId}/${productoId}/tallas/${tallaKey}`)

  const res = await runTransaction(stockRef, (current) => {
    const cur = Number(current ?? 0)
    if (!Number.isFinite(cur)) return
    return cur + qty
  })

  if (!res.committed) {
    const err = new Error('no_commit')
    err.code = 'no_commit'
    throw err
  }

  const now = Date.now()
  const totalRef = ref(db, `inventarioTotales/${sucursalId}/${productoId}/total`)
  await runTransaction(totalRef, (current) => {
    const curTotal = Number(current ?? 0)
    if (!Number.isFinite(curTotal)) return
    return curTotal + qty
  })

  if (totalBefore == null) {
    const tallas = (await getValue(`inventario/${sucursalId}/${productoId}/tallas`)) || {}
    const total = Object.values(tallas).reduce((acc, n) => acc + (Number.isFinite(Number(n)) ? Number(n) : 0), 0)
    update(ref(db), { [totalPath]: total }).catch(() => {})
  }

  update(ref(db), {
    [`inventario/${sucursalId}/${productoId}/actualizadoEn`]: now,
    [`inventarioTotales/${sucursalId}/${productoId}/actualizadoEn`]: now,
  }).catch(() => {})

  return { ok: true, nuevoStock: Number(res.snapshot.val() ?? 0) }
}
async function removeData(rute, arg2, arg3) {
  const setUserSuccess = typeof arg2 === 'function' && typeof arg3 === 'function' ? arg2 : undefined
  const callback =
    typeof arg2 === 'function' && arg3 === undefined
      ? arg2
      : typeof arg3 === 'function'
        ? arg3
        : undefined

  return remove(ref(db, rute))
    .then(() => {
      if (typeof callback === 'function') callback()
      if (typeof setUserSuccess === 'function') setUserSuccess('Eliminado correctamente')
      return { ok: true }
    })
    .catch((err) => {
      console.log(err)
      if (typeof setUserSuccess === 'function') setUserSuccess(err?.code || err?.message || 'repeat')
      return { ok: false, error: err }
    });
}


export {
  readUserData,
  readUserDataLength,
  removeData,
  getSpecificData,
  getSpecificDataEq,
  getLate,
  writeUserData,
  getPagedData,
  getRangeByChild,
  getRangeByKey,
  getValue,
  updatePaths,
  descontarStockSucursal,
  incrementarStockSucursal,
}
