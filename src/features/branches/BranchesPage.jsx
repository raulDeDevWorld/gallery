'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import Button from '@/components/Button'
import Modal from '@/components/Modal'
import DataPanel from '@/components/DataPanel'
import Table, { THead } from '@/components/Table'

import { useUser } from '@/context'
import { readUserData, removeData, writeUserData } from '@/firebase/database'
import { isAdmin } from '@/lib/roles'
import { lower } from '@/lib/string'
import { compareByLowerField } from '@/lib/sort'
import { usePagination } from '@/hooks/usePagination'
import TablePager from '@/components/TablePager'

export default function BranchesPage() {
  const {
    userDB,
    msg,
    modal,
    item,
    setModal,
    setSucursales,
    setServicios,
    setUserItem,
    setUserSuccess,
    setUserUuid,
    sucursales,
  } = useUser()

  const router = useRouter()
  const [draftByUuid, setDraftByUuid] = useState({})
  const [filter, setFilter] = useState('')

  const admin = isAdmin(userDB)
  const filterLower = lower(filter)

  useEffect(() => {
    if (sucursales !== undefined) return
    readUserData('sucursales', setSucursales)
  }, [sucursales, setSucursales])

  const branches = useMemo(() => {
    if (!sucursales || typeof sucursales !== 'object') return []
    return Object.values(sucursales).sort(compareByLowerField('nombre'))
  }, [sucursales])

  const filteredBranches = useMemo(() => {
    if (!branches.length) return []
    return branches.filter((branch) => lower(branch?.nombre).includes(filterLower))
  }, [branches, filterLower])

  const pagination = usePagination(filteredBranches, { initialPageSize: 10, resetOn: [filterLower] })

  function onChangeFilter(e) {
    setFilter(e.target.value)
  }

  function onChangeBranchField(e, branch) {
    setDraftByUuid((prev) => ({
      ...prev,
      [branch.uuid]: { ...(prev[branch.uuid] || {}), uuid: branch.uuid, [e.target.name]: e.target.value },
    }))
  }

  function redirectToAdd(uuid) {
    setUserUuid(uuid)
    router.push('/Sucursales/Agregar/')
  }

  async function save(branch) {
    const patch = draftByUuid[branch.uuid]
    if (!patch) return

    const callback = () => {
      setDraftByUuid((prev) => {
        const next = { ...prev }
        delete next[branch.uuid]
        return next
      })
      readUserData(`sucursales/${branch.uuid}`, setServicios)
    }

    const res = await writeUserData(`sucursales/${branch.uuid}`, patch, callback)
    if (res?.ok) setUserSuccess?.('Se ha guardado correctamente')
  }

  function requestDelete(branch) {
    setUserItem(branch)
    setModal('Delete')
  }

  function deleteConfirm() {
    const callback2 = () => setModal('')
    const callback = () => readUserData(`sucursales/`, setServicios, callback2)
    if (!item?.uuid) return setModal('')
    removeData(`sucursales/${item.uuid}`, setUserSuccess, callback)
  }

  return (
    <DataPanel
      title="Sucursales"
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
      {modal === 'Delete' && <Modal funcion={deleteConfirm}>Estas seguro de eliminar a la siguiente sucursal {msg}</Modal>}

      <Table className="min-w-[1000px]">
        <THead>
          <tr>
            <th scope="col" className="min-w-[50px] px-3 py-3">
              #
            </th>
            <th scope="col" className="px-3 py-3">
              Nombre de sucursal
            </th>
            <th scope="col" className="px-3 py-3">
              Dirección
            </th>
            <th scope="col" className="px-3 py-3">
              Whatsapp
            </th>
            <th scope="col" className="text-center px-3 py-3">
              Eliminar
            </th>
          </tr>
        </THead>
        <tbody>
          {pagination.pageItems.map((branch, index) => {
            const hasDraft = Boolean(draftByUuid[branch.uuid])

            return (
              <tr
                className="text-[13px] border-b border-transparent hover:bg-surface/50 odd:bg-surface/20 even:bg-surface/10"
                key={branch?.uuid ?? branch?.nombre ?? index}
              >
                <td className="min-w-[50px] px-3 py-4 text-gray-900 align-middle">{pagination.from + index}</td>
                <td className="min-w-[250px] px-3 py-4 text-gray-900">{branch?.nombre}</td>
                <td className="min-w-[250px] px-3 py-4 text-gray-900">
                  {admin ? (
                    <textarea
                      rows="1"
                      onChange={(e) => onChangeBranchField(e, branch)}
                      name="direccion"
                      defaultValue={branch?.direccion}
                      className="block w-full resize-none rounded-xl bg-surface/70 p-2.5 text-sm text-text shadow-sm ring-1 ring-border/15 outline-none focus:ring-2 focus:ring-accent/25"
                      placeholder="Escribe aquí..."
                    />
                  ) : (
                    <span className="text-text">{branch?.direccion || '—'}</span>
                  )}
                </td>
                <td className="min-w-[200px] px-3 py-4 text-gray-900">
                  {admin ? (
                    <textarea
                      rows="1"
                      onChange={(e) => onChangeBranchField(e, branch)}
                      name="whatsapp"
                      cols="4"
                      defaultValue={branch?.whatsapp}
                      className="block w-full resize-none rounded-xl bg-surface/70 p-2.5 text-sm text-text shadow-sm ring-1 ring-border/15 outline-none focus:ring-2 focus:ring-accent/25"
                      placeholder="Escribe aquí..."
                    />
                  ) : (
                    <span className="text-text">{branch?.whatsapp || '—'}</span>
                  )}
                </td>
                <td className="min-w-[200px] px-3 py-4">
                  {admin ? (
                    hasDraft ? (
                      <Button theme="Primary" click={() => save(branch)}>
                        Guardar
                      </Button>
                    ) : (
                      <Button theme="Danger" click={() => requestDelete(branch)}>
                        Eliminar
                      </Button>
                    )
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </Table>

      {admin && (
        <div className="mt-4 flex justify-end">
          <Button theme="Primary" styled="w-auto whitespace-nowrap" click={() => redirectToAdd()}>
            Agregar sucursal
          </Button>
        </div>
      )}
    </DataPanel>
  )
}
