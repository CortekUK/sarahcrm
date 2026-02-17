import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../../../lib/supabase/client'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import { Select } from '../../../components/ui/Select'
import { Textarea } from '../../../components/ui/Textarea'
import { Search } from 'lucide-react'

interface MemberOption {
  id: string
  name: string
  company: string | null
}

interface EventOption {
  id: string
  title: string
}

const schema = z.object({
  member_a_id: z.string().min(1, 'Select Member A'),
  member_b_id: z.string().min(1, 'Select Member B'),
  event_id: z.string().optional(),
  match_reason: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface CreateIntroductionModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  prefillMemberA?: string
  prefillMemberB?: string
}

function MemberPicker({
  label,
  members,
  value,
  onChange,
  excludeId,
  error,
}: {
  label: string
  members: MemberOption[]
  value: string
  onChange: (id: string) => void
  excludeId?: string
  error?: string
}) {
  const [query, setQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)

  const selected = members.find((m) => m.id === value)
  const filtered = members.filter((m) => {
    if (m.id === excludeId) return false
    if (!query) return true
    const q = query.toLowerCase()
    return m.name.toLowerCase().includes(q) || (m.company ?? '').toLowerCase().includes(q)
  })

  return (
    <div className="space-y-1.5">
      <label className="block font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted">
        {label}
      </label>
      <div className="relative">
        <Search
          size={16}
          strokeWidth={1.5}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim"
        />
        <input
          type="text"
          placeholder={selected ? `${selected.name}${selected.company ? ` — ${selected.company}` : ''}` : 'Search members...'}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setShowDropdown(true)
          }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          className="w-full pl-9 pr-3.5 py-2.5 bg-surface text-text text-sm rounded-[var(--radius-md)] border border-border outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-text-dim focus:border-gold focus:shadow-[0_0_0_3px_var(--color-gold-muted)]"
        />
        {selected && !query && (
          <button
            type="button"
            onClick={() => { onChange(''); setQuery('') }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-dim hover:text-text"
          >
            Clear
          </button>
        )}
        {showDropdown && (
          <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-surface border border-border rounded-[var(--radius-md)] shadow-lg max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-text-dim">No members found</div>
            ) : (
              filtered.slice(0, 20).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(m.id)
                    setQuery('')
                    setShowDropdown(false)
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2 transition-colors"
                >
                  <span className="font-medium text-text">{m.name}</span>
                  {m.company && <span className="text-text-dim ml-1">— {m.company}</span>}
                </button>
              ))
            )}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-accent-warm">{error}</p>}
    </div>
  )
}

export function CreateIntroductionModal({
  open,
  onClose,
  onSuccess,
  prefillMemberA,
  prefillMemberB,
}: CreateIntroductionModalProps) {
  const [members, setMembers] = useState<MemberOption[]>([])
  const [events, setEvents] = useState<EventOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      member_a_id: prefillMemberA ?? '',
      member_b_id: prefillMemberB ?? '',
      event_id: '',
      match_reason: '',
    },
  })

  useEffect(() => {
    if (open) {
      fetchData()
      reset({
        member_a_id: prefillMemberA ?? '',
        member_b_id: prefillMemberB ?? '',
        event_id: '',
        match_reason: '',
      })
      setError(null)
    }
  }, [open, reset, prefillMemberA, prefillMemberB])

  async function fetchData() {
    const [membersRes, eventsRes] = await Promise.all([
      supabase
        .from('members')
        .select('id, company_name, profiles(first_name, last_name, company_name)')
        .eq('membership_status', 'active')
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('events')
        .select('id, title')
        .in('status', ['published', 'live'])
        .order('start_date', { ascending: false }),
    ])

    if (membersRes.data) {
      setMembers(
        (membersRes.data as unknown as Array<{
          id: string
          company_name: string | null
          profiles: { first_name: string | null; last_name: string | null; company_name: string | null }
        }>).map((m) => ({
          id: m.id,
          name: `${m.profiles?.first_name ?? ''} ${m.profiles?.last_name ?? ''}`.trim() || 'Unnamed',
          company: m.company_name ?? m.profiles?.company_name ?? null,
        }))
      )
    }
    if (eventsRes.data) {
      setEvents(eventsRes.data.map((e) => ({ id: e.id, title: e.title })))
    }
  }

  async function onSubmit(data: FormData) {
    setLoading(true)
    setError(null)

    // DB constraint: member_a_id < member_b_id (ordered UUIDs)
    const [orderedA, orderedB] =
      data.member_a_id < data.member_b_id
        ? [data.member_a_id, data.member_b_id]
        : [data.member_b_id, data.member_a_id]

    const { error: insertError } = await supabase.from('introductions').insert({
      member_a_id: orderedA,
      member_b_id: orderedB,
      event_id: data.event_id || null,
      match_reason: data.match_reason || null,
      status: 'suggested',
      suggested_at: new Date().toISOString(),
    })

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    setLoading(false)
    onSuccess()
  }

  const eventOptions = [
    { value: '', label: 'No event' },
    ...events.map((e) => ({ value: e.id, label: e.title })),
  ]

  return (
    <Modal open={open} onClose={onClose} title="Create Introduction" size="md">
      {error && (
        <div className="mb-5 px-4 py-3 rounded-[var(--radius-md)] bg-[rgba(196,105,74,0.08)] border border-[rgba(196,105,74,0.2)]">
          <p className="text-sm text-accent-warm">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <Controller
          name="member_a_id"
          control={control}
          render={({ field }) => (
            <MemberPicker
              label="Member A"
              members={members}
              value={field.value}
              onChange={field.onChange}
              excludeId={undefined}
              error={errors.member_a_id?.message}
            />
          )}
        />

        <Controller
          name="member_b_id"
          control={control}
          render={({ field }) => (
            <Controller
              name="member_a_id"
              control={control}
              render={({ field: fieldA }) => (
                <MemberPicker
                  label="Member B"
                  members={members}
                  value={field.value}
                  onChange={field.onChange}
                  excludeId={fieldA.value}
                  error={errors.member_b_id?.message}
                />
              )}
            />
          )}
        />

        <Select
          label="Event (optional)"
          options={eventOptions}
          {...register('event_id')}
        />

        <Textarea
          label="Match Reason"
          rows={3}
          placeholder="Why are these members a good match?"
          {...register('match_reason')}
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            Create Introduction
          </Button>
        </div>
      </form>
    </Modal>
  )
}
