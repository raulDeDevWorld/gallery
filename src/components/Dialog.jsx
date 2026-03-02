'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function Dialog({ open, title, subtitle, children, footer, onClose }) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    const prevPad = document.body.style.paddingRight
    const scrollBar = typeof window !== 'undefined' ? window.innerWidth - document.documentElement.clientWidth : 0
    document.body.style.overflow = 'hidden'
    if (scrollBar > 0) document.body.style.paddingRight = `${scrollBar}px`

    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prev
      document.body.style.paddingRight = prevPad
    }
  }, [open, onClose])

  if (!open) return null
  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[1000000002] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/55 backdrop-blur-[1px]" aria-label="Cerrar" onClick={onClose} />

      <div className="relative w-full max-w-2xl rounded-3xl bg-surface/95 text-text shadow-2xl ring-1 ring-border/20 backdrop-blur">
        <div className="flex items-start justify-between gap-3 px-6 pt-6">
          <div className="min-w-0">
            {title ? <div className="truncate text-[15px] font-semibold">{title}</div> : null}
            {subtitle ? <div className="mt-1 text-[12px] text-muted">{subtitle}</div> : null}
          </div>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-surface/60 text-muted ring-1 ring-border/15 transition hover:bg-surface hover:text-text"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5">{children}</div>

        {footer ? (
          <div className="flex flex-col-reverse gap-2 border-t border-border/15 px-6 py-4 sm:flex-row sm:items-center sm:justify-end">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  )
}
