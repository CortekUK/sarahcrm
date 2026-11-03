'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { toast } from '@/lib/hooks/use-toast'
import { apiClient, getApiErrorMessage } from '@/lib/http'
import { SECTOR_LABELS } from '@/lib/contacts/sectors'
import { AlertCircle, Check, Loader2, Sparkles, Square, Users } from 'lucide-react'

// Bulk company enrichment for the whole contact table (Clay, by email domain).
//
//   1. "Fill from known companies" — free: copies company data from a
//      colleague already enriched at the same domain.
//   2. Clay — searches the next N companies (most contacts first). The browser
//      loops small batches against /api/admin/contacts/enrich so no request
//      outlives the serverless limit, shows progress + the Clay quota, and
//      stops on Stop or when the quota runs out.
//
// Each company is searched at most once (the server caches every result), so
// stopping and coming back later never pays twice. Only empty fields are
// filled; nothing stored is overwritten.

interface Props {
  open: boolean
  onClose: () => void
  onEnriched: () => void
}

interface Plan {
  total_contacts: number
  personal_contacts: number
  business_contacts: number
  incomplete_contacts: number
  incomplete_domains: number
  free_contacts: number
  free_domains: number
  pending_contacts: number
  pending_domains: number
  clay_found: number
  clay_not_found: number
  clay_failed: number
}

interface Quota {
  limit: number
  used: number
  remaining: number
  resets_at: string
}

interface BatchItem {
  domain: string
  contacts: number
  status: 'found' | 'not_found' | 'failed'
  company: string | null
  sector: string | null
}

interface BatchResponse {
  items: BatchItem[]
  updated_contacts: number
  quota: Quota | null
  stopped: null | 'quota'
  stop_message: string | null
  done: boolean
  plan: Plan
}

const BATCH_SIZE = 4
const TARGETS = [
  { value: '25', label: 'Next 25 companies' },
  { value: '100', label: 'Next 100 companies' },
  { value: '250', label: 'Next 250 companies' },
  { value: '500', label: 'Next 500 companies' },
  { value: 'all', label: 'All remaining companies' },
]

const n = (v: number) => v.toLocaleString('en-GB')

