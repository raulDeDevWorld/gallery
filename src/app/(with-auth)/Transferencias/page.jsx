'use client'

import { useEffect, useMemo, useState } from 'react'
import DataPanel from '@/components/DataPanel'
import Table, { THead } from '@/components/Table'
import Button from '@/components/Button'
import Dialog from '@/components/Dialog'
import LoaderBlack from '@/components/LoaderBlack'
import { useUser } from '@/context'
import { getPagedData, getValue, readUserData } from '@/firebase/database'
import { solicitarTransferencia, transferirTransferencia } from '@/firebase/ops'
import { lower } from '@/lib/string'
import { isAdmin, isPersonal } from '@/lib/roles'
import { generateUUID } from '@/utils/UIDgenerator'

function inputClass() {
  return 'h-10 w-full rounded-2xl bg-surface/60 px-4 text-sm text-text placeholder:text-muted ring-1 ring-border/25 outline-none focus:ring-2 focus:ring-accent/25'
}

function countItems(items) {
  const obj = items && typeof items === 'object' ? items : {}
  let productos = 0
  let pares = 0
  for (const data of Object.values(obj)) {
    const tallas = data?.tallas && typeof data.tallas === 'object' ? data.tallas : {}
    const qty = Object.values(tallas).reduce((acc, n) => acc + (Number.isFinite(Number(n)) ? Number(n) : 0), 0)
    if (qty > 0) productos += 1
    pares += qty
  }
  return { productos, pares }
}

