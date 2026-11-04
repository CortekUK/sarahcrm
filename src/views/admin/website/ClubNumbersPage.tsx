'use client'

// /dashboard/website/club-numbers — structured editor for the ONE source of
// every figure on the homepage "The Club in numbers" band and the About
// page charts: app_settings row key 'club_stats' (jsonb, admin-only RLS).
// Saves straight to Supabase (RLS gates it) and then flushes '/' and
// '/about' so the public pages update immediately.

import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/lib/hooks/use-toast'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import {
  DEFAULT_CLUB_STATS,
  normaliseClubStats,
  type ClubStats,
} from '@/lib/cms/club-stats-shared'

// Form state keeps percentages as strings so "22." can be typed mid-edit.
interface BarRow {
  label: string
  pct: string
}
interface PairRow {
  value: string
  label: string
}
interface FormState {
  numbers: PairRow[]
  ecosystem: PairRow[]
  sectors: BarRow[]
  sectors_source: string
  regions: BarRow[]
  company_size: BarRow[]
  company_size_note: string
  demographics_stamp: string
  beyond: PairRow[]
  channels: PairRow[]
  audience_notes: string[]
}

function toForm(s: ClubStats): FormState {
  const bars = (b: ClubStats['sectors']) => b.map((x) => ({ label: x.label, pct: String(x.pct) }))
  return {
    numbers: s.numbers.map((t) => ({ ...t })),
    ecosystem: s.ecosystem.map((t) => ({ ...t })),
    sectors: bars(s.sectors),
    sectors_source: s.sectors_source,
    regions: bars(s.regions),
    company_size: bars(s.company_size),
    company_size_note: s.company_size_note,
    demographics_stamp: s.demographics_stamp,
    beyond: s.beyond.map((t) => ({ ...t })),
    channels: s.channels.map((c) => ({ value: c.value, label: c.label })),
    audience_notes: [...s.audience_notes],
  }
}

function fromForm(f: FormState): ClubStats {
  const pairs = (rows: PairRow[]) =>
    rows.map((r) => ({ value: r.value.trim(), label: r.label.trim() })).filter((r) => r.value || r.label)
  const bars = (rows: BarRow[]) =>
    rows
      .map((r) => ({ label: r.label.trim(), pct: Number.parseFloat(r.pct) }))
      .filter((r) => r.label)
      .map((r) => ({ label: r.label, pct: Number.isFinite(r.pct) ? r.pct : 0 }))
  return normaliseClubStats({
    numbers: pairs(f.numbers),
    ecosystem: pairs(f.ecosystem),
    sectors: bars(f.sectors),
    sectors_source: f.sectors_source,
    regions: bars(f.regions),
    company_size: bars(f.company_size),
    company_size_note: f.company_size_note,
    demographics_stamp: f.demographics_stamp,
    beyond: pairs(f.beyond),
    channels: pairs(f.channels).map((c) => ({ label: c.label, value: c.value })),
    audience_notes: f.audience_notes.map((n) => n.trim()).filter(Boolean),
  })
}

function badPct(rows: BarRow[]): boolean {
  return rows.some((r) => {
    if (!r.label.trim()) return false
    const n = Number.parseFloat(r.pct)
    return !Number.isFinite(n) || n < 0 || n > 100
  })
}

function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir
  if (j < 0 || j >= list.length) return list
  const next = [...list]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