export function EnrichContactsModal({ open, onClose, onEnriched }: Props) {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [clayConfigured, setClayConfigured] = useState(true)
  const [loadingPlan, setLoadingPlan] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [seeding, setSeeding] = useState(false)
  const [target, setTarget] = useState('100')
  const [running, setRunning] = useState(false)
  const stopRef = useRef(false)
  const [progress, setProgress] = useState({ searched: 0, found: 0, notFound: 0, failed: 0, updated: 0, goal: 0 })
  const [recent, setRecent] = useState<BatchItem[]>([])
  const [quota, setQuota] = useState<Quota | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const changedRef = useRef(false)

  const loadPlan = useCallback(async () => {
    setLoadingPlan(true)
    setError(null)
    try {
      const { data } = await apiClient.get<{ plan: Plan; clay_configured: boolean }>('/api/admin/contacts/enrich')
      setPlan(data.plan)
      setClayConfigured(data.clay_configured)
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not load the enrichment summary.'))
    } finally {
      setLoadingPlan(false)
    }
  }, [])

  useEffect(() => {
    if (open) loadPlan()
  }, [open, loadPlan])

  function handleClose() {
    if (running) return
    if (changedRef.current) onEnriched()
    changedRef.current = false
    setProgress({ searched: 0, found: 0, notFound: 0, failed: 0, updated: 0, goal: 0 })
    setRecent([])
    setNotice(null)
    setError(null)
    onClose()
  }

  async function seed() {
    setSeeding(true)
    setError(null)
    try {
      const { data } = await apiClient.post<{ seeded_domains: number; updated_contacts: number; plan: Plan }>(
        '/api/admin/contacts/enrich',
        { action: 'seed' },
      )
      setPlan(data.plan)
      changedRef.current = true
      toast({
        title: 'Filled from known companies',
        description: `${n(data.updated_contacts)} contacts updated from ${n(data.seeded_domains)} companies — no Clay searches used.`,
      })
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not fill from known companies.'))
    } finally {
      setSeeding(false)
    }
  }

  async function runClay() {
    if (!plan) return
    const goal = target === 'all' ? plan.pending_domains : Math.min(Number(target), plan.pending_domains)
    if (goal <= 0) return
    stopRef.current = false
    setRunning(true)
    setError(null)
    setNotice(null)
    setRecent([])
    const tally = { searched: 0, found: 0, notFound: 0, failed: 0, updated: 0, goal }
    setProgress({ ...tally })
    try {
      while (!stopRef.current && tally.searched < goal) {
        const size = Math.min(BATCH_SIZE, goal - tally.searched)
        const { data } = await apiClient.post<BatchResponse>('/api/admin/contacts/enrich', { action: 'batch', size })
        setPlan(data.plan)
        if (data.quota) setQuota(data.quota)
        if (data.items.length) changedRef.current = true
        for (const it of data.items) {
          tally.searched += 1
          if (it.status === 'found') tally.found += 1
          else if (it.status === 'not_found') tally.notFound += 1
          else tally.failed += 1
        }
        tally.updated += data.updated_contacts
        setProgress({ ...tally })
        setRecent((prev) => [...data.items.slice().reverse(), ...prev].slice(0, 6))
        if (data.stopped === 'quota') {
          setNotice(data.stop_message ?? 'The Clay search quota for this period is used up.')
          break
        }
        if (data.done || data.items.length === 0) break
      }
      if (stopRef.current) setNotice('Stopped. Nothing is lost — the next run carries on with the remaining companies.')
    } catch (e) {
      setError(getApiErrorMessage(e, 'Clay enrichment stopped with an error.'))
    } finally {
      setRunning(false)
    }
  }

  const goal = plan ? (target === 'all' ? plan.pending_domains : Math.min(Number(target), plan.pending_domains)) : 0
  const pct = progress.goal ? Math.round((progress.searched / progress.goal) * 100) : 0

  return (
    <Modal open={open} onClose={handleClose} title="Enrich contacts" size="lg">
      <div className="space-y-5">
        <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 px-4 py-3">
          <p className="text-xs text-text-muted leading-relaxed">
            Clay looks a company up by the <strong className="text-text">domain of the email address</strong>, so
            one search fills <strong className="text-text">every contact at that company</strong>: company name,
            industry, sector, website and size. It only fills <strong className="text-text">empty</strong> fields
            and never overwrites anything already stored. Each company is searched once.
          </p>
        </div>

        {loadingPlan && !plan ? (
          <div className="flex items-center gap-2 text-sm text-text-dim">
            <Loader2 size={15} className="animate-spin" />
            Working out what can be enriched…
          </div>
        ) : plan ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Stat label="Missing company data" value={plan.incomplete_contacts} hint={`${n(plan.incomplete_domains)} companies`} />
              <Stat label="Needs Clay" value={plan.pending_domains} hint={`companies · ${n(plan.pending_contacts)} contacts`} tone="info" />
              <Stat
                label="Personal emails"
                value={plan.personal_contacts}
                hint="hotmail, gmail… — no company to look up"
              />
            </div>

            {/* ── Step 1: free ─────────────────────────────── */}
            <section className="rounded-[var(--radius-md)] border border-border p-4 space-y-3">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm font-medium text-text flex items-center gap-2">
                    <Users size={15} className="text-gold" />
                    1. Fill from known companies
                    <span className="text-[10px] uppercase tracking-[0.12em] text-accent">Free</span>
                  </p>
                  <p className="text-xs text-text-dim mt-1">
                    {plan.free_contacts > 0
                      ? `Up to ${n(plan.free_contacts)} contacts work at ${n(plan.free_domains)} companies we already have details for — copy them across without using Clay.`
                      : 'Nothing to copy — every known company has already been applied.'}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Check size={14} />}
                  loading={seeding}
                  disabled={running || plan.free_contacts === 0}
                  onClick={seed}
                >
                  Fill from known companies
                </Button>
              </div>
            </section>

            {/* ── Step 2: Clay ─────────────────────────────── */}
            <section className="rounded-[var(--radius-md)] border border-border p-4 space-y-3">
              <div>
                <p className="text-sm font-medium text-text flex items-center gap-2">
                  <Sparkles size={15} className="text-gold" />
                  2. Search companies with Clay
                </p>
                <p className="text-xs text-text-dim mt-1">
                  Companies with the most contacts go first. Each company uses one Clay search from your quota.
                  {plan.clay_found + plan.clay_not_found > 0 &&
                    ` Searched so far: ${n(plan.clay_found)} found, ${n(plan.clay_not_found)} not on Clay.`}
                </p>
              </div>

              {!clayConfigured ? (
                <p className="text-xs text-accent-warm">
                  Clay isn&rsquo;t configured on this deployment (CLAY_API_KEY), so searches are unavailable.
                </p>
              ) : plan.pending_domains === 0 ? (
                <p className="text-xs text-accent">Every business contact&rsquo;s company has been searched.</p>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <SelectMenu
                    value={target}
                    onValueChange={setTarget}
                    options={TARGETS}
                    size="sm"
                    ariaLabel="How many companies to search"
                    className="sm:w-60"
                  />
                  <p className="text-xs text-text-dim flex-1">Uses up to {n(goal)} Clay searches.</p>
                  {running ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Square size={13} />}
                      onClick={() => {
                        stopRef.current = true
                      }}
                    >
                      Stop
                    </Button>
                  ) : (
                    <Button size="sm" icon={<Sparkles size={14} />} disabled={seeding || goal === 0} onClick={runClay}>
                      Start
                    </Button>
                  )}
                </div>
              )}

              {(running || progress.goal > 0) && (
                <div className="space-y-2">
                  <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                    <div className="h-full bg-gold transition-[width] duration-300" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-text-muted flex items-center gap-2 flex-wrap">
                    {running && <Loader2 size={12} className="animate-spin" />}
                    {n(progress.searched)} / {n(progress.goal)} companies searched · {n(progress.found)} found ·{' '}
                    {n(progress.notFound)} not on Clay
                    {progress.failed > 0 && ` · ${n(progress.failed)} failed (retried next run)`} ·{' '}
                    <span className="text-text">{n(progress.updated)} contacts updated</span>
                  </p>
                  {recent.length > 0 && (
                    <ul className="text-xs divide-y divide-border rounded-[var(--radius-md)] border border-border">
                      {recent.map((r) => (
                        <li key={r.domain} className="flex items-center justify-between gap-3 px-3 py-1.5">
                          <span className="text-text-muted truncate">{r.domain}</span>
                          <span className="text-text-dim shrink-0 text-right">
                            {r.status === 'found'
                              ? `${r.company ?? 'Found'}${r.sector ? ` · ${SECTOR_LABELS[r.sector] ?? r.sector}` : ''}`
                              : r.status === 'not_found'
                                ? 'Not on Clay'
                                : 'Failed'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {quota && (
                <p className="text-[11px] text-text-dim">
                  Clay quota: {n(quota.used)} / {n(quota.limit)} used this period · {n(quota.remaining)} left
                  {quota.resets_at &&
                    ` · resets ${new Date(quota.resets_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
                </p>
              )}
            </section>
          </>
        ) : null}

        {notice && (
          <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-border bg-surface-2 px-4 py-3">
            <AlertCircle size={16} className="text-gold shrink-0 mt-0.5" />
            <p className="text-sm text-text-muted">{notice}</p>
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-accent-warm/30 bg-accent-warm/[0.06] px-4 py-3">
            <AlertCircle size={16} className="text-accent-warm shrink-0 mt-0.5" />
            <p className="text-sm text-text-muted">{error}</p>
          </div>
        )}
      </div>

      <div className="-mx-6 -mb-4 mt-6 px-6 py-4 border-t border-border flex items-center justify-end gap-3 bg-surface rounded-b-[var(--radius-xl)]">
        <Button onClick={handleClose} disabled={running} title={running ? 'Stop the Clay run first' : undefined}>
          {changedRef.current ? 'Done' : 'Close'}
        </Button>
      </div>
    </Modal>
  )
}

function Stat({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: 'info' }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 px-4 py-3">
      <p
        className={`font-[family-name:var(--font-heading)] text-xl font-semibold ${tone === 'info' ? 'text-accent-blue' : 'text-text'}`}
      >
        {n(value)}
      </p>
      <p className="text-[0.6875rem] uppercase tracking-[0.12em] text-text-muted mt-0.5">{label}</p>
      {hint && <p className="text-[11px] text-text-dim mt-1">{hint}</p>}
    </div>
  )
}
