'use client'

// Admin "Calls" — every call answered by the AI phone receptionist
// (services/voice). Newest first, keyset-paged 25 at a time with TanStack
// useInfiniteQuery, filter chips by outcome, and a detail modal (summary,
// captured details, call-back request, CRM links, transcript, Mark handled).
// Deep link: /dashboard/calls?call=<id> (used by admin notifications + tasks).
//
// Reads go straight to Supabase with the browser client under admin RLS
// (voice_calls: admins SELECT + UPDATE). All time formatting happens after
// mount (data is client-fetched), so there's nothing to mismatch on hydrate.

import { useCallback, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Phone, PhoneIncoming, UserRound, ContactRound } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { useAuth } from '@/providers/AuthProvider'
import { toast } from '@/lib/hooks/use-toast'
import { cn } from '@/lib/utils'
import { CallDetailModal } from './CallDetailModal'
import {
  callerLabel,
  displayPhone,
  fetchCallsPage,
  fetchUnhandledCount,
  FILTERS,
  formatDuration,
  formatWhen,
  INTEREST_LABELS,
  isMissingTable,
  OUTCOME_META,
  setHandled,
  type CallDetail,
  type CallFilter,
  type CallRow,
} from './calls-data'

function MatchBadge({ call }: { call: CallRow }) {
  if (call.member_id) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gold-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-gold">
        <UserRound size={10} /> Member
      </span>
    )
  }
  if (call.contact_id) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-text-muted">
        <ContactRound size={10} /> Contact
      </span>
    )
  }
  return null
}

function OutcomeBadge({ call }: { call: CallRow }) {
  if (!call.outcome) return <Badge variant="draft">In progress</Badge>
  const meta = OUTCOME_META[call.outcome]
  return <Badge variant={meta.variant}>{meta.label}</Badge>
}

function subline(call: CallRow): string {
  const bits = [
    call.caller_name ? displayPhone(call.from_number) : null,
    call.caller_company,
    call.interest ? INTEREST_LABELS[call.interest] ?? call.interest : null,
  ].filter(Boolean)
  return bits.join(' · ')
}