export function ClubNumbersPage() {
  const [form, setForm] = useState<FormState>(() => toForm(DEFAULT_CLUB_STATS))
  const [initial, setInitial] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedBefore, setSavedBefore] = useState(true)

  useEffect(() => {
    ;(async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'club_stats')
        .maybeSingle()
      if (error) {
        toast({ title: 'Could not load the figures', description: error.message, variant: 'destructive' })
      }
      const next = toForm(normaliseClubStats(data?.value ?? null))
      setSavedBefore(!!data)
      setForm(next)
      setInitial(JSON.stringify(next))
      setLoading(false)
    })()
  }, [])

  const dirty = useMemo(() => JSON.stringify(form) !== initial, [form, initial])
  const invalid = badPct(form.sectors) || badPct(form.regions) || badPct(form.company_size)

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    if (invalid) {
      toast({
        title: 'Check the percentages',
        description: 'Every bar needs a number between 0 and 100.',
        variant: 'destructive',
      })
      return
    }
    setSaving(true)
    const value = fromForm(form)
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: 'club_stats', value: value as never }, { onConflict: 'key' })
    setSaving(false)
    if (error) {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' })
      return
    }
    const next = toForm(value)
    setForm(next)
    setInitial(JSON.stringify(next))
    setSavedBefore(true)
    void fetch('/api/admin/revalidate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paths: ['/', '/about'] }),
    }).catch(() => {})
    toast({ title: 'Figures saved', description: 'The homepage and The Club page now show the new numbers.' })
  }

  function handleResetDefaults() {
    setForm(toForm(DEFAULT_CLUB_STATS))
    toast({
      title: 'Brochure figures restored',
      description: 'Nothing is saved until you press Save.',
    })
  }

  return (
    <div className="pb-28">
      <AdminPageHeader
        title="Club numbers"
        description="Every figure on the homepage “The Club in numbers” band and the charts on The Club (About) page. Edit here — no code change needed."
        breadcrumbs={[{ label: 'Website' }, { label: 'Club numbers' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleResetDefaults} icon={<RotateCcw size={14} />} disabled={loading}>
              Brochure defaults
            </Button>
            <Button size="sm" onClick={handleSave} loading={saving} disabled={loading || saving || (!dirty && savedBefore)} icon={<Save size={14} />}>
              Save
            </Button>
          </div>
        }
      />

      {!loading && !savedBefore && (
        <p className="mb-6 text-sm text-text-muted">
          These are the brochure figures the site shows by default — they haven&apos;t been saved
          here yet. Press Save to store them (or your edits).
        </p>
      )}

      <div className="space-y-6">
        <PairSection
          title="The Club in numbers"
          help="Six tiles on the homepage and The Club page. Value is the big figure; label sits underneath."
          rows={form.numbers}
          onChange={(rows) => set('numbers', rows)}
          valueLabel="Figure"
          disabled={loading}
        />

        <PairSection
          title="The ecosystem"
          help="Figures beside the concentric-circle graphic, e.g. 5 · Event series."
          rows={form.ecosystem}
          onChange={(rows) => set('ecosystem', rows)}
          valueLabel="Figure"
          disabled={loading}
        />

        <BarSection
          title="The database by sector"
          help="Bar chart. Percentages are shown as typed (e.g. 22.7)."
          rows={form.sectors}
          onChange={(rows) => set('sectors', rows)}
          disabled={loading}
        >
          <Input
            label="Source line"
            value={form.sectors_source}
            onChange={(e) => set('sectors_source', e.target.value)}
            hint="Shown as “Source: …” under the heading."
            disabled={loading}
          />
        </BarSection>

        <BarSection
          title="By region"
          help="Left-hand chart in “Where they are, and the businesses they run”."
          rows={form.regions}
          onChange={(rows) => set('regions', rows)}
          disabled={loading}
        >
          <Input
            label="Date stamp"
            value={form.demographics_stamp}
            onChange={(e) => set('demographics_stamp', e.target.value)}
            hint="Small date beside the region and company-size charts, e.g. Sept 2026."
            disabled={loading}
          />
        </BarSection>

        <BarSection
          title="By company size (employees)"
          help="Right-hand chart."
          rows={form.company_size}
          onChange={(rows) => set('company_size', rows)}
          disabled={loading}
        >
          <Input
            label="Line under the charts"
            value={form.company_size_note}
            onChange={(e) => set('company_size_note', e.target.value)}
            disabled={loading}
          />
        </BarSection>

        <PairSection
          title="Beyond the room: CRM, social and content"
          help="Four headline figures."
          rows={form.beyond}
          onChange={(rows) => set('beyond', rows)}
          valueLabel="Figure"
          disabled={loading}
        />

        <PairSection
          title="Channel counts"
          help="Followers per channel, shown under the figures above."
          rows={form.channels}
          onChange={(rows) => set('channels', rows)}
          valueLabel="Count"
          labelLabel="Channel"
          disabled={loading}
        />

        <Card>
          <CardHeader>
            <CardTitle>Audience lines</CardTitle>
            <p className="text-sm text-text-muted mt-1">Short lines beside the channel counts, e.g. 64.5% women · 35.5% men.</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {form.audience_notes.map((n, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="flex-1">
                    <Input
                      aria-label={`Audience line ${i + 1}`}
                      value={n}
                      onChange={(e) =>
                        set(
                          'audience_notes',
                          form.audience_notes.map((x, j) => (j === i ? e.target.value : x)),
                        )
                      }
                      disabled={loading}
                    />
                  </div>
                  <RowButtons
                    onUp={() => set('audience_notes', move(form.audience_notes, i, -1))}
                    onDown={() => set('audience_notes', move(form.audience_notes, i, 1))}
                    onRemove={() => set('audience_notes', form.audience_notes.filter((_, j) => j !== i))}
                    disabled={loading}
                  />
                </div>
              ))}
              <Button
                variant="secondary"
                size="sm"
                icon={<Plus size={14} />}
                onClick={() => set('audience_notes', [...form.audience_notes, ''])}
                disabled={loading}
              >
                Add line
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {dirty && !loading && (
        <div className="fixed bottom-6 right-6 z-30 flex items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3 shadow-lg">
          <span className="text-sm text-text-muted">Unsaved changes</span>
          <Button size="sm" onClick={handleSave} loading={saving} icon={<Save size={14} />}>
            Save
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Sections ─────────────────────────────────────────────────────────

function PairSection({
  title,
  help,
  rows,
  onChange,
  valueLabel = 'Value',
  labelLabel = 'Label',
  disabled,
}: {
  title: string
  help: string
  rows: PairRow[]
  onChange: (rows: PairRow[]) => void
  valueLabel?: string
  labelLabel?: string
  disabled?: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-text-muted mt-1">{help}</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[180px_1fr_auto] gap-2 items-end">
              <Input
                label={i === 0 ? valueLabel : undefined}
                aria-label={`${title} ${i + 1} ${valueLabel}`}
                value={r.value}
                onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                disabled={disabled}
              />
              <Input
                label={i === 0 ? labelLabel : undefined}
                aria-label={`${title} ${i + 1} ${labelLabel}`}
                value={r.label}
                onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                disabled={disabled}
              />
              <RowButtons
                onUp={() => onChange(move(rows, i, -1))}
                onDown={() => onChange(move(rows, i, 1))}
                onRemove={() => onChange(rows.filter((_, j) => j !== i))}
                disabled={disabled}
              />
            </div>
          ))}
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => onChange([...rows, { value: '', label: '' }])}
            disabled={disabled}
          >
            Add row
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function BarSection({
  title,
  help,
  rows,
  onChange,
  disabled,
  children,
}: {
  title: string
  help: string
  rows: BarRow[]
  onChange: (rows: BarRow[]) => void
  disabled?: boolean
  children?: React.ReactNode
}) {
  const total = rows.reduce((sum, r) => sum + (Number.parseFloat(r.pct) || 0), 0)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-text-muted mt-1">
          {help} <span className="text-text-dim">Total: {Math.round(total * 10) / 10}%</span>
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {rows.map((r, i) => {
            const n = Number.parseFloat(r.pct)
            const err = r.label.trim() && (!Number.isFinite(n) || n < 0 || n > 100) ? '0–100' : undefined
            return (
              <div key={i} className="grid grid-cols-[1fr_96px_auto] gap-2 items-end">
                <Input
                  label={i === 0 ? 'Label' : undefined}
                  aria-label={`${title} bar ${i + 1} label`}
                  value={r.label}
                  onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                  disabled={disabled}
                />
                <Input
                  label={i === 0 ? '%' : undefined}
                  aria-label={`${title} bar ${i + 1} percentage`}
                  inputMode="decimal"
                  value={r.pct}
                  error={err}
                  onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))}
                  disabled={disabled}
                />
                <RowButtons
                  onUp={() => onChange(move(rows, i, -1))}
                  onDown={() => onChange(move(rows, i, 1))}
                  onRemove={() => onChange(rows.filter((_, j) => j !== i))}
                  disabled={disabled}
                />
              </div>
            )
          })}
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => onChange([...rows, { label: '', pct: '' }])}
            disabled={disabled}
          >
            Add bar
          </Button>
          {children && <div className="pt-3 max-w-2xl">{children}</div>}
        </div>
      </CardContent>
    </Card>
  )
}

function RowButtons({
  onUp,
  onDown,
  onRemove,
  disabled,
}: {
  onUp: () => void
  onDown: () => void
  onRemove: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-1 pb-1">
      <Button variant="ghost" size="sm" onClick={onUp} disabled={disabled} aria-label="Move up">
        <ArrowUp size={14} />
      </Button>
      <Button variant="ghost" size="sm" onClick={onDown} disabled={disabled} aria-label="Move down">
        <ArrowDown size={14} />
      </Button>
      <Button variant="ghost" size="sm" onClick={onRemove} disabled={disabled} aria-label="Remove">
        <Trash2 size={14} />
      </Button>
    </div>
  )
}
