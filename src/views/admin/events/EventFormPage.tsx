'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/providers/AuthProvider'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ImageUpload } from '@/components/ui/ImageUpload'
import { MultiImageUpload } from '@/components/ui/MultiImageUpload'
import { DateTimeField } from '@/components/ui/DateTimeField'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { Plus, Trash2, Save, Send } from 'lucide-react'
import { slugify } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────
// Event create / edit form
//
// Field-by-field mapping to the public site (so the form's UI signals
// which inputs feed which surfaces):
//
//   Public                       ← Field
//   ────────────────────────────   ─────────────────────────────────
//   /events card hero            ← cover_image_url
//   /events card title           ← title (always required)
//   /events card type tag        ← event_type
//   /events card date/time       ← start_date (+ optional doors_open)
//   /events card venue line      ← venue_name + venue_city
//   /events card price line      ← member_price / guest_price
//   /events card teaser          ← description (line-clamped)
//   /events/[slug] hero          ← cover_image_url + title + start_date
//   /events/[slug] body          ← description (paragraphs)
//   /events/[slug] particulars   ← start_date, doors_open, full venue,
//                                  capacity, member/guest price
//   /events/[slug] agenda        ← agenda[] (time, title, description)
//   /events/[slug] past gallery  ← gallery_urls[] (only on past events)
//
// Empty optional fields are hidden on the frontend. Required fields are
// marked as such in the schema below.
// ─────────────────────────────────────────────────────────────────────

const speakerSchema = z.object({
  name: z.string().min(1, 'Name required'),
  title: z.string().optional(),
})

const agendaSchema = z.object({
  time: z.string().min(1, 'Time required'),
  title: z.string().min(1, 'Title required'),
  description: z.string().optional(),
})

const eventSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  slug: z.string().min(1, 'Slug is required'),
  description: z.string().optional(),
  event_type: z.enum(['member_event', 'curated_luxury', 'retreat']),
  venue_name: z.string().optional(),
  venue_address: z.string().optional(),
  venue_city: z.string().optional(),
  venue_postcode: z.string().optional(),
  venue_url: z.string().optional(),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().optional(),
  doors_open: z.string().optional(),
  capacity: z.coerce.number().int().positive().optional().or(z.literal(0)),
  guest_ticket_capacity: z.coerce.number().int().min(0).optional().or(z.literal(0)),
  member_price: z.coerce.number().min(0),
  guest_price: z.coerce.number().min(0),
  sponsor_price: z.coerce.number().min(0),
  travel_included: z.boolean(),
  accommodation_available: z.boolean(),
  accommodation_price: z.coerce.number().min(0),
  guest_list_visible: z.boolean(),
  auto_confirm: z.boolean(),
  cover_image_url: z.string().optional(),
  gallery_urls: z.array(z.string()).default([]),
  speakers: z.array(speakerSchema),
  agenda: z.array(agendaSchema),
})

type EventFormData = z.infer<typeof eventSchema>

const eventTypeOptions = [
  { value: 'member_event', label: 'Member Event' },
  { value: 'curated_luxury', label: 'Curated Luxury' },
  { value: 'retreat', label: 'Retreat' },
]

