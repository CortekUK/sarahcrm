'use client'

import { useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { toast } from '@/lib/hooks/use-toast'
import { Upload, FileText, Check, AlertCircle } from 'lucide-react'

// Bulk member import from a CSV. Parsing happens here in the browser;
// we POST already-structured rows to /api/admin/members/import. Keeps
// the server route simple (no multipart) and lets us preview before
// committing anything.

interface ImportMembersModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

interface ParsedRow {
  first_name: string
  last_name: string
  email: string
  phone: string
  company_name: string
  job_title: string
  membership_tier: string
  membership_status: string
}

interface RowResult {
  row: number
  email: string
  status: 'created' | 'reused' | 'skipped'
  reason?: string
}

// ── Minimal RFC-4180-ish CSV parser: handles quoted fields, embedded
//    commas, escaped quotes ("") and quoted newlines. ──
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  // Strip a leading BOM if present.
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      // Treat \r\n as one break; skip the \n after a \r.
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(field)
      field = ''
      // Ignore fully-blank lines.
      if (row.some((f) => f.trim() !== '')) rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  // Trailing field / row (no final newline).
  if (field !== '' || row.length > 0) {
    row.push(field)
    if (row.some((f) => f.trim() !== '')) rows.push(row)
  }
  return rows
}

// Map a messy CSV header to one of our known fields.
const HEADER_ALIASES: Record<keyof ParsedRow, string[]> = {
  first_name: ['firstname', 'first', 'forename', 'givenname'],
  last_name: ['lastname', 'last', 'surname', 'familyname'],
  email: ['email', 'emailaddress', 'mail'],
  phone: ['phone', 'phonenumber', 'mobile', 'tel', 'telephone'],
  company_name: ['company', 'companyname', 'organisation', 'organization', 'business'],
  job_title: ['jobtitle', 'title', 'role', 'position'],
  membership_tier: ['tier', 'membershiptier', 'level'],
  membership_status: ['status', 'membershipstatus'],
}

function normaliseHeader(h: string): string {
  return h.toLowerCase().replace(/[\s_\-.]/g, '')
}

function mapHeaders(headerRow: string[]): Record<number, keyof ParsedRow> {
  const map: Record<number, keyof ParsedRow> = {}
  headerRow.forEach((raw, idx) => {
    const norm = normaliseHeader(raw)
    for (const field of Object.keys(HEADER_ALIASES) as (keyof ParsedRow)[]) {
      if (field === norm || HEADER_ALIASES[field].includes(norm)) {
        map[idx] = field
        break
      }
    }
  })
  return map
}

const TIER_OPTIONS = [
  { value: 'tier_1', label: 'Tier 1' },
  { value: 'tier_2', label: 'Tier 2' },
  { value: 'tier_3', label: 'Tier 3' },
]
const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending — no portal access yet' },
  { value: 'active', label: 'Active — portal access immediately' },
]
const INVITE_OPTIONS = [
  { value: 'false', label: "Don't email anyone (silent import)" },
  { value: 'true', label: 'Send branded set-password invite to each' },
]

