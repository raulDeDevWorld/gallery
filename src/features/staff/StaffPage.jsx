'use client'

import { useEffect, useMemo, useState } from 'react'
import Button from '@/components/Button'
import DataPanel from '@/components/DataPanel'
import Modal from '@/components/Modal'
import Select from '@/components/Select'
import Table, { THead } from '@/components/Table'
import TablePager from '@/components/TablePager'
import { useUser } from '@/context/'
import { readUserData, removeData, writeUserData } from '@/firebase/database'
import { usePagination } from '@/hooks/usePagination'
import { ROLES, canonicalRol, isAdmin, rolLabel } from '@/lib/roles'

const ROLE_OPTIONS = [ROLES.admin, ROLES.personal, ROLES.cliente]

function StaffPage() {
  const { user, userDB, msg, modal, setModal, setUserItem, item, sucursales, setSucursales, clientes, setClientes, setUserSuccess } = useUser()
  const [draftByUid, setDraftByUid] = useState({})
  const [filter, setFilter] = useState('')

  const admin = isAdmin(userDB)
  const allowStaffSection = admin

  useEffect(() => {
    if (!allowStaffSection) return
    if (clientes !== undefined) return
    const unsub = readUserData('usuarios', setClientes, undefined, (err) => setUserSuccess?.(err?.code || err?.message || 'repeat'))
    return () => (typeof unsub === 'function' ? unsub() : null)
  }, [allowStaffSection, clientes, setClientes, setUserSuccess])

  useEffect(() => {
    if (!allowStaffSection) return
    if (sucursales !== undefined) return
    const unsub = readUserData('sucursales', setSucursales, undefined, (err) => setUserSuccess?.(err?.code || err?.message || 'repeat'))
    return () => (typeof unsub === 'function' ? unsub() : null)
  }, [allowStaffSection, setSucursales, setUserSuccess, sucursales])

  const sucursalesArr = useMemo(() => {
    const obj = sucursales && typeof sucursales === 'object' ? sucursales : {}
    return Object.values(obj).filter((s) => s?.uuid && s?.nombre)
  }, [sucursales])

  const sucursalNames = useMemo(() => sucursalesArr.map((s) => s.nombre), [sucursalesArr])

  const usuariosRows = useMemo(() => {
    const obj = clientes && typeof clientes === 'object' ? clientes : {}
    return Object.entries(obj)
      .map(([uid, u]) => ({ uid, ...(u && typeof u === 'object' ? u : {}) }))
      .filter((u) => u?.uid)
  }, [clientes])

  const visibleRows = useMemo(() => {
    // Admin debe ver todo (incluye pendientes) para poder aprobar/asignar sucursal.
    if (admin) return usuariosRows
    return []
  }, [admin, usuariosRows])

  const filteredRows = useMemo(() => {
    const q = String(filter || '').trim().toLowerCase()
    return visibleRows
      .filter((u) => {
        if (!q) return true
        return String(u?.nombre || '').toLowerCase().includes(q)
      })
      .sort((a, b) => String(a?.nombre || '').localeCompare(String(b?.nombre || ''), 'es', { sensitivity: 'base' }))
  }, [filter, visibleRows])

  const pagination = usePagination(filteredRows, { initialPageSize: 10, resetOn: [filter] })

  function onChangeFilter(e) {
    setFilter(String(e?.target?.value || '').toLowerCase())
  }

  function onChangeSelect(name, value, uid) {
    setDraftByUid((prev) => ({ ...prev, [uid]: { ...(prev?.[uid] || {}), [name]: value } }))
  }

  function onChangeSucursalNombre(name, value, uid) {
    const suc = sucursalesArr.find((s) => s.nombre === value)
    if (!suc) return
    setDraftByUid((prev) => ({
      ...prev,
      [uid]: { ...(prev?.[uid] || {}), [name]: value, sucursalId: suc.uuid, sucursalNombre: suc.nombre },
    }))
  }

  async function save(u) {
    if (!admin) return setUserSuccess?.('No tienes permisos')
    if (!u?.uid) return

    const now = Date.now()
    const patch = { ...(draftByUid[u.uid] || {}), updatedAt: now }

    if (patch.rol != null) patch.rol = canonicalRol(patch.rol, ROLES.cliente)
    const nextRol = canonicalRol(patch.rol ?? u.rol, ROLES.cliente)
    const nextSucursalId = patch.sucursalId ?? u.sucursalId

    if (u?.solicitudEstado === 'pendiente' && u?.rolSolicitado === 'personal' && nextRol !== ROLES.cliente && !!nextSucursalId) {
      patch.solicitudEstado = 'aprobado'
    }

    const res = await writeUserData(`usuarios/${u.uid}`, patch, () => {
      setDraftByUid((prev) => {
        const next = { ...(prev || {}) }
        delete next[u.uid]
        return next
      })
    })
    if (res?.ok) setUserSuccess?.('Se ha guardado correctamente')
    else setUserSuccess?.(res?.error?.code || res?.error?.message || 'repeat')
  }

  function requestDelete(u) {
    if (!admin) return setUserSuccess?.('No tienes permisos')
    setUserItem(u)
    setModal('Delete')
  }

  async function confirmDelete() {
    if (!admin) return setUserSuccess?.('No tienes permisos')
    if (!item?.uid) return
    const deletedUid = item.uid
    const res = await removeData(`usuarios/${deletedUid}`, setUserSuccess)
    if (!res?.ok) return

    setClientes((prev) => {
      const next = { ...((prev && typeof prev === 'object') ? prev : {}) }
      delete next[deletedUid]
      return next
    })
    setUserItem(null)
    setModal('')
  }

  if (!allowStaffSection) {
    return (
      <DataPanel title="Personal" subtitle="No tienes permisos para ver esta seccion.">
        <div className="p-6 text-[13px] text-muted">Solo rol admin.</div>
      </DataPanel>
    )
  }

  return (
    <DataPanel
      title="Personal"
      subtitle="Admin: puedes ver y administrar todos los usuarios (incluye pendientes)."
      filter={{ value: filter, onChange: onChangeFilter, placeholder: 'Filtrar por nombre' }}
      scroll="x"
      footer={
        <TablePager
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
      }
    >
      {admin && modal === 'Delete' ? <Modal funcion={confirmDelete}>Estas seguro de eliminar al siguiente usuario {msg}</Modal> : null}

      <Table className="min-w-[1700px]">
        <THead>
          <tr>
            <th scope="col" className="min-w-[50px] px-3 py-3">
              #
            </th>
            <th scope="col" className="px-3 py-3">
              Nombre
            </th>
            <th scope="col" className="px-3 py-3">
              Correo
            </th>
            <th scope="col" className="px-3 py-3">
              Estado
            </th>
            <th scope="col" className="px-3 py-3">
              CI
            </th>
            <th scope="col" className="px-3 py-3">
              Direccion
            </th>
            <th scope="col" className="px-3 py-3">
              Whatsapp
            </th>
            <th scope="col" className="text-center px-3 py-3">
              Rol
            </th>
            <th scope="col" className="text-center px-3 py-3">
              Sucursal
            </th>
            <th scope="col" className="text-center px-3 py-3">
              Acciones
            </th>
          </tr>
        </THead>
        <tbody>
          {clientes === undefined || sucursales === undefined ? (
            <tr>
              <td className="px-4 py-10 text-center text-[13px] text-muted" colSpan={10}>
                Cargando...
              </td>
            </tr>
          ) : pagination.pageItems.length === 0 ? (
            <tr>
              <td className="px-4 py-10 text-center text-[13px] text-muted" colSpan={10}>
                Sin usuarios.
              </td>
            </tr>
          ) : (
            pagination.pageItems.map((u, index) => {
              const rol = canonicalRol(u?.rol, ROLES.cliente)
              const draft = draftByUid?.[u.uid]
              const hasDraft = !!draft

              return (
                <tr className="text-[13px] border-b border-transparent hover:bg-surface/50 odd:bg-surface/20 even:bg-surface/10" key={u.uid}>
                  <td className="min-w-[50px] h-full px-3 py-4 text-muted align-middle">{pagination.from + index}</td>
                  <td className="min-w-[250px] px-3 py-4 text-text">
                    <div className="text-[13px] font-semibold">{u?.nombre || '-'}</div>
                    <div className="text-[12px] text-muted">{rolLabel(u)}</div>
                  </td>
                  <td className="min-w-[260px] px-3 py-4 text-text">{u?.correo || u?.email || u?.mail || '-'}</td>
                  <td className="min-w-[160px] px-3 py-4 text-text">
                    {u?.solicitudEstado === 'pendiente' ? (
                      <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-1 text-[12px] font-semibold text-amber-500 ring-1 ring-amber-500/20">
                        Solicitud pendiente
                      </span>
                    ) : u?.solicitudEstado === 'aprobado' ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-1 text-[12px] font-semibold text-emerald-500 ring-1 ring-emerald-500/20">
                        Aprobado
                      </span>
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </td>
                  <td className="min-w-[150px] px-3 py-4 text-text">{u?.ci || '-'}</td>
                  <td className="min-w-[250px] px-3 py-4 text-text">{u?.direccion || '-'}</td>
                  <td className="min-w-[150px] px-3 py-4 text-text">{u?.whatsapp || '-'}</td>

                  <td className="min-w-[200px] px-3 py-4 text-text">
                    {admin ? (
                      <Select arr={ROLE_OPTIONS} name="rol" uuid={u.uid} defaultValue={rol} click={onChangeSelect} />
                    ) : (
                      <span className="text-text font-semibold">{rol}</span>
                    )}
                  </td>

                  <td className="min-w-[200px] px-3 py-4 text-text">
                    {admin ? (
                      <Select
                        arr={sucursalNames}
                        name="sucursalNombre"
                        uuid={u.uid}
                        defaultValue={u?.sucursalNombre ? u.sucursalNombre : 'No asignado'}
                        click={onChangeSucursalNombre}
                      />
                    ) : (
                      <span className="text-text font-semibold">{u?.sucursalNombre || 'No asignado'}</span>
                    )}
                  </td>

                  <td className="min-w-[200px] px-3 py-4 text-center">
                    {admin ? (
                      hasDraft ? (
                        <Button theme="Primary" click={() => save(u)}>
                          Guardar
                        </Button>
                      ) : (
                        <Button theme="Danger" click={() => requestDelete(u)}>
                          Eliminar
                        </Button>
                      )
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </Table>
    </DataPanel>
  )
}

export default StaffPage
