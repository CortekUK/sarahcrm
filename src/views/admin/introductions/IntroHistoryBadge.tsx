'use client'

// "3 intros this month · 2 of 4 allowance · 11 total · last 12 Oct" — shown on
// every introduction request row (and in the compose flow) so Sarah can judge
// a member's allowance herself. Amber once this month's count reaches the
// quota. Display-only: requests are never blocked.

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Info } from 'lucide-react'
import { apiClient } from '@/lib/http'
import { cn } from '@/lib/utils'
import type { IntroHistory } from '@/lib/introductions/history'

export const introHistoryKey = (ids: string[]) =>
  ['admin', 'intro-history', [...new Set(ids)].sort().join(',')] as const

// One batched request for every member on screen (max 100).
export function useIntroHistory(memberIds: string[]) {
  const ids = [...new Set(memberIds.filter(Boolean))].sort().slice(0, 100)
  return useQuery({
    queryKey: introHistoryKey(ids),
    enabled: ids.length > 0,
    queryFn: async () =>
      (
        await apiClient.get<{ history: Record<string, IntroHistory> }>(
          '/api/admin/introductions/history',
          { params: { member_ids: ids.join(',') } },
        )
      ).data.history,
    staleTime: 30_000,
  })
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/London',
  })
}

export function IntroHistoryBadge({
  history,
  name,
  className,
}: {
  history: IntroHistory | undefined
  name?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  if (!history) return null

  const { quota, thisMonth, total, pendingRequests, lastIntroAt } = history
  const atLimit = quota > 0 && thisMonth >= quota
  const parts = [
    `${thisMonth} intro${thisMonth === 1 ? '' : 's'} this month`,
    quota > 0 ? `${Math.min(thisMonth, quota)} of ${quota} allowance` : 'no allowance set',
    `${total} total`,
    lastIntroAt ? `last ${shortDate(lastIntroAt)}` : null,
  ].filter(Boolean)
  const who = name ? name.split(' ')[0] : 'This member'

  return (
    <div className={cn('min-w-0', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Introductions made for this member — click for details"
        className={cn(
          'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] text-left transition-colors',
          atLimit
            ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 night:text-amber-300'
            : 'border-border bg-surface-2 text-text-muted hover:text-text',
        )}
      >
        <Info size={11} className="shrink-0" />
        <span className="min-w-0 break-words">
          {name && <span className="font-medium">{who}: </span>}
          {parts.join(' · ')}
          {pendingRequests > 0 && ` · ${pendingRequests} open request${pendingRequests === 1 ? '' : 's'}`}
        </span>
      </button>
      {open && (
        <p className="mt-1.5 max-w-prose text-[11px] leading-relaxed text-text-dim">
          Counts introductions actually made for {who === 'This member' ? 'this member' : who}: member
          introductions once an email has been sent (either side), plus wider-network requests
          marked completed. &ldquo;This month&rdquo; is the calendar month (UK time). Open requests
          are ones still waiting on The Club. {atLimit && 'They have reached their monthly allowance. '}
          The allowance is a guide only — nothing is ever blocked; it&rsquo;s your call.
        </p>
      )}
    </div>
  )
}
