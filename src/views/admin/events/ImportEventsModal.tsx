'use client'

import { useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { toast } from '@/lib/hooks/use-toast'
import { parseEventsWorkbook, type EventImportRow } from '@/lib/events/import'
import { Upload, FileText, AlertCircle, Check, Loader2 } from 'lucide-react'

// Event import from the planning spreadsheet — always previews before writing.
//
// The workbook is parsed in the browser (so the route never handles multipart)
// and every cell is carried across exactly as typed. Nothing here tries to turn
// "April /May" into a date or "15 - 20" into a capacity: imported events land
// in PLANNING status, admin-only and not bookable, and an admin resolves those
// values on the event page before it can be published.

interface Props {
  open: boolean
  onClose: () => void
  onImported: () => void
}

interface Preview {
  total_rows: number
  invalid: number
  to_create: number
  already_imported: number
  created?: number
  sample?: { title: string; sheet: string | null; date: string | null; location: string | null }[]
}

export function ImportEventsModal({ open, onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [filename, setFilename] = useState<string | null>(null)
  const [rows, setRows] = useState<EventImportRow[]>([])
  const [skipped, setSkipped] = useState<{ sheet: string; reason: string }[]>([])
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState<null | 'parsing' | 'preview' | 'commit'>(null)
  const [done, setDone] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setFilename(null)
    setRows([])
    setSkipped([])
    setPreview(null)
    setDone(null)
    setError(null)
    setBusy(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleFile(file: File) {
    setBusy('parsing')
    setError(null)
    setPreview(null)
    setDone(null)
    try {
      const parsed = parseEventsWorkbook(await file.arrayBuffer())
      if (parsed.rows.length === 0) {
        setError(
          'No events found. Each tab needs a heading row with an "Event" column — month-grid calendar tabs are skipped.',
        )
        setRows([])
        setSkipped(parsed.skipped)
        return
      }
      setFilename(file.name)
      setRows(parsed.rows)
      setSkipped(parsed.skipped)
      await runPreview(parsed.rows, file.name)
    } catch {
      setError('Could not read that file. It needs to be an .xlsx or .csv spreadsheet.')
    } finally {
      setBusy(null)
    }
  }

  async function runPreview(parsed: EventImportRow[], name: string) {
    setBusy('preview')
    try {
      const res = await fetch('/api/admin/events/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: parsed, dry_run: true, filename: name }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Could not preview the import.')
        return
      }
      setPreview(json as Preview)
    } catch {
      setError('Network error while previewing.')
    } finally {
      setBusy(null)
    }
  }

  async function commit() {
    setBusy('commit')
    setError(null)
    try {
      const res = await fetch('/api/admin/events/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, dry_run: false, filename }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Import failed.')
        return
      }
      setDone(json as Preview)
      toast({
        title: 'Events imported',
        description: `${json.created} event${json.created === 1 ? '' : 's'} added as planning.`,
      })
      onImported()
    } catch {
      setError('Network error during import.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Import events from a spreadsheet" size="lg">
      <div className="space-y-5">
        {done ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-accent">
              <Check size={18} />
              <p className="font-medium">Import complete</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ResultStat label="Added as planning" value={done.created ?? 0} tone="success" />
              <ResultStat label="Already imported" value={done.already_imported} />
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              They are in the <strong className="text-text">Planning</strong> tab — visible to the
              team only. Open one to choose the venue, date, capacity and prices; it can be
              published once those are filled in.
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 px-4 py-3">
              <p className="text-xs text-text-muted leading-relaxed">
                Every tab with an <strong className="text-text">Event</strong> heading row is read;
                month-grid calendar tabs are skipped. Cells are stored{' '}
                <strong className="text-text">exactly as written</strong> — nothing is interpreted.
                Events arrive as <strong className="text-text">planning</strong>: team-only, not
                bookable, and not shown to members until an admin completes and publishes them.
                Re-uploading the same file adds nothing twice.
              </p>
            </div>

            <div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy !== null}
                className="w-full flex flex-col items-center justify-center gap-2 px-6 py-8 rounded-[var(--radius-md)] border border-dashed border-border hover:border-border-gold bg-surface transition-colors disabled:opacity-60"
              >
                {busy === 'parsing' ? (
                  <>
                    <Loader2 size={20} className="animate-spin text-gold" />
                    <span className="text-sm text-text-muted">Reading file…</span>
                  </>
                ) : filename ? (
                  <>
                    <FileText size={20} className="text-gold" />
                    <span className="text-sm text-text">{filename}</span>
                    <span className="text-xs text-text-dim">
                      {rows.length} event{rows.length === 1 ? '' : 's'} read
                    </span>
                    <span className="text-xs text-text-dim">Click to choose a different file</span>
                  </>
                ) : (
                  <>
                    <Upload size={20} className="text-text-dim" />
                    <span className="text-sm text-text">Choose a spreadsheet</span>
                    <span className="text-xs text-text-dim">
                      .xlsx or .csv — the Master Events Plan works as it is
                    </span>
                  </>
                )}
              </button>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-accent-warm/30 bg-accent-warm/[0.06] px-4 py-3">
                <AlertCircle size={16} className="text-accent-warm shrink-0 mt-0.5" />
                <p className="text-sm text-text-muted">{error}</p>
              </div>
            )}

            {busy === 'preview' && (
              <div className="flex items-center gap-2 text-sm text-text-dim">
                <Loader2 size={15} className="animate-spin" />
                Checking against events already in the CRM…
              </div>
            )}

            {preview && busy !== 'preview' && (
              <div className="space-y-3">
                <p className="text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted">
                  What this import will do
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <ResultStat label="New events" value={preview.to_create} tone="success" />
                  <ResultStat label="Already imported" value={preview.already_imported} />
                </div>

                {skipped.length > 0 && (
                  <p className="text-xs text-text-dim">
                    Skipped: {skipped.map((s) => `${s.sheet} (${s.reason})`).join(' · ')}
                  </p>
                )}

                {preview.sample && preview.sample.length > 0 && (
                  <div className="rounded-[var(--radius-md)] border border-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-surface-2 text-text-muted">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Event</th>
                          <th className="px-3 py-2 text-left font-medium">Tab</th>
                          <th className="px-3 py-2 text-left font-medium">Date as written</th>
                          <th className="px-3 py-2 text-left font-medium">Location</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {preview.sample.map((r, i) => (
                          <tr key={`${r.title}-${i}`}>
                            <td className="px-3 py-2 text-text truncate max-w-[220px]">{r.title}</td>
                            <td className="px-3 py-2 text-text-muted truncate max-w-[140px]">
                              {r.sheet ?? '—'}
                            </td>
                            <td className="px-3 py-2 text-text-muted whitespace-pre-line">
                              {r.date ?? '—'}
                            </td>
                            <td className="px-3 py-2 text-text-muted">{r.location ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="-mx-6 -mb-4 mt-6 px-6 py-4 border-t border-border flex items-center justify-end gap-3 bg-surface rounded-b-[var(--radius-xl)]">
        {done ? (
          <Button onClick={handleClose}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={handleClose} disabled={busy === 'commit'}>
              Cancel
            </Button>
            <Button
              onClick={commit}
              loading={busy === 'commit'}
              disabled={!preview || busy !== null || preview.to_create === 0}
            >
              {preview && preview.to_create === 0
                ? 'Nothing to import'
                : `Import ${preview ? preview.to_create : ''} events`}
            </Button>
          </>
        )}
      </div>
    </Modal>
  )
}

function ResultStat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'success' | 'info' | 'warn'
}) {
  const toneClass =
    tone === 'success'
      ? 'text-accent'
      : tone === 'info'
        ? 'text-accent-blue'
        : tone === 'warn'
          ? 'text-accent-warm'
          : 'text-text'
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 px-4 py-3">
      <p className={`font-[family-name:var(--font-heading)] text-xl font-semibold ${toneClass}`}>
        {value.toLocaleString('en-GB')}
      </p>
      <p className="text-[0.6875rem] uppercase tracking-[0.12em] text-text-muted mt-0.5">{label}</p>
    </div>
  )
}
