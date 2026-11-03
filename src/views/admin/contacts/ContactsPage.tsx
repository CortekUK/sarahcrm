'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui'
import { StatCard } from '@/components/ui/StatCard'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { toast } from '@/lib/hooks/use-toast'
import { apiClient } from '@/lib/http'
import { cn } from '@/lib/utils'
import { SECTOR_LABELS } from '@/lib/contacts/sectors'
import { ImportContactsModal } from './ImportContactsModal'
import { EnrichContactsModal, type EnrichScope } from './EnrichContactsModal'
import { EnrichSelectionModal } from './EnrichSelectionModal'
import { ContactDetailDrawer, type Contact } from './ContactDetailDrawer'
import { Search, Upload, MailCheck, Loader2, Sparkles, X, Contact as ContactIcon } from 'lucide-react'

// The club's general contact database — ~11k event guests, past enquiries and
// leads from the me&u export plus Sarah's own address book, enriched by Clay.
//
// Deliberately NOT the Members list: these people have no login and no
// membership. The point of the screen is segmentation — "show me everyone in
// Hospitality" — which then feeds marketing campaigns and the sponsorship
// warm pool.
//
// Reads through /api/admin/contacts rather than the browser Supabase client
// because `contacts` is absent from src/types/database.ts (same as Inbox).

const PAGE_SIZE = 50

interface SectorStat {
  key: string
  label: string
  count: number
}

function fullName(c: Contact): string {
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || '—'
}

