import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const EMPTY_PAGE = Object.freeze({ items: Object.freeze([]), nextAfter: null, hasMore: false })

export function useCursorPagination(fetchPage, { initialPageSize = 25, resetOn = [] } = {}) {
  const fetchRef = useRef(fetchPage)
  fetchRef.current = fetchPage

  const [pageSize, setPageSizeState] = useState(initialPageSize)
  const [pageIndex, setPageIndex] = useState(0) // 0-based
  const [pages, setPages] = useState([]) // [{ items, nextAfter, hasMore }]
  const [loading, setLoading] = useState(false)

  const loadFirstPage = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchRef.current({ after: null, limit: pageSize })
      setPages([res])
      setPageIndex(0)
    } finally {
      setLoading(false)
    }
  }, [pageSize])

  const reset = useCallback(() => {
    setPages([])
    setPageIndex(0)
  }, [])

  useEffect(() => {
    reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize, ...resetOn])

  useEffect(() => {
    if (pages.length) return
    loadFirstPage()
  }, [loadFirstPage, pages.length])

  const current = pages[pageIndex] || EMPTY_PAGE

  const next = useCallback(async () => {
    const nextIndex = pageIndex + 1
    if (pages[nextIndex]) return setPageIndex(nextIndex)
    if (!current.hasMore) return
    setLoading(true)
    try {
      const res = await fetchRef.current({ after: current.nextAfter, limit: pageSize })
      setPages((prev) => {
        const nextPages = prev.slice()
        nextPages[nextIndex] = res
        return nextPages
      })
      setPageIndex(nextIndex)
    } finally {
      setLoading(false)
    }
  }, [current.hasMore, current.nextAfter, pageIndex, pageSize, pages])

  const prev = useCallback(() => {
    setPageIndex((p) => Math.max(0, p - 1))
  }, [])

  const refresh = useCallback(async () => {
    reset()
    await loadFirstPage()
  }, [loadFirstPage, reset])

  const setPageSize = useCallback((n) => {
    const nextSize = Math.max(1, Number(n) || initialPageSize)
    setPageSizeState(nextSize)
  }, [initialPageSize])

  const page = pageIndex + 1
  const from = pageIndex * pageSize + 1
  const to = from + (current.items?.length || 0) - 1

  return useMemo(
    () => ({
      page,
      pageSize,
      items: current.items || [],
      loading,
      canPrev: pageIndex > 0,
      canNext: Boolean(pages[pageIndex + 1]) || Boolean(current.hasMore),
      from: current.items?.length ? from : 0,
      to: current.items?.length ? to : 0,
      setPageSize,
      next,
      prev,
      refresh,
      reset,
    }),
    [current.hasMore, current.items, from, loading, next, page, pageIndex, pageSize, pages, prev, refresh, reset, setPageSize, to]
  )
}
