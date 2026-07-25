'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { toast } from '@/lib/hooks/use-toast'
import { formatDate, cn } from '@/lib/utils'
import { Filter, Plus, Edit, Trash2, Users, Loader2 } from 'lucide-react'

// ── Rule vocabulary (mirrors the DB enums) ──────────────────────────
const TIERS = [
  { value: 'tier_1', label: 'Tier 1' },
  { value: 'tier_2', label: 'Tier 2' },
  { value: 'tier_3', label: 'Tier 3' },
]
const STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'paused', label: 'Paused' },
]
const TYPES = [
  { value: 'individual', label: 'Individual' },
  { value: 'business', label: 'Business' },
]

export interface SegmentRules {
  tiers?: string[]
  statuses?: string[]
  types?: string[]
  tag_ids?: string[]
  tag_match?: 'any' | 'all'
}

interface Segment {
  id: string
  name: string
  rules: SegmentRules
  created_at: string
  updated_at: string
}

interface TagRow {
  id: string
  name: string
  category: string
}

export function SegmentsPage() {
  const confirm = useConfirm()
  const [segments, setSegments] = useState<Segment[]>([])
  const [tags, setTags] = useState<TagRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editTarget, setEditTarget] = useState<Segment | 'new' | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [segRes, tagRes] = await Promise.all([
      fetch('/api/admin/marketing/segments').then((r) => r.json()),
      supabase.from('tags').select('id, name, category').order('name'),
    ])
    if (segRes.error) {
      toast({ title: 'Failed to load segments', description: segRes.error, variant: 'destructive' })
    } else {
      setSegments((segRes.segments ?? []) as Segment[])
    }
    setTags((tagRes.data ?? []) as TagRow[])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function remove(seg: Segment) {
    const ok = await confirm({
      title: `Delete "${seg.name}"?`,
      description:
        'The segment rule is removed. Members are untouched, and past campaigns sent to it keep their history.',
      tone: 'danger',
      confirmLabel: 'Delete',
    })
    if (!ok) return
    const res = await fetch(`/api/admin/marketing/segments?id=${seg.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast({ title: 'Failed', description: j.error, variant: 'destructive' })
      return
    }
    setSegments((prev) => prev.filter((s) => s.id !== seg.id))
    toast({ title: 'Segment deleted' })
  }

  return (
    <div className="p-4 md:p-8">
      <AdminPageHeader
        title="Segments"
        description="Rule-based groups of members that auto-collect everyone matching the filters (tier, status, type, tags). Send a campaign to a segment from the Campaigns wizard — it always reflects the members who match right now."
        breadcrumbs={[{ label: 'Marketing', href: '/dashboard/marketing' }, { label: 'Segments' }]}
        actions={
          <Button onClick={() => setEditTarget('new')}>
            <Plus size={14} />
            New segment
          </Button>
        }
      />

      {loading ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-text-dim">Loading…</CardContent>
        </Card>
      ) : segments.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <AdminEmptyState
              icon={Filter}
              title="No segments yet"
              description="Create a rule-based segment — e.g. all active Tier 3 members tagged 'Finance' — then email it from Campaigns."
              action={
                <Button onClick={() => setEditTarget('new')}>
                  <Plus size={14} />
                  Create the first segment
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {segments.map((s) => (
            <SegmentCard
              key={s.id}
              segment={s}
              tags={tags}
              onEdit={() => setEditTarget(s)}
              onDelete={() => remove(s)}
            />
          ))}
        </div>
      )}

      {editTarget && (
        <SegmentEditorModal
          segment={editTarget === 'new' ? null : editTarget}
          tags={tags}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function ruleSummary(rules: SegmentRules, tags: TagRow[]): string[] {
  const parts: string[] = []
  if (rules.tiers?.length) parts.push(`Tiers: ${rules.tiers.map((t) => t.replace('tier_', 'T')).join(', ')}`)
  parts.push(`Status: ${rules.statuses?.length ? rules.statuses.join(', ') : 'active (default)'}`)
  if (rules.types?.length) parts.push(`Type: ${rules.types.join(', ')}`)
  if (rules.tag_ids?.length) {
    const names = rules.tag_ids.map((id) => tags.find((t) => t.id === id)?.name ?? '…')
    parts.push(`${rules.tag_match === 'all' ? 'ALL' : 'ANY'} tags: ${names.join(', ')}`)
  }
  return parts
}

function SegmentCard({
  segment,
  tags,
  onEdit,
  onDelete,
}: {
  segment: Segment
  tags: TagRow[]
  onEdit: () => void
  onDelete: () => void
}) {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/marketing/segments/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ segment_id: segment.id }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && typeof j.count === 'number') setCount(j.count)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [segment.id])

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-[family-name:var(--font-heading)] text-base font-semibold text-text truncate">
              {segment.name}
            </h3>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onEdit}
              className="p-1.5 rounded text-text-dim hover:text-text hover:bg-surface-2"
              title="Edit segment"
            >
              <Edit size={14} />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="p-1.5 rounded text-text-dim hover:text-accent-warm hover:bg-surface-2"
              title="Delete segment"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        <ul className="mt-3 space-y-1">
          {ruleSummary(segment.rules, tags).map((line, i) => (
            <li key={i} className="text-xs text-text-muted">
              {line}
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between mt-4">
          <Badge variant="active">
            <Users size={10} className="mr-1" />
            {count === null ? '…' : `${count} members`}
          </Badge>
          <p className="text-[11px] text-text-dim">Updated {formatDate(segment.updated_at)}</p>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Editor modal ────────────────────────────────────────────────────

function SegmentEditorModal({
  segment,
  tags,
  onClose,
  onSaved,
}: {
  segment: Segment | null
  tags: TagRow[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(segment?.name ?? '')
  const [rules, setRules] = useState<SegmentRules>(
    segment?.rules ?? { tiers: [], statuses: [], types: [], tag_ids: [], tag_match: 'any' },
  )
  const [saving, setSaving] = useState(false)
  const [count, setCount] = useState<number | null>(null)
  const [sample, setSample] = useState<{ name: string; email: string }[]>([])
  const [previewing, setPreviewing] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Live preview — debounced on any rule change.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    setPreviewing(true)
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/marketing/segments/preview', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ rules }),
        })
        const j = await res.json()
        if (res.ok) {
          setCount(j.count ?? 0)
          setSample(j.sample ?? [])
        }
      } finally {
        setPreviewing(false)
      }
    }, 350)
    return () => {
      if (debounce.current) clearTimeout(debounce.current)
    }
  }, [rules])

  function toggle(key: 'tiers' | 'statuses' | 'types' | 'tag_ids', value: string) {
    setRules((prev) => {
      const cur = prev[key] ?? []
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]
      return { ...prev, [key]: next }
    })
  }

  const tagsByCategory = useMemo(() => {
    const map: Record<string, TagRow[]> = {}
    for (const t of tags) {
      ;(map[t.category] ??= []).push(t)
    }
    return map
  }, [tags])

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    const payload = { name: name.trim(), rules }
    const res = segment
      ? await fetch('/api/admin/marketing/segments', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: segment.id, ...payload }),
        })
      : await fetch('/api/admin/marketing/segments', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })
    setSaving(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast({ title: 'Save failed', description: j.error, variant: 'destructive' })
      return
    }
    toast({ title: segment ? 'Segment updated' : 'Segment created' })
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title={segment ? 'Edit segment' : 'New segment'} size="xl">
      <div className="space-y-5">
        <div>
          <label className="text-xs text-text-muted">Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Active Tier 3 — Finance"
            autoFocus
          />
        </div>

        <ChipGroup
          label="Membership tier"
          options={TIERS}
          selected={rules.tiers ?? []}
          onToggle={(v) => toggle('tiers', v)}
          emptyHint="Any tier"
        />
        <ChipGroup
          label="Membership status"
          options={STATUSES}
          selected={rules.statuses ?? []}
          onToggle={(v) => toggle('statuses', v)}
          emptyHint="Active only (default)"
        />
        <ChipGroup
          label="Membership type"
          options={TYPES}
          selected={rules.types ?? []}
          onToggle={(v) => toggle('types', v)}
          emptyHint="Any type"
        />

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted">
              Tags
            </p>
            {(rules.tag_ids?.length ?? 0) > 0 && (
              <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
                {(['any', 'all'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setRules((p) => ({ ...p, tag_match: m }))}
                    className={cn(
                      'px-2.5 py-1 transition-colors',
                      (rules.tag_match ?? 'any') === m
                        ? 'bg-gold text-ink'
                        : 'text-text-muted hover:bg-surface-2',
                    )}
                  >
                    {m === 'any' ? 'Match ANY' : 'Match ALL'}
                  </button>
                ))}
              </div>
            )}
          </div>
          {tags.length === 0 ? (
            <p className="text-xs text-text-dim">No tags exist yet.</p>
          ) : (
            <div className="space-y-3 max-h-[220px] overflow-y-auto border border-border rounded-md p-3">
              {Object.entries(tagsByCategory).map(([cat, list]) => (
                <div key={cat}>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-text-dim mb-1.5 capitalize">
                    {cat}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {list.map((t) => {
                      const on = (rules.tag_ids ?? []).includes(t.id)
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => toggle('tag_ids', t.id)}
                          className={cn(
                            'px-2.5 py-1 rounded-full border text-xs transition-colors',
                            on
                              ? 'border-gold bg-gold-muted/50 text-gold'
                              : 'border-border text-text-muted hover:bg-surface-2',
                          )}
                        >
                          {t.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Live preview */}
        <div className="border border-border rounded-md p-4 bg-surface-2/40">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.18em] text-text-muted">
              Matching members (live)
            </p>
            <Badge variant="active">
              {previewing ? (
                <Loader2 size={10} className="mr-1 animate-spin" />
              ) : (
                <Users size={10} className="mr-1" />
              )}
              {count === null ? '…' : count}
            </Badge>
          </div>
          {sample.length > 0 && (
            <p className="text-xs text-text-dim mt-2">
              e.g. {sample.map((s) => s.name).join(', ')}
              {count !== null && count > sample.length ? `, +${count - sample.length} more` : ''}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving} disabled={!name.trim()}>
            {segment ? 'Save changes' : 'Create segment'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function ChipGroup({
  label,
  options,
  selected,
  onToggle,
  emptyHint,
}: {
  label: string
  options: { value: string; label: string }[]
  selected: string[]
  onToggle: (v: string) => void
  emptyHint: string
}) {
  return (
    <div>
      <p className="text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-2">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = selected.includes(o.value)
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onToggle(o.value)}
              className={cn(
                'px-3 py-1.5 rounded-full border text-xs transition-colors',
                on
                  ? 'border-gold bg-gold-muted/50 text-gold'
                  : 'border-border text-text-muted hover:bg-surface-2',
              )}
            >
              {o.label}
            </button>
          )
        })}
      </div>
      {selected.length === 0 && <p className="text-[11px] text-text-dim mt-1.5">{emptyHint}</p>}
    </div>
  )
}
