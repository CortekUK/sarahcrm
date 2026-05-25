'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { toast } from '@/lib/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { Database } from '@/types/database'

type Tag = Database['public']['Tables']['tags']['Row']

const addMemberSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  email: z.string().email('Please enter a valid email'),
  phone: z.string().optional(),
  company_name: z.string().optional(),
  company_description: z.string().optional(),
  company_website: z.string().optional(),
  job_title: z.string().optional(),
  membership_type: z.enum(['individual', 'business']),
  membership_tier: z.enum(['tier_1', 'tier_2', 'tier_3']),
  status: z.enum(['active', 'pending']),
  send_invite: z.boolean(),
  notes: z.string().optional(),
})

type AddMemberFormData = z.infer<typeof addMemberSchema>

interface AddMemberModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

const typeOptions = [
  { value: 'individual', label: 'Individual' },
  { value: 'business', label: 'Business' },
]
const tierOptions = [
  { value: 'tier_1', label: 'Tier 1' },
  { value: 'tier_2', label: 'Tier 2' },
  { value: 'tier_3', label: 'Tier 3' },
]
const statusOptions = [
  { value: 'pending', label: 'Pending — awaiting them' },
  { value: 'active', label: 'Active — portal access immediately' },
]

const CATEGORY_LABELS: Record<string, string> = {
  industry: 'Industry',
  interest: 'Interests',
  need: 'Looking for',
}

export function AddMemberModal({ open, onClose, onSuccess }: AddMemberModalProps) {
  const [tags, setTags] = useState<Tag[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddMemberFormData>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: {
      membership_type: 'individual',
      membership_tier: 'tier_1',
      status: 'pending',
      send_invite: true,
    },
  })

  useEffect(() => {
    if (open) {
      fetchTags()
      reset()
      setSelectedTagIds([])
      setError(null)
    }
  }, [open, reset])

  async function fetchTags() {
    const { data } = await supabase
      .from('tags')
      .select('*')
      .order('category')
      .order('name')
    if (data) setTags(data)
  }

  function toggleTag(tagId: string) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    )
  }

  async function onSubmit(data: AddMemberFormData) {
    setLoading(true)
    setError(null)
    try {
      // Hit the server route — it has service-role access to create the
      // auth user and trigger the branded invite email. The previous
      // client-side `supabase.auth.admin.createUser` call silently fell
      // back to `signUp` because the anon key can't do admin operations,
      // which meant new members weren't getting invitation emails.
      const res = await fetch('/api/admin/members/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...data,
          tag_ids: selectedTagIds,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Failed to create member')
      }
      toast({
        title: 'Member added',
        description: json.invite_sent
          ? `${data.first_name} ${data.last_name} — branded invitation email sent.`
          : `${data.first_name} ${data.last_name} — no email sent.`,
      })
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create member')
    } finally {
      setLoading(false)
    }
  }

  const tagsByCategory = tags.reduce<Record<string, Tag[]>>((acc, tag) => {
    if (!acc[tag.category]) acc[tag.category] = []
    acc[tag.category].push(tag)
    return acc
  }, {})

  return (
    <Modal open={open} onClose={onClose} title="Add new member" size="lg">
      {error && (
        <div className="mb-5 px-4 py-3 rounded-[var(--radius-md)] bg-[rgba(196,105,74,0.08)] border border-[rgba(196,105,74,0.2)]">
          <p className="text-sm text-accent-warm">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Personal */}
        <div>
          <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-3">
            Personal details
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="First name"
              error={errors.first_name?.message}
              {...register('first_name')}
            />
            <Input
              label="Last name"
              error={errors.last_name?.message}
              {...register('last_name')}
            />
            <Input
              label="Email"
              type="email"
              error={errors.email?.message}
              {...register('email')}
            />
            <Input label="Phone" {...register('phone')} />
            <Input label="Job title" className="sm:col-span-2" {...register('job_title')} />
          </div>
        </div>

        {/* Company */}
        <div>
          <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-3">
            Company
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Company name" {...register('company_name')} />
            <Input label="Website" placeholder="https://" {...register('company_website')} />
          </div>
          <div className="mt-4">
            <Textarea label="Company description" rows={2} {...register('company_description')} />
          </div>
        </div>

        {/* Membership */}
        <div>
          <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-3">
            Membership
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select label="Type" options={typeOptions} {...register('membership_type')} />
            <Select label="Tier" options={tierOptions} {...register('membership_tier')} />
            <Select label="Status" options={statusOptions} {...register('status')} />
          </div>
          <label className="mt-3 flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-border text-gold accent-gold"
              {...register('send_invite')}
            />
            <span className="text-sm text-text">
              Send branded invitation email
              <span className="text-text-dim font-normal ml-1">
                (lets them set a password and enter the portal)
              </span>
            </span>
          </label>
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div>
            <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-3">
              Tags
            </p>
            <div className="space-y-3">
              {Object.entries(tagsByCategory).map(([category, categoryTags]) => (
                <div key={category}>
                  <p className="text-xs font-medium text-text-muted mb-1.5">
                    {CATEGORY_LABELS[category] ?? category}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {categoryTags.map((tag) => {
                      const selected = selectedTagIds.includes(tag.id)
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleTag(tag.id)}
                          className={cn(
                            'px-2.5 py-1 text-xs rounded-full border transition-colors',
                            selected
                              ? 'bg-gold text-white border-gold'
                              : 'bg-surface text-text-muted border-border hover:border-border-hover',
                          )}
                        >
                          {tag.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <Textarea label="Internal notes" rows={2} placeholder="Optional…" {...register('notes')} />

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="flex-1 sm:flex-none"
          >
            Cancel
          </Button>
          <Button type="submit" loading={loading} className="flex-1 sm:flex-none">
            Add member
          </Button>
        </div>
      </form>
    </Modal>
  )
}
