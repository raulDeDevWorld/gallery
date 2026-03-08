'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import Button from '@/components/Button'
import Modal from '@/components/Modal'
import DataPanel from '@/components/DataPanel'
import Table, { THead } from '@/components/Table'
import ImageUploadField from '@/components/ImageUploadField'

import { useUser } from '@/context'
import { readUserData, removeData, writeUserData } from '@/firebase/database'
import { isAdmin } from '@/lib/roles'
import { lower } from '@/lib/string'
import { compareByLowerField } from '@/lib/sort'
import { usePagination } from '@/hooks/usePagination'
import TablePager from '@/components/TablePager'
import { uploadImage } from '@/firebase/storage'

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
  const [qrFilesByUuid, setQrFilesByUuid] = useState({})
  const [qrPreviewsByUuid, setQrPreviewsByUuid] = useState({})
  const [logoFilesByUuid, setLogoFilesByUuid] = useState({})
  const [logoPreviewsByUuid, setLogoPreviewsByUuid] = useState({})
  const [assetRemovals, setAssetRemovals] = useState({})
  const previewsRef = useRef({ qr: {}, logo: {} })

  const admin = isAdmin(userDB)
  const filterLower = lower(filter)

  function BranchAssetView({ url, placeholder }) {
    if (url) {
      return (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center rounded-xl bg-surface/50 px-3 py-2 text-[12px] font-semibold text-accent ring-1 ring-border/15 hover:bg-surface/70"
        >
          Ver
        </a>
      )
    }
    return <span className="text-muted text-[12px]">{placeholder || '-'}</span>
  }

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

  function setBranchDraftField(branch, field, value) {
    if (!branch?.uuid) return
    setDraftByUuid((prev) => ({
      ...prev,
      [branch.uuid]: { ...(prev[branch.uuid] || {}), uuid: branch.uuid, [field]: value },
    }))
  }

  function onChangeBranchField(e, branch) {
    setBranchDraftField(branch, e.target.name, e.target.value)
  }

  const revokeBlobUrl = (value) => {
    if (typeof value === 'string' && value.startsWith('blob:') && typeof URL !== 'undefined') {
      URL.revokeObjectURL(value)
    }
  }

  function setTempFile(uuid, type, file) {
    if (!uuid) return
    const isQr = type === 'qr'
    const fileSetter = isQr ? setQrFilesByUuid : setLogoFilesByUuid
    const previewSetter = isQr ? setQrPreviewsByUuid : setLogoPreviewsByUuid

    fileSetter((prev) => {
      const next = { ...prev }
      if (file) next[uuid] = file
      else delete next[uuid]
      return next
    })

    previewSetter((prev) => {
      const next = { ...prev }
      const previous = next[uuid]
      if (previous) revokeBlobUrl(previous)
      if (file) next[uuid] = URL.createObjectURL(file)
      else delete next[uuid]
      return next
    })
  }

  function updateAssetRemoval(uuid, type, enabled) {
    if (!uuid) return
    setAssetRemovals((prev) => {
      const next = { ...prev }
      const current = { ...(next[uuid] || {}) }
      if (enabled) current[type] = true
      else delete current[type]
      if (Object.keys(current).length) next[uuid] = current
      else delete next[uuid]
      return next
    })
  }

  const handleAssetSelection = (branch, type) => (event) => {
    const file = event.target.files?.[0] ?? null
    if (!file) return
    setTempFile(branch.uuid, type, file)
    updateAssetRemoval(branch.uuid, type, false)
    event.target.value = ''
  }

  function cancelTempSelection(branch, type) {
    if (!branch?.uuid) return
    setTempFile(branch.uuid, type, null)
  }

  function markAssetForRemoval(branch, type) {
    if (!branch?.uuid) return
    setTempFile(branch.uuid, type, null)
    updateAssetRemoval(branch.uuid, type, true)
  }

  function cleanupBranchAssets(uuid) {
    if (!uuid) return
    setTempFile(uuid, 'qr', null)
    setTempFile(uuid, 'logo', null)
    setAssetRemovals((prev) => {
      const next = { ...prev }
      delete next[uuid]
      return next
    })
  }

  useEffect(() => {
    previewsRef.current = { qr: qrPreviewsByUuid, logo: logoPreviewsByUuid }
  }, [qrPreviewsByUuid, logoPreviewsByUuid])

  useEffect(() => {
    return () => {
      Object.values(previewsRef.current.qr || {}).forEach((value) => revokeBlobUrl(value))
      Object.values(previewsRef.current.logo || {}).forEach((value) => revokeBlobUrl(value))
    }
  }, [])

  function onChangeFilter(e) {
    setFilter(e.target.value)
  }

  function redirectToAdd(uuid) {
    setUserUuid(uuid)
    router.push('/Sucursales/Agregar/')
  }

  async function save(branch) {
    if (!admin) return setUserSuccess?.('No tienes permisos')
    const uuid = branch?.uuid
    if (!uuid) return

    const patch = { ...(draftByUuid[uuid] || {}) }
    const removal = assetRemovals[uuid] || {}
    const qrFile = qrFilesByUuid[uuid]
    const logoFile = logoFilesByUuid[uuid]
    const hasDraft = Object.keys(patch).length > 0
    const hasAssetChanges = Boolean(qrFile || logoFile || removal.qr || removal.logo)
    if (!hasDraft && !hasAssetChanges) return

    const callback = () => {
      setDraftByUuid((prev) => {
        const next = { ...prev }
        delete next[uuid]
        return next
      })
      cleanupBranchAssets(uuid)
      readUserData(`sucursales/${uuid}`, setServicios)
    }

    try {
      setModal('Guardando')

      if (qrFile) {
        patch.qrUrl = await uploadImage(`sucursales/${uuid}/qr`, qrFile)
      } else if (removal.qr) {
        patch.qrUrl = null
      }

      if (logoFile) {
        patch.logoUrl = await uploadImage(`sucursales/${uuid}/logo`, logoFile)
      } else if (removal.logo) {
        patch.logoUrl = null
      }

      Object.keys(patch).forEach((key) => {
        if (patch[key] === undefined) delete patch[key]
      })

      if (!Object.keys(patch).length) {
        cleanupBranchAssets(uuid)
        return
      }

      const res = await writeUserData(`sucursales/${uuid}`, patch, callback)
      if (res?.ok) {
        setUserSuccess?.('Se ha guardado correctamente')
      }
    } catch (err) {
      setUserSuccess?.(err?.code || err?.message || 'repeat')
    } finally {
      setModal('')
    }
  }

  function requestDelete(branch) {
    if (!admin) return setUserSuccess?.('No tienes permisos')
    setUserItem(branch)
    setModal('Delete')
  }

  function deleteConfirm() {
    if (!admin) return setUserSuccess?.('No tienes permisos')
    const callback2 = () => setModal('')
    const callback = () => readUserData(`sucursales/`, setServicios, callback2)
    if (!item?.uuid) return setModal('')
    removeData(`sucursales/${item.uuid}`, setUserSuccess, callback)
  }

  return (
    <DataPanel
      title="Sucursales"
      actions={
        admin ? (
          <Button theme="Primary" styled="w-auto whitespace-nowrap" click={() => redirectToAdd()}>
            Agregar sucursal
          </Button>
        ) : null
      }
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

      <Table className="min-w-[1300px]">
        <THead>
          <tr>
            <th scope="col" className="min-w-[50px] px-3 py-3">
              #
            </th>
            <th scope="col" className="min-w-[210px] px-3 py-3">
              Nombre de sucursal
            </th>
            <th scope="col" className="min-w-[250px] px-3 py-3">
              Direccion
            </th>
            <th scope="col" className="min-w-[200px] px-3 py-3">
              Whatsapp
            </th>
            <th scope="col" className="min-w-[180px] px-3 py-3 text-center">
              QR
            </th>
            <th scope="col" className="min-w-[180px] px-3 py-3 text-center">
              Logo
            </th>
            {admin ? (
              <th scope="col" className="text-center px-3 py-3">
                Accion
              </th>
            ) : null}
          </tr>
        </THead>
        <tbody>
          {pagination.pageItems.map((branch, index) => {
            const uuid = branch?.uuid
            const removal = assetRemovals[uuid] || {}
            const qrPreview = qrPreviewsByUuid[uuid]
            const logoPreview = logoPreviewsByUuid[uuid]
            const hasDraft = Boolean(draftByUuid[branch.uuid])

            return (
              <tr
                className="text-[13px] border-b border-transparent hover:bg-surface/50 odd:bg-surface/20 even:bg-surface/10"
                key={branch?.uuid ?? branch?.nombre ?? index}
              >
                <td className="min-w-[50px] px-3 py-4 text-muted align-middle">{pagination.from + index}</td>
                <td className="min-w-[210px] px-3 py-4 text-text">
                  {admin ? (
                    <input
                      type="text"
                      name="nombre"
                      defaultValue={branch?.nombre || ''}
                      onChange={(e) => onChangeBranchField(e, branch)}
                      className="h-9 w-full rounded-xl bg-surface/60 px-3 text-[12px] text-text ring-1 ring-border/15 outline-none focus:ring-2 focus:ring-accent/25"
                      placeholder="Nombre de sucursal"
                    />
                  ) : (
                    branch?.nombre
                  )}
                </td>
                <td className="min-w-[250px] px-3 py-4 text-text">
                  {admin ? (
                    <textarea
                      rows="1"
                      onChange={(e) => onChangeBranchField(e, branch)}
                      name="direccion"
                      defaultValue={branch?.direccion}
                      className="block w-full resize-none rounded-xl bg-surface/70 p-2.5 text-sm text-text shadow-sm ring-1 ring-border/15 outline-none focus:ring-2 focus:ring-accent/25"
                      placeholder="Escribe aqui..."
                    />
                  ) : (
                    <span className="text-text">{branch?.direccion || '-'}</span>
                  )}
                </td>
                <td className="min-w-[200px] px-3 py-4 text-text">
                  {admin ? (
                    <textarea
                      rows="1"
                      onChange={(e) => onChangeBranchField(e, branch)}
                      name="whatsapp"
                      cols="4"
                      defaultValue={branch?.whatsapp}
                      className="block w-full resize-none rounded-xl bg-surface/70 p-2.5 text-sm text-text shadow-sm ring-1 ring-border/15 outline-none focus:ring-2 focus:ring-accent/25"
                      placeholder="Escribe aqui..."
                    />
                  ) : (
                    <span className="text-text">{branch?.whatsapp || '-'}</span>
                  )}
                </td>
                <td className="px-3 py-4 text-center">
                  {admin ? (
                    <ImageUploadField
                      placeholder="Sin QR"
                      preview={qrPreview || branch?.qrUrl}
                      buttonLabel={qrPreview || branch?.qrUrl ? 'Cambiar QR' : 'Agregar QR'}
                      onSelect={handleAssetSelection(branch, 'qr')}
                      onCancel={qrPreview ? () => cancelTempSelection(branch, 'qr') : undefined}
                      onRemove={branch?.qrUrl && !removal.qr ? () => markAssetForRemoval(branch, 'qr') : undefined}
                      onUndoRemove={removal.qr ? () => updateAssetRemoval(uuid, 'qr', false) : undefined}
                      actionText={qrPreview || branch?.qrUrl ? 'Cambiar' : undefined}
                      catalogMode
                    />
                  ) : (
                    <BranchAssetView url={branch?.qrUrl || null} placeholder="Sin QR" />
                  )}
                </td>
                <td className="px-3 py-4 text-center">
                  {admin ? (
                    <ImageUploadField
                      placeholder="Sin logo"
                      preview={logoPreview || branch?.logoUrl}
                      buttonLabel={logoPreview || branch?.logoUrl ? 'Cambiar logo' : 'Agregar logo'}
                      onSelect={handleAssetSelection(branch, 'logo')}
                      onCancel={logoPreview ? () => cancelTempSelection(branch, 'logo') : undefined}
                      onRemove={branch?.logoUrl && !removal.logo ? () => markAssetForRemoval(branch, 'logo') : undefined}
                      onUndoRemove={removal.logo ? () => updateAssetRemoval(uuid, 'logo', false) : undefined}
                      actionText={logoPreview || branch?.logoUrl ? 'Cambiar' : undefined}
                      catalogMode
                    />
                  ) : (
                    <BranchAssetView url={branch?.logoUrl || null} placeholder="Sin logo" />
                  )}
                </td>
                {admin ? (
                  <td className="min-w-[200px] px-3 py-4 text-center">
                    {hasDraft ? (
                      <Button theme="Primary" click={() => save(branch)}>
                        Guardar
                      </Button>
                    ) : (
                      <Button theme="Danger" click={() => requestDelete(branch)}>
                        Eliminar
                      </Button>
                    )}
                  </td>
                ) : null}
              </tr>
            )
          })}
        </tbody>
      </Table>
    </DataPanel>
  )
}   
          
