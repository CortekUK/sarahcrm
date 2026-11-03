'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { apiClient, getApiErrorMessage } from '@/lib/http'
import { SECTOR_LABELS } from '@/lib/contacts/sectors'
import { AlertCircle, Check, CircleSlash, Loader2, Mail, Search, Sparkles, Square } from 'lucide-react'
import type { EnrichScope } from './EnrichContactsModal'

// "Enrich selected with Clay" — acts straight away on the ticked contacts:
//   1. free fill from colleagues already enriched at the same company;
//   2. one Clay search per selected company still missing data;
//   3. a result line per contact (enriched / personal email / not on Clay…).
// Only a large selection (more than CONFIRM_ABOVE Clay searches) asks first,
// so a stray "select all" can't burn the quota. Same server rules as the bulk
// dialog: each company searched once, empty fields only.

const CONFIRM_ABOVE = 25
const BATCH_SIZE = 4

interface Props {
  open: boolean
  onClose: () => void
  onEnriched: () => void
  scope: EnrichScope
  count: number
}

interface Plan {
  total_contacts: number
  personal_contacts: number
  incomplete_contacts: number
  free_contacts: number
  pending_domains: number
  pending_contacts: number
}

interface ResultRow {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  company_name: string | null
  sector: string
  personal: boolean
  needs_data: boolean
  lookup_status: 'found' | 'not_found' | 'failed' | null
  lookup_source: 'clay' | 'contacts' | null
}

interface BatchResponse {
  items: { status: 'found' | 'not_found' | 'failed' }[]
  updated_contacts: number
  stopped: null | 'quota'
  stop_message: string | null
  done: boolean
  plan: Plan
}

type Phase = 'loading' | 'confirm' | 'running' | 'done' | 'error'

const n = (v: number) => v.toLocaleString('en-GB')

