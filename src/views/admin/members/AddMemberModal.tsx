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
import { PLAN_OPTIONS } from '@/lib/membership/plans'
import type { Database } from '@/types/database'
import {
  requiredName,
  emailField,
  phoneField,
  urlField,
  shortText,
  longText,
  readJson,
  apiErrorText,
} from './memberValidation'

type Tag = Database['public']['Tables']['tags']['Row']

const addMemberSchema = z.object({
  first_name: requiredName('First name'),
  last_name: requiredName('Last name'),
  email: emailField,
  phone: phoneField,
  company_name: shortText,
  company_description: longText,
  company_website: urlField,
  job_title: shortText,
  // The plan IS the tier — a single choice. membership_type is derived
  // server-side from the tier, so it isn't part of this form.
  membership_tier: z.enum(['tier_1', 'tier_2', 'tier_3']),
  status: z.enum(['active', 'pending']),
  send_invite: z.boolean(),
  notes: longText,
})

type AddMemberFormData = z.infer<typeof addMemberSchema>

interface AddMemberModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

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
      const json = await readJson(res)
      if (!res.ok) {
        // 400 = validation message, 409 = an account with this email
        // already exists (the server never overwrites it). Both are
        // written for the admin, so show them as-is.
        throw new Error(apiErrorText(res, json, 'Failed to create member'))
      }
      toast({
        title: json.invite_sent ? 'Member added — invitation sent' : 'Member added',
        description: json.invite_sent
          ? `${data.first_name} ${data.last_name} has been emailed an invitation to ${data.email}.`
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
            <Input label="Phone" type="tel" error={errors.phone?.message} {...register('phone')} />
            <Input
              label="Job title"
              className="sm:col-span-2"
              error={errors.job_title?.message}
              {...register('job_title')}
            />
          </div>
        </div>

        {/* Company */}
        <div>
          <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-3">
            Company
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Company name" error={errors.company_name?.message} {...register('company_name')} />
            <Input
              label="Website"
              placeholder="https://"
              error={errors.company_website?.message}
              {...register('company_website')}
            />
          </div>
          <div className="mt-4">
            <Textarea
              label="Company description"
              rows={2}
              error={errors.company_description?.message}
              {...register('company_description')}
            />
          </div>
        </div>

        {/* Membership */}
        <div>
          <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-3">
            Membership
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select label="Plan" options={PLAN_OPTIONS} {...register('membership_tier')} />
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

        <Textarea
          label="Internal notes"
          rows={2}
          placeholder="Optional…"
          error={errors.notes?.message}
          {...register('notes')}
        />

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
