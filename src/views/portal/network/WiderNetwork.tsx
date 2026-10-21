'use client'

// "Wider network" half of the directory — the club's CRM contacts who aren't
// members, shown as name / role · company / sector only. Infinite-scrolled in
// 24-row keyset pages (never loads everything); the only action is asking
// The Club for an introduction.

import { useEffect, useRef, useState } from 'react'
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query'
import { Globe2, Handshake } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { PortalButton, PortalCard, PortalEmptyState, PortalLoading } from '@/components/portal/PortalChrome'
import { apiClient, getApiErrorMessage } from '@/lib/http'
import type {
  DirectoryContact,
  DirectoryContactsPage,
  DirectorySector,
} from '@/lib/directory/types'
import { FilterChip, FilterRow } from './filters'
import { RequestIntroModal } from './RequestIntroModal'

const PAGE_SIZE = 24
const KEY = ['portal', 'directory', 'contacts'] as const

interface Props {
  search: string // already debounced by the page
  onRequested: () => void // page shows the shared toast
}

export function WiderNetwork({ search, onRequested }: Props) {
  const qc = useQueryClient()
  const [sector, setSector] = useState<string | null>(null)
  const [target, setTarget] = useState<DirectoryContact | null>(null)
  const sentinel = useRef<HTMLDivElement>(null)

  const sectorsQuery = useQuery({
    queryKey: ['portal', 'directory', 'sectors'],
    queryFn: async () =>
      (await apiClient.get<{ sectors: DirectorySector[] }>('/api/portal/directory/sectors')).data
        .sectors,
    staleTime: 5 * 60_000,
  })

  const listKey = [...KEY, search, sector ?? ''] as const
  const list = useInfiniteQuery({
    queryKey: listKey,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) =>
      (
        await apiClient.get<DirectoryContactsPage>('/api/portal/directory/contacts', {
          signal,
          params: {
            q: search || undefined,
            sector: sector ?? undefined,
            cursor: pageParam ?? undefined,
            limit: PAGE_SIZE,
          },
        })
      ).data,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 60_000,
  })

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list

  // Load the next page as the sentinel nears the viewport.
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasNextPage) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) fetchNextPage()
      },
      { rootMargin: '600px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  function markRequested(id: string) {
    qc.setQueriesData<InfiniteData<DirectoryContactsPage>>({ queryKey: KEY }, (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((p) => ({
              ...p,
              contacts: p.contacts.map((c) => (c.id === id ? { ...c, requested: true } : c)),
            })),
          }
        : data,
    )
  }

  async function submitRequest(reason: string, desiredOutcome: string): Promise<string | null> {
    if (!target) return null
    try {
      await apiClient.post(`/api/portal/directory/contacts/${target.id}/request-intro`, {
        reason,
        desired_outcome: desiredOutcome || undefined,
      })
    } catch (e) {
      const msg = getApiErrorMessage(e, 'Could not send your request.')
      // 409 → already requested; reflect that on the card too.
      if (msg.toLowerCase().includes('already')) markRequested(target.id)
      return msg
    }
    markRequested(target.id)
    setTarget(null)
    onRequested()
    return null
  }

  const contacts = list.data?.pages.flatMap((p) => p.contacts) ?? []
  const sectors = sectorsQuery.data ?? []

  return (
    <div className="min-w-0">
      {sectors.length > 0 && (
        <div className="mb-10">
          <FilterRow label="Industry">
            <FilterChip label="All" active={sector === null} onClick={() => setSector(null)} />
            {sectors.map((s) => (
              <FilterChip
                key={s.key}
                label={s.label}
                active={sector === s.key}
                onClick={() => setSector(sector === s.key ? null : s.key)}
              />
            ))}
          </FilterRow>
        </div>
      )}

      {list.isPending ? (
        <PortalLoading label="Loading the wider network" />
      ) : list.isError ? (
        <PortalEmptyState
          icon={<Globe2 size={18} strokeWidth={1.5} />}
          title="The wider network is unavailable just now."
          description="Please try again in a moment."
        />
      ) : contacts.length === 0 ? (
        <PortalEmptyState
          icon={<Globe2 size={18} strokeWidth={1.5} />}
          title="No one matches your search."
          description="Try a different keyword or clear the industry filter."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
            {contacts.map((c) => (
              <ContactCard key={c.id} contact={c} onRequest={() => setTarget(c)} />
            ))}
          </div>
          <div ref={sentinel} aria-hidden className="h-px" />
          {isFetchingNextPage && (
            <div className="mt-8">
              <PortalLoading label="Loading more" />
            </div>
          )}
          {!hasNextPage && contacts.length > PAGE_SIZE && (
            <p className="mt-10 text-center font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.28em] text-slate-dim">
              End of the list
            </p>
          )}
        </>
      )}

      <RequestIntroModal
        open={target !== null}
        targetName={target ? [target.name, target.company].filter(Boolean).join(', ') : ''}
        onClose={() => setTarget(null)}
        onSubmit={submitRequest}
      />
    </div>
  )
}

function ContactCard({ contact, onRequest }: { contact: DirectoryContact; onRequest: () => void }) {
  return (
    <PortalCard className="p-6 flex flex-col">
      <div className="flex items-start gap-4 min-w-0">
        <Avatar name={contact.name} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="font-[family-name:var(--font-display)] text-[15.5px] text-ivory leading-tight truncate">
            {contact.name}
          </h3>
          {contact.role && (
            <p className="mt-1 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.22em] text-bronze-light/85 truncate">
              {contact.role}
            </p>
          )}
          {contact.company && (
            <p
              className="mt-1 font-[family-name:var(--font-editorial)] italic text-[12.5px] text-ivory-soft/80 truncate"
              title={contact.company}
            >
              {contact.company}
            </p>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 min-w-0">
        {contact.sectorLabel ? (
          <span className="max-w-full truncate px-2.5 py-0.5 text-[9.5px] font-[family-name:var(--font-meta)] uppercase tracking-[0.18em] rounded-full border border-bronze/45 bg-bronze/10 text-bronze-light day:border-bronze/55 day:bg-bronze/15 day:text-bronze-dark">
            {contact.sectorLabel}
          </span>
        ) : (
          <span />
        )}
        {contact.requested ? (
          <span className="font-[family-name:var(--font-editorial)] italic text-[12.5px] text-bronze-light day:text-bronze-dark">
            Requested
          </span>
        ) : (
          <PortalButton
            size="sm"
            variant="secondary"
            icon={<Handshake size={12} strokeWidth={1.5} />}
            onClick={onRequest}
          >
            Request introduction
          </PortalButton>
        )}
      </div>
    </PortalCard>
  )
}