export function EventFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const router = useRouter()
  const { user } = useAuth()
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const form = useForm<EventFormData>({
    resolver: zodResolver(eventSchema) as any,
    defaultValues: {
      event_type: 'member_event',
      member_price: 0,
      guest_price: 0,
      sponsor_price: 0,
      accommodation_price: 0,
      travel_included: false,
      accommodation_available: false,
      guest_list_visible: false,
      auto_confirm: true,
      gallery_urls: [],
      speakers: [],
      agenda: [],
    },
  })

  const speakersField = useFieldArray({ control: form.control, name: 'speakers' })
  const agendaField = useFieldArray({ control: form.control, name: 'agenda' })

  // Auto-generate slug from title on create. On edit we don't touch
  // the slug because it's already the public URL.
  const title = form.watch('title')
  useEffect(() => {
    if (!isEdit && title) {
      form.setValue('slug', slugify(title), { shouldValidate: true })
    }
  }, [title, isEdit, form])

  // Fetch existing event for edit
  useEffect(() => {
    if (isEdit && id) {
      supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .single()
        .then(({ data }) => {
          if (data) {
            form.reset({
              title: data.title,
              slug: data.slug,
              description: data.description ?? '',
              event_type: data.event_type,
              venue_name: data.venue_name ?? '',
              venue_address: data.venue_address ?? '',
              venue_city: data.venue_city ?? '',
              venue_postcode: data.venue_postcode ?? '',
              venue_url: data.venue_url ?? '',
              start_date: data.start_date ? new Date(data.start_date).toISOString().slice(0, 16) : '',
              end_date: data.end_date ? new Date(data.end_date).toISOString().slice(0, 16) : '',
              doors_open: data.doors_open ? new Date(data.doors_open).toISOString().slice(0, 16) : '',
              capacity: data.capacity ?? 0,
              guest_ticket_capacity: data.guest_ticket_capacity ?? 0,
              member_price: data.member_price_pence / 100,
              guest_price: data.guest_price_pence / 100,
              sponsor_price: data.sponsor_price_pence / 100,
              travel_included: data.travel_included,
              accommodation_available: data.accommodation_available,
              accommodation_price: (data.accommodation_price_pence ?? 0) / 100,
              guest_list_visible: data.guest_list_visible,
              auto_confirm: data.auto_confirm,
              cover_image_url: data.cover_image_url ?? '',
              gallery_urls: (data.gallery_urls as string[] | null) ?? [],
              speakers: (data.speakers as Array<{ name: string; title?: string }>) ?? [],
              agenda: (data.agenda as Array<{ time: string; title: string; description?: string }>) ?? [],
            })
          }
          setLoading(false)
        })
    }
  }, [id, isEdit, form])

  async function onSubmit(data: EventFormData, publish = false) {
    setSaving(true)
    setError(null)

    const payload = {
      title: data.title,
      slug: data.slug,
      description: data.description || null,
      event_type: data.event_type,
      status: publish ? ('published' as const) : isEdit ? undefined : ('draft' as const),
      venue_name: data.venue_name || null,
      venue_address: data.venue_address || null,
      venue_city: data.venue_city || null,
      venue_postcode: data.venue_postcode || null,
      venue_url: data.venue_url || null,
      start_date: new Date(data.start_date).toISOString(),
      end_date: data.end_date ? new Date(data.end_date).toISOString() : null,
      doors_open: data.doors_open ? new Date(data.doors_open).toISOString() : null,
      capacity: data.capacity ? Number(data.capacity) : null,
      guest_ticket_capacity: data.guest_ticket_capacity ? Number(data.guest_ticket_capacity) : 0,
      member_price_pence: Math.round(data.member_price * 100),
      guest_price_pence: Math.round(data.guest_price * 100),
      sponsor_price_pence: Math.round(data.sponsor_price * 100),
      travel_included: data.travel_included,
      accommodation_available: data.accommodation_available,
      accommodation_price_pence: Math.round(data.accommodation_price * 100),
      guest_list_visible: data.guest_list_visible,
      auto_confirm: data.auto_confirm,
      cover_image_url: data.cover_image_url || null,
      gallery_urls: data.gallery_urls && data.gallery_urls.length > 0 ? data.gallery_urls : null,
      speakers: data.speakers,
      agenda: data.agenda,
    }

    try {
      if (isEdit && id) {
        const { error: err } = await supabase.from('events').update(payload).eq('id', id)
        if (err) throw err
        router.push(`/dashboard/events/${id}`)
      } else {
        const { data: created, error: err } = await supabase
          .from('events')
          .insert({ ...payload, status: publish ? 'published' : 'draft', created_by: user?.id ?? null })
          .select('id')
          .single()
        if (err) throw err
        router.push(`/dashboard/events/${created.id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save event')
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading event…</span>
        </div>
      </div>
    )
  }

  const accomOn = form.watch('accommodation_available')

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <AdminPageHeader
        title={isEdit ? 'Edit event' : 'Create event'}
        description={
          isEdit
            ? 'Update event details, pricing, agenda, and gallery. Every field below maps to a slot on the public site — empty optional fields are hidden, not shown blank.'
            : 'Build a new event end-to-end. You can save it as a draft first and publish once details are confirmed. Empty optional fields are hidden on the public site rather than displayed blank.'
        }
        backHref="/dashboard/events"
        breadcrumbs={[
          { label: 'Events', href: '/dashboard/events' },
          { label: isEdit ? 'Edit' : 'New' },
        ]}
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Save size={14} />}
              size="sm"
              loading={saving}
              onClick={form.handleSubmit((d: EventFormData) => onSubmit(d, false))}
            >
              {isEdit ? 'Save changes' : 'Save as draft'}
            </Button>
            {!isEdit && (
              <Button
                icon={<Send size={14} />}
                size="sm"
                loading={saving}
                onClick={form.handleSubmit((d: EventFormData) => onSubmit(d, true))}
              >
                Save &amp; publish
              </Button>
            )}
          </>
        }
      />

      {error && (
        <div className="mb-5 px-4 py-3 rounded-[var(--radius-md)] bg-[rgba(196,105,74,0.08)] border border-[rgba(196,105,74,0.2)]">
          <p className="text-sm text-accent-warm">{error}</p>
        </div>
      )}

      <div className="space-y-6">
        {/* ── Basic info ─────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Basic information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Event title"
                error={form.formState.errors.title?.message}
                {...form.register('title')}
              />
              <Input
                label="Slug"
                hint="Used as the URL: /events/<slug>"
                error={form.formState.errors.slug?.message}
                {...form.register('slug')}
              />
            </div>
            <Select label="Event type" options={eventTypeOptions} {...form.register('event_type')} />
            <Textarea
              label="Description"
              rows={6}
              placeholder="What is the evening about? Separate paragraphs with a blank line — they'll render as separate paragraphs on the event page."
              hint="Shown on the public event card (line-clamped) and as the editorial body on the detail page. Hidden if empty."
              {...form.register('description')}
            />
            <ImageUpload
              label="Cover image"
              value={form.watch('cover_image_url')}
              onChange={(url) => form.setValue('cover_image_url', url ?? '', { shouldDirty: true })}
              bucket="content"
              folder="events"
              aspect="16 / 10"
              hint="Used on event cards, the dashboard list, and the detail-page hero. Landscape works best. Falls back to the event's first letter if blank."
            />
          </CardContent>
        </Card>

        {/* ── Date & time ────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Date &amp; time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Controller
                control={form.control}
                name="start_date"
                render={({ field, fieldState }) => (
                  <DateTimeField
                    label="Start date & time"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    error={fieldState.error?.message}
                  />
                )}
              />
              <Controller
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <DateTimeField
                    label="End date & time"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                  />
                )}
              />
              <Controller
                control={form.control}
                name="doors_open"
                render={({ field }) => (
                  <DateTimeField
                    label="Doors open"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    hint="If set, the public time line reads “Doors HH:MM · From HH:MM”."
                  />
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Venue ───────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Venue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Venue name" {...form.register('venue_name')} />
              <Input
                label="Website"
                placeholder="https://"
                hint="Optional — internal reference only, not shown publicly."
                {...form.register('venue_url')}
              />
              <Input label="Address" className="md:col-span-2" {...form.register('venue_address')} />
              <Input label="City" {...form.register('venue_city')} />
              <Input label="Postcode" {...form.register('venue_postcode')} />
            </div>
            <p className="mt-3 text-[11.5px] text-text-dim">
              The card line shows <span className="text-text-muted">venue + city</span>. The detail-page
              particulars row joins all four with commas, skipping any that are blank.
            </p>
          </CardContent>
        </Card>

        {/* ── Capacity & pricing ──────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Capacity &amp; pricing</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Total capacity"
                type="number"
                hint="Shown publicly as “N seats”. Hidden if blank."
                {...form.register('capacity')}
              />
              <Input
                label="Guest spots (within capacity)"
                type="number"
                hint="Internal — caps how many guest tickets the booking widget can sell."
                {...form.register('guest_ticket_capacity')}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
              <Input
                label="Member price"
                type="number"
                step="0.01"
                prefix="£"
                hint="0 → “Complimentary” for members."
                {...form.register('member_price', { valueAsNumber: true })}
              />
              <Input
                label="Guest price"
                type="number"
                step="0.01"
                prefix="£"
                hint="0 → “Complimentary” for guests."
                {...form.register('guest_price', { valueAsNumber: true })}
              />
              <Input
                label="Sponsor price"
                type="number"
                step="0.01"
                prefix="£"
                hint="Internal — not shown on the public site."
                {...form.register('sponsor_price', { valueAsNumber: true })}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Options ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Options</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6">
              {[
                { name: 'travel_included' as const, label: 'Travel included' },
                { name: 'accommodation_available' as const, label: 'Accommodation available' },
                { name: 'guest_list_visible' as const, label: 'Guest list visible to members' },
                { name: 'auto_confirm' as const, label: 'Auto-confirm bookings' },
              ].map(({ name, label }) => (
                <label key={name} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-border text-gold accent-gold"
                    {...form.register(name)}
                  />
                  <span className="text-sm text-text">{label}</span>
                </label>
              ))}
            </div>
            {accomOn && (
              <div className="mt-4 max-w-xs">
                <Input
                  label="Accommodation price"
                  type="number"
                  step="0.01"
                  prefix="£"
                  {...form.register('accommodation_price', { valueAsNumber: true })}
                />
              </div>
            )}
            <p className="mt-4 text-[11.5px] text-text-dim">
              These flags are internal (used by the booking widget + portal). They aren't rendered as labels on the public detail page.
            </p>
          </CardContent>
        </Card>

        {/* ── Agenda — public ─────────────────────────────────────── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>Agenda</CardTitle>
              <p className="text-[11.5px] text-text-dim mt-1">
                Renders the timeline on the public detail page. Hidden entirely if empty.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => agendaField.append({ time: '', title: '', description: '' })}
            >
              Add item
            </Button>
          </CardHeader>
          <CardContent>
            {agendaField.fields.length === 0 ? (
              <p className="text-sm text-text-dim">No agenda items yet.</p>
            ) : (
              <div className="space-y-3">
                {agendaField.fields.map((field, index) => (
                  <div
                    key={field.id}
                    className="flex flex-col sm:flex-row gap-3 sm:items-end pb-3 border-b border-border/60 last:border-b-0 last:pb-0"
                  >
                    <div className="sm:w-28">
                      <Input
                        label={index === 0 ? 'Time' : undefined}
                        placeholder="19:00"
                        {...form.register(`agenda.${index}.time`)}
                      />
                    </div>
                    <div className="flex-1">
                      <Input
                        label={index === 0 ? 'Title' : undefined}
                        placeholder="Welcome reception"
                        {...form.register(`agenda.${index}.title`)}
                      />
                    </div>
                    <div className="flex-1">
                      <Input
                        label={index === 0 ? 'Description' : undefined}
                        placeholder="Optional"
                        {...form.register(`agenda.${index}.description`)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => agendaField.remove(index)}
                      className="self-end p-2.5 text-text-dim hover:text-accent-warm transition-colors"
                      aria-label="Remove agenda item"
                    >
                      <Trash2 size={16} strokeWidth={1.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Gallery (past events) ───────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Photo gallery</CardTitle>
            <p className="text-[11.5px] text-text-dim mt-1">
              Shown only on the public detail page <strong>after the event has happened</strong> — the
              “From the evening” strip. Add 4–12 photos at a 1:1 ratio. The whole section is hidden if no
              photos are added.
            </p>
          </CardHeader>
          <CardContent>
            <MultiImageUpload
              value={form.watch('gallery_urls') ?? []}
              onChange={(urls) =>
                form.setValue('gallery_urls', urls, { shouldDirty: true })
              }
              bucket="content"
              folder="event-galleries"
              maxCount={24}
              hint="Order matters — drag the ◀ / ▶ buttons on each tile to re-sort."
            />
          </CardContent>
        </Card>

        {/* ── Speakers — internal ─────────────────────────────────── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>Speakers</CardTitle>
              <p className="text-[11.5px] text-text-dim mt-1">
                Internal reference for the team — not currently rendered on the public site.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => speakersField.append({ name: '', title: '' })}
            >
              Add speaker
            </Button>
          </CardHeader>
          <CardContent>
            {speakersField.fields.length === 0 ? (
              <p className="text-sm text-text-dim">No speakers added.</p>
            ) : (
              <div className="space-y-3">
                {speakersField.fields.map((field, index) => (
                  <div
                    key={field.id}
                    className="flex flex-col sm:flex-row gap-3 sm:items-end pb-3 border-b border-border/60 last:border-b-0 last:pb-0"
                  >
                    <div className="flex-1">
                      <Input
                        label={index === 0 ? 'Name' : undefined}
                        placeholder="Speaker name"
                        {...form.register(`speakers.${index}.name`)}
                      />
                    </div>
                    <div className="flex-1">
                      <Input
                        label={index === 0 ? 'Title / role' : undefined}
                        placeholder="e.g. Founder, CEO"
                        {...form.register(`speakers.${index}.title`)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => speakersField.remove(index)}
                      className="self-end p-2.5 text-text-dim hover:text-accent-warm transition-colors"
                      aria-label="Remove speaker"
                    >
                      <Trash2 size={16} strokeWidth={1.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