export function ImportMembersModal({ open, onClose, onSuccess }: ImportMembersModalProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [defaultTier, setDefaultTier] = useState('tier_1')
  const [defaultStatus, setDefaultStatus] = useState('pending')
  const [sendInvites, setSendInvites] = useState('false')
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState<{
    summary: { total: number; created: number; reused: number; skipped: number }
    results: RowResult[]
  } | null>(null)

  function reset() {
    setRows([])
    setFileName('')
    setParseError(null)
    setResults(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleFile(file: File) {
    setParseError(null)
    setResults(null)
    try {
      const text = await file.text()
      const matrix = parseCsv(text)
      if (matrix.length < 2) {
        setParseError('That file has no data rows (need a header row plus at least one record).')
        setRows([])
        return
      }
      const headerMap = mapHeaders(matrix[0])
      if (!Object.values(headerMap).includes('email')) {
        setParseError('Could not find an "email" column. Add a header row with at least: first_name, last_name, email.')
        setRows([])
        return
      }
      const parsed: ParsedRow[] = matrix.slice(1).map((cells) => {
        const out: ParsedRow = {
          first_name: '', last_name: '', email: '', phone: '',
          company_name: '', job_title: '', membership_tier: '', membership_status: '',
        }
        cells.forEach((val, idx) => {
          const field = headerMap[idx]
          if (field) out[field] = val.trim()
        })
        return out
      })
      setRows(parsed)
      setFileName(file.name)
    } catch {
      setParseError('Could not read that file. Make sure it is a plain .csv export.')
      setRows([])
    }
  }

  const validCount = rows.filter((r) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)).length
  const invalidCount = rows.length - validCount

  async function handleImport() {
    setImporting(true)
    try {
      const res = await fetch('/api/admin/members/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          rows,
          send_invites: sendInvites === 'true',
          default_tier: defaultTier,
          default_status: defaultStatus,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Import failed', description: json.error, variant: 'destructive' })
        return
      }
      setResults({ summary: json.summary, results: json.results })
      toast({
        title: 'Import complete',
        description: `${json.summary.created} added, ${json.summary.reused} updated, ${json.summary.skipped} skipped.`,
      })
      onSuccess()
    } catch (e) {
      toast({
        title: 'Import failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Import members from CSV" size="lg">
      <div className="px-6 py-5 space-y-5 overflow-y-auto">
        {/* Results view */}
        {results ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <ResultStat label="Added" value={results.summary.created} tone="success" />
              <ResultStat label="Updated" value={results.summary.reused} tone="info" />
              <ResultStat label="Skipped" value={results.summary.skipped} tone="warn" />
            </div>
            {results.results.some((r) => r.status === 'skipped') && (
              <div className="rounded-[var(--radius-md)] border border-border overflow-hidden">
                <p className="px-4 py-2 text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim bg-surface-2">
                  Skipped rows
                </p>
                <div className="max-h-48 overflow-y-auto divide-y divide-border">
                  {results.results
                    .filter((r) => r.status === 'skipped')
                    .map((r) => (
                      <div key={r.row} className="px-4 py-2 flex items-center gap-3 text-sm">
                        <span className="text-text-dim w-10 shrink-0">#{r.row}</span>
                        <span className="text-text truncate flex-1">{r.email}</span>
                        <span className="text-accent-warm text-xs shrink-0">{r.reason}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Step 1 — file */}
            <div>
              <p className="text-sm text-text-muted mb-3">
                Upload a CSV with a header row. Recognised columns:{' '}
                <span className="text-text">first_name, last_name, email</span> (required), plus
                optional <span className="text-text">phone, company_name, job_title, tier, status</span>.
              </p>
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
                className="w-full border border-dashed border-border hover:border-gold rounded-[var(--radius-lg)] px-6 py-8 flex flex-col items-center gap-2 transition-colors"
              >
                {fileName ? (
                  <>
                    <FileText size={22} className="text-gold" />
                    <span className="text-sm text-text">{fileName}</span>
                    <span className="text-xs text-text-dim">Click to choose a different file</span>
                  </>
                ) : (
                  <>
                    <Upload size={22} className="text-text-dim" />
                    <span className="text-sm text-text">Choose a CSV file</span>
                  </>
                )}
              </button>
              {parseError && (
                <p className="mt-3 flex items-start gap-2 text-sm text-accent-warm">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  {parseError}
                </p>
              )}
            </div>

            {/* Step 2 — preview + options */}
            {rows.length > 0 && (
              <>
                <div className="flex items-center gap-4 rounded-[var(--radius-md)] bg-surface-2 px-4 py-3">
                  <Check size={16} className="text-accent shrink-0" />
                  <p className="text-sm text-text">
                    <strong>{validCount}</strong> ready to import
                    {invalidCount > 0 && (
                      <span className="text-accent-warm">
                        {' '}· {invalidCount} will be skipped (bad/blank email)
                      </span>
                    )}
                  </p>
                </div>

                {/* First few rows preview */}
                <div className="rounded-[var(--radius-md)] border border-border overflow-hidden">
                  <div className="max-h-48 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-surface-2 sticky top-0">
                        <tr className="text-left text-text-dim text-xs uppercase tracking-wide">
                          <th className="px-3 py-2 font-medium">Name</th>
                          <th className="px-3 py-2 font-medium">Email</th>
                          <th className="px-3 py-2 font-medium">Company</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {rows.slice(0, 50).map((r, i) => (
                          <tr key={i}>
                            <td className="px-3 py-1.5 text-text">
                              {`${r.first_name} ${r.last_name}`.trim() || '—'}
                            </td>
                            <td className="px-3 py-1.5 text-text-muted">{r.email || '—'}</td>
                            <td className="px-3 py-1.5 text-text-muted">{r.company_name || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {rows.length > 50 && (
                    <p className="px-3 py-2 text-xs text-text-dim bg-surface-2">
                      Showing first 50 of {rows.length} rows.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Select
                    label="Default tier"
                    hint="Used when a row has no tier"
                    options={TIER_OPTIONS}
                    value={defaultTier}
                    onChange={(e) => setDefaultTier(e.target.value)}
                  />
                  <Select
                    label="Default status"
                    hint="Used when a row has no status"
                    options={STATUS_OPTIONS}
                    value={defaultStatus}
                    onChange={(e) => setDefaultStatus(e.target.value)}
                  />
                  <Select
                    label="Email invites"
                    hint="Historic contacts: leave off"
                    options={INVITE_OPTIONS}
                    value={sendInvites}
                    onChange={(e) => setSendInvites(e.target.value)}
                  />
                </div>
              </>
            )}
          </>
        )}
      </div>

      <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3">
        {results ? (
          <Button onClick={handleClose}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={handleClose} disabled={importing}>
              Cancel
            </Button>
            <Button onClick={handleImport} loading={importing} disabled={validCount === 0}>
              Import {validCount > 0 ? `${validCount} member${validCount === 1 ? '' : 's'}` : 'members'}
            </Button>
          </>
        )}
      </div>
    </Modal>
  )
}

function ResultStat({ label, value, tone }: { label: string; value: number; tone: 'success' | 'info' | 'warn' }) {
  const color =
    tone === 'success' ? 'text-accent' : tone === 'info' ? 'text-accent-blue' : 'text-accent-warm'
  return (
    <div className="rounded-[var(--radius-md)] border border-border px-4 py-3 text-center">
      <p className={`text-2xl font-semibold ${color}`}>{value}</p>
      <p className="text-xs text-text-dim uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  )
}
