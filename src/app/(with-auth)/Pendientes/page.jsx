'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Modal from '@/components/Modal'
import Tag from '@/components/Tag'
import TablePager from '@/components/TablePager'
import { useUser } from '@/context'
import { readUserData, removeData, writeUserData } from '@/firebase/database'
import { usePagination } from '@/hooks/usePagination'
import { getDayMonthYearHour } from '@/utils/getDate'
import { isCliente } from '@/lib/roles'

function Home() {
  const { userDB, msg, modal, item, setModal, setSucursales, setTareas, setUserItem, setUserSuccess, sucursales, tareas } =
    useUser()

  const scrollRef = useRef(null)

  const [draftByUuid, setDraftByUuid] = useState({})
  const [editingUuid, setEditingUuid] = useState(null)
  const [abonoByUuid, setAbonoByUuid] = useState({})
  const [drawer, setDrawer] = useState({ open: false, tarea: null })

  const [tag, setTag] = useState('')
  const [entrega, setEntrega] = useState('')
  const [filter, setFilter] = useState('')
  const [filterDate, setFilterDate] = useState('')

  useEffect(() => {
    readUserData('sucursales', setSucursales)
    readUserData('tareas', setTareas)
  }, [])

  const allTareas = useMemo(() => {
    if (!tareas) return []
    if (Array.isArray(tareas)) return tareas
    if (typeof tareas !== 'object') return []

    const merged = Object.values(tareas).reduce((acc, el) => {
      if (!el || typeof el !== 'object') return acc
      return { ...acc, ...el }
    }, {})

    return Object.values(merged)
  }, [tareas])

  const filteredTareas = useMemo(() => {
    const tagNorm = String(tag || '').toLowerCase()
    const entregaNorm = String(entrega || '').toLowerCase()
    const filterNorm = String(filter || '').toLowerCase().trim()
    const filterDateNorm = String(filterDate || '').trim()

    return allTareas
      .filter((i) => {
        const nombre = String(i?.nombre || '').toLowerCase()
        const code = String(i?.code || '').toLowerCase()
        const sucursal = String(i?.sucursal || '').toLowerCase()
        const estadoNorm = String(i?.estado || '').toLowerCase()
        const mes = String(i?.mes || '').trim()

        const matchSucursal = sucursal.includes(tagNorm)
        const matchEstado = estadoNorm.includes(entregaNorm)
        const matchText = !filterNorm || nombre.includes(filterNorm) || code.includes(filterNorm)
        const matchMonth = !filterDateNorm || mes.includes(filterDateNorm)

        return matchSucursal && matchEstado && matchText && matchMonth
      })
      .slice()
      .sort((a, b) => {
        const aName = String(a?.nombre || '').toLowerCase()
        const bName = String(b?.nombre || '').toLowerCase()
        if (aName < bName) return -1
        if (aName > bName) return 1
        return 0
      })
  }, [allTareas, entrega, filter, filterDate, tag])

  const pagination = usePagination(filteredTareas, {
    initialPageSize: 10,
    resetOn: [tag, entrega, filter, filterDate],
  })

  const hasActiveFilters = Boolean(tag || entrega || filter || filterDate)

  const btnBase =
    'inline-flex h-9 items-center justify-center rounded-xl px-3 text-sm font-semibold shadow-sm ring-1 ring-border/30 outline-none transition focus-visible:ring-2 focus-visible:ring-accent/30 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50'
  const btnGhost = `${btnBase} bg-surface/60 text-text hover:bg-surface`
  const btnPrimary = `${btnBase} bg-accent text-black hover:opacity-90`
  const btnDanger = `${btnBase} bg-red-500/10 text-red-600 ring-red-500/20 hover:bg-red-500/15`

  const inputBase =
    'h-10 w-full rounded-xl bg-surface/60 px-3 text-sm text-text placeholder:text-muted shadow-sm ring-1 ring-border/15 outline-none focus:ring-2 focus:ring-accent/25'

  const clearFilters = () => {
    setTag('')
    setEntrega('')
    setFilter('')
    setFilterDate('')
  }

  const prev = () => {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: -Math.max(240, el.clientWidth * 0.85), behavior: 'smooth' })
  }

  const next = () => {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: Math.max(240, el.clientWidth * 0.85), behavior: 'smooth' })
  }

  const onChangeDraft = (uuid, patch) => {
    setDraftByUuid((prevState) => ({
      ...prevState,
      [uuid]: { ...(prevState[uuid] || {}), ...patch },
    }))
  }

  const startEdit = (i) => {
    if (!i?.uuid) return
    setEditingUuid(i.uuid)
    setAbonoByUuid((prevState) => ({ ...prevState, [i.uuid]: '' }))
    onChangeDraft(i.uuid, { whatsapp: i?.whatsapp ?? '' })
  }

  const cancelEdit = (uuid) => {
    setEditingUuid(null)
    setDraftByUuid((prevState) => {
      const nextState = { ...prevState }
      delete nextState[uuid]
      return nextState
    })
    setAbonoByUuid((prevState) => {
      const nextState = { ...prevState }
      delete nextState[uuid]
      return nextState
    })
  }

  const openServices = (tarea) => setDrawer({ open: true, tarea })
  const closeDrawer = () => setDrawer({ open: false, tarea: null })

  async function save(i) {
    const uuid = i?.uuid
    if (!uuid) return

    const draft = draftByUuid[uuid] || {}

    if (draft['nombre receptor'] || draft['CI receptor'] || draft['whatsapp receptor']) {
      if (draft['nombre receptor'] && draft['CI receptor'] && draft['whatsapp receptor']) {
        await writeUserData(
          `tareas/${i['sucursal uuid']}/${uuid}`,
          { ...draft, estado: 'Entregado', ['fecha entrega']: getDayMonthYearHour() },
          uuid
        )
        cancelEdit(uuid)
        readUserData(`tareas/${uuid}`, setTareas)
      } else {
        setUserSuccess('Complete')
      }
      return
    }

    await writeUserData(`tareas/${i['sucursal uuid']}/${uuid}`, draft, uuid)
    cancelEdit(uuid)
    readUserData(`tareas`, setTareas)
  }

  function deletConfirm() {
    if (!item?.uuid || !item?.['sucursal uuid']) {
      setModal('')
      return
    }

    const callback = () => {
      readUserData(`tareas`, setTareas)
      setModal('')
    }

    removeData(`tareas/${item['sucursal uuid']}/${item.uuid}`, null, callback)
  }

  function delet(i) {
    setUserItem(i)
    setModal('Delete')
  }

  const drawerServices = useMemo(() => {
    const servicesObj = drawer?.tarea?.servicios
    if (!servicesObj || typeof servicesObj !== 'object') return []
    return Object.values(servicesObj)
  }, [drawer])

  const drawerServicesTotal = useMemo(() => {
    return drawerServices.reduce((sum, s) => sum + Number(s?.cantidad || 0), 0)
  }, [drawerServices])

  return (
    <div className="h-full">
      <div className="relative min-h-[80vh] overflow-hidden rounded-3xl bg-surface shadow-2xl ring-1 ring-border/12">
        {modal === 'Delete' && (
          <Modal funcion={deletConfirm}>
            Estas seguro de eliminar:{' '}
            <span className="font-semibold">{item?.nombre || item?.code || msg || 'registro'}</span>
          </Modal>
        )}

        <header className="border-b border-border/0 bg-surface/55 backdrop-blur">
          <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-end lg:justify-between lg:p-6">
            <div className="space-y-1">
              <h1 className="text-lg font-semibold text-text">Pendientes</h1>
              <p className="text-sm text-muted">
                {filteredTareas.length} de {allTareas.length} registros
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <div className="relative w-full sm:w-[360px]">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M21 21L16.65 16.65M10.5 18C14.6421 18 18 14.6421 18 10.5C18 6.35786 14.6421 3 10.5 3C6.35786 3 3 6.35786 3 10.5C3 14.6421 6.35786 18 10.5 18Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Buscar por nombre o code"
                  className={`${inputBase} pl-10`}
                />
              </div>

              <div className="w-full sm:w-[200px]">
                <input type="month" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className={inputBase} />
              </div>

              <button type="button" onClick={clearFilters} disabled={!hasActiveFilters} className={btnGhost}>
                Limpiar
              </button>
            </div>
          </div>

          <div className="grid gap-4 px-4 pb-4 lg:px-6 lg:pb-6">
            <div className="grid gap-2 lg:grid-cols-[110px_1fr] lg:items-center">
              <div className="text-sm font-medium text-muted">Sucursal</div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {sucursales &&
                  Object.values(sucursales).map((s) => (
                    <Tag key={s.uuid || s.nombre} theme={tag === s.nombre ? 'Primary' : 'Secondary'} click={() => setTag(tag === s.nombre ? '' : s.nombre)}>
                      {s.nombre}
                    </Tag>
                  ))}
              </div>
            </div>

            <div className="grid gap-2 lg:grid-cols-[110px_1fr] lg:items-center">
              <div className="text-sm font-medium text-muted">Estado</div>
              <div className="flex flex-wrap gap-2">
                <Tag theme={entrega === 'Pendiente' ? 'Primary' : 'Secondary'} click={() => setEntrega(entrega === 'Pendiente' ? '' : 'Pendiente')}>
                  Pendiente
                </Tag>
                <Tag theme={entrega === 'Concluido' ? 'Primary' : 'Secondary'} click={() => setEntrega(entrega === 'Concluido' ? '' : 'Concluido')}>
                  Concluido
                </Tag>
                <Tag theme={entrega === 'Entregado' ? 'Primary' : 'Secondary'} click={() => setEntrega(entrega === 'Entregado' ? '' : 'Entregado')}>
                  Entregado
                </Tag>
              </div>
            </div>

            {hasActiveFilters && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted">Filtros:</span>
                {tag && (
                  <Tag theme="Transparent" click={() => setTag('')} styled="ring-1 ring-border/20 border-transparent bg-surface/40">
                    <span className="text-text">Sucursal:</span> {tag}
                    <span className="ml-1 text-muted" aria-hidden="true">
                      ×
                    </span>
                  </Tag>
                )}
                {entrega && (
                  <Tag theme="Transparent" click={() => setEntrega('')} styled="ring-1 ring-border/20 border-transparent bg-surface/40">
                    <span className="text-text">Estado:</span> {entrega}
                    <span className="ml-1 text-muted" aria-hidden="true">
                      ×
                    </span>
                  </Tag>
                )}
                {filter && (
                  <Tag theme="Transparent" click={() => setFilter('')} styled="ring-1 ring-border/20 border-transparent bg-surface/40">
                    <span className="text-text">Buscar:</span> &quot;{filter}&quot;
                    <span className="ml-1 text-muted" aria-hidden="true">
                      ×
                    </span>
                  </Tag>
                )}
                {filterDate && (
                  <Tag theme="Transparent" click={() => setFilterDate('')} styled="ring-1 ring-border/20 border-transparent bg-surface/40">
                    <span className="text-text">Mes:</span> {filterDate}
                    <span className="ml-1 text-muted" aria-hidden="true">
                      ×
                    </span>
                  </Tag>
                )}
              </div>
            )}
          </div>
        </header>

        <section className="relative">
          <button
            type="button"
            onClick={prev}
            aria-label="Desplazar a la izquierda"
            className="hidden lg:inline-flex absolute left-3 top-3 z-20 h-10 w-10 items-center justify-center rounded-full bg-surface/60 text-muted shadow-sm ring-1 ring-border/20 backdrop-blur transition hover:bg-surface"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Desplazar a la derecha"
            className="hidden lg:inline-flex absolute right-3 top-3 z-20 h-10 w-10 items-center justify-center rounded-full bg-surface/60 text-muted shadow-sm ring-1 ring-border/20 backdrop-blur transition hover:bg-surface"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <div ref={scrollRef} className="max-h-[calc(100vh-380px)] overflow-auto scroll-smooth">
            {filteredTareas.length === 0 ? (
              <div className="p-10 text-center">
                <div className="mx-auto max-w-md rounded-2xl bg-surface/60 p-6 shadow-sm ring-1 ring-border/20">
                  <h3 className="text-base font-semibold text-text">Sin resultados</h3>
                  <p className="mt-1 text-sm text-muted">Prueba cambiando los filtros o limpiándolos.</p>
                  <button type="button" onClick={clearFilters} className={`${btnPrimary} mt-4`}>
                    Limpiar filtros
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 lg:p-6">
                <div className="overflow-hidden rounded-2xl bg-surface/30 ring-1 ring-border/15">
                  <table className="min-w-[2600px] w-full text-left text-[13px]">
                    <thead className="sticky top-0 z-10 bg-gradient-to-b from-thead-bg/95 to-thead-bg/75 text-[11px] font-semibold tracking-wide text-thead-muted backdrop-blur-md">
                      <tr className="border-b border-transparent">
                        <th scope="col" className="sticky left-0 z-20 w-[56px] bg-thead-bg/90 px-3 py-3">
                          #
                        </th>
                        <th scope="col" className="sticky left-[56px] z-20 bg-thead-bg/90 px-3 py-3">
                          Code
                        </th>
                        <th scope="col" className="px-3 py-3">
                          Cliente
                        </th>
                        <th scope="col" className="px-3 py-3">
                          Sucursal
                        </th>
                        <th scope="col" className="px-3 py-3">
                          Whatsapp
                        </th>
                        <th scope="col" className="px-3 py-3">
                          A cuenta
                        </th>
                        <th scope="col" className="px-3 py-3">
                          Saldo
                        </th>
                        <th scope="col" className="px-3 py-3">
                          Dirección
                        </th>
                        <th scope="col" className="px-3 py-3">
                          Servicios
                        </th>
                        {!isCliente(userDB) && (
                          <th scope="col" className="px-3 py-3 text-right">
                            Acciones
                          </th>
                        )}
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-transparent">
                      {pagination.pageItems.map((i, index) => {
                        const isLocked = Boolean(i?.['nombre receptor'])
                        const canEditRow = !isCliente(userDB) && !isLocked
                        const isEditing = editingUuid === i.uuid

                        const rowBg = index % 2 === 0 ? 'bg-surface/35' : 'bg-surface/20'
                        const rowTone = isEditing ? 'bg-accent/5' : rowBg

                        const draft = draftByUuid[i.uuid]
                        const hasDraft = Boolean(draft)

                        const estado = String(i?.estado || 'Pendiente')
                        const statusTone =
                          estado === 'Entregado'
                            ? 'border-emerald-500/25 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                            : estado === 'Concluido'
                              ? 'border-amber-500/25 bg-amber-500/12 text-amber-800 dark:text-amber-300'
                              : 'border-border/30 bg-surface/50 text-text'

                        const saldoDisplay = draft?.saldo ?? i?.saldo
                        const acDisplay = draft?.ac ?? i?.ac

                        const servicesArr = i?.servicios && typeof i.servicios === 'object' ? Object.values(i.servicios) : []
                        const servicesCount = servicesArr.length
                        const itemsTotal = servicesArr.reduce((sum, s) => sum + Number(s?.cantidad || 0), 0)

                        const summary = servicesArr
                          .slice(0, 2)
                          .map((s) => String(s?.['nombre 1'] || '').trim())
                          .filter(Boolean)
                          .join(' · ')

                        return (
                          <tr
                            key={i.uuid || `${i.code}-${index}`}
                            className={`${rowTone} hover:bg-surface/50 transition-colors`}
                          >
                            <td className="sticky left-0 z-10 w-[56px] bg-inherit px-3 py-3 align-top text-text">
                              {pagination.from + index}
                            </td>

                            <td className="sticky left-[56px] z-10 bg-inherit px-3 py-3 align-top">
                              <div className={`inline-flex flex-col gap-0.5 rounded-2xl border px-3 py-2 ${statusTone}`}>
                                <span className="text-[13px] font-semibold text-text">{i?.code || '—'}</span>
                                <span className="text-[11px] opacity-70">{estado}</span>
                              </div>
                            </td>

                            <td className="px-3 py-3 align-top text-text">{i?.nombre || '—'}</td>
                            <td className="px-3 py-3 align-top text-text">{i?.sucursal || '—'}</td>

                            <td className="px-3 py-3 align-top text-text">
                              {isEditing && canEditRow ? (
                                <input
                                  type="text"
                                  value={String(draft?.whatsapp ?? i?.whatsapp ?? '')}
                                  onChange={(e) => onChangeDraft(i.uuid, { whatsapp: e.target.value })}
                                  placeholder="Escribe aquí..."
                                  className="h-9 w-full min-w-[180px] rounded-xl bg-surface/70 px-3 text-sm text-text shadow-sm ring-1 ring-border/15 outline-none focus:ring-2 focus:ring-accent/25"
                                />
                              ) : (
                                <span className="text-text">{i?.whatsapp || '—'}</span>
                              )}
                            </td>

                            <td className="px-3 py-3 align-top text-text">
                              {isEditing && canEditRow ? (
                                <div className="min-w-[160px]">
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    min="0"
                                    value={String(abonoByUuid[i.uuid] ?? '')}
                                    onChange={(e) => {
                                      const raw = e.target.value
                                      setAbonoByUuid((prevState) => ({ ...prevState, [i.uuid]: raw }))

                                      const abono = Number(raw || 0)
                                      const acPrev = Number(i?.ac || 0)
                                      const saldoPrev = Number(i?.saldo || 0)
                                      onChangeDraft(i.uuid, { ac: acPrev + abono, saldo: saldoPrev - abono })
                                    }}
                                    placeholder="Abono"
                                    className="h-9 w-full rounded-xl bg-surface/70 px-3 text-sm text-text shadow-sm ring-1 ring-border/15 outline-none focus:ring-2 focus:ring-accent/25"
                                  />
                                  <div className="mt-1 text-xs text-muted">Nuevo: {acDisplay}</div>
                                </div>
                              ) : (
                                <span className="text-text">{i?.ac ?? '—'}</span>
                              )}
                            </td>

                            <td className="px-3 py-3 align-top text-text">
                              <span className="font-semibold">{saldoDisplay ?? '—'}</span>
                            </td>

                            <td className="px-3 py-3 align-top text-text">{i?.direccion || '—'}</td>

                            <td className="px-3 py-3 align-top">
                              {servicesCount === 0 ? (
                                <span className="text-muted">—</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => openServices(i)}
                                  className="group w-full min-w-[280px] rounded-xl bg-surface/50 px-3 py-2 text-left shadow-sm ring-1 ring-border/20 transition hover:bg-surface/70"
                                >
                                  <div className="text-sm font-semibold text-text">
                                    {summary || 'Ver servicios'} {servicesCount > 2 ? <span className="text-muted">+{servicesCount - 2}</span> : null}
                                  </div>
                                  <div className="mt-0.5 text-xs text-muted">
                                    {servicesCount} servicios · {itemsTotal} items
                                  </div>
                                </button>
                              )}
                            </td>

                            {!isCliente(userDB) && (
                              <td className="px-3 py-3 align-top text-right">
                                <div className="inline-flex items-center gap-2">
                                  {isEditing ? (
                                    <>
                                      <button type="button" className={btnGhost} onClick={() => cancelEdit(i.uuid)}>
                                        Cancelar
                                      </button>
                                      <button type="button" className={btnPrimary} disabled={!hasDraft} onClick={() => save(i)}>
                                        Guardar
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button type="button" className={btnGhost} disabled={!canEditRow} onClick={() => startEdit(i)}>
                                        Editar
                                      </button>
                                      <button type="button" className={btnDanger} onClick={() => delet(i)}>
                                        Eliminar
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <TablePager
                  className="mt-4"
                  page={pagination.page}
                  pageCount={pagination.pageCount}
                  total={pagination.total}
                  from={pagination.from}
                  to={pagination.to}
                  pageSize={pagination.pageSize}
                  pageSizeOptions={pagination.pageSizeOptions}
                  onPageChange={pagination.setPage}
                  onPageSizeChange={pagination.setPageSize}
                />
              </div>
            )}
          </div>
        </section>
      </div>

      {drawer.open && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Cerrar"
            className="absolute inset-0 bg-black/35 backdrop-blur-sm"
            onClick={closeDrawer}
          />
          <div className="absolute right-0 top-0 h-full w-full max-w-[520px] bg-surface/85 p-4 shadow-2xl ring-1 ring-border/30 backdrop-blur lg:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-text">Servicios</h3>
                <p className="text-sm text-muted">
                  {drawer?.tarea?.code || '—'} · {drawer?.tarea?.nombre || '—'}
                </p>
              </div>
              <button type="button" onClick={closeDrawer} className={btnGhost}>
                Cerrar
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl bg-surface/60 p-4 ring-1 ring-border/20">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-muted">Sucursal</div>
                    <div className="font-semibold text-text">{drawer?.tarea?.sucursal || '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Estado</div>
                    <div className="font-semibold text-text">{drawer?.tarea?.estado || '—'}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-xs text-muted">Dirección</div>
                    <div className="font-semibold text-text">{drawer?.tarea?.direccion || '—'}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-surface/60 p-4 ring-1 ring-border/20">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-text">Detalle</div>
                  <div className="text-xs text-muted">
                    {drawerServices.length} servicios · {drawerServicesTotal} items
                  </div>
                </div>

                <ul className="mt-3 space-y-2">
                  {drawerServices.map((s, idx) => (
                    <li key={idx} className="rounded-xl bg-surface/50 p-3 ring-1 ring-border/15">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-text">{s?.['nombre 1'] || '—'}</div>
                          {s?.observacion ? <div className="mt-0.5 text-xs text-muted">[{s.observacion}]</div> : null}
                        </div>
                        <div className="shrink-0 text-sm font-semibold text-text">x{s?.cantidad || 0}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Home
