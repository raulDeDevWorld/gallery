'use client'

function IconChevron({ dir = 'left', className = 'h-4 w-4' }) {
  const d = dir === 'left' ? 'M15 18L9 12L15 6' : 'M9 18L15 12L9 6'
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function buildPages(page, pageCount) {
  if (!pageCount || pageCount <= 1) return [page]
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1)

  const pages = new Set([1, pageCount, page - 1, page, page + 1])
  const sorted = Array.from(pages)
    .filter((p) => p >= 1 && p <= pageCount)
    .sort((a, b) => a - b)

  const out = []
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]
    const prev = sorted[i - 1]
    if (prev && p - prev > 1) out.push('…')
    out.push(p)
  }
  return out
}

export default function TablePager({
  mode = 'pages', // 'pages' | 'cursor'
  page,
  pageCount,
  total,
  from,
  to,
  pageSize,
  pageSizeOptions = [10, 25, 50, 100],
  onPageChange,
  onPageSizeChange,
  canPrev,
  canNext,
  className = '',
  compact = false,
}) {
  const showNumbers = mode === 'pages' && Boolean(pageCount)
  const pages = showNumbers ? buildPages(page, pageCount) : []
  const resolvedCanPrev = typeof canPrev === 'boolean' ? canPrev : page > 1
  const resolvedCanNext =
    typeof canNext === 'boolean'
      ? canNext
      : pageCount
        ? page < pageCount
        : true

  return (
    <div
      className={[
        'flex flex-col gap-3 rounded-2xl bg-surface/50 p-3 ring-1 ring-border/15 backdrop-blur',
        'sm:flex-row sm:items-center sm:justify-between',
        className,
      ].join(' ')}
    >
      <div className="text-[12px] text-muted">
        {total === 0 ? (
          <span>
            0 resultados <span className="opacity-60">•</span> <span className="font-semibold text-text">{pageSize}</span> filas/página
          </span>
        ) : total == null ? (
          <span>
            Mostrando <span className="font-semibold text-text">{from}</span>–<span className="font-semibold text-text">{to}</span>
            <span className="opacity-60"> • </span>
            Página <span className="font-semibold text-text">{page}</span>
            {pageCount ? (
              <>
                /<span className="font-semibold text-text">{pageCount}</span>
              </>
            ) : null}
            <span className="opacity-60"> • </span>
            <span className="font-semibold text-text">{pageSize}</span> filas/página
          </span>
        ) : (
          <span>
            Mostrando <span className="font-semibold text-text">{from}</span>–<span className="font-semibold text-text">{to}</span> de{' '}
            <span className="font-semibold text-text">{total}</span>
            <span className="opacity-60"> • </span>
            Página <span className="font-semibold text-text">{page}</span>/<span className="font-semibold text-text">{pageCount}</span>
            <span className="opacity-60"> • </span>
            <span className="font-semibold text-text">{pageSize}</span> filas/página
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 justify-between sm:justify-end">
        {!compact && onPageSizeChange ? (
          <label className="inline-flex items-center gap-2 text-[12px] text-muted">
            <span className="hidden sm:inline">Filas</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
              className="h-9 rounded-xl bg-surface/70 px-2.5 text-[12px] text-text shadow-sm ring-1 ring-border/15 outline-none focus:ring-2 focus:ring-accent/25"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange?.(page - 1)}
            disabled={!resolvedCanPrev}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-surface/60 text-text ring-1 ring-border/15 transition hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Página anterior"
          >
            <IconChevron dir="left" />
          </button>

          {showNumbers ? (
            <div className="hidden sm:flex items-center gap-1 px-1">
              {pages.map((p, idx) =>
                p === '…' ? (
                  <span key={`ellipsis-${idx}`} className="px-2 text-[12px] text-muted">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onPageChange?.(p)}
                    className={[
                      'h-9 min-w-9 px-2 rounded-xl text-[12px] font-semibold ring-1 transition',
                      p === page
                        ? 'bg-accent text-black ring-accent/40'
                        : 'bg-surface/60 text-text ring-border/15 hover:bg-surface',
                    ].join(' ')}
                    aria-current={p === page ? 'page' : undefined}
                  >
                    {p}
                  </button>
                )
              )}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => onPageChange?.(page + 1)}
            disabled={!resolvedCanNext}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-surface/60 text-text ring-1 ring-border/15 transition hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Página siguiente"
          >
            <IconChevron dir="right" />
          </button>
        </div>
      </div>
    </div>
  )
}
