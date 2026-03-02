'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import DataPanel from '@/components/DataPanel'
import Table, { THead } from '@/components/Table'
import Button from '@/components/Button'
import Modal from '@/components/Modal'
import LoaderBlack from '@/components/LoaderBlack'
import TablePager from '@/components/TablePager'
import { useCursorPagination } from '@/hooks/useCursorPagination'
import { getPagedData } from '@/firebase/database'
import { uploadImage } from '@/firebase/storage'
import { guardarProducto } from '@/firebase/ops'
import { lower } from '@/lib/string'
import { isAdmin } from '@/lib/roles'
import { useUser } from '@/context/'

export default function ProductsPage() {
  const router = useRouter()
  const { userDB, modal, setModal, msg, setUserSuccess, setUserItem, item } = useUser()
  const admin = isAdmin(userDB)

  const [searchBy, setSearchBy] = useState('nombreLower') // nombreLower|marcaLower|modeloLower
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')

  const [draft, setDraft] = useState({}) // { [productoId]: { marca, modelo, nombre, precio, activo } }
  const [postImage, setPostImage] = useState({})
  const [urlPostImage, setUrlPostImage] = useState({})

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 250)
    return () => clearTimeout(t)
  }, [search])

  const searchLower = lower(searchDebounced).trim()

  const fetchPage = useCallback(
    async ({ after, limit }) => {
      if (searchLower) {
        return getPagedData('productos', {
          orderBy: 'child',
          childKey: searchBy,
          range: { start: searchLower, end: `${searchLower}\uf8ff` },
          after,
          limit,
        })
      }
      return getPagedData('productos', {
        orderBy: 'child',
        childKey: 'nombreLower',
        after,
        limit,
      })
    },
    [searchBy, searchLower]
  )

  const cursor = useCursorPagination(fetchPage, { initialPageSize: 10, resetOn: [searchBy, searchLower] })

  const actions = useMemo(() => {
    return (
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        <label className="inline-flex items-center gap-2 text-[12px] text-muted">
          <span className="hidden sm:inline">Buscar en</span>
          <select
            value={searchBy}
            onChange={(e) => setSearchBy(e.target.value)}
            className="h-10 rounded-2xl bg-surface/60 px-3 text-[12px] text-text ring-1 ring-border/25 outline-none focus:ring-2 focus:ring-accent/25"
          >
            <option value="nombreLower">Nombre</option>
            <option value="marcaLower">Marca</option>
            <option value="modeloLower">Modelo</option>
          </select>
        </label>

        {admin ? (
          <Button theme="Primary" styled="w-full sm:w-auto whitespace-nowrap" click={() => router.push('/Catalogo/Agregar')}>
            Agregar producto
          </Button>
        ) : (
          <div className="rounded-2xl bg-surface/40 px-3 py-2 text-[12px] text-muted ring-1 ring-border/15">
            Solo el admin puede agregar/editar productos.
          </div>
        )}
      </div>
    )
  }, [admin, router, searchBy])

  function setDraftField(productoId, field, value) {
    setDraft((prev) => ({
      ...prev,
      [productoId]: { ...(prev[productoId] || {}), [field]: value },
    }))
  }

  function manageInputIMG(e, productoId) {
    const file = e.target.files?.[0]
    if (!file) return
    setPostImage((p) => ({ ...p, [productoId]: file }))
    setUrlPostImage((p) => ({ ...p, [productoId]: URL.createObjectURL(file) }))
  }

  async function save(p) {
    if (!admin) return
    const productoId = p?.__key
    if (!productoId) return

    try {
      setModal('Guardando')

      const marca = draft?.[productoId]?.marca ?? p?.marca ?? ''
      const modelo = draft?.[productoId]?.modelo ?? p?.modelo ?? ''
      const nombre = draft?.[productoId]?.nombre ?? p?.nombre ?? ''
      const precio = draft?.[productoId]?.precio ?? p?.precio ?? 0
      const activo = draft?.[productoId]?.activo ?? p?.activo ?? true

      let urlImagen = p?.urlImagen ?? null
      if (postImage[productoId]) {
        urlImagen = await uploadImage(`productos/${productoId}`, postImage[productoId])
      }

      await guardarProducto({
        productoId,
        marcaLowerAnterior: p?.marcaLower,
        producto: { marca, modelo, nombre, precio, activo, urlImagen, creadoEn: p?.creadoEn },
      })

      setDraft((prev) => {
        const next = { ...prev }
        delete next[productoId]
        return next
      })
      setPostImage((prev) => {
        const next = { ...prev }
        delete next[productoId]
        return next
      })
      setUrlPostImage((prev) => {
        const next = { ...prev }
        delete next[productoId]
        return next
      })

      setModal('')
      setUserSuccess?.('Se ha guardado correctamente')
      cursor.refresh()
    } catch (err) {
      setModal('')
      setUserSuccess?.(err?.code || err?.message || 'repeat')
    }
  }

  function requestDeactivate(p) {
    if (!admin) return
    setUserItem?.(p)
    setModal('Delete')
  }

  async function deactivateConfirm() {
    if (!admin) return setModal('')
    const p = item
    const productoId = p?.__key
    if (!productoId) return setModal('')

    try {
      setModal('Guardando')
      await guardarProducto({
        productoId,
        marcaLowerAnterior: p?.marcaLower,
        producto: {
          marca: p?.marca,
          modelo: p?.modelo,
          nombre: p?.nombre,
          precio: p?.precio,
          urlImagen: p?.urlImagen ?? null,
          activo: false,
          creadoEn: p?.creadoEn,
        },
      })
      setModal('')
      setUserSuccess?.('Eliminado correctamente')
      cursor.refresh()
    } catch (err) {
      setModal('')
      setUserSuccess?.(err?.code || err?.message || 'repeat')
    }
  }

  return (
    <DataPanel
      title="Productos"
      subtitle="Catálogo (marca, modelo, nombre, precio)"
      actions={actions}
      scroll="x"
      filter={{
        value: search,
        onChange: (e) => setSearch(e.target.value),
        placeholder:
          searchBy === 'marcaLower' ? 'Buscar por marca...' : searchBy === 'modeloLower' ? 'Buscar por modelo...' : 'Buscar por nombre...',
      }}
      footer={
        <TablePager
          mode="cursor"
          page={cursor.page}
          total={null}
          from={cursor.from}
          to={cursor.to}
          pageSize={cursor.pageSize}
          pageSizeOptions={[10, 25, 50, 100]}
          canPrev={cursor.canPrev}
          canNext={cursor.canNext}
          onPageChange={(nextPage) => {
            if (Number(nextPage) > cursor.page) cursor.next()
            else cursor.prev()
          }}
          onPageSizeChange={cursor.setPageSize}
        />
      }
    >
      {modal === 'Guardando' && <LoaderBlack>{modal}</LoaderBlack>}
      {modal === 'Delete' && (
        <Modal funcion={deactivateConfirm}>
          ¿Desactivar el producto <span className="font-semibold">{msg || item?.nombre || item?.__key}</span>?
        </Modal>
      )}

      <Table minWidth={1100}>
        <THead>
          <tr>
            <th scope="col" className="min-w-[80px] px-3 py-3">
              Marca
            </th>
            <th scope="col" className="min-w-[120px] px-3 py-3">
              Modelo
            </th>
            <th scope="col" className="min-w-[140px] px-3 py-3">
              Nombre
            </th>
            <th scope="col" className="min-w-[90px] px-3 py-3 text-right">
              Precio
            </th>
            <th scope="col" className="min-w-[80px] px-3 py-3 text-center">
              Activo
            </th>
            <th scope="col" className="min-w-[120px] px-3 py-3">
              Imagen
            </th>
            <th scope="col" className="min-w-[200px] px-3 py-3 text-center">
              Acción
            </th>
          </tr>
        </THead>
        <tbody>
          {cursor.loading && cursor.items.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-[13px] text-muted">
                Cargando...
              </td>
            </tr>
          ) : cursor.items.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-[13px] text-muted">
                Sin resultados.
              </td>
            </tr>
          ) : (
            cursor.items.map((p) => {
              const productoId = p?.__key
              const d = draft?.[productoId] || {}
              return (
                <tr
                  key={productoId}
                  className="text-[13px] border-b border-transparent hover:bg-surface/50 odd:bg-surface/20 even:bg-surface/10"
                >
                  <td className="px-3 py-3 text-text">
                    {admin ? (
                      <input
                        className="h-9 w-full rounded-xl bg-surface/60 px-3 text-[12px] text-text ring-1 ring-border/15 outline-none focus:ring-2 focus:ring-accent/25"
                        defaultValue={p.marca || ''}
                        onChange={(e) => setDraftField(productoId, 'marca', e.target.value)}
                      />
                    ) : (
                      p.marca
                    )}
                  </td>
                  <td className="px-3 py-3 text-text">
                    {admin ? (
                      <input
                        className="h-9 w-full rounded-xl bg-surface/60 px-3 text-[12px] text-text ring-1 ring-border/15 outline-none focus:ring-2 focus:ring-accent/25"
                        defaultValue={p.modelo || ''}
                        onChange={(e) => setDraftField(productoId, 'modelo', e.target.value)}
                      />
                    ) : (
                      p.modelo
                    )}
                  </td>
                  <td className="px-3 py-3 text-text">
                    {admin ? (
                      <input
                        className="h-9 w-full rounded-xl bg-surface/60 px-3 text-[12px] text-text ring-1 ring-border/15 outline-none focus:ring-2 focus:ring-accent/25"
                        defaultValue={p.nombre || ''}
                        onChange={(e) => setDraftField(productoId, 'nombre', e.target.value)}
                      />
                    ) : (
                      p.nombre
                    )}
                  </td>
                  <td className="px-3 py-3 text-text text-right">
                    {admin ? (
                      <input
                        type="number"
                        className="h-9 w-[120px] rounded-xl bg-surface/60 px-3 text-[12px] text-text ring-1 ring-border/15 outline-none focus:ring-2 focus:ring-accent/25 text-right"
                        defaultValue={Number(p.precio || 0)}
                        onChange={(e) => setDraftField(productoId, 'precio', Number(e.target.value))}
                      />
                    ) : (
                      Number(p.precio || 0)
                    )}
                  </td>
                  <td className="px-3 py-3 text-text text-center">
                    <span
                      className={[
                        'inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ring-1',
                        p.activo === false ? 'bg-surface/50 text-muted ring-border/15' : 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/20',
                      ].join(' ')}
                    >
                      {p.activo === false ? 'No' : 'Sí'}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 overflow-hidden rounded-xl bg-surface/40 ring-1 ring-border/15">
                        <img
                          src={urlPostImage[productoId] || p.urlImagen || p.url || '/logo.png'}
                          alt="Producto"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      {admin ? (
                        <label className="cursor-pointer text-[12px] text-muted hover:text-text">
                          Cambiar
                          <input className="hidden" type="file" accept="image/*" onChange={(e) => manageInputIMG(e, productoId)} />
                        </label>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center">
                    {!admin ? null : (
                      <div className="flex items-center justify-center">
                        {d.marca != null || d.modelo != null || d.nombre != null || d.precio != null || postImage[productoId] ? (
                          <Button theme="Primary" styled="w-auto whitespace-nowrap" click={() => save(p)}>
                            Guardar
                          </Button>
                        ) : (
                          <Button theme="Danger" styled="w-auto whitespace-nowrap" click={() => requestDeactivate(p)}>
                            Desactivar
                          </Button>
                        )}
                      </div>
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