export function CallsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const openId = params.get('call')
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<CallFilter>('all')

  const list = useInfiniteQuery({
    queryKey: ['voice-calls', 'list', filter],
    queryFn: ({ pageParam }) => fetchCallsPage(filter, pageParam),
    initialPageParam: null as { at: string; id: string } | null,
    getNextPageParam: (last) => last.next,
  })

  const unhandled = useQuery({
    queryKey: ['voice-calls', 'unhandled-count'],
    queryFn: fetchUnhandledCount,
    retry: false,
  })

  const openCall = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(params.toString())
      if (id) next.set('call', id)
      else next.delete('call')
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [params, pathname, router],
  )

  const toggle = useMutation({
    mutationFn: (call: CallDetail) => setHandled(call.id, profile?.id ?? null, !call.handled_at),
    onSuccess: (_d, call) => {
      toast({ title: call.handled_at ? 'Marked as unhandled' : 'Marked as handled' })
      queryClient.invalidateQueries({ queryKey: ['voice-calls'] })
    },
    onError: (e) => toast({ title: 'Could not update the call', description: (e as Error).message, variant: 'destructive' }),
  })

  const rows = list.data?.pages.flatMap((p) => p.rows) ?? []
  const loadError = list.error ? (list.error as Error).message : null

  return (
    <div className="p-4 md:p-8">
      <AdminPageHeader
        title="Calls"
        description="Calls answered by The Club's AI phone receptionist. Each call has an AI summary, the details the caller gave, any call-back request and the full transcript. Mark a call handled once someone has followed it up."
        meta={
          unhandled.data !== undefined ? (
            <span className="text-xs text-text-dim">
              {unhandled.data} call{unhandled.data === 1 ? '' : 's'} awaiting follow-up
            </span>
          ) : undefined
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              'px-3 py-1.5 text-xs rounded-full border transition-colors whitespace-nowrap',
              filter === f.key
                ? 'bg-gold text-white border-gold'
                : 'bg-[var(--color-surface)] text-text-muted border-border hover:border-border-hover hover:text-text',
            )}
          >
            {f.label}
            {f.key === 'unhandled' && unhandled.data ? <span className="ml-1.5 opacity-70">{unhandled.data}</span> : null}
          </button>
        ))}
      </div>

      {list.isLoading ? (
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading calls…</span>
        </div>
      ) : loadError ? (
        <Card>
          <CardContent className="p-0">
            <AdminEmptyState
              icon={AlertTriangle}
              title={isMissingTable(loadError) ? 'Calls aren’t set up yet' : 'Couldn’t load calls'}
              description={
                isMissingTable(loadError)
                  ? 'The call log table doesn’t exist yet. Apply supabase/migrations/20261028_voice_calls.sql, then calls answered by the phone receptionist will appear here.'
                  : loadError
              }
            />
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <AdminEmptyState
              icon={PhoneIncoming}
              title={filter === 'all' ? 'No calls yet' : 'No calls match this filter'}
              description={
                filter === 'all'
                  ? 'When someone rings The Club’s number, the AI receptionist answers and the call appears here with a summary and transcript.'
                  : 'Try another filter.'
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden md:block">
            <CardContent className="p-0 overflow-x-auto">
              <Table className="min-w-[820px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[150px]">When</TableHead>
                    <TableHead className="min-w-[260px]">Caller</TableHead>
                    <TableHead className="w-[90px]">Duration</TableHead>
                    <TableHead className="w-[140px]">Outcome</TableHead>
                    <TableHead className="min-w-[220px]">Summary</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((c) => (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => openCall(c.id)}>
                      <TableCell className="text-[13px] text-text-muted whitespace-nowrap">{formatWhen(c.started_at)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-[13.5px] font-medium text-text truncate">{callerLabel(c)}</p>
                          <MatchBadge call={c} />
                        </div>
                        {subline(c) && <p className="mt-0.5 text-[11px] text-text-dim truncate">{subline(c)}</p>}
                      </TableCell>
                      <TableCell className="text-[13px] text-text-muted tabular-nums">{formatDuration(c.duration_s)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <OutcomeBadge call={c} />
                          {c.escalated && c.outcome !== 'escalated' && <Badge variant="urgent">Escalated</Badge>}
                          {c.handled_at && (
                            <CheckCircle2 size={14} className="text-accent" aria-label="Handled" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-[12.5px] text-text-muted line-clamp-2">{c.summary || '—'}</p>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2.5">
            {rows.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => openCall(c.id)}
                className="w-full text-left rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3 shadow-[var(--shadow-card)] active:border-border-hover"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Phone size={13} className="shrink-0 text-gold" />
                      <p className="text-sm font-medium text-text truncate">{callerLabel(c)}</p>
                    </div>
                    <p className="mt-0.5 text-[11px] text-text-dim">
                      {formatWhen(c.started_at)} · {formatDuration(c.duration_s)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <OutcomeBadge call={c} />
                    {c.handled_at && <CheckCircle2 size={14} className="text-accent" aria-label="Handled" />}
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <MatchBadge call={c} />
                  {c.escalated && c.outcome !== 'escalated' && <Badge variant="urgent">Escalated</Badge>}
                </div>
                {c.summary && <p className="mt-1.5 text-xs text-text-muted line-clamp-3">{c.summary}</p>}
              </button>
            ))}
          </div>

          {list.hasNextPage && (
            <div className="mt-5 flex justify-center">
              <Button variant="secondary" loading={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}

      <CallDetailModal
        callId={openId}
        onClose={() => openCall(null)}
        onToggleHandled={(call) => toggle.mutate(call)}
        toggling={toggle.isPending}
      />
    </div>
  )
}
