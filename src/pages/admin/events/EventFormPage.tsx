import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../../../lib/supabase/client'
import { useAuth } from '../../../providers/AuthProvider'
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { Textarea } from '../../../components/ui/Textarea'
import { ArrowLeft, Plus, Trash2, Save, Send } from 'lucide-react'
import { slugify } from '../../../lib/utils'

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
  const navigate = useNavigate()
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
      speakers: [],
      agenda: [],
    },
  })

  const speakersField = useFieldArray({ control: form.control, name: 'speakers' })
  const agendaField = useFieldArray({ control: form.control, name: 'agenda' })

  // Auto-generate slug from title
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
      status: publish ? 'published' as const : (isEdit ? undefined : 'draft' as const),
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
      speakers: data.speakers,
      agenda: data.agenda,
    }

    try {
      if (isEdit && id) {
        const { error: err } = await supabase
          .from('events')
          .update(payload)
          .eq('id', id)
        if (err) throw err
        navigate(`/dashboard/events/${id}`)
      } else {
        const { data: created, error: err } = await supabase
          .from('events')
          .insert({ ...payload, status: publish ? 'published' : 'draft', created_by: user?.id ?? null })
          .select('id')
          .single()
        if (err) throw err
        navigate(`/dashboard/events/${created.id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save event')
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading event...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate('/dashboard/events')}
          className="flex items-center gap-2 text-sm text-text-muted hover:text-text transition-colors"
        >
          <ArrowLeft size={16} strokeWidth={1.5} />
          Back to Events
        </button>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            icon={<Save size={14} />}
            size="sm"
            loading={saving}
            onClick={form.handleSubmit((d: EventFormData) => onSubmit(d, false))}
          >
            {isEdit ? 'Save Changes' : 'Save as Draft'}
          </Button>
          {!isEdit && (
            <Button
              icon={<Send size={14} />}
              size="sm"
              loading={saving}
              onClick={form.handleSubmit((d: EventFormData) => onSubmit(d, true))}
            >
              Save & Publish
            </Button>
          )}
        </div>
      </div>

      <h1 className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-text mb-6">
        {isEdit ? 'Edit Event' : 'Create Event'}
      </h1>

      {error && (
        <div className="mb-5 px-4 py-3 rounded-[var(--radius-md)] bg-[rgba(196,105,74,0.08)] border border-[rgba(196,105,74,0.2)]">
          <p className="text-sm text-accent-warm">{error}</p>
        </div>
      )}

      <div className="space-y-6">
        {/* Basic info */}
        <Card>
          <CardHeader><CardTitle>Basic Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Event Title" error={form.formState.errors.title?.message} {...form.register('title')} />
              <Input label="Slug" error={form.formState.errors.slug?.message} {...form.register('slug')} />
            </div>
            <Select label="Event Type" options={eventTypeOptions} {...form.register('event_type')} />
            <Textarea label="Description" rows={3} {...form.register('description')} />
            <Input label="Cover Image URL" placeholder="https://" {...form.register('cover_image_url')} />
          </CardContent>
        </Card>

        {/* Date & time */}
        <Card>
          <CardHeader><CardTitle>Date & Time</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <Input label="Start Date & Time" type="datetime-local" error={form.formState.errors.start_date?.message} {...form.register('start_date')} />
              <Input label="End Date & Time" type="datetime-local" {...form.register('end_date')} />
              <Input label="Doors Open" type="datetime-local" {...form.register('doors_open')} />
            </div>
          </CardContent>
        </Card>

        {/* Venue */}
        <Card>
          <CardHeader><CardTitle>Venue</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Venue Name" {...form.register('venue_name')} />
              <Input label="Website" placeholder="https://" {...form.register('venue_url')} />
              <Input label="Address" className="col-span-2" {...form.register('venue_address')} />
              <Input label="City" {...form.register('venue_city')} />
              <Input label="Postcode" {...form.register('venue_postcode')} />
            </div>
          </CardContent>
        </Card>

        {/* Capacity & pricing */}
        <Card>
          <CardHeader><CardTitle>Capacity & Pricing</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Input label="Total Capacity" type="number" {...form.register('capacity')} />
              <Input label="Guest Spots" type="number" {...form.register('guest_ticket_capacity')} />
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4">
              <Input label="Member Price" type="number" step="0.01" prefix="£" {...form.register('member_price', { valueAsNumber: true })} />
              <Input label="Guest Price" type="number" step="0.01" prefix="£" {...form.register('guest_price', { valueAsNumber: true })} />
              <Input label="Sponsor Price" type="number" step="0.01" prefix="£" {...form.register('sponsor_price', { valueAsNumber: true })} />
            </div>
          </CardContent>
        </Card>

        {/* Options */}
        <Card>
          <CardHeader><CardTitle>Options</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-y-3 gap-x-6">
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
            {form.watch('accommodation_available') && (
              <div className="mt-4 w-64">
                <Input
                  label="Accommodation Price"
                  type="number"
                  step="0.01"
                  prefix="£"
                  {...form.register('accommodation_price', { valueAsNumber: true })}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Speakers — dynamic JSON */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Speakers</CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => speakersField.append({ name: '', title: '' })}
            >
              Add Speaker
            </Button>
          </CardHeader>
          <CardContent>
            {speakersField.fields.length === 0 ? (
              <p className="text-sm text-text-dim">No speakers added</p>
            ) : (
              <div className="space-y-3">
                {speakersField.fields.map((field, index) => (
                  <div key={field.id} className="flex items-end gap-3">
                    <div className="flex-1">
                      <Input
                        label={index === 0 ? 'Name' : undefined}
                        placeholder="Speaker name"
                        {...form.register(`speakers.${index}.name`)}
                      />
                    </div>
                    <div className="flex-1">
                      <Input
                        label={index === 0 ? 'Title / Role' : undefined}
                        placeholder="e.g. Founder, CEO"
                        {...form.register(`speakers.${index}.title`)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => speakersField.remove(index)}
                      className="p-2.5 text-text-dim hover:text-accent-warm transition-colors"
                    >
                      <Trash2 size={16} strokeWidth={1.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Agenda — dynamic JSON */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Agenda</CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => agendaField.append({ time: '', title: '', description: '' })}
            >
              Add Item
            </Button>
          </CardHeader>
          <CardContent>
            {agendaField.fields.length === 0 ? (
              <p className="text-sm text-text-dim">No agenda items</p>
            ) : (
              <div className="space-y-3">
                {agendaField.fields.map((field, index) => (
                  <div key={field.id} className="flex items-end gap-3">
                    <div className="w-28">
                      <Input
                        label={index === 0 ? 'Time' : undefined}
                        placeholder="09:00"
                        {...form.register(`agenda.${index}.time`)}
                      />
                    </div>
                    <div className="flex-1">
                      <Input
                        label={index === 0 ? 'Title' : undefined}
                        placeholder="Agenda item title"
                        {...form.register(`agenda.${index}.title`)}
                      />
                    </div>
                    <div className="flex-1">
                      <Input
                        label={index === 0 ? 'Description' : undefined}
                        placeholder="Optional details"
                        {...form.register(`agenda.${index}.description`)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => agendaField.remove(index)}
                      className="p-2.5 text-text-dim hover:text-accent-warm transition-colors"
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
