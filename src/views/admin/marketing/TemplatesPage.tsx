'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Plus,
  Loader2,
  Trash2,
  Copy,
  Pencil,
  GripVertical,
  ArrowLeft,
  ImagePlus,
  Type,
  AlignLeft,
  Pin,
  X,
} from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { Button, Card, Badge, Input, Select, Textarea } from '@/components/ui'
import { supabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  BUILDER_SHAPES,
  SHAPE_LABELS,
  BRAND_SWATCHES,
  FONT_CHOICES,
  SHAPE_DIMS,
} from '@/lib/marketing/graphics/types'
import type {
  GraphicShape,
  MarketingTemplate,
  TemplateSlot,
  SlotType,
  SlotZone,
  SlotAlign,
} from '@/lib/marketing/graphics/types'

// base64url-encode a live builder state for the preview <img> src.
function toBase64Url(obj: unknown): string {
  const json = JSON.stringify(obj)
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)))
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function newSlotId(): string {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
}

const SLOT_TYPE_META: Record<SlotType, { label: string; icon: typeof Type }> = {
  heading: { label: 'Heading', icon: Type },
  subtext: { label: 'Subtext', icon: AlignLeft },
  fixed: { label: 'Fixed line', icon: Pin },
  photo: { label: 'Photo', icon: ImagePlus },
}

function blankSlot(type: SlotType): TemplateSlot {
  return {
    id: newSlotId(),
    type,
    zone: type === 'fixed' ? 'top' : 'middle',
    align: 'center',
    text_source: type === 'fixed' ? 'fixed' : 'ai',
    fixed_text: type === 'fixed' ? 'YOUR TEXT' : undefined,
    style:
      type === 'heading'
        ? { font: 'serif', color: '#F7F3EA', size: 76 }
        : type === 'photo'
          ? undefined
          : { font: 'sans', color: '#F7F3EA', size: 32 },
  }
}

interface TemplateListItem extends MarketingTemplate {
  created_at?: string
}

