'use client'

import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useUser } from '@/context/'

function Icon({ tone = 'danger' }) {
  const color = tone === 'danger' ? 'text-red-500' : tone === 'info' ? 'text-accent' : 'text-muted'
  return (
    <div className={['mx-auto grid h-12 w-12 place-items-center rounded-2xl ring-1 ring-border/20', color].join(' ')}>
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
        <path
          d="M12 9v4m0 4h.01M10.29 3.86l-7.1 12.27A2 2 0 005 19h14a2 2 0 001.73-2.99l-7.1-12.27a2 2 0 00-3.46 0Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

export default function Modal({
  title,
  children,
  funcion,
  alert = false,
  close = true,
  cancel,
  cancelText = 'Cancelar',
  successText,
}) {
  const { msg, setModal } = useUser()

  const tone = alert ? 'info' : 'danger'
  const okText = useMemo(() => {
    if (typeof successText === 'string' && successText.trim()) return successText
    return alert ? 'Entendido' : 'Sí, confirmar'
  }, [alert, successText])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (e) => {
      if (e.key === 'Escape') setModal?.('')
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prev
    }
  }, [setModal])

  if (typeof document === 'undefined') return null

  const onConfirm = () => {
    if (typeof funcion === 'function') return funcion()
    setModal?.('')
  }

  const onCancel = () => {
    if (typeof cancel === 'function') return cancel()
    setModal?.('')
  }

  return createPortal(
    <div className="fixed inset-0 z-[1000000001]">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={alert ? onCancel : undefined} />

      <div className="relative mx-auto flex min-h-full max-w-[520px] items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          className="w-full overflow-hidden rounded-3xl bg-surface/95 shadow-2xl ring-1 ring-border/20 backdrop-blur"
        >
          <div className="relative p-6">
            {close ? (
              <button
                type="button"
                onClick={onCancel}
                className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-surface/60 text-muted ring-1 ring-border/15 transition hover:bg-surface hover:text-text focus-visible:ring-2 focus-visible:ring-accent/35"
                aria-label="Cerrar"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </button>
            ) : null}

            <Icon tone={tone} />

            <div className="mt-4 text-center">
              {title ? <h3 className="text-[16px] font-semibold text-text">{title}</h3> : null}
              <div className="mt-2 text-[13px] leading-relaxed text-muted">
                <div className="break-words">{children}</div>
                {msg ? <div className="mt-2 break-words text-text/90">{msg}</div> : null}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border/10 bg-surface/50 p-4">
            {alert ? (
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex h-10 items-center justify-center rounded-2xl bg-surface/60 px-4 text-[12px] font-semibold text-text ring-1 ring-border/15 transition hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/35"
              >
                {okText}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onCancel}
                  className="inline-flex h-10 items-center justify-center rounded-2xl bg-surface/60 px-4 text-[12px] font-semibold text-text ring-1 ring-border/15 transition hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/35"
                >
                  {cancelText}
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  className="inline-flex h-10 items-center justify-center rounded-2xl bg-red-500 px-4 text-[12px] font-semibold text-white ring-1 ring-red-500/25 transition hover:bg-red-500/90 focus-visible:ring-2 focus-visible:ring-red-500/40"
                >
                  {okText}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
