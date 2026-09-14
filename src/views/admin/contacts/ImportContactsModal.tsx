'use client'

import { useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { toast } from '@/lib/hooks/use-toast'
import { parseContactsCsv, type ContactRow } from '@/lib/contacts/csv'
import { SECTOR_LABELS } from '@/lib/contacts/sectors'
import { Upload, FileText, AlertCircle, Check, Loader2 } from 'lucide-react'

// Contact CSV import — always previews before it writes.
//
// ONE button handles both source files (the thin ~11k contact export and the
// Clay enrichment) because they share `email` as the identity key and the
// server's merge rule is additive: a blank cell never overwrites a stored
// value, so uploading a thinner file can't erase anything. Two separate
// upload buttons would only add confusion.
//
// Parsing happens here in the browser so the route never handles multipart.

interface Props {
  open: boolean
  onClose: () => void
  onImported: () => void
}

interface Preview {
  total_rows: number
  unique_rows: number
  inserted: number
  updated: number
  unchanged: number
  invalid: number
  sample_new?: { email: string; name: string | null; company: string | null; sector: string }[]
}

// 11k rows of JSON is a few MB — fine, but guard against someone dropping a
// vastly larger export in.
const MAX_ROWS = 50_000

export function ImportContactsModal({ open, onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [filename, setFilename] = useState<string | null>(null)
  const [rows, setRows] = useState<ContactRow[]>([])
  const [localInvalid, setLocalInvalid] = useState(0)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState<null | 'parsing' | 'preview' | 'commit'>(null)
  const [done, setDone] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setFilename(null)
    setRows([])
    setLocalInvalid(0)
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
      const text = await file.text()
      const { rows: parsed, invalid } = parseContactsCsv(text)
      if (parsed.length === 0) {
        setError(
          'No usable rows found. The file needs a header row and an email column.',
        )
        setRows([])
        return
      }
      if (parsed.length > MAX_ROWS) {
        setError(`That file has ${parsed.length.toLocaleString('en-GB')} rows — the limit is ${MAX_ROWS.toLocaleString('en-GB')}. Split it and upload in parts.`)
        setRows([])
        return
      }
      setFilename(file.name)
      setRows(parsed)
      setLocalInvalid(invalid)
      await runPreview(parsed, file.name)
    } catch {
      setError('Could not read that file. Make sure it is a plain .csv export.')
    } finally {
      setBusy(null)
    }
  }

  async function runPreview(parsed: ContactRow[], name: string) {
    setBusy('preview')
    try {
      const res = await fetch('/api/admin/contacts/import', {
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
      const res = await fetch('/api/admin/contacts/import', {
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
        title: 'Import complete',
        description: `${json.inserted} added, ${json.updated} updated.`,
      })
      onImported()
    } catch {
      setError('Network error during import.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Import contacts from CSV" size="lg">
      <div className="space-y-5">
        {/* ── Result ─────────────────────────────────────────── */}
        {done ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-accent">
              <Check size={18} />
              <p className="font-medium">Import complete</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <ResultStat label="Added" value={done.inserted} tone="success" />
              <ResultStat label="Updated" value={done.updated} tone="info" />
              <ResultStat label="Unchanged" value={done.unchanged} />
            </div>
          </div>
        ) : (
          <>
            {/* ── How the merge behaves ────────────────────────── */}
            <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 px-4 py-3">
              <p className="text-xs text-text-muted leading-relaxed">
                Contacts are matched on <strong className="text-text">email</strong>. A new email is
                added; an email already in the table is updated — blank cells in your file{' '}
                <strong className="text-text">never erase</strong> data that is already stored. So
                you can upload the full list first and a Clay-enriched export over the top, in
                either order, as many times as you like.
              </p>
            </div>

            {/* ── File picker ──────────────────────────────────── */}
            <div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
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
                      {rows.length.toLocaleString('en-GB')} rows read
                      {localInvalid > 0 && ` · ${localInvalid} skipped (no valid email)`}
                    </span>
                    <span className="text-xs text-text-dim">Click to choose a different file</span>
                  </>
                ) : (
                  <>
                    <Upload size={20} className="text-text-dim" />
                    <span className="text-sm text-text">Choose a CSV file</span>
                    <span className="text-xs text-text-dim">
                      Any export with an email column — extra columns are matched automatically
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
                Checking against existing contacts…
              </div>
            )}

            {/* ── Preview ──────────────────────────────────────── */}
            {preview && busy !== 'preview' && (
              <div className="space-y-3">
                <p className="text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted">
                  What this import will do
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <ResultStat label="New contacts" value={preview.inserted} tone="success" />
                  <ResultStat label="Will be updated" value={preview.updated} tone="info" />
                  <ResultStat label="Unchanged" value={preview.unchanged} />
                </div>

                {(preview.invalid > 0 || preview.total_rows !== preview.unique_rows) && (
                  <p className="text-xs text-text-dim">
                    {preview.total_rows !== preview.unique_rows && (
                      <>
                        {(preview.total_rows - preview.unique_rows).toLocaleString('en-GB')}{' '}
                        duplicate row(s) inside the file were merged together.{' '}
                      </>
                    )}
                    {preview.invalid > 0 && (
                      <>{preview.invalid} row(s) had no valid email and will be skipped.</>
                    )}
                  </p>
                )}

                {preview.sample_new && preview.sample_new.length > 0 && (
                  <div className="rounded-[var(--radius-md)] border border-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-surface-2 text-text-muted">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Email</th>
                          <th className="px-3 py-2 text-left font-medium">Name</th>
                          <th className="px-3 py-2 text-left font-medium">Company</th>
                          <th className="px-3 py-2 text-left font-medium">Sector</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {preview.sample_new.map((r) => (
                          <tr key={r.email}>
                            <td className="px-3 py-2 text-text truncate max-w-[200px]">{r.email}</td>
                            <td className="px-3 py-2 text-text-muted">{r.name ?? '—'}</td>
                            <td className="px-3 py-2 text-text-muted truncate max-w-[140px]">
                              {r.company ?? '—'}
                            </td>
                            <td className="px-3 py-2 text-text-muted">
                              {SECTOR_LABELS[r.sector] ?? r.sector}
                            </td>
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
              disabled={!preview || busy !== null || preview.inserted + preview.updated === 0}
            >
              {preview && preview.inserted + preview.updated === 0
                ? 'Nothing to import'
                : `Import ${preview ? (preview.inserted + preview.updated).toLocaleString('en-GB') : ''} contacts`}
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
