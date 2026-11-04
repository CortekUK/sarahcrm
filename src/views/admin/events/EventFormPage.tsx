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
import { PlanningChecklist, PlanningNotes } from './EventPlanningPanel'
import { slugify } from '@/lib/utils'
import { eventErrorMessage, isoToUkLocal, ukLocalToIso } from './eventErrors'

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

// Optional free-text field with a length cap.
const optText = (max: number, label: string) =>
  z.string().max(max, `${label} must be ${max.toLocaleString('en-GB')} characters or fewer`).optional()

// Rows the admin added but left completely blank are dropped rather than
// silently blocking the save; half-filled rows show which field is missing.
const isBlankRow = (r: Record<string, unknown>) =>
  Object.values(r).every((v) => typeof v !== 'string' || v.trim() === '')

const speakerSchema = z
  .object({
    name: z.string().max(200, 'Name is too long'),
    title: z.string().max(200, 'Role is too long').optional(),
  })
  .superRefine((r, ctx) => {
    if (isBlankRow(r)) return // empty row — ignored on save
    if (!r.name.trim()) ctx.addIssue({ code: 'custom', path: ['name'], message: 'Name required (or remove the row)' })
  })

const AGENDA_TIME_RE = /^([01]?\d|2[0-3])[:.][0-5]\d$/

const agendaSchema = z
  .object({
    time: z.string(),
    title: z.string().max(200, 'Title is too long'),
    description: z.string().max(1000, 'Description is too long').optional(),
  })
  .superRefine((r, ctx) => {
    if (isBlankRow(r)) return // empty row — ignored on save
    if (!r.time.trim()) ctx.addIssue({ code: 'custom', path: ['time'], message: 'Time required' })
    else if (!AGENDA_TIME_RE.test(r.time.trim()))
      ctx.addIssue({ code: 'custom', path: ['time'], message: 'Use a 24-hour time, e.g. 19:00' })
    if (!r.title.trim()) ctx.addIssue({ code: 'custom', path: ['title'], message: 'Title required' })
  })

// Money typed in pounds. Blank = 0 (complimentary). Text, not a number box,
// so nothing is pre-filled for typing to append to and bad input gets a
// message instead of the browser silently refusing the save.
const MONEY_RE = /^\d{1,7}(\.\d{1,2})?$/
const moneyField = (label: string) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/^£/, '').replace(/,/g, ''))
    .refine((v) => v === '' || !v.startsWith('-'), `${label} can’t be negative`)
    .refine((v) => v === '' || v.startsWith('-') || MONEY_RE.test(v), `${label} must be an amount in pounds, e.g. 25 or 25.50`)

const WHOLE_RE = /^\d{1,6}$/
const wholeField = (label: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || !v.startsWith('-'), `${label} can’t be negative`)
    .refine((v) => v === '' || v.startsWith('-') || WHOLE_RE.test(v), `${label} must be a whole number`)

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim())
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.')
  } catch {
    return false
  }
}

const eventSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(300, 'Title must be 300 characters or fewer'),
    slug: z
      .string()
      .trim()
      .min(1, 'Slug is required')
      .max(120, 'Slug must be 120 characters or fewer')
      .regex(SLUG_RE, 'Use lower-case letters, numbers and single hyphens only, e.g. summer-party-2026'),
    description: optText(20000, 'Description'),
    event_type: z.enum(['member_event', 'curated_luxury', 'retreat']),
    venue_name: optText(200, 'Venue name'),
    venue_address: optText(300, 'Address'),
    venue_city: optText(100, 'City'),
    venue_postcode: optText(20, 'Postcode'),
    venue_url: z
      .string()
      .trim()
      .max(2000, 'Link is too long')
      .refine((v) => v === '' || isHttpUrl(v), 'Enter a full web address starting with https://')
      .optional(),
    // Optional in the schema because a planning event imported from the
    // spreadsheet often has no date yet ("Q4 2026 (TBC)"). Publishing requires
    // one — checked on submit below, and again by a database trigger.
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    doors_open: z.string().optional(),
    capacity: wholeField('Capacity'),
    guest_ticket_capacity: wholeField('Guest spots'),
    member_price: moneyField('Member price'),
    guest_price: moneyField('Guest price'),
    travel_included: z.boolean(),
    accommodation_available: z.boolean(),
    accommodation_price: moneyField('Accommodation price'),
    guest_list_visible: z.boolean(),
    auto_confirm: z.boolean(),
    vat_mode: z.enum(['included', 'added']),
    vat_rate: z
      .string()
      .trim()
      .refine((v) => /^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) <= 100, 'Enter a VAT rate between 0 and 100'),
    cover_image_url: z
      .string()
      .refine(
        (v) => !v || isHttpUrl(v) || (v.startsWith('/') && !v.startsWith('//')),
        'The cover image must be an uploaded image or an https:// link',
      )
      .optional(),
    gallery_urls: z.array(z.string()).default([]),
    speakers: z.array(speakerSchema),
    agenda: z.array(agendaSchema),
  })
  .superRefine((d, ctx) => {
    const start = d.start_date ? ukLocalToIso(d.start_date) : null
    const end = d.end_date ? ukLocalToIso(d.end_date) : null
    if (start && end && new Date(end) < new Date(start)) {
      ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'The end must be after the start' })
    }
    if (d.end_date && !d.start_date) {
      ctx.addIssue({ code: 'custom', path: ['start_date'], message: 'Add a start date before an end date' })
    }
    const cap = d.capacity ? Number(d.capacity) : null
    const guestCap = d.guest_ticket_capacity ? Number(d.guest_ticket_capacity) : 0
    if (cap != null && Number.isFinite(cap) && Number.isFinite(guestCap) && guestCap > cap) {
      ctx.addIssue({
        code: 'custom',
        path: ['guest_ticket_capacity'],
        message: `Guest spots can’t be more than the total capacity (${cap})`,
      })
    }
  })

