'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUser } from '@/context'
import { getRol, isAdmin, rolLabel } from '@/lib/roles'

function Icon({ name, className = 'h-5 w-5' }) {
  const common = { className, viewBox: '0 0 24 24', fill: 'none', xmlns: 'http://www.w3.org/2000/svg', 'aria-hidden': true }

  switch (name) {
    case 'inventory':
      return (
        <svg {...common}>
          <path d="M4 7h16M6 7V5a2 2 0 012-2h8a2 2 0 012 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M6 7l-1 14h14L18 7" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      )
    case 'pending':
      return (
        <svg {...common}>
          <path d="M9 11h6M9 15h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M7 4h10a2 2 0 012 2v14H5V6a2 2 0 012-2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      )
    case 'sale':
      return (
        <svg {...common}>
          <path d="M7 7h10M7 11h10M7 15h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M6 3h12v18H6V3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      )
    case 'users':
      return (
        <svg {...common}>
          <path d="M16 11a4 4 0 10-8 0 4 4 0 008 0Z" stroke="currentColor" strokeWidth="2" />
          <path d="M4 21a8 8 0 0116 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )
    case 'services':
      return (
        <svg {...common}>
          <path d="M12 2l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 7.3l5-.7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M4 22h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )
    case 'branches':
      return (
        <svg {...common}>
          <path d="M12 21s7-4.5 7-11a7 7 0 10-14 0c0 6.5 7 11 7 11Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M12 10.5a2 2 0 100-4 2 2 0 000 4Z" stroke="currentColor" strokeWidth="2" />
        </svg>
      )
    case 'tracking':
      return (
        <svg {...common}>
          <path d="M3 12h4l2 6 4-12 2 6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'reports':
      return (
        <svg {...common}>
          <path d="M4 19V5a2 2 0 012-2h8l6 6v10a2 2 0 01-2 2H6a2 2 0 01-2-2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M14 3v6h6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M8 13h8M8 17h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )
    case 'settings':
      return (
        <svg {...common}>
          <path
            d="M12 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7Z"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M19.4 15a7.9 7.9 0 00.1-1 7.9 7.9 0 00-.1-1l2-1.6-2-3.4-2.4 1a8 8 0 00-1.7-1L14 3h-4L9.1 8a8 8 0 00-1.7 1l-2.4-1-2 3.4 2 1.6a7.9 7.9 0 00-.1 1 7.9 7.9 0 00.1 1l-2 1.6 2 3.4 2.4-1a8 8 0 001.7 1L10 21h4l.9-5a8 8 0 001.7-1l2.4 1 2-3.4-2-1.6Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'shield':
      return (
        <svg {...common}>
          <path d="M12 2l8 4v6c0 5-3.4 9.4-8 10-4.6-.6-8-5-8-10V6l8-4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M9.5 12l1.8 1.8 3.8-3.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'help':
      return (
        <svg {...common}>
          <path d="M12 22a10 10 0 110-20 10 10 0 010 20Z" stroke="currentColor" strokeWidth="2" />
          <path d="M9.5 9a2.5 2.5 0 014.4 1.6c0 1.9-2 2.1-2 3.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M12 17h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )
    case 'logout':
      return (
        <svg {...common}>
          <path d="M10 16l-4-4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6 12h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M14 4h6v16h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    default:
      return null
  }
}

function NavItem({ href, icon, label, active, onClick }) { 
  return ( 
    <Link 
      href={href} 
      onClick={onClick} 
      className={[ 
        'group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition outline-none', 
        'focus-visible:ring-2 focus-visible:ring-accent/35', 
        active ? 'bg-sidebar-surface/70 text-sidebar-text' : 'bg-sidebar-surface/20 text-sidebar-muted hover:bg-sidebar-surface/45 hover:text-sidebar-text', 
      ].join(' ')} 
    > 
      {active ? <span className="absolute left-1.5 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-accent/90" aria-hidden="true" /> : null}
      <span
        className={[
          'inline-flex h-9 w-9 items-center justify-center rounded-xl transition',
          active ? 'bg-accent/15 text-accent' : 'bg-sidebar-surface/55 text-sidebar-muted group-hover:bg-sidebar-surface/75 group-hover:text-sidebar-text',
        ].join(' ')}
      >
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <span className="flex-1">{label}</span>
    </Link>
  )
}

export default function Navbar({ rol }) {
  const { user, userDB, setModal, perfil, setNav } = useUser()
  const pathname = usePathname()

  const role = getRol(rol || userDB)

  const closeNav = () => setNav?.(false)

  const avatar = userDB?.fotoURL || user?.photoURL || user?.photoUrl || null
  const displayName = userDB?.nombre || user?.displayName || 'Usuario'

  const navItems = useMemoNav(role)

  const signOutHandler = () => setModal?.('SignOut')

  const redirectSupport = () => {
    const phone = perfil?.whatsapp ? String(perfil.whatsapp).replaceAll(' ', '') : '+59169941749'
    window.open(
      `https://api.whatsapp.com/send?phone=${phone}&text=hola%20necesito%20ayuda%20con%20mi%20cuenta`,
      '_blank'
    )
    closeNav()
  }

  const isActive = (href) => {
    if (href === '/') return pathname === '/'
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  return (
    <div className="flex h-full flex-col ">
      <div className="relative px-4 pb-4 pt-4">
        <button
          type="button"
          className="absolute right-3 top-3 sm:hidden inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sidebar-surface/55 text-sidebar-muted transition hover:bg-sidebar-surface/80 hover:text-sidebar-text focus-visible:ring-2 focus-visible:ring-accent/35"
          onClick={closeNav}
          aria-label="Cerrar menú"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </button>

        <div className="flex items-center gap-3">
          <div className="h-12 w-12 overflow-hidden rounded-2xl bg-sidebar-surface/70 shadow-sm shadow-black/10">
            {avatar ? <img src={avatar} className="h-full w-full object-cover" alt="Avatar" /> : <img src="/logo.png" className="h-full w-full object-contain p-2" alt="Logo" />}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-sidebar-text">{displayName}</div>
            <div className="truncate text-[12px] text-sidebar-muted">{rolLabel(role)}</div>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-4 bottom-0 h-px bg-gradient-to-r from-transparent via-sidebar-border/25 to-transparent" aria-hidden="true" />
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-5">
          {navItems.map((section) => (
            <div key={section.label}>
              <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-sidebar-muted/80">
                {section.label}
              </div>
              <div className="space-y-2">
                {section.items.map((it) => (
                  <NavItem
                    key={it.href}
                    href={it.href}
                    icon={it.icon}
                    label={it.label}
                    active={isActive(it.href)}
                    onClick={closeNav}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="relative px-3 py-4">
        <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-sidebar-border/25 to-transparent" aria-hidden="true" />
        <div className="space-y-2">
          <button
            type="button"
            onClick={redirectSupport}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-sidebar-muted transition hover:bg-sidebar-surface/50 hover:text-sidebar-text focus-visible:ring-2 focus-visible:ring-accent/35"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sidebar-surface/60">
              <Icon name="help" className="h-5 w-5" />
            </span>
            <span className="flex-1 text-left">Soporte</span>
          </button>

          <button
            type="button"
            onClick={signOutHandler}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-sidebar-muted transition hover:bg-sidebar-surface/50 hover:text-sidebar-text focus-visible:ring-2 focus-visible:ring-accent/35"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sidebar-surface/60">
              <Icon name="logout" className="h-5 w-5" />
            </span>
            <span className="flex-1 text-left">Cerrar sesión</span>
          </button>
        </div>
      </div>
    </div>
  )
} 

function useMemoNav(role) { 
  const admin = isAdmin(role)
  const base = [ 
    { 
      label: 'Panel', 
      items: [ 
        { href: '/', label: 'Inventario', icon: 'inventory' }, 
        { href: '/Catalogo', label: 'Catálogo', icon: 'services' },
        { href: '/Sucursales', label: 'Sucursales', icon: 'branches' }, 
        { href: '/Personal', label: 'Personal', icon: 'users' }, 
        ...(admin ? [{ href: '/Reportes', label: 'Reporte histórico', icon: 'reports' }] : []),
      ], 
    }, 
  ] 


  return base
}
