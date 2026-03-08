'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useUser } from '@/context/'
import Tolkipt from '@/components/Tolkipt'
import { normalizeRol, ROLES } from '@/lib/roles'

export default function Select({ arr, name, click, defaultValue, uuid }) {
  const { success } = useUser()

  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const options = useMemo(() => (Array.isArray(arr) ? arr.filter((x) => x != null) : []), [arr])
  const initial = defaultValue != null ? defaultValue : options[0]

  const [value, setValue] = useState(initial)
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const [pos, setPos] = useState(null)

  useEffect(() => {
    if (defaultValue != null) setValue(defaultValue)
  }, [defaultValue])

  const formatLabel = (raw) => {
    const v = String(raw ?? '')
    if (name !== 'rol') return v
    const rol = normalizeRol(v)
    if (!rol) return v
    if (rol === ROLES.admin) return 'Administrador'
    if (rol === ROLES.personal) return 'Personal'
    if (rol === ROLES.cliente) return 'Cliente'
    return rol.charAt(0).toUpperCase() + rol.slice(1)
  }

  const toneClass = useMemo(() => {
    const v = String(value ?? '').trim()
    if (v === 'No disponible') return 'bg-red-500/10 ring-red-500/25 text-text'
    if (v === 'Inmediato') return 'bg-emerald-500/10 ring-emerald-500/25 text-text'
    if (v === 'En 24 hrs') return 'bg-amber-500/10 ring-amber-500/25 text-text'
    if (v === 'Pendiente') return 'bg-zinc-500/10 ring-zinc-500/20 text-text'
    if (v === 'Entregado') return 'bg-emerald-500/10 ring-emerald-500/25 text-text'
    if (v === 'Concluido') return 'bg-amber-500/10 ring-amber-500/25 text-text'
    return ''
  }, [value])

  function syncPos() {
    const el = triggerRef.current
    if (!el || typeof window === 'undefined') return

    const r = el.getBoundingClientRect()
    const maxH = 240
    const gap = 8
    const minW = 180

    const width = Math.max(minW, r.width)
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8)
    const downTop = r.bottom + gap
    const upTop = Math.max(8, r.top - gap - maxH)
    const openDown = downTop + maxH <= window.innerHeight

    setPos({ left, top: openDown ? downTop : upTop, width, maxH })
  }

  useEffect(() => {
    if (!open) return
    syncPos()

    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onResize = () => syncPos()
    const onScroll = () => syncPos()

    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onScroll, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function onToggle(e) {
    e?.preventDefault?.()
    e?.stopPropagation?.()
    setOpen((v) => !v)
  }

  function onPick(next) {
    setValue(next)
    setOpen(false)
    if (typeof click === 'function') click(name, next, uuid)
  }

  return (
    <div className="relative w-full">
      {options.includes('Chuquisaca') ? (
        <div className="absolute w-full top-[-80px]">
          {success === 'Importand' ? (
            <Tolkipt>
              Esta informacion es importante,
              <br /> por favor revisa que sea correcta.
            </Tolkipt>
          ) : null}
        </div>
      ) : null}

      <button
        ref={triggerRef}
        type="button"
        onClick={onToggle}
        className={`relative inline-flex w-full items-center justify-between gap-3 rounded-2xl bg-surface px-3 py-2.5 text-[13px] font-semibold text-text shadow-sm ring-1 ring-border/20 transition hover:bg-surface/95 focus:outline-none focus:ring-2 focus:ring-accent/25 ${toneClass}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="min-w-0 truncate">{formatLabel(value)}</span>
        <span className={`shrink-0 text-muted transition ${open ? 'rotate-[-90deg]' : 'rotate-90'}`}>{'>'}</span>
      </button>

      {mounted && open && pos
        ? createPortal(
            <div className="fixed inset-0 z-[100000]">
              <button type="button" className="absolute inset-0 cursor-default" onClick={() => setOpen(false)} aria-label="Cerrar" />

              <div
                className="fixed overflow-hidden rounded-2xl bg-surface text-text shadow-2xl ring-1 ring-border/25"
                style={{ left: pos.left, top: pos.top, width: pos.width }}
                role="listbox"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="max-h-[240px] overflow-y-auto p-1">
                  {options.map((opt, index) => {
                    const selected = String(opt) === String(value)
                    return (
                      <button
                        key={`${String(opt)}-${index}`}
                        type="button"
                        className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-[13px] font-semibold transition ${
                          selected ? 'bg-accent/15 text-text ring-1 ring-accent/20' : 'hover:bg-surface-2/60'
                        }`}
                        onClick={() => onPick(opt)}
                      >
                        <span className="min-w-0 truncate">{formatLabel(opt)}</span>
                        {selected ? <span className="text-[12px] font-semibold text-muted">Actual</span> : null}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  )
}