export function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<MarketingTemplate | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/marketing/templates')
      const json = await res.json()
      if (res.ok) setTemplates(json.templates ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function startNew() {
    setEditing({
      id: '',
      name: 'New template',
      shape: 'square',
      background: { type: 'color', value: '#211D19' },
      slots: [blankSlot('heading')],
    })
  }

  function duplicate(t: TemplateListItem) {
    setEditing({
      id: '',
      name: `${t.name} copy`,
      shape: t.shape,
      background: t.background,
      slots: t.slots.map((s) => ({ ...s, id: newSlotId() })),
    })
  }

  async function remove(id: string) {
    if (!confirm('Delete this template? Pieces already rendered from it keep their graphic.')) return
    const res = await fetch(`/api/admin/marketing/templates?id=${id}`, { method: 'DELETE' })
    if (res.ok) setTemplates((prev) => prev.filter((t) => t.id !== id))
  }

  if (editing) {
    return (
      <TemplateBuilder
        initial={editing}
        onCancel={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          load()
        }}
      />
    )
  }

  return (
    <div className="p-4 md:p-8">
      <AdminPageHeader
        title="Template graphics"
        description="Design on-brand social graphics from building blocks. The AI fills the text and a real photo is dropped in at generation, then the finished PNG appears in the approval queue."
        breadcrumbs={[{ label: 'Marketing', href: '/dashboard/marketing' }, { label: 'Templates' }]}
        actions={
          <Button icon={<Plus size={16} />} onClick={startNew}>
            New template
          </Button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-text-muted text-sm">
          <Loader2 size={16} className="animate-spin" /> Loading templates…
        </div>
      ) : templates.length === 0 ? (
        <AdminEmptyState
          icon={ImagePlus}
          title="No templates yet"
          description="Create your first on-brand template, or duplicate one of the starters once they load."
          action={
            <Button icon={<Plus size={16} />} onClick={startNew}>
              New template
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {templates.map((t) => (
            <Card key={t.id} className="overflow-hidden flex flex-col">
              <div className="bg-surface-2 flex items-center justify-center p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/admin/marketing/graphics/preview?template_id=${t.id}`}
                  alt={t.name}
                  className="max-h-56 w-auto rounded-[var(--radius-md)] shadow-sm"
                  style={{ aspectRatio: `${SHAPE_DIMS[t.shape].w} / ${SHAPE_DIMS[t.shape].h}` }}
                />
              </div>
              <div className="p-4 flex-1 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-text truncate">{t.name}</p>
                  <Badge variant="info">{t.shape}</Badge>
                </div>
                <p className="text-xs text-text-dim">
                  {t.slots.length} slot{t.slots.length === 1 ? '' : 's'}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  <Button size="sm" variant="secondary" icon={<Pencil size={13} />} onClick={() => setEditing(t)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Copy size={13} />} onClick={() => duplicate(t)}>
                    Duplicate
                  </Button>
                  <div className="flex-1" />
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 size={13} />}
                    onClick={() => remove(t.id)}
                    className="text-accent-warm hover:text-accent-warm"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function TemplateBuilder({
  initial,
  onCancel,
  onSaved,
}: {
  initial: MarketingTemplate
  onCancel: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(initial.name)
  const [shape, setShape] = useState<GraphicShape>(initial.shape)
  const [bgType, setBgType] = useState<'color' | 'photo'>(initial.background.type)
  const [bgColor, setBgColor] = useState(
    initial.background.type === 'color' ? initial.background.value : '#211D19',
  )
  const [bgPhoto, setBgPhoto] = useState(
    initial.background.type === 'photo' ? initial.background.value : '',
  )
  const [slots, setSlots] = useState<TemplateSlot[]>(initial.slots)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dragIndex = useRef<number | null>(null)

  const template: MarketingTemplate = useMemo(
    () => ({
      id: initial.id,
      name,
      shape,
      background: bgType === 'color' ? { type: 'color', value: bgColor } : { type: 'photo', value: bgPhoto },
      slots,
    }),
    [initial.id, name, shape, bgType, bgColor, bgPhoto, slots],
  )

  // Live preview — debounced so we don't refetch the PNG on every keystroke.
  const [previewSrc, setPreviewSrc] = useState('')
  useEffect(() => {
    const t = setTimeout(() => {
      setPreviewSrc(
        `/api/admin/marketing/graphics/preview?state=${toBase64Url({ template, shape })}`,
      )
    }, 250)
    return () => clearTimeout(t)
  }, [template, shape])

  function updateSlot(id: string, patch: Partial<TemplateSlot>) {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }
  function updateStyle(id: string, patch: Partial<NonNullable<TemplateSlot['style']>>) {
    setSlots((prev) =>
      prev.map((s) => (s.id === id ? { ...s, style: { ...s.style, ...patch } } : s)),
    )
  }
  function addSlot(type: SlotType) {
    setSlots((prev) => [...prev, blankSlot(type)])
  }
  function removeSlot(id: string) {
    setSlots((prev) => prev.filter((s) => s.id !== id))
  }
  function reorder(from: number, to: number) {
    setSlots((prev) => {
      if (to < 0 || to >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  async function uploadBgPhoto(file: File) {
    setError(null)
    try {
      const path = `templates/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${file.name.split('.').pop() ?? 'jpg'}`
      const { error: upErr } = await supabase.storage
        .from('social-graphics')
        .upload(path, file, { upsert: false, cacheControl: '31536000' })
      if (upErr) throw new Error(upErr.message)
      const { data } = supabase.storage.from('social-graphics').getPublicUrl(path)
      setBgPhoto(data.publicUrl)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    }
  }

  async function save() {
    setError(null)
    if (!name.trim()) return setError('Give the template a name.')
    if (slots.length === 0) return setError('Add at least one slot.')
    setSaving(true)
    try {
      const payload = {
        ...(initial.id ? { id: initial.id } : {}),
        name: name.trim(),
        shape,
        background:
          bgType === 'color'
            ? { type: 'color', value: bgColor }
            : { type: 'photo', value: bgPhoto },
        slots,
      }
      const res = await fetch('/api/admin/marketing/templates', {
        method: initial.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Save failed')
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 md:p-8">
      <AdminPageHeader
        title={initial.id ? 'Edit template' : 'New template'}
        description="Add ordered slots, set the background, and style each block. The preview updates live."
        breadcrumbs={[
          { label: 'Marketing', href: '/dashboard/marketing' },
          { label: 'Templates', href: '/dashboard/marketing/templates' },
          { label: initial.id ? 'Edit' : 'New' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" icon={<ArrowLeft size={15} />} onClick={onCancel}>
              Back
            </Button>
            <Button onClick={save} loading={saving}>
              Save template
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        {/* ── Controls ─────────────────────────────────────── */}
        <div className="space-y-5">
          <Card className="p-5 space-y-4">
            <Input label="Template name" value={name} onChange={(e) => setName(e.target.value)} />
            <Select
              label="Shape"
              options={BUILDER_SHAPES.map((s) => ({ value: s, label: SHAPE_LABELS[s] }))}
              value={shape}
              onChange={(e) => setShape(e.target.value as GraphicShape)}
            />

            <div>
              <label className="block font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-2">
                Background
              </label>
              <div className="flex gap-2 mb-3">
                {(['color', 'photo'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setBgType(m)}
                    className={cn(
                      'px-3 py-1.5 rounded-[var(--radius-md)] border text-sm capitalize transition-colors',
                      bgType === m ? 'border-gold bg-gold-muted text-text' : 'border-border text-text-muted hover:text-text',
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
              {bgType === 'color' ? (
                <div className="flex flex-wrap items-center gap-2">
                  {BRAND_SWATCHES.map((sw) => (
                    <button
                      key={sw.value}
                      type="button"
                      title={sw.label}
                      onClick={() => setBgColor(sw.value)}
                      className={cn(
                        'w-8 h-8 rounded-full border-2 transition-transform',
                        bgColor.toLowerCase() === sw.value.toLowerCase()
                          ? 'border-gold scale-110'
                          : 'border-border',
                      )}
                      style={{ backgroundColor: sw.value }}
                    />
                  ))}
                  <input
                    type="text"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="w-28 px-2.5 py-1.5 rounded-[var(--radius-md)] border border-border bg-surface text-sm text-text"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-text-dim">
                    Optional default photo. When a piece is generated the real event/uploaded photo
                    is dropped in per-post; this default is just for the preview.
                  </p>
                  {bgPhoto && (
                    <div className="relative w-full max-w-[220px]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={bgPhoto} alt="" className="w-full rounded-[var(--radius-md)]" />
                      <button
                        type="button"
                        onClick={() => setBgPhoto('')}
                        className="absolute top-1 right-1 bg-surface/90 rounded-full p-1 text-text-muted hover:text-text"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  <label className="inline-flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] border border-dashed border-border text-sm text-text-muted cursor-pointer hover:border-gold">
                    <ImagePlus size={15} /> Upload photo
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) uploadBgPhoto(f)
                      }}
                    />
                  </label>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-medium text-text">Slots</p>
              <div className="flex flex-wrap gap-1.5">
                {(['heading', 'subtext', 'fixed', 'photo'] as SlotType[]).map((tp) => {
                  const M = SLOT_TYPE_META[tp]
                  return (
                    <Button key={tp} size="sm" variant="secondary" icon={<M.icon size={13} />} onClick={() => addSlot(tp)}>
                      {M.label}
                    </Button>
                  )
                })}
              </div>
            </div>

            {slots.length === 0 ? (
              <p className="text-sm text-text-dim py-4 text-center">
                No slots yet — add a heading, subtext, fixed line or photo above.
              </p>
            ) : (
              <div className="space-y-3">
                {slots.map((slot, i) => {
                  const M = SLOT_TYPE_META[slot.type]
                  const isText = slot.type !== 'photo'
                  return (
                    <div
                      key={slot.id}
                      draggable
                      onDragStart={() => (dragIndex.current = i)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragIndex.current !== null && dragIndex.current !== i) {
                          reorder(dragIndex.current, i)
                        }
                        dragIndex.current = null
                      }}
                      className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3 space-y-3"
                    >
                      <div className="flex items-center gap-2">
                        <GripVertical size={15} className="text-text-dim cursor-grab shrink-0" />
                        <M.icon size={15} className="text-gold shrink-0" />
                        <span className="text-sm font-medium text-text">{M.label}</span>
                        <span className="text-xs text-text-dim">
                          {slot.text_source === 'ai' && isText ? '· AI-written' : isText ? '· fixed' : ''}
                        </span>
                        <div className="flex-1" />
                        <button
                          type="button"
                          onClick={() => reorder(i, i - 1)}
                          disabled={i === 0}
                          className="text-text-dim hover:text-text disabled:opacity-30 text-xs px-1"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => reorder(i, i + 1)}
                          disabled={i === slots.length - 1}
                          className="text-text-dim hover:text-text disabled:opacity-30 text-xs px-1"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => removeSlot(slot.id)}
                          className="text-text-dim hover:text-accent-warm px-1"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <Select
                          label="Zone"
                          options={[
                            { value: 'top', label: 'Top' },
                            { value: 'middle', label: 'Middle' },
                            { value: 'bottom', label: 'Bottom' },
                          ]}
                          value={slot.zone}
                          onChange={(e) => updateSlot(slot.id, { zone: e.target.value as SlotZone })}
                        />
                        <Select
                          label="Align"
                          options={[
                            { value: 'left', label: 'Left' },
                            { value: 'center', label: 'Center' },
                            { value: 'right', label: 'Right' },
                          ]}
                          value={slot.align}
                          onChange={(e) => updateSlot(slot.id, { align: e.target.value as SlotAlign })}
                        />
                      </div>

                      {isText && (
                        <>
                          <Select
                            label="Text source"
                            options={[
                              { value: 'ai', label: 'AI-written (filled at generation)' },
                              { value: 'fixed', label: 'Fixed (a constant line)' },
                            ]}
                            value={slot.text_source}
                            onChange={(e) =>
                              updateSlot(slot.id, {
                                text_source: e.target.value as 'ai' | 'fixed',
                              })
                            }
                          />
                          {slot.text_source === 'fixed' && (
                            <Textarea
                              label="Fixed text"
                              value={slot.fixed_text ?? ''}
                              onChange={(e) => updateSlot(slot.id, { fixed_text: e.target.value })}
                              className="min-h-[60px]"
                            />
                          )}
                          <div className="grid grid-cols-3 gap-2">
                            <Select
                              label="Font"
                              options={FONT_CHOICES.map((f) => ({ value: f, label: f }))}
                              value={slot.style?.font ?? 'sans'}
                              onChange={(e) => updateStyle(slot.id, { font: e.target.value as 'serif' | 'sans' })}
                            />
                            <Input
                              label="Size"
                              type="number"
                              value={slot.style?.size ?? ''}
                              onChange={(e) =>
                                updateStyle(slot.id, { size: Number(e.target.value) || undefined })
                              }
                            />
                            <div>
                              <label className="block font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-1.5">
                                Colour
                              </label>
                              <div className="flex items-center gap-1">
                                {BRAND_SWATCHES.map((sw) => (
                                  <button
                                    key={sw.value}
                                    type="button"
                                    title={sw.label}
                                    onClick={() => updateStyle(slot.id, { color: sw.value })}
                                    className={cn(
                                      'w-6 h-6 rounded-full border-2',
                                      (slot.style?.color ?? '').toLowerCase() === sw.value.toLowerCase()
                                        ? 'border-gold'
                                        : 'border-border',
                                    )}
                                    style={{ backgroundColor: sw.value }}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                      {slot.type === 'photo' && (
                        <p className="text-xs text-text-dim">
                          An inline photo block — the real photo is chosen per-post at generation.
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          {error && <p className="text-sm text-accent-warm">{error}</p>}
        </div>

        {/* ── Live preview ─────────────────────────────────── */}
        <div>
          <div className="lg:sticky lg:top-6 space-y-2">
            <p className="text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted">
              Live preview
            </p>
            <Card className="p-4 bg-surface-2 flex items-center justify-center">
              {previewSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewSrc}
                  alt="Template preview"
                  className="max-w-full rounded-[var(--radius-md)] shadow-md"
                  style={{ aspectRatio: `${SHAPE_DIMS[shape].w} / ${SHAPE_DIMS[shape].h}` }}
                />
              ) : (
                <div className="py-16 text-text-dim text-sm">Rendering…</div>
              )}
            </Card>
            <p className="text-xs text-text-dim">
              AI text slots show placeholder copy here; they are written from your event or topic when
              you generate a post using this template.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