export function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<{ total: number; subscribed: number; sectors: SectorStat[] }>({
    total: 0,
    subscribed: 0,
    sectors: [],
  })
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [sector, setSector] = useState('all')
  const [subscribedOnly, setSubscribedOnly] = useState(false)
  const [page, setPage] = useState(0)

  const [importOpen, setImportOpen] = useState(false)
  // Bulk dialog (whole table) vs. the selection dialog (ticked rows). The
  // selection is snapshotted into state when opened, so the dialog doesn't
  // restart if the list re-renders underneath it.
  const [enrichOpen, setEnrichOpen] = useState(false)
  const [selectionRun, setSelectionRun] = useState<{ scope: EnrichScope; count: number } | null>(null)

  // Row selection. `allMatching` = every contact matching the current filters
  // (Gmail-style "select all N"), not just the ticked rows on this page.
  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  const [allMatching, setAllMatching] = useState(false)
  const [selected, setSelected] = useState<Contact | null>(null)

  // Debounce the search box — typing into 11k rows shouldn't fire a query per
  // keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim())
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const queryString = useMemo(() => {
    const sp = new URLSearchParams()
    if (debounced) sp.set('q', debounced)
    if (sector !== 'all') sp.set('sector', sector)
    if (subscribedOnly) sp.set('subscribed', '1')
    return sp.toString()
  }, [debounced, sector, subscribedOnly])

  // A stale in-flight response must never overwrite a newer one — the filter
  // pills are fast to click.
  const requestId = useRef(0)

  const loadList = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    try {
      const sp = new URLSearchParams(queryString)
      sp.set('limit', String(PAGE_SIZE))
      sp.set('offset', String(page * PAGE_SIZE))
      const res = await fetch(`/api/admin/contacts?${sp}`)
      const json = await res.json()
      if (id !== requestId.current) return
      if (!res.ok) {
        toast({ title: 'Could not load contacts', description: json.error, variant: 'destructive' })
        return
      }
      setContacts(json.contacts ?? [])
      setTotal(json.total ?? 0)
    } catch {
      if (id === requestId.current) {
        toast({ title: 'Could not load contacts', description: 'Network error.', variant: 'destructive' })
      }
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [queryString, page])

  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const sp = new URLSearchParams()
      if (debounced) sp.set('q', debounced)
      if (subscribedOnly) sp.set('subscribed', '1')
      const res = await fetch(`/api/admin/contacts/stats?${sp}`)
      const json = await res.json()
      if (res.ok) setStats(json)
    } finally {
      setStatsLoading(false)
    }
    // Sector is deliberately NOT a dependency — the pill counts must stay
    // stable when you click between sectors.
  }, [debounced, subscribedOnly])

  // Deep link (?contact=<id>, e.g. from a wider-network intro request) opens
  // that contact's drawer straight away.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('contact')
    if (!id) return
    apiClient
      .get<{ contact: Contact }>(`/api/admin/contacts/${id}`)
      .then(({ data }) => setSelected(data.contact))
      .catch(() => toast({ title: 'Contact not found', variant: 'destructive' }))
  }, [])

  useEffect(() => {
    loadList()
  }, [loadList])
  useEffect(() => {
    loadStats()
  }, [loadStats])

  function refreshAll() {
    loadList()
    loadStats()
  }

  // A new search / sector / consent filter is a new list — drop the selection.
  useEffect(() => {
    setPicked(new Set())
    setAllMatching(false)
  }, [queryString])

  const pageIds = contacts.map((c) => c.id)
  const pageAllPicked = pageIds.length > 0 && pageIds.every((id) => picked.has(id))
  const pageSomePicked = pageIds.some((id) => picked.has(id))
  const selectedCount = allMatching ? total : picked.size

  function togglePage() {
    setAllMatching(false)
    setPicked((prev) => {
      const next = new Set(prev)
      if (pageAllPicked) pageIds.forEach((id) => next.delete(id))
      else pageIds.forEach((id) => next.add(id))
      return next
    })
  }

  function toggleOne(id: string) {
    if (allMatching) {
      // Leaving "all matching" mode: keep this page's rows minus the one untick.
      setAllMatching(false)
      setPicked(new Set(pageIds.filter((x) => x !== id)))
      return
    }
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearSelection() {
    setPicked(new Set())
    setAllMatching(false)
  }

  function enrichSelection() {
    if (allMatching) {
      setSelectionRun({ scope: { filter: { q: debounced, sector, subscribed: subscribedOnly } }, count: total })
    } else {
      setSelectionRun({ scope: { ids: Array.from(picked) }, count: picked.size })
    }
  }

  const pageCount = Math.ceil(total / PAGE_SIZE)
  const shownSectors = stats.sectors.filter((s) => s.count > 0 || s.key === sector)

  return (
    <div className="p-4 md:p-8">
      <AdminPageHeader
        title="Contacts"
        description="The club's full contact database — event guests, past enquiries and leads. Segment by sector to build a marketing audience or a sponsorship prospect pool. These are contacts, not members: they have no portal login."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<Sparkles size={15} />} onClick={() => setEnrichOpen(true)}>
              Enrich all with Clay
            </Button>
            <Button icon={<Upload size={15} />} onClick={() => setImportOpen(true)}>
              Import CSV
            </Button>
          </div>
        }
      />

      {/* Headline counts */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Total contacts"
          value={stats.total.toLocaleString('en-GB')}
          changeText="in the database"
          changeType="neutral"
        />
        <StatCard
          label="Emailable"
          value={stats.subscribed.toLocaleString('en-GB')}
          changeText={
            stats.total > 0
              ? `${(stats.total - stats.subscribed).toLocaleString('en-GB')} opted out`
              : '—'
          }
          changeType="neutral"
        />
        <StatCard
          label="Segmented"
          value={(
            stats.total - (stats.sectors.find((s) => s.key === 'unsegmented')?.count ?? 0)
          ).toLocaleString('en-GB')}
          changeText="have a sector"
          changeType="neutral"
        />
      </div>

      {/* Search + consent filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim pointer-events-none"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or company…"
            className="w-full pl-9 pr-3 py-2.5 rounded-[var(--radius-md)] bg-surface border border-border text-sm text-text placeholder:text-text-dim focus:outline-none focus:border-gold/50 transition-colors"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setSubscribedOnly((v) => !v)
            setPage(0)
          }}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 rounded-[var(--radius-md)] border text-sm transition-colors whitespace-nowrap',
            subscribedOnly
              ? 'border-gold/40 bg-gold-muted text-gold-dark'
              : 'border-border bg-surface text-text-muted hover:text-text',
          )}
        >
          <MailCheck size={15} />
          Emailable only
        </button>
      </div>

      {/* Sector pills — the segmentation control */}
      <div className="flex flex-wrap gap-2 mb-5">
        <SectorPill
          label="All"
          count={stats.total}
          active={sector === 'all'}
          onClick={() => {
            setSector('all')
            setPage(0)
          }}
        />
        {shownSectors.map((s) => (
          <SectorPill
            key={s.key}
            label={s.label}
            count={s.count}
            active={sector === s.key}
            muted={s.key === 'unsegmented'}
            onClick={() => {
              setSector(s.key)
              setPage(0)
            }}
          />
        ))}
        {statsLoading && <Loader2 size={15} className="animate-spin text-text-dim self-center" />}
      </div>

      {/* Selection bar */}
      {selectedCount > 0 && (
        <div className="mb-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 rounded-[var(--radius-md)] border border-gold/30 bg-gold-muted/40 px-4 py-2.5">
          <p className="text-sm text-text flex-1">
            <strong>{selectedCount.toLocaleString('en-GB')}</strong> selected
            {!allMatching && pageAllPicked && total > contacts.length && (
              <>
                {' · '}
                <button
                  type="button"
                  onClick={() => setAllMatching(true)}
                  className="text-gold-dark underline underline-offset-2 hover:text-gold"
                >
                  Select all {total.toLocaleString('en-GB')} matching contacts
                </button>
              </>
            )}
            {allMatching && <span className="text-text-muted"> · every contact matching the current filters</span>}
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" icon={<Sparkles size={14} />} onClick={enrichSelection}>
              Enrich selected with Clay
            </Button>
            <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={clearSelection}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* The list */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="px-6 py-16 text-center text-sm text-text-dim">
              <Loader2 size={18} className="animate-spin mx-auto mb-3" />
              Loading contacts…
            </div>
          ) : contacts.length === 0 ? (
            <AdminEmptyState
              icon={ContactIcon}
              title={stats.total === 0 ? 'No contacts yet' : 'No matches'}
              description={
                stats.total === 0
                  ? 'Import a CSV to load the contact database. Uploading the same file twice is safe — contacts are matched on email.'
                  : 'Try a different sector, or clear your search.'
              }
              action={
                stats.total === 0 ? (
                  <Button icon={<Upload size={15} />} onClick={() => setImportOpen(true)}>
                    Import CSV
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10 pr-0">
                    <RowCheckbox
                      checked={allMatching || pageAllPicked}
                      indeterminate={!allMatching && !pageAllPicked && pageSomePicked}
                      onChange={togglePage}
                      label="Select every contact on this page"
                    />
                  </TableHead>
                  <TableHead className="min-w-[220px]">Contact</TableHead>
                  <TableHead className="w-[200px]">Company</TableHead>
                  <TableHead className="w-[170px]">Sector</TableHead>
                  <TableHead className="w-[130px]">City</TableHead>
                  <TableHead className="w-[110px]">Email</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer"
                    onClick={() => setSelected(c)}
                  >
                    <TableCell className="w-10 pr-0" onClick={(e) => e.stopPropagation()}>
                      <RowCheckbox
                        checked={allMatching || picked.has(c.id)}
                        onChange={() => toggleOne(c.id)}
                        label={`Select ${fullName(c) === '—' ? c.email : fullName(c)}`}
                      />
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-text">{fullName(c)}</p>
                      <p className="text-xs text-text-dim truncate">{c.email}</p>
                    </TableCell>
                    <TableCell className="text-text-muted">
                      {c.company_name ?? '—'}
                      {c.job_title && (
                        <span className="block text-xs text-text-dim truncate">{c.job_title}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.sector === 'unsegmented' ? 'draft' : 'info'}>
                        {SECTOR_LABELS[c.sector] ?? c.sector}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-text-muted">{c.city ?? '—'}</TableCell>
                    <TableCell>
                      {c.email_subscribed ? (
                        <Badge variant="active" dot>
                          Subscribed
                        </Badge>
                      ) : (
                        <Badge variant="urgent" dot>
                          Opted out
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <p className="text-text-dim">
            {(page * PAGE_SIZE + 1).toLocaleString('en-GB')}–
            {Math.min((page + 1) * PAGE_SIZE, total).toLocaleString('en-GB')} of{' '}
            {total.toLocaleString('en-GB')}
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <span className="text-text-dim px-2">
              {page + 1} / {pageCount}
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={page + 1 >= pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <ImportContactsModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={refreshAll}
      />

      <EnrichContactsModal open={enrichOpen} onClose={() => setEnrichOpen(false)} onEnriched={refreshAll} />

      {selectionRun && (
        <EnrichSelectionModal
          open
          scope={selectionRun.scope}
          count={selectionRun.count}
          onClose={() => setSelectionRun(null)}
          onEnriched={refreshAll}
        />
      )}

      <ContactDetailDrawer
        contact={selected}
        onClose={() => setSelected(null)}
        onSaved={refreshAll}
      />
    </div>
  )
}

function SectorPill({
  label,
  count,
  active,
  muted,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  muted?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-full border text-[13px] transition-colors',
        active
          ? 'border-gold/50 bg-gold-muted text-gold-dark font-medium'
          : muted
            ? 'border-border bg-surface-2 text-text-dim hover:text-text-muted'
            : 'border-border bg-surface text-text-muted hover:text-text hover:border-border-gold',
      )}
    >
      {label}
      <span className={cn('text-[11px]', active ? 'text-gold-dark' : 'text-text-dim')}>
        {count.toLocaleString('en-GB')}
      </span>
    </button>
  )
}

function RowCheckbox({
  checked,
  indeterminate = false,
  onChange,
  label,
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: () => void
  label: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      aria-label={label}
      className="h-4 w-4 cursor-pointer rounded border-border accent-gold align-middle"
    />
  )
}