export function EnrichSelectionModal({ open, onClose, onEnriched, scope, count }: Props) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [step, setStep] = useState('')
  const [searched, setSearched] = useState({ done: 0, total: 0 })
  const [updated, setUpdated] = useState(0)
  const [results, setResults] = useState<ResultRow[] | null>(null)
  const stopRef = useRef(false)
  const changedRef = useRef(false)

  const run = useCallback(
    async (p: Plan) => {
      setPhase('running')
      setError(null)
      stopRef.current = false
      let touched = 0
      try {
        // 1. Free fill (always — costs nothing).
        if (p.free_contacts > 0) {
          setStep('Filling from companies we already know…')
          const { data } = await apiClient.post<{ updated_contacts: number; plan: Plan }>('/api/admin/contacts/enrich', {
            action: 'seed',
            scope,
          })
          touched += data.updated_contacts
          p = data.plan
        }
        // 2. Clay, one search per company.
        const total = p.pending_domains
        let done = 0
        setSearched({ done, total })
        while (!stopRef.current && done < total) {
          setStep('Looking up companies on Clay…')
          const { data } = await apiClient.post<BatchResponse>('/api/admin/contacts/enrich', {
            action: 'batch',
            size: Math.min(BATCH_SIZE, total - done),
            scope,
          })
          done += data.items.length
          touched += data.updated_contacts
          setSearched({ done, total })
          if (data.stopped === 'quota') {
            setNotice(data.stop_message ?? 'The Clay search quota for this period is used up.')
            break
          }
          if (data.done || data.items.length === 0) break
        }
        if (stopRef.current) setNotice('Stopped. The rest can be enriched later — nothing is searched twice.')
        setUpdated(touched)
        if (touched > 0) changedRef.current = true
        // 3. Per-contact outcome (ticked rows only — not "all matching").
        if (scope.ids) {
          const { data } = await apiClient.post<{ results: ResultRow[] }>('/api/admin/contacts/enrich', {
            action: 'results',
            scope,
          })
          setResults(data.results)
        }
        setPhase('done')
      } catch (e) {
        setUpdated(touched)
        if (touched > 0) changedRef.current = true
        setError(getApiErrorMessage(e, 'Enrichment stopped with an error.'))
        setPhase('error')
      }
    },
    [scope],
  )

  // Open → work out the selection, then start (or ask first if it's big).
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setPhase('loading')
    setPlan(null)
    setResults(null)
    setNotice(null)
    setError(null)
    setUpdated(0)
    setSearched({ done: 0, total: 0 })
    apiClient
      .post<{ plan: Plan; clay_configured: boolean }>('/api/admin/contacts/enrich', { action: 'plan', scope })
      .then(({ data }) => {
        if (cancelled) return
        setPlan(data.plan)
        if (data.plan.pending_domains > 0 && !data.clay_configured) {
          setError('Clay isn’t configured on this deployment (CLAY_API_KEY), so companies can’t be looked up.')
          setPhase('error')
        } else if (data.plan.pending_domains > CONFIRM_ABOVE) setPhase('confirm')
        else run(data.plan)
      })
      .catch((e) => {
        if (cancelled) return
        setError(getApiErrorMessage(e, 'Could not read the selection.'))
        setPhase('error')
      })
    return () => {
      cancelled = true
    }
  }, [open, scope, run])

  function handleClose() {
    if (phase === 'running') return
    if (changedRef.current) onEnriched()
    changedRef.current = false
    onClose()
  }

  const title = `Enrich ${n(count)} selected contact${count === 1 ? '' : 's'}`
  const pct = searched.total ? Math.round((searched.done / searched.total) * 100) : 0

  return (
    <Modal open={open} onClose={handleClose} title={title} size="lg">
      <div className="space-y-4">
        {phase === 'loading' && (
          <p className="flex items-center gap-2 text-sm text-text-dim">
            <Loader2 size={15} className="animate-spin" />
            Checking the selection…
          </p>
        )}

        {phase === 'confirm' && plan && (
          <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 px-4 py-4 space-y-2">
            <p className="text-sm text-text">
              This needs <strong>{n(plan.pending_domains)} Clay searches</strong> (one per company) for{' '}
              {n(plan.pending_contacts)} contacts.
            </p>
            <p className="text-xs text-text-dim">
              {plan.personal_contacts > 0 &&
                `${n(plan.personal_contacts)} selected contacts use a personal email (hotmail, gmail…) and can’t be looked up. `}
              Companies already searched are never searched again.
            </p>
          </div>
        )}

        {(phase === 'running' || ((phase === 'done' || phase === 'error') && searched.total > 0)) && (
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm text-text-muted">
              {phase === 'running' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} className="text-accent" />}
              {phase === 'running' ? step : 'Finished'}
              {searched.total > 0 && (
                <span className="text-text-dim">
                  {' '}
                  · {n(searched.done)} / {n(searched.total)} companies searched
                </span>
              )}
            </p>
            {searched.total > 0 && (
              <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full bg-gold transition-[width] duration-300" style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>
        )}

        {phase === 'running' && searched.total === 0 && (
          <p className="flex items-center gap-2 text-sm text-text-muted">
            <Loader2 size={14} className="animate-spin" />
            {step || 'Working…'}
          </p>
        )}

        {(phase === 'done' || phase === 'error') && (
          <p className="text-sm text-text">
            {updated > 0 ? (
              <>
                <strong>{n(updated)}</strong> contact{updated === 1 ? '' : 's'} updated.
              </>
            ) : (
              'No contacts were changed.'
            )}
          </p>
        )}

        {results && results.length > 0 && (
          <ul className="divide-y divide-border rounded-[var(--radius-md)] border border-border text-sm max-h-80 overflow-y-auto">
            {results.map((r) => (
              <ResultLine key={r.id} r={r} />
            ))}
          </ul>
        )}

        {phase === 'done' && !scope.ids && plan && plan.personal_contacts > 0 && (
          <p className="text-xs text-text-dim">
            {n(plan.personal_contacts)} of the selected contacts use a personal email address and can’t be looked up
            on Clay.
          </p>
        )}

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
        {phase === 'confirm' && plan ? (
          <>
            <Button variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button icon={<Sparkles size={14} />} onClick={() => run(plan)}>
              Enrich now ({n(plan.pending_domains)} searches)
            </Button>
          </>
        ) : phase === 'running' ? (
          <Button
            variant="secondary"
            icon={<Square size={13} />}
            onClick={() => {
              stopRef.current = true
            }}
          >
            Stop
          </Button>
        ) : (
          <Button onClick={handleClose} disabled={phase === 'loading'}>
            {phase === 'loading' ? 'Close' : 'Done'}
          </Button>
        )}
      </div>
    </Modal>
  )
}

function ResultLine({ r }: { r: ResultRow }) {
  const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email
  let icon = <Check size={14} className="text-accent" />
  let text: string
  if (r.personal) {
    icon = <Mail size={14} className="text-text-dim" />
    text = 'Personal email — no company to look up'
  } else if (r.lookup_status === 'not_found') {
    icon = <CircleSlash size={14} className="text-text-dim" />
    text = 'Company not found on Clay'
  } else if (r.lookup_status === 'failed') {
    icon = <AlertCircle size={14} className="text-accent-warm" />
    text = 'Clay lookup failed — try again later'
  } else if (r.company_name || r.sector !== 'unsegmented') {
    text = [r.company_name, r.sector !== 'unsegmented' ? (SECTOR_LABELS[r.sector] ?? r.sector) : null]
      .filter(Boolean)
      .join(' · ')
  } else {
    icon = <Search size={14} className="text-text-dim" />
    text = 'Not looked up yet'
  }
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-text truncate">{name}</span>
        {name !== r.email && <span className="block text-xs text-text-dim truncate">{r.email}</span>}
      </span>
      <span className="text-xs text-text-muted text-right shrink-0 max-w-[45%] truncate">{text}</span>
    </li>
  )
}
