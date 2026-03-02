'use client'

import { useEffect, useRef, useState } from 'react'
import ThemeToggle from '@/components/ThemeToggle'
import { useUser } from '@/context'

function IconGear({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
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
}

function Swatch({ label, active, onClick, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'group flex items-center gap-2 rounded-xl px-2.5 py-2 text-left transition outline-none',
        'hover:bg-surface/60 focus-visible:ring-2 focus-visible:ring-accent/35',
        active ? 'bg-surface/60' : '',
      ].join(' ')}
      title={label}
    >
      <span className={['h-6 w-6 rounded-xl ring-1 ring-border/25', className].join(' ')} aria-hidden="true" />
      <span className="text-[12px] font-semibold text-text">{label}</span>
      {active ? <span className="ml-auto text-[12px] text-muted">✓</span> : null}
    </button>
  )
}

export default function AppearanceMenu() {
  const { accent, setAccent } = useUser()
  const [open, setOpen] = useState(false)

  const rootRef = useRef(null)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onDown = (e) => {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target)) setOpen(false)
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sidebar-surface/45 text-nav-text ring-1 ring-sidebar-border/20 transition hover:bg-sidebar-surface/70 focus-visible:ring-2 focus-visible:ring-accent/35"
        aria-label="Apariencia"
        aria-expanded={open}
      >
        <IconGear />
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-[320px] rounded-2xl bg-surface/90 p-3 shadow-2xl ring-1 ring-border/20 backdrop-blur">
          <div className="px-2 pb-2">
            <div className="text-[12px] font-semibold text-text">Apariencia</div>
            <div className="text-[11px] text-muted">Tema, colores y fuente</div>
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl bg-surface/50 p-3 ring-1 ring-border/20">
              <div className="flex items-center justify-between">
                <div className="text-[12px] font-semibold text-text">Tema</div>
                <div className="text-[11px] text-muted">Light / Neutral / Dark</div>
              </div>
              <div className="mt-2">
                <ThemeToggle className="w-full justify-between" tone="app" />
              </div>
            </div>

            <div className="rounded-2xl bg-surface/50 p-3 ring-1 ring-border/20">
              <div className="text-[12px] font-semibold text-text">Acento</div>
              <div className="mt-2 grid grid-cols-2 gap-1">
                <Swatch label="Cyan" active={accent === 'cyan'} onClick={() => setAccent('cyan')} className="bg-cyan-400" />
                <Swatch label="Indigo" active={accent === 'indigo'} onClick={() => setAccent('indigo')} className="bg-indigo-500" />
                <Swatch label="Emerald" active={accent === 'emerald'} onClick={() => setAccent('emerald')} className="bg-emerald-500" />
                <Swatch label="Rose" active={accent === 'rose'} onClick={() => setAccent('rose')} className="bg-rose-500" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
