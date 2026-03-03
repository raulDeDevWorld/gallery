'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@/context'
import { guardarProducto } from '@/firebase/ops'
import { uploadImage } from '@/firebase/storage'
import { generateUUID } from '@/utils/UIDgenerator'
import { isAdmin } from '@/lib/roles'

import LoaderBlack from '@/components/LoaderBlack'
import Success from '@/components/Success'
import Modal from '@/components/Modal'
import Button from '@/components/Button'

function inputClass(size = 'md') {
  const base = 'w-full text-text placeholder:text-muted outline-none focus:ring-2 focus:ring-accent/25'
  const surface = 'bg-surface/60 ring-1 ring-border/25'
  const dims = size === 'sm' ? 'h-9 rounded-xl px-3 text-[12px]' : 'h-10 rounded-2xl px-4 text-sm'
  return [base, surface, dims].join(' ')
}

function labelClass() {
  return 'mb-2 block text-[12px] font-semibold uppercase tracking-wide text-muted'
}

function Field({ label, children, hint }) {
  return (
    <div>
      {label ? <div className={labelClass()}>{label}</div> : null}
      {children}
      {hint ? <div className="mt-1 text-[12px] text-muted">{hint}</div> : null}
    </div>
  )
}

export default function Page() {
  const router = useRouter()
  const { userDB, perfil, modal, setModal, success, setUserSuccess } = useUser()

  const admin = isAdmin(userDB)

  const formRef = useRef(null)
  const afterRef = useRef('productos') // 'productos' | 'stock'

  const [producto, setProducto] = useState({ marca: '', modelo: '', nombre: '', precio: '', codigo: '' })
  const [postImage, setPostImage] = useState(null)
  const [urlPostImage, setUrlPostImage] = useState(null)

  useEffect(() => {
    if (!perfil) return
   
  }, [perfil, producto.marca])

  function setField(name, value) {
    setProducto((p) => ({ ...p, [name]: value }))
  }

  function manageInputIMG(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPostImage(file)
    setUrlPostImage(URL.createObjectURL(file))
  }

  function clearImage() {
    setPostImage(null)
    setUrlPostImage(null)
  }

  async function save(e) {
    e.preventDefault()
    if (!admin) return setUserSuccess?.('No tienes permisos')

    const marca = String(producto.marca || '').trim()
    const modelo = String(producto.modelo || '').trim()
    const nombre = String(producto.nombre || '').trim()
    const precio = Number(producto.precio || 0)
    const codigo = String(producto.codigo || '').trim()

    if (!marca || !modelo || !nombre || !Number.isFinite(precio) || precio <= 0) {
      return setUserSuccess?.('Completa el formulario')
    }

    try {
      setModal('Guardando')

      const productoId = generateUUID()
      let urlImagen = null
      if (postImage) {
        // Guardamos imagen en Storage y el URL en DB
        // (la ruta de storage no tiene que ser igual a la ruta de DB, pero aquí la igualamos por simplicidad)
        urlImagen = await uploadImage(`productos/${productoId}`, postImage)
      }

      await guardarProducto({
        productoId,
        producto: { marca, modelo, nombre, precio, urlImagen, activo: true, codigo },
      })

      setModal('')
      setUserSuccess?.('Se ha guardado correctamente')
      if (afterRef.current === 'stock') {
        router.push(`/?stock=1&productoId=${encodeURIComponent(productoId)}`)
      } else {
        router.push('/Catalogo')
      }
    } catch (err) {
      setModal('')
      setUserSuccess?.(err?.code || err?.message || 'repeat')
    }
  }

  return (
    <div className="min-h-full px-4 lg:px-8 py-6 pb-[30px] lg:pb-6">
      {modal === 'Guardando' && <LoaderBlack>{modal}</LoaderBlack>}
      {!admin ? (
        <Modal funcion={() => router.back()} alert>
          Solo el admin puede agregar productos.
        </Modal>
      ) : null}

      <form
        ref={formRef}
        className="min-h-[80vh] w-full rounded-3xl bg-surface/40 p-6 lg:p-10 shadow-sm ring-1 ring-border/20 backdrop-blur"
        onSubmit={save}
      >
        <div className="flex flex-col items-center gap-1 pb-4">
          <h3 className="text-[16px] font-semibold text-text">Agregar producto</h3>
          <p className="text-[13px] text-muted">Primero crea el producto. Luego ajusta stock desde Inventario.</p>
        </div>

        <div className="flex w-full justify-center">
          <div className="w-full max-w-[540px] rounded-3xl bg-surface/30 p-5 ring-1 ring-border/15">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[13px] font-semibold text-text">Imagen (opcional)</div>
                <div className="text-[12px] text-muted">Se usa en catálogo y productos.</div>
              </div>
              {urlPostImage ? (
                <button
                  type="button"
                  className="h-9 rounded-xl bg-surface/60 px-3 text-[12px] font-semibold text-text ring-1 ring-border/15 hover:bg-surface"
                  onClick={clearImage}
                >
                  Quitar
                </button>
              ) : null}
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-[220px,1fr]">
              <div className="aspect-[4/3] w-full overflow-hidden rounded-2xl bg-surface/50 ring-1 ring-border/15">
                {urlPostImage ? (
                  <img src={urlPostImage} alt="Preview" className="h-full w-full object-contain" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-[12px] text-muted">Sin imagen</div>
                )}
              </div>

              <div className="flex flex-col justify-center gap-3">
                <label className="inline-flex items-center justify-center rounded-2xl bg-surface/60 px-4 py-3 text-[12px] font-semibold text-text ring-1 ring-border/15 hover:bg-surface cursor-pointer">
                  Cargar imagen
                  <input onChange={manageInputIMG} type="file" className="sr-only" accept="image/*" />
                </label>
                <div className="text-[12px] text-muted">PNG/JPG/GIF · recomendado 800×800.</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
        
          <Field label="Marca">
            <input className={inputClass()} value={producto.marca} onChange={(e) => setField('marca', e.target.value)} placeholder="Nike" />
          </Field>


          <Field label="Modelo">
            <input className={inputClass()} value={producto.modelo} onChange={(e) => setField('modelo', e.target.value)} placeholder="Jordan" />
          </Field>

          <Field label="Nombre">
            <input className={inputClass()} value={producto.nombre} onChange={(e) => setField('nombre', e.target.value)} placeholder="Black" />
          </Field>

          <Field label="Código (opcional)">
            <input className={inputClass()} value={producto.codigo} onChange={(e) => setField('codigo', e.target.value)} placeholder="SKU / interno" />
          </Field>

          <Field label="Precio">
            <input
              className={inputClass()}
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={producto.precio}
              onChange={(e) => setField('precio', e.target.value)}
              placeholder="200"
            />
          </Field>
        </div>

        <div className="mt-8 rounded-3xl bg-surface/30 p-5 ring-1 ring-border/15">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[13px] font-semibold text-text">Siguiente paso: cargar stock</div>
              <div className="text-[12px] text-muted">
                El stock se gestiona por sucursal desde Inventario.
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <Button
                theme="Secondary"
                type="button"
                styled="w-full sm:w-auto whitespace-nowrap"
                click={() => {
                  afterRef.current = 'productos'
                  formRef.current?.requestSubmit()
                }}
              >
                Guardar producto
              </Button>
              {/* <Button
                theme="Primary"
                type="button"
                styled="w-full sm:w-auto whitespace-nowrap"
                click={() => {
                  afterRef.current = 'stock'
                  formRef.current?.requestSubmit()
                }}
              >
                Guardar y cargar stock
              </Button> */}
            </div>
          </div>
        </div>

        {success === 'Se ha guardado correctamente' && <Success>Guardado correctamente</Success>}
      </form>
    </div>
  )
}
