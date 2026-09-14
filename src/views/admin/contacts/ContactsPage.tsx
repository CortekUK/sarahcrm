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
import { cn } from '@/lib/utils'
import { SECTOR_LABELS } from '@/lib/contacts/sectors'
import { ImportContactsModal } from './ImportContactsModal'
import { ContactDetailDrawer, type Contact } from './ContactDetailDrawer'
import { Search, Upload, MailCheck, Loader2, Contact as ContactIcon } from 'lucide-react'

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

  const pageCount = Math.ceil(total / PAGE_SIZE)
  const shownSectors = stats.sectors.filter((s) => s.count > 0 || s.key === sector)

  return (
    <div className="p-4 md:p-8">
      <AdminPageHeader
        title="Contacts"
        description="The club's full contact database — event guests, past enquiries and leads. Segment by sector to build a marketing audience or a sponsorship prospect pool. These are contacts, not members: they have no portal login."
        actions={
          <Button icon={<Upload size={15} />} onClick={() => setImportOpen(true)}>
            Import CSV
          </Button>
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
