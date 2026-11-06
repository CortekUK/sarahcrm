'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'

// Client-side pagination for admin lists that already hold every row in
// memory. `usePagination(rows, size, resetKey)` slices the current page and
// jumps back to page 1 whenever `resetKey` changes (pass the filters/search);
// <PaginationBar> renders "1–25 of 80 · Previous 1 / 4 Next" under the table
// (hidden when everything fits on one page).

export function usePagination<T>(rows: T[], pageSize = 25, resetKey?: unknown) {
  const [page, setPage] = useState(0)
  useEffect(() => setPage(0), [resetKey])
  const pageCount = Math.ceil(rows.length / pageSize)
  // Rows can drop off (a status change under a filter) — stay in range.
  useEffect(() => {
    if (page > 0 && page >= pageCount) setPage(Math.max(0, pageCount - 1))
  }, [page, pageCount])
  const pageRows = useMemo(
    () => rows.slice(page * pageSize, (page + 1) * pageSize),
    [rows, page, pageSize],
  )
  return { page, setPage, pageCount, pageRows, total: rows.length, pageSize }
}

export function PaginationBar({
  page,
  setPage,
  pageCount,
  total,
  pageSize,
  className,
}: {
  page: number
  setPage: (fn: (p: number) => number) => void
  pageCount: number
  total: number
  pageSize: number
  className?: string
}) {
  if (pageCount <= 1) return null
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 mt-4 text-sm ${className ?? ''}`}>
      <p className="text-text-dim">
        {(page * pageSize + 1).toLocaleString('en-GB')}–
        {Math.min((page + 1) * pageSize, total).toLocaleString('en-GB')} of {total.toLocaleString('en-GB')}
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
          Previous
        </Button>
        <span className="text-text-dim px-2">
          {page + 1} / {pageCount}
        </span>
        <Button size="sm" variant="secondary" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}>
          Next
        </Button>
      </div>
    </div>
  )
}
