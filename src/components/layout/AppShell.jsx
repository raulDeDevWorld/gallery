'use client'
import { useUser } from '@/context'
import LoaderWithLogo from '@/components/LoaderWithLogo'

import { useEffect, useRef, useState } from 'react'
import { handleSignOut } from '@/firebase/utils'
import { getValue } from '@/firebase/database'
import { useRouter } from 'next/navigation';
import Cart from '@/components/Cart'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import BottomNavigation from '@/components/BottomNavigation'
import Navbar from '@/components/Navbar'
import Modal from '@/components/Modal'
import { useReactPath } from '@/HOCs/useReactPath'
import AppearanceMenu from '@/components/AppearanceMenu'
import { ROLES, canonicalRol, isAdmin, isPersonal, rolLabel } from '@/lib/roles'

function AppShell({ children }) { 
  const { user, userDB, sucursales, setUserCart, setUserSuccess, setUserData, businessData, setUserProduct, setRecetaDB, whatsapp, setWhatsapp, nav, setNav, modal, setModal, cart, introClientVideo, setIntroClientVideo, pendienteDB, setPendienteDB, productDB, videoClientRef, webScann, setWebScann, setTienda, setBusinessData } = useUser() 
  const router = useRouter() 
  const pathname = usePathname() 
  const path = useReactPath(); 
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const redirectedToRegisterRef = useRef(false)
  const checkingUserDbRef = useRef(false)

  const registroCompleto = (u) => {
    const has = (v) => String(v ?? '').trim().length > 0
    return has(u?.nombre) && has(u?.ci) && has(u?.direccion) && has(u?.whatsapp)
  }

  const pageTitle = (() => {
    if (pathname === '/') return 'Inventario'
    const map = {
      '/Pendientes': 'Pendientes',
      '/RegistrarVenta': 'Registrar venta',
      '/Clientes': 'Clientes',
      '/Servicios': 'Catálogo',
      '/Catalogo': 'Catálogo',
      '/Sucursales': 'Sucursales',
      '/Transferencias': 'Transferencias',
      '/Tracking': 'Tracking',
      '/Reportes': 'Reporte histórico',
      '/Personal': 'Personal',
      '/Politicas': 'Políticas',
    }
    for (const [key, value] of Object.entries(map)) {
      if (pathname === key || pathname.startsWith(`${key}/`)) return value
    }
    const last = pathname.split('/').filter(Boolean).at(-1)
    return last ? last.replace(/-/g, ' ') : ''
  })()

  const assignedSucursalId = String(userDB?.sucursalId ?? '').trim()
  const assignedSucursal =
    assignedSucursalId && sucursales && typeof sucursales === 'object'
      ? sucursales[assignedSucursalId] || Object.values(sucursales).find((s) => String(s?.uuid ?? '').trim() === assignedSucursalId) || null
      : null
  const headerLogoSrc = assignedSucursal?.logoUrl || '/logo.png'
  const headerSucursalName =
    String(assignedSucursal?.nombre ?? '').trim() ||
    String(userDB?.sucursalNombre ?? '').trim() ||
    'Sin sucursal asignada'


  const back = (e) => { 
    e?.preventDefault?.() 
    e?.stopPropagation?.() 
    router.back() 
  } 
  function openNav(e) { 
    e.preventDefault() 
    e.stopPropagation() 
    if (isDesktop) {
      setSidebarCollapsed((v) => !v)
      return
    }
    setNav((v) => !v) 
  } 

  const signOutConfirm = async () => {
    handleSignOut()
    setUserCart({})
    setUserProduct(undefined),
      setRecetaDB(undefined),
    setModal('')
    return router.push('/Login')
  }

  const requestSignOut = (e) => {
    e?.preventDefault?.()
    e?.stopPropagation?.()
    setModal('SignOut')
  }

  function sortArray(x, y) {
    if (x['nombre de producto 1'].toLowerCase() < y['nombre de producto 1'].toLowerCase()) { return -1 }
    if (x['nombre de producto 1'].toLowerCase() > y['nombre de producto 1'].toLowerCase()) { return 1 }
    return 0
  }

  const handlerWhatsapp = (e) => {
    e?.preventDefault?.()
    e?.stopPropagation?.()
    setWhatsapp(false)
  }

  const soporte = () => {
    businessData && window.open(`https://api.whatsapp.com/send?phone=+59169941749&text=hola%20necesito%20un%20implante%20de%20osteosintesis%20y%20mi%20cuenta%20esta%20bloqueada%20¿Pueden%20ayudarme?%20`, '_blank')
    setNav(false)
    // setWhatsapp(!whatsapp)
  }

  useEffect(() => { 
    if (user === null) router.replace('/Login') 
  }, [user, router]) 

  useEffect(() => {
    if (!user) return
    if (userDB === undefined) return
    if (redirectedToRegisterRef.current) return

    if (userDB === null) {
      if (checkingUserDbRef.current) return
      checkingUserDbRef.current = true
      let cancelled = false

      ;(async () => {
        try {
          const fresh = await getValue(`usuarios/${user.uid}`).catch(() => null)
          if (cancelled) return
          if (fresh) {
            setUserData(fresh)
            return
          }

          redirectedToRegisterRef.current = true
          router.replace('/Register')
        } finally {
          if (!cancelled) checkingUserDbRef.current = false
        }
      })()

      return () => {
        cancelled = true
      }
      setUserSuccess?.('Completa tu registro (nombre, CI, dirección y whatsapp) para ingresar.')
    }

    if (!registroCompleto(userDB)) {
      redirectedToRegisterRef.current = true
      router.replace('/Register')
    }
  }, [user, userDB, router, setUserData, setUserSuccess])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia('(min-width: 1024px)')
    const update = () => {
      setIsDesktop(media.matches)
      if (media.matches) setNav(false)
    }
    update()
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [setNav])

  useEffect(() => {
    setWhatsapp(false)
  }, [pathname, setWhatsapp])

  // DataApp (perfil del negocio) ya no se usa. La app arranca con auth + usuarios/{uid}.
  const showApp = Boolean(user) && userDB !== undefined
  const rolCanon = canonicalRol(userDB?.rol, ROLES.cliente)
  const canUseDashboard = isAdmin(userDB) || isPersonal(userDB)
  const shouldBlockCliente = showApp && userDB !== undefined && userDB !== null && registroCompleto(userDB) && !canUseDashboard
  const shouldBlockPersonalNoSucursal =
    showApp &&
    userDB !== undefined &&
    userDB !== null &&
    registroCompleto(userDB) &&
    isPersonal(userDB) &&
    String(userDB?.sucursalId ?? '').trim().length === 0

  if (shouldBlockCliente) {
    return (
      <div className="min-h-screen w-screen flex items-center justify-center bg-bg px-6 text-center">
        <div className="w-full max-w-[560px] rounded-3xl border border-border bg-surface shadow-xl p-6">
          <div className="flex flex-col items-center">
            <img src="/logo.png" alt="Logo" className="h-12" />
            <h2 className="mt-4 text-[20px] font-semibold text-text">Solicitud en revision</h2>
            <p className="mt-2 text-[14px] text-muted">
              Tu cuenta aun no esta habilitada para usar el dashboard. Un administrador debe asignarte el rol{' '}
              <span className="font-semibold text-text">Personal</span> o <span className="font-semibold text-text">Administrador</span>.
            </p>

            <div className="mt-4 w-full rounded-2xl bg-surface-2/60 p-4 text-left ring-1 ring-border/15">
              <div className="text-[12px] font-semibold text-muted">Estado</div>
              <div className="mt-1 text-[13px] font-semibold text-text">Rol actual: {rolLabel({ rol: rolCanon })}</div>
              {userDB?.solicitudEstado ? <div className="mt-1 text-[12px] text-muted">Solicitud: {String(userDB.solicitudEstado)}</div> : null}
              {userDB?.rolSolicitado ? <div className="mt-1 text-[12px] text-muted">Rol solicitado: {String(userDB.rolSolicitado)}</div> : null}
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center w-full">
              <button
                type="button"
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-border bg-surface hover:bg-surface-2 text-text transition-colors"
                onClick={() => typeof window !== 'undefined' && window.location.reload()}
              >
                Actualizar
              </button>
              <button
                type="button"
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-accent text-black font-semibold hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent/40"
                onClick={signOutConfirm}
              >
                Cerrar sesion
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (shouldBlockPersonalNoSucursal) {
    return (
      <div className="min-h-screen w-screen flex items-center justify-center bg-bg px-6 text-center">
        <div className="w-full max-w-[560px] rounded-3xl border border-border bg-surface shadow-xl p-6">
          <div className="flex flex-col items-center">
            <img src="/logo.png" alt="Logo" className="h-12" />
            <h2 className="mt-4 text-[20px] font-semibold text-text">Sin sucursal asignada</h2>
            <p className="mt-2 text-[14px] text-muted">
              Tu usuario tiene rol <span className="font-semibold text-text">Personal</span>, pero no tiene una sucursal asignada.
              Un administrador debe asignarte una sucursal para que puedas registrar ventas o gestionar transferencias.
            </p>

            <div className="mt-4 w-full rounded-2xl bg-surface-2/60 p-4 text-left ring-1 ring-border/15">
              <div className="text-[12px] font-semibold text-muted">Estado</div>
              <div className="mt-1 text-[13px] font-semibold text-text">Sucursal: (sin asignar)</div>
              <div className="mt-1 text-[12px] text-muted">Rol actual: {rolLabel({ rol: rolCanon })}</div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center w-full">
              <button
                type="button"
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-border bg-surface hover:bg-surface-2 text-text transition-colors"
                onClick={() => typeof window !== 'undefined' && window.location.reload()}
              >
                Actualizar
              </button>
              <button
                type="button"
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-accent text-black font-semibold hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent/40"
                onClick={signOutConfirm}
              >
                Cerrar sesion
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (

    <div>

          {showApp
 
        ? <div className="h-screen bg-bg text-text"> 
          {userDB && userDB.bloqueado === true ? <Modal funcion={soporte} close={true} cancel={signOutConfirm} cancelText="Cerrar sesión" successText="Contactar">
            Esta cuenta esta bloqueada, <br />por favor comuniquese con soporte.
            <br />
            {/* <button type="button" onClick={soporte} className="text-white bg-red-600 hover:bg-red-800 focus:ring-4 focus:outline-none focus:ring-red-300 dark:focus:ring-red-800 font-medium rounded-lg  inline-flex items-center px-5 py-4 text-center">
              Contactar
            </button> */}
          </Modal> : ''}
          {modal == 'SignOut' && <Modal funcion={signOutConfirm}>
            Estas seguro de salir...? <br /> {Object.keys(cart).length > 0 && 'Tus compras no han sido efectuadas'}
          </Modal>}
          {modal == 'Exit' && <Modal funcion={signOutConfirm}>
            Estas seguro de salir...? <br /> {Object.keys(cart).length > 0 && 'Tus compras no han sido efectuadas'}
          </Modal>}
          <aside 
            className={`app-sidebar fixed top-0 left-0 h-screen w-[88vw] max-w-[320px] sm:w-[288px] py-4 z-50 overflow-y-auto bg-sidebar-bg/80 text-sidebar-text backdrop-blur shadow-2xl shadow-black/20 transition-all ${isDesktop ? (sidebarCollapsed ? '-translate-x-full' : 'translate-x-0') : (nav ? 'translate-x-0' : '-translate-x-full')} lg:w-[288px]`} 
          > 
            {userDB && userDB !== undefined && <Navbar rol={userDB.rol} />} 
          </aside> 

           {nav && <div className='fixed inset-x-0 top-[64px] bottom-0 bg-black/40 z-40 lg:hidden' onClick={() => setNav(false)}></div>}
           {whatsapp && <div className='fixed inset-x-0 top-[64px] bottom-0 bg-[#ffffff00] z-20' onClick={handlerWhatsapp}></div>}

          <main className={`relative min-h-screen bg-bg text-text  lg:pb-0 ${sidebarCollapsed ? 'lg:pl-0' : 'lg:pl-[288px]'}`}>
            <nav className={`w-screen fixed left-0 top-0 flex items-center justify-between px-4 h-[64px] z-30 bg-nav-bg/75 text-nav-text backdrop-blur shadow-sm shadow-black/10 ${sidebarCollapsed ? 'lg:pl-0' : 'lg:pl-[288px]'}`}>

              <div className='flex lg:block z-10'> 
                <div className='flex items-center gap-2'> 
                  <button
                    type="button"
                    className="inline-flex items-center justify-center h-10 w-10 rounded-lg text-nav-text "
                    onClick={openNav}
                    aria-label="Abrir menú"
                  >
                    <svg className="w-[28px] h-[28px]" aria-hidden="true" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                      <path d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" fill="currentColor" clipRule="evenodd"></path>
                    </svg>
                  </button>
                 
                 
                 
                  <span className="lg:hidden max-w-[180px] truncate text-[14px] font-semibold text-nav-text">
                    {pageTitle}
                  </span>
                  <div className="hidden lg:flex items-center gap-3 ml-3">
                    <img src={headerLogoSrc} className="h-[42px] w-auto object-contain" alt={headerSucursalName} />
                    <div className="flex flex-col leading-tight">
                      <span className="text-[13px] font-semibold text-nav-text">{pageTitle}</span> 
                      <span className="text-[11px] text-nav-text/60">{headerSucursalName}</span> 
                    </div> 
                  </div> 
                </div>  
              </div>  
             
              <div className="flex items-center gap-2 z-10">
                {user && <AppearanceMenu />}
                {user && (
                  <button
                    type="button"
                    onClick={requestSignOut}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-sidebar-surface/45 hover:bg-sidebar-surface/70 transition-colors text-nav-text ring-1 ring-sidebar-border/20"
                    title="Cerrar sesión"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M5.30724 15.75L1.8457 12L5.30724 8.25" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M1.8457 12H17.9995" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M9.92383 7V3.25C9.92383 2.91848 10.0454 2.60054 10.2618 2.36612C10.4781 2.1317 10.7717 2 11.0777 2H21.4623C21.7683 2 22.0618 2.1317 22.2782 2.36612C22.4946 2.60054 22.6161 2.91848 22.6161 3.25V20.75C22.6161 21.0815 22.4946 21.3995 22.2782 21.6339C22.0618 21.8683 21.7683 22 21.4623 22H11.0777C10.7717 22 10.4781 21.8683 10.2618 21.6339C10.0454 21.3995 9.92383 21.0815 9.92383 20.75V17" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="hidden sm:inline text-[14px]">Salir</span>
                  </button>
                )}
              </div>
            </nav>
            <div >
                {children}
          
            </div>

            {/* {userDB && userDB !== undefined && <div className="app-bottom-nav fixed bottom-0 z-30 w-full h-16 bg-nav-bg/80 text-nav-text backdrop-blur shadow-sm shadow-black/10 ring-1 ring-sidebar-border/10 lg:hidden">
             
              <BottomNavigation rol={userDB.rol} />
            </div>} */}

          </main>
        </div>

        : <LoaderWithLogo></LoaderWithLogo> 
      } 

    </div>

  )
}






export default AppShell

