'use client'

import { useEffect, useRef, useState } from 'react'

function PagerButton({ dir, onClick }) {
  const isPrev = dir === 'prev'

  return (
    <button
      type="button"
      aria-label={isPrev ? 'Desplazar a la izquierda' : 'Desplazar a la derecha'}
      onClick={onClick}
      className={[
        'fixed text-[20px] text-muted h-12 w-12 rounded-full inline-flex items-center justify-center top-0 bottom-0 my-auto',
        'bg-surface/50 ring-1 ring-border/20 shadow-sm backdrop-blur z-20 hover:bg-surface',
        isPrev ? 'left-2 lg:left-[20px]' : 'right-2 lg:right-[20px]',
      ].join(' ')}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d={isPrev ? 'M15 18L9 12L15 6' : 'M9 18L15 12L9 6'}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

export default function DataPanel({
  title,
  subtitle,
  actions,
  filter,
  footer,
  children,
  className = '',
  panelClassName = '',
  scroll = 'auto', // 'auto' | 'x'
  pager = 'auto', // 'auto' | true | false
}) {
  const scrollRef = useRef(null)
  const [canScrollX, setCanScrollX] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const check = () => {
      setCanScrollX(el.scrollWidth > el.clientWidth + 4)
    }

    check()

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null
    ro?.observe(el)
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(check) : null
    mo?.observe(el, { childList: true, subtree: true, characterData: true })
    window.addEventListener?.('resize', check)

    return () => {
      ro?.disconnect?.()
      mo?.disconnect?.()
      window.removeEventListener?.('resize', check)
    }
  }, [])


  const showPager = pager === true || (pager === 'auto' && canScrollX)

  const overflowClass = scroll === 'x' ? 'overflow-x-auto' : 'overflow-auto'

  return (
    <div className="px-4 lg:px-5 pt-[92px] pb-[88px] lg:pb-10    w-full overflow-y-auto">
     
     
     {(title || actions || subtitle || filter) && (
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                {title && <h3 className="font-medium text-[16px]">{title}</h3>}
                {subtitle && <p className="mt-1 text-[13px] text-muted">{subtitle}</p>}
              </div>

              {actions ? <div className="w-full sm:w-auto">{actions}</div> : null}
            </div>
          )}

          {filter ? (
            <>
              <div className="flex justify-center w-full">
                <input
                  type="text"
                  className="h-10 w-full max-w-[340px] rounded-2xl bg-surface/60 px-4 text-sm text-text placeholder:text-muted ring-1 ring-border/25 outline-none focus:ring-2 focus:ring-accent/25"
                  onChange={filter.onChange}
                  {...(filter.value === undefined ? { defaultValue: filter.defaultValue } : { value: filter.value })}
                  placeholder={filter.placeholder || 'Filtrar'}
                />
              </div>
              <br />
            </>
          ) : null}
     
      <div className={`h-full ${className}`}>
        <div
          ref={scrollRef}
          className={[
            'relative  w-full scroll-smooth  bg-surface/40 rounded-md shadow-sm backdrop-blur',
            overflowClass,
            panelClassName,
          ].join(' ')}
        >
          {children}
        </div>
        {footer ? <div className="mt-4">{footer}</div> : null}
      </div>
    </div>
  )
}