const pence = (v: string | undefined) => (v ? Math.round(Number(v) * 100) : 0)

type EventFormData = z.output<typeof eventSchema>

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
  // Imported-from-spreadsheet context: the original cells, shown for reference,
  // and the status, so a planning event stays planning when saved.
  const [planningData, setPlanningData] = useState<unknown>(null)
  const [status, setStatus] = useState<string | null>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const form = useForm<EventFormData>({
    resolver: zodResolver(eventSchema) as any,
    defaultValues: {
      event_type: 'member_event',
      // Blank, not "0": typing into a pre-filled 0 produced "020" / "0-20".
      // Blank prices save as 0 (complimentary).
      capacity: '',
      guest_ticket_capacity: '',
      member_price: '',
      guest_price: '',
      accommodation_price: '',
      travel_included: false,
      accommodation_available: false,
      guest_list_visible: false,
      auto_confirm: true,
      vat_mode: 'included',
      vat_rate: '20',
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
            setPlanningData(data.planning_data ?? null)
            setStatus(data.status)
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
              // Pickers show UK wall-clock time (not UTC, not the laptop's zone).
              start_date: isoToUkLocal(data.start_date),
              end_date: isoToUkLocal(data.end_date),
              doors_open: isoToUkLocal(data.doors_open),
              capacity: data.capacity ? String(data.capacity) : '',
              guest_ticket_capacity: data.guest_ticket_capacity ? String(data.guest_ticket_capacity) : '',
              member_price: data.member_price_pence ? (data.member_price_pence / 100).toFixed(2) : '',
              guest_price: data.guest_price_pence ? (data.guest_price_pence / 100).toFixed(2) : '',
              travel_included: data.travel_included,
              accommodation_available: data.accommodation_available,
              accommodation_price: data.accommodation_price_pence
                ? (data.accommodation_price_pence / 100).toFixed(2)
                : '',
              guest_list_visible: data.guest_list_visible,
              auto_confirm: data.auto_confirm,
              vat_mode: data.vat_mode === 'added' ? 'added' : 'included',
              vat_rate: String(data.vat_rate ?? 20),
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
    if (publish) {
      // Mirrors the database trigger — same four requirements, in words.
      const missing = [
        !data.start_date && 'an exact date & start time',
        !data.venue_name?.trim() && 'a venue',
        !(Number(data.capacity) > 0) && 'a capacity',
        !data.description?.trim() && 'a description',
      ].filter(Boolean) as string[]
      if (missing.length > 0) {
        setError(`This event still needs ${missing.join(', ')} before it can be published.`)
        return
      }
      const startIso = ukLocalToIso(data.start_date)
      if (startIso && new Date(startIso) < new Date()) {
        form.setError('start_date', { message: 'This start time is in the past' })
        setError('The start date & time is in the past — an event can’t be published for a date that has gone. Fix the date, or save it as a draft.')
        return
      }
    }
    setSaving(true)
    setError(null)

    const payload = {
      title: data.title.trim(),
      slug: data.slug.trim(),
      description: data.description || null,
      event_type: data.event_type,
      status: publish ? ('published' as const) : isEdit ? undefined : ('draft' as const),
      venue_name: data.venue_name || null,
      venue_address: data.venue_address || null,
      venue_city: data.venue_city || null,
      venue_postcode: data.venue_postcode || null,
      venue_url: data.venue_url || null,
      // Typed times are UK time.
      start_date: ukLocalToIso(data.start_date),
      end_date: ukLocalToIso(data.end_date),
      doors_open: ukLocalToIso(data.doors_open),
      capacity: data.capacity ? Number(data.capacity) : null,
      guest_ticket_capacity: data.guest_ticket_capacity ? Number(data.guest_ticket_capacity) : 0,
      member_price_pence: pence(data.member_price),
      guest_price_pence: pence(data.guest_price),
      travel_included: data.travel_included,
      accommodation_available: data.accommodation_available,
      accommodation_price_pence: pence(data.accommodation_price),
      guest_list_visible: data.guest_list_visible,
      auto_confirm: data.auto_confirm,
      vat_mode: data.vat_mode,
      vat_rate: Number(data.vat_rate),
      cover_image_url: data.cover_image_url || null,
      gallery_urls: data.gallery_urls && data.gallery_urls.length > 0 ? data.gallery_urls : null,
      // Blank rows the admin added but never filled are dropped.
      speakers: data.speakers
        .filter((r) => !isBlankRow(r))
        .map((r) => ({ name: r.name.trim(), title: r.title?.trim() || undefined })),
      agenda: data.agenda
        .filter((r) => !isBlankRow(r))
        .map((r) => ({
          time: r.time.trim().replace('.', ':').padStart(5, '0'),
          title: r.title.trim(),
          description: r.description?.trim() || undefined,
        })),
    }

    try {
      if (isEdit && id) {
        const { error: err } = await supabase.from('events').update(payload).eq('id', id)
        if (err) throw err
        router.push(`/dashboard/events/${id}`)
        return
      } else {
        const { data: created, error: err } = await supabase
          .from('events')
          .insert({ ...payload, status: publish ? 'published' : 'draft', created_by: user?.id ?? null })
          .select('id')
          .single()
        if (err) throw err
        // Open the saved event (draft or published) — replace, so Back
        // doesn't return to an empty "Create event" form inviting a 2nd save.
        router.replace(`/dashboard/events/${created.id}`)
      }
    } catch (err) {
      const msg = eventErrorMessage(err, 'Failed to save event')
      // Point at the field when the database names one.
      const raw = String((err as { message?: string })?.message ?? '')
      if (raw.includes('events_slug')) form.setError('slug', { message: msg })
      else if (raw.includes('events_dates_order_check')) form.setError('end_date', { message: msg })
      else if (raw.includes('events_guest_capacity_check'))
        form.setError('guest_ticket_capacity', { message: msg })
      setError(msg)
      setSaving(false)
    }
  }

  // Validation failed: say so (some invalid fields — e.g. an agenda row —
  // may be scrolled out of view, which used to look like "nothing happened").
  function onInvalid(errors: Record<string, unknown>) {
    const labels: Record<string, string> = {
      title: 'title',
      slug: 'slug',
      description: 'description',
      venue_name: 'venue name',
      venue_address: 'address',
      venue_city: 'city',
      venue_postcode: 'postcode',
      venue_url: 'venue website',
      start_date: 'start date',
      end_date: 'end date',
      capacity: 'capacity',
      guest_ticket_capacity: 'guest spots',
      member_price: 'member price',
      guest_price: 'guest price',
      accommodation_price: 'accommodation price',
      cover_image_url: 'cover image',
      speakers: 'speakers',
      agenda: 'agenda',
    }
    const names = Object.keys(errors).map((k) => labels[k] ?? k)
    setError(`Please fix the highlighted fields: ${names.join(', ')}.`)
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
  const vatMode = form.watch('vat_mode')
  const vatRateText = form.watch('vat_rate')

  return (
    <div className="p-4 md:p-8">
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
              onClick={form.handleSubmit((d: EventFormData) => onSubmit(d, false), onInvalid)}
            >
              {isEdit ? 'Save changes' : 'Save as draft'}
            </Button>
            {(!isEdit || status === 'planning' || status === 'draft') && (
              <Button
                icon={<Send size={14} />}
                size="sm"
                loading={saving}
                onClick={form.handleSubmit((d: EventFormData) => onSubmit(d, true), onInvalid)}
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
        {/* Imported events open here with the spreadsheet row beside the form:
           the checklist says what is still missing, the notes card holds the
           venue shortlist, the "April /May" date and the columns the events
           table has no home for. */}
        {status === 'planning' && (
          <PlanningChecklist
            event={{
              start_date: form.watch('start_date') || null,
              venue_name: form.watch('venue_name') || null,
              capacity: Number(form.watch('capacity')) || null,
              description: form.watch('description') || null,
            }}
          />
        )}
        <PlanningNotes planningData={planningData} />

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
              error={form.formState.errors.description?.message}
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
            {form.formState.errors.cover_image_url?.message && (
              <p className="text-xs text-accent-warm">{form.formState.errors.cover_image_url.message}</p>
            )}
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
                render={({ field, fieldState }) => (
                  <DateTimeField
                    label="End date & time"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    error={fieldState.error?.message}
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
            <p className="mt-3 text-[11.5px] text-text-dim">All times are UK time (Europe/London).</p>
          </CardContent>
        </Card>

        {/* ── Venue ───────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Venue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Venue name"
                maxLength={200}
                error={form.formState.errors.venue_name?.message}
                {...form.register('venue_name')}
              />
              <Input
                label="Website"
                placeholder="https://"
                hint="Optional — internal reference only, not shown publicly."
                error={form.formState.errors.venue_url?.message}
                {...form.register('venue_url')}
              />
              <Input
                label="Address"
                className="md:col-span-2"
                maxLength={300}
                error={form.formState.errors.venue_address?.message}
                {...form.register('venue_address')}
              />
              <Input
                label="City"
                maxLength={100}
                error={form.formState.errors.venue_city?.message}
                {...form.register('venue_city')}
              />
              <Input
                label="Postcode"
                maxLength={20}
                error={form.formState.errors.venue_postcode?.message}
                {...form.register('venue_postcode')}
              />
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
                inputMode="numeric"
                placeholder="e.g. 40"
                hint="Shown publicly as “N seats”. Hidden if blank."
                error={form.formState.errors.capacity?.message}
                {...form.register('capacity')}
              />
              <Input
                label="Guest spots (within capacity)"
                inputMode="numeric"
                placeholder="0"
                hint="Internal — caps how many guest tickets the booking widget can sell."
                error={form.formState.errors.guest_ticket_capacity?.message}
                {...form.register('guest_ticket_capacity')}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <Input
                label="Member price"
                inputMode="decimal"
                placeholder="0.00"
                prefix="£"
                hint="Blank or 0 → “Complimentary” for members."
                error={form.formState.errors.member_price?.message}
                {...form.register('member_price')}
              />
              <Input
                label="Guest price"
                inputMode="decimal"
                placeholder="0.00"
                prefix="£"
                hint="Blank or 0 → “Complimentary” for guests."
                error={form.formState.errors.guest_price?.message}
                {...form.register('guest_price')}
              />
            </div>
            <p className="mt-3 text-[11.5px] text-text-dim">
              Sponsor ticket prices are set per sponsor in the{' '}
              <span className="text-text-muted">Sponsors</span> section after you save the event —
              each sponsor gets their own reserved rate and booking link.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
              <Select
                label="VAT"
                options={[
                  { value: 'included', label: 'Prices include VAT' },
                  { value: 'added', label: 'Add VAT on top of these prices' },
                ]}
                {...form.register('vat_mode')}
              />
              {vatMode === 'added' && (
                <Input
                  label="VAT rate"
                  inputMode="decimal"
                  placeholder="20"
                  suffix="%"
                  error={form.formState.errors.vat_rate?.message}
                  {...form.register('vat_rate')}
                />
              )}
            </div>
            <p className="mt-2 text-[11.5px] text-text-dim">
              {vatMode === 'added'
                ? `Members and guests pay the price plus ${vatRateText}% VAT — e.g. £80.00 is charged as £${(80 * (1 + (Number(vatRateText) || 0) / 100)).toFixed(2)}. Applies to tickets, guests, sponsor rates and accommodation.`
                : 'Members and guests pay exactly the prices above.'}
            </p>
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
                  inputMode="decimal"
                  placeholder="0.00"
                  prefix="£"
                  error={form.formState.errors.accommodation_price?.message}
                  {...form.register('accommodation_price')}
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
                        maxLength={5}
                        error={form.formState.errors.agenda?.[index]?.time?.message}
                        {...form.register(`agenda.${index}.time`)}
                      />
                    </div>
                    <div className="flex-1">
                      <Input
                        label={index === 0 ? 'Title' : undefined}
                        placeholder="Welcome reception"
                        error={form.formState.errors.agenda?.[index]?.title?.message}
                        {...form.register(`agenda.${index}.title`)}
                      />
                    </div>
                    <div className="flex-1">
                      <Input
                        label={index === 0 ? 'Description' : undefined}
                        placeholder="Optional"
                        error={form.formState.errors.agenda?.[index]?.description?.message}
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
                Shown to members on the event page in the portal.
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
                        error={form.formState.errors.speakers?.[index]?.name?.message}
                        {...form.register(`speakers.${index}.name`)}
                      />
                    </div>
                    <div className="flex-1">
                      <Input
                        label={index === 0 ? 'Title / role' : undefined}
                        placeholder="e.g. Founder, CEO"
                        error={form.formState.errors.speakers?.[index]?.title?.message}
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
