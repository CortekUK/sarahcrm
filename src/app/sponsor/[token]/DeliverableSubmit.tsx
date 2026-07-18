'use client'

import { useRef, useState } from 'react'
import { Paperclip, Check, Loader2, UploadCloud } from 'lucide-react'
import type { SponsorDeliverable } from '@/lib/sponsors/portal'

// One interactive deliverable row on the token-based Sponsor Portal.
// The sponsor attaches a file and/or a note and marks the item provided —
// POSTing FormData to /api/sponsor/<token>/submit (the token is the auth,
// no login). Already-submitted items render the "Provided" state on load.
// On-brand with the portal's dark/gold editorial palette.

const STATUS_STYLE: Record<string, string> = {
  pending: 'text-ivory-soft border-graphite-line/60 bg-graphite/60',
  received: 'text-bronze-light border-bronze/45 bg-bronze/15',
  done: 'text-emerald-300 border-emerald-700/45 bg-emerald-900/25',
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function DeliverableSubmit({
  token,
  deliverable,
}: {
  token: string
  deliverable: SponsorDeliverable
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState(deliverable.status)
  const [fileName, setFileName] = useState<string | null>(deliverable.file_name)
  const [submittedAt, setSubmittedAt] = useState<string | null>(deliverable.submitted_at)
  const [note, setNote] = useState(deliverable.sponsor_note ?? '')
  const [chosen, setChosen] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const provided = !!submittedAt || status === 'received' || status === 'done'

  async function submit() {
    if (!chosen && !note.trim()) {
      setError('Attach a file or add a note first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const body = new FormData()
      body.set('deliverable_id', deliverable.id)
      if (chosen) body.set('file', chosen)
      if (note.trim()) body.set('note', note.trim())
      const res = await fetch(`/api/sponsor/${token}/submit`, { method: 'POST', body })
      const json = (await res.json()) as { ok?: boolean; file_name?: string | null; error?: string }
      if (!res.ok || !json.ok) {
        setError(json.error ?? 'Something went wrong. Please try again.')
        return
      }
      if (json.file_name) setFileName(json.file_name)
      else if (chosen) setFileName(chosen.name)
      setStatus('received')
      setSubmittedAt(new Date().toISOString())
      setChosen(null)
      setOpen(false)
      if (fileRef.current) fileRef.current.value = ''
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="py-4">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] text-ivory leading-snug">{deliverable.label}</p>
          {(deliverable.due_date || deliverable.notes) && (
            <p className="mt-1 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.2em] text-bronze-light/80">
              {deliverable.due_date ? `Due ${fmtDate(deliverable.due_date)}` : ''}
              {deliverable.due_date && deliverable.notes ? ' · ' : ''}
              {deliverable.notes ? (
                <span className="normal-case tracking-normal text-ivory-soft/70">{deliverable.notes}</span>
              ) : ''}
            </p>
          )}
          {provided && fileName && (
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-[12.5px] text-ivory-soft/85">
              <Paperclip size={12} className="text-bronze-light" /> {fileName}
            </p>
          )}
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-[family-name:var(--font-meta)] text-[9.5px] font-medium uppercase tracking-[0.18em] ${
            STATUS_STYLE[status] ?? STATUS_STYLE.pending
          }`}
        >
          {provided && <Check size={11} />}
          {provided ? 'Provided' : status}
        </span>
      </div>

      {/* Provide / update control */}
      <div className="mt-3">
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-bronze/50 bg-bronze/10 px-3.5 py-1.5 font-[family-name:var(--font-meta)] text-[10px] font-medium uppercase tracking-[0.22em] text-bronze-light transition-colors hover:bg-bronze hover:text-ink"
          >
            <UploadCloud size={13} />
            {provided ? 'Update' : 'Provide asset'}
          </button>
        ) : (
          <div className="rounded-md border border-graphite-line/60 bg-graphite/40 p-4">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.gif,.svg,.webp,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.ai,.eps,.zip"
              onChange={(e) => {
                setChosen(e.target.files?.[0] ?? null)
                setError(null)
              }}
              className="block w-full text-[13px] text-ivory-soft file:mr-3 file:rounded-full file:border-0 file:bg-bronze/20 file:px-3.5 file:py-1.5 file:font-[family-name:var(--font-meta)] file:text-[10px] file:font-medium file:uppercase file:tracking-[0.2em] file:text-bronze-light hover:file:bg-bronze/30"
            />
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Add a note for the team (optional)…"
              className="mt-3 w-full resize-none rounded-md border border-graphite-line/60 bg-ink/40 px-3 py-2 text-[13.5px] text-ivory placeholder:text-ivory-soft/40 focus:border-bronze focus:outline-none"
            />
            {error && <p className="mt-2 text-[12.5px] text-rose-300">{error}</p>}
            <div className="mt-3 flex items-center gap-2.5">
              <button
                type="button"
                onClick={submit}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-full border border-bronze bg-bronze/15 px-4 py-1.5 font-[family-name:var(--font-meta)] text-[10px] font-medium uppercase tracking-[0.24em] text-bronze-light transition-colors hover:bg-bronze hover:text-ink disabled:opacity-60"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                {busy ? 'Sending…' : 'Submit'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  setError(null)
                }}
                disabled={busy}
                className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.24em] text-ivory-soft/70 hover:text-ivory"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </li>
  )
}
