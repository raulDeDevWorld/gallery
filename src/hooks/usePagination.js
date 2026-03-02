import { useEffect, useMemo, useState } from 'react'

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export function usePagination(
  items,
  {
    initialPage = 1,
    initialPageSize = 10,
    pageSizeOptions = [10, 25, 50, 100],
    resetOn = [],
  } = {}
) {
  const safeItems = Array.isArray(items) ? items : []
  const total = safeItems.length

  const [pageSize, setPageSizeState] = useState(initialPageSize)
  const [page, setPageState] = useState(initialPage)

  const pageCount = Math.max(1, Math.ceil(total / Math.max(1, pageSize)))

  useEffect(() => {
    setPageState((prev) => clamp(prev, 1, pageCount))
  }, [pageCount])

  useEffect(() => {
    setPageState(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, resetOn)

  const setPage = (next) => {
    setPageState((prev) => {
      const raw = typeof next === 'function' ? next(prev) : next
      const n = Number(raw || 1)
      return clamp(Number.isFinite(n) ? n : 1, 1, pageCount)
    })
  }

  const setPageSize = (next) => {
    const n = Number(next || initialPageSize)
    const nextSize = Number.isFinite(n) && n > 0 ? n : initialPageSize
    setPageSizeState(nextSize)
    setPageState(1)
  }

  const { pageItems, from, to } = useMemo(() => {
    if (total === 0) return { pageItems: [], from: 0, to: 0 }
    const start = (page - 1) * pageSize
    const end = Math.min(start + pageSize, total)
    return { pageItems: safeItems.slice(start, end), from: start + 1, to: end }
  }, [page, pageSize, safeItems, total])

  return {
    page,
    pageSize,
    pageSizeOptions,
    total,
    pageCount,
    from,
    to,
    pageItems,
    setPage,
    setPageSize,
    canPrev: page > 1,
    canNext: page < pageCount,
  }
}