export default function Page() {
  const { user, userDB, sucursales, setSucursales, modal, setModal, setUserSuccess } = useUser()
  const [transferenciaId, setTransferenciaId] = useState(() => generateUUID())

  const [desdeSucursalId, setDesdeSucursalId] = useState('')
  const [haciaSucursalId, setHaciaSucursalId] = useState('')
  const [nota, setNota] = useState('')
  const [vista, setVista] = useState('pendiente') // 'pendiente' | 'transferido'

  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [results, setResults] = useState([])

  const [items, setItems] = useState([]) // [{ productoId, marca, modelo, nombre, talla, tallaRaw, cantidad }]
  const [addDialog, setAddDialog] = useState(null) // { producto, tallas, tallaKeySel, cantidadSel, max }
  const [transferenciasDB, setTransferenciasDB] = useState(undefined)

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

  const admin = isAdmin(userDB)
  const personal = isPersonal(userDB)
  const mySucursalId = userDB?.sucursalId || ''

  const sucursalNameById = useMemo(() => {
    const map = {}
    for (const s of sucursalesArr) map[s.uuid] = s.nombre
    return map
  }, [sucursalesArr])

  useEffect(() => {
    if (!sucursalesArr.length) return
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

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      if (!searchLower) return setResults([])
      try {
        const res = await getPagedData('productos', {
          orderBy: 'child',
          childKey: 'nombreLower',
          range: { start: searchLower, end: `${searchLower}\uf8ff` },
          limit: 10,
        })
        if (!cancelled) setResults(res.items || [])
      } catch (err) {
        if (!cancelled) setUserSuccess?.(err?.code || err?.message || 'repeat')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [searchLower, setUserSuccess])

  async function openAddDialog(producto) {
    if (!desdeSucursalId) return setUserSuccess?.('Selecciona sucursal origen')
    if (!haciaSucursalId) return setUserSuccess?.('Selecciona sucursal destino')
    if (desdeSucursalId === haciaSucursalId) return setUserSuccess?.('Sucursal origen y destino no pueden ser iguales')

    const productoId = producto?.__key
    if (!productoId) return

    try {
      setModal('Cargando')
      const raw = (await getValue(`inventario/${desdeSucursalId}/${productoId}/tallas`)) || {}

      // Normaliza tallas para UI (label) pero mantiene la llave real (key) para descontar/incrementar sin errores por espacios.
      const byLabel = {}
      for (const [t, q] of Object.entries(raw)) {
        const key = String(t ?? '')
        const label = key.trim()
        const stock = Number(q || 0)
        if (!label || !Number.isFinite(stock) || stock <= 0) continue
        const prev = byLabel[label]
        if (!prev || stock > prev.stock) byLabel[label] = { key, label, stock }
      }

      const tallas = Object.values(byLabel).sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { numeric: true }))

      setModal('')
      setAddDialog({
        producto,
        tallas,
        tallaKeySel: tallas[0]?.key || '',
        cantidadSel: 1,
        max: tallas[0]?.stock || 0,
      })
    } catch (err) {
      setModal('')
      setUserSuccess?.(err?.code || err?.message || 'repeat')
    }
  }

  function addItemFromDialog() {
    const d = addDialog
    if (!d?.producto?.__key) return
    const productoId = d.producto.__key
    const tallaKey = String(d.tallaKeySel || '')
    const cantidad = Number(d.cantidadSel || 0)
    if (!tallaKey.trim() || !Number.isFinite(cantidad) || cantidad <= 0) return

    const match = d.tallas.find((x) => x.key === tallaKey)
    const max = match?.stock || 0
    if (cantidad > max) return setUserSuccess?.('stock_insuficiente')

    setItems((prev) => [
      ...prev,
      {
        productoId,
        marca: d.producto.marca,
        modelo: d.producto.modelo,
        nombre: d.producto.nombre,
        talla: match?.label || String(tallaKey).trim(),
        tallaRaw: tallaKey,
        cantidad,
      },
    ])
    setAddDialog(null)
  }

  function removeItem(idx) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  async function confirmarTransferencia() {
    if (!desdeSucursalId || !haciaSucursalId) return setUserSuccess?.('Selecciona sucursales')
    if (desdeSucursalId === haciaSucursalId) return setUserSuccess?.('Sucursal origen y destino no pueden ser iguales')
    if (!items.length) return setUserSuccess?.('noProduct')

    try {
      setModal('Guardando')
      await solicitarTransferencia({
        transferenciaId,
        idempotencyKey: `transferencia_${transferenciaId}`,
        desdeSucursalId,
        haciaSucursalId,
        usuarioId: user?.uid ?? null,
        items,
        nota,
      })
      setModal('')
      setUserSuccess?.('Se ha guardado correctamente')
      setItems([])
      setSearch('')
      setResults([])
      setNota('')
      setTransferenciaId(generateUUID())
    } catch (err) {
      setModal('')
      setUserSuccess?.(err?.code || err?.message || 'repeat')
    }
  }

  async function marcarTransferido(id) {
    if (!id) return
    try {
      setModal('Transfiriendo')
      await transferirTransferencia({
        transferenciaId: id,
        idempotencyKey: `transferir_${id}`,
        usuarioId: user?.uid ?? null,
      })
      setModal('')
      setUserSuccess?.('Se ha guardado correctamente')
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
    const estado = vista === 'transferido' ? 'transferido' : 'pendiente'
    return transferenciasArr
      .filter((t) => String(t.estado) === estado)
      .filter((t) => (admin ? true : mySucursalId ? t.desdeSucursalId === mySucursalId || t.haciaSucursalId === mySucursalId : false))
      .sort((a, b) => Number(b.creadoEn || 0) - Number(a.creadoEn || 0))
  }, [admin, mySucursalId, transferenciasArr, vista])

  const canTransferir = (t) => {
    if (!t || t.estado !== 'pendiente') return false
    if (admin) return true
    if (personal && mySucursalId) return t.desdeSucursalId === mySucursalId
    return false
  }

  return (
    <DataPanel
      title="Transferencias"
      subtitle="Solicita stock y registra transferencias"
      actions={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <div className="rounded-2xl bg-surface/40 px-3 py-2 text-[12px] text-muted ring-1 ring-border/15">
            Transferencia ID: <span className="font-semibold text-text">{transferenciaId.slice(0, 8)}</span>
          </div>
        </div>
      }
      scroll="x"
    >
      {modal ? <LoaderBlack>{modal}</LoaderBlack> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-3xl bg-surface/40 p-5 ring-1 ring-border/20 backdrop-blur">
          <div className="text-[13px] font-semibold text-text">Origen</div>
          <select className={`${inputClass()} mt-2`} value={desdeSucursalId} onChange={(e) => setDesdeSucursalId(e.target.value)}>
            {sucursalesArr.map((s) => (
              <option key={s.uuid} value={s.uuid}>
                {s.nombre}
              </option>
            ))}
          </select>

          <div className="mt-4 text-[13px] font-semibold text-text">Destino</div>
          {personal && mySucursalId ? (
            <div className="mt-2 rounded-2xl bg-surface/50 px-4 py-3 text-sm text-text ring-1 ring-border/15">
              {sucursalNameById[mySucursalId] || mySucursalId}
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

          <div className="mt-4 text-[13px] font-semibold text-text">Nota (opcional)</div>
          <input className={`${inputClass()} mt-2`} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Motivo / comentario" />

          <div className="mt-4 text-[13px] font-semibold text-text">Buscar producto</div>
          <input className={`${inputClass()} mt-2`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre..." />

          {searchLower ? (
            <div className="mt-3 space-y-2">
              {results.length === 0 ? (
                <div className="text-[12px] text-muted">Sin resultados.</div>
              ) : (
                results.map((p) => (
                  <button
                    key={p.__key}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded-2xl bg-surface/50 px-3 py-3 text-left ring-1 ring-border/15 hover:bg-surface"
                    onClick={() => openAddDialog(p)}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold text-text">
                        {p.marca} {p.modelo}
                      </div>
                      <div className="truncate text-[12px] text-muted">{p.nombre}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : (
            <div className="mt-3 text-[12px] text-muted">Escribe para buscar.</div>
          )}
        </div>

        <div className="lg:col-span-2 rounded-3xl bg-surface/40 p-5 ring-1 ring-border/20 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[13px] font-semibold text-text">Items</div>
              <div className="text-[12px] text-muted">{items.length} items</div>
            </div>
            <Button theme="Primary" styled="whitespace-nowrap" click={confirmarTransferencia}>
              Enviar solicitud
            </Button>
          </div>

          <div className="mt-4">
            <Table minWidth={900}>
              <THead>
                <tr>
                  <th className="px-3 py-3">Producto</th>
                  <th className="px-3 py-3">Talla</th>
                  <th className="px-3 py-3 text-right">Cantidad</th>
                  <th className="px-3 py-3 text-center">Acción</th>
                </tr>
              </THead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-[13px] text-muted">
                      Agrega productos para transferir.
                    </td>
                  </tr>
                ) : (
                  items.map((it, idx) => (
                    <tr key={`${it.productoId}-${it.talla}-${idx}`} className="border-b border-transparent odd:bg-surface/20">
                      <td className="px-3 py-3 text-text">
                        <div className="text-[13px] font-semibold">{it.marca} {it.modelo}</div>
                        <div className="text-[12px] text-muted">{it.nombre}</div>
                      </td>
                      <td className="px-3 py-3 text-text">{it.talla}</td>
                      <td className="px-3 py-3 text-text text-right">{it.cantidad}</td>
                      <td className="px-3 py-3 text-center">
                        <button
                          type="button"
                          className="h-9 rounded-xl bg-surface/60 px-3 text-[12px] font-semibold text-text ring-1 ring-border/15 hover:bg-surface"
                          onClick={() => removeItem(idx)}
                        >
                          Quitar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </div>

          <div className="mt-6 rounded-3xl bg-surface/30 p-4 ring-1 ring-border/15">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[13px] font-semibold text-text">Historial</div>
                <div className="text-[12px] text-muted">{admin ? 'Todas las sucursales' : mySucursalId ? 'Solo tu sucursal' : 'Sin sucursal asignada'}</div>
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
                    <th className="px-3 py-3 text-center">AcciÃ³n</th>
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
                      const creadoEn = Number(t.creadoEn || 0)
                      return (
                        <tr key={id} className="border-b border-transparent odd:bg-surface/20">
                          <td className="px-3 py-3 text-sm text-text">{id.slice(0, 8)}</td>
                          <td className="px-3 py-3 text-sm text-text">{sucursalNameById[t.desdeSucursalId] || t.desdeSucursalId}</td>
                          <td className="px-3 py-3 text-sm text-text">{sucursalNameById[t.haciaSucursalId] || t.haciaSucursalId}</td>
                          <td className="px-3 py-3 text-sm text-text">
                            <span className="font-semibold">{pares}</span> pares <span className="text-muted">Â· {productos} productos</span>
                          </td>
                          <td className="px-3 py-3 text-sm text-muted">{creadoEn ? new Date(creadoEn).toLocaleString() : '-'}</td>
                          <td className="px-3 py-3 text-sm">
                            <span className={t.estado === 'transferido' ? 'text-emerald-500' : 'text-amber-500'}>{t.estado}</span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            {canTransferir(t) ? (
                              <Button theme="Primary" styled="text-xs px-3 py-2" click={() => marcarTransferido(id)}>
                                Marcar transferido
                              </Button>
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
      </div>

      <Dialog
        open={Boolean(addDialog)}
        title="Agregar item"
        subtitle={addDialog ? `${addDialog.producto?.marca || ''} ${addDialog.producto?.modelo || ''} · ${addDialog.producto?.nombre || ''}` : ''}
        onClose={() => setAddDialog(null)}
        footer={
          <>
            <button
              type="button"
              className="h-10 rounded-2xl bg-surface/60 px-4 text-[12px] font-semibold text-text ring-1 ring-border/15 hover:bg-surface"
              onClick={() => setAddDialog(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="h-10 rounded-2xl bg-accent px-4 text-[12px] font-semibold text-black ring-1 ring-accent/30 hover:brightness-105"
              onClick={addItemFromDialog}
            >
              Agregar
            </button>
          </>
        }
      >
        {addDialog ? (
          <div className="space-y-3">
            <div>
              <div className="text-[12px] font-semibold text-muted">Talla</div>
              <select
                className={`${inputClass()} mt-2`}
                value={addDialog.tallaKeySel}
                onChange={(e) => {
                  const tallaKey = e.target.value
                  const match = addDialog.tallas.find((x) => x.key === tallaKey)
                  setAddDialog((prev) => ({ ...prev, tallaKeySel: tallaKey, max: match?.stock || 0, cantidadSel: 1 }))
                }}
              >
                {addDialog.tallas.length === 0 ? <option value="">Sin stock</option> : null}
                {addDialog.tallas.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label} (stock {t.stock})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-[12px] font-semibold text-muted">Cantidad</div>
              <input
                className={`${inputClass()} mt-2`}
                type="number"
                min={1}
                max={addDialog.max || 1}
                value={addDialog.cantidadSel}
                onChange={(e) => setAddDialog((prev) => ({ ...prev, cantidadSel: Number(e.target.value) }))}
              />
            </div>
          </div>
        ) : null}
      </Dialog>
    </DataPanel>
  )
}
