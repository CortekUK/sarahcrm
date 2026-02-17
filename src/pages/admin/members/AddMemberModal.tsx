import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../../../lib/supabase/client'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { Textarea } from '../../../components/ui/Textarea'
import { cn } from '../../../lib/utils'
import type { Database } from '../../../types/database'

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
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    )
  }

  async function onSubmit(data: AddMemberFormData) {
    setLoading(true)
    setError(null)

    try {
      // 1. Create auth user (invite — they'll set their password)
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: data.email,
        email_confirm: true,
        user_metadata: {
          first_name: data.first_name,
          last_name: data.last_name,
        },
      })

      // If admin.createUser fails (no service role in browser), fall back to invite
      let userId: string | null = null

      if (authError) {
        // Use signUp with a random password — admin will send invite separately
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: data.email,
          password: crypto.randomUUID(),
          options: {
            data: {
              first_name: data.first_name,
              last_name: data.last_name,
            },
          },
        })
        if (signUpError) throw signUpError
        userId = signUpData.user?.id ?? null
      } else {
        userId = authData.user?.id ?? null
      }

      if (!userId) throw new Error('Failed to create user account')

      // 2. Update profile with additional info
      await supabase
        .from('profiles')
        .update({
          phone: data.phone || null,
          company_name: data.company_name || null,
          job_title: data.job_title || null,
        })
        .eq('id', userId)

      // 3. Create member record
      const { data: memberData, error: memberError } = await supabase
        .from('members')
        .insert({
          profile_id: userId,
          membership_type: data.membership_type,
          membership_tier: data.membership_tier,
          membership_status: 'pending',
          company_name: data.company_name || null,
          company_description: data.company_description || null,
          company_website: data.company_website || null,
          notes: data.notes || null,
          membership_start_date: new Date().toISOString().split('T')[0],
        })
        .select('id')
        .single()

      if (memberError) throw memberError

      // 4. Add tags
      if (selectedTagIds.length > 0 && memberData) {
        const tagRows = selectedTagIds.map((tagId) => ({
          member_id: memberData.id,
          tag_id: tagId,
        }))
        await supabase.from('member_tags').insert(tagRows)
      }

      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create member')
    } finally {
      setLoading(false)
    }
  }

  // Group tags by category
  const tagsByCategory = tags.reduce<Record<string, Tag[]>>((acc, tag) => {
    if (!acc[tag.category]) acc[tag.category] = []
    acc[tag.category].push(tag)
    return acc
  }, {})

  return (
    <Modal open={open} onClose={onClose} title="Add New Member" size="lg">
      {error && (
        <div className="mb-5 px-4 py-3 rounded-[var(--radius-md)] bg-[rgba(196,105,74,0.08)] border border-[rgba(196,105,74,0.2)]">
          <p className="text-sm text-accent-warm">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Personal details */}
        <div>
          <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-3">
            Personal Details
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Input label="First Name" error={errors.first_name?.message} {...register('first_name')} />
            <Input label="Last Name" error={errors.last_name?.message} {...register('last_name')} />
            <Input label="Email" type="email" error={errors.email?.message} {...register('email')} />
            <Input label="Phone" {...register('phone')} />
            <Input label="Job Title" {...register('job_title')} />
          </div>
        </div>

        {/* Company */}
        <div>
          <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-3">
            Company
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Company Name" {...register('company_name')} />
            <Input label="Website" placeholder="https://" {...register('company_website')} />
          </div>
          <div className="mt-4">
            <Textarea label="Company Description" rows={2} {...register('company_description')} />
          </div>
        </div>

        {/* Membership */}
        <div>
          <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-3">
            Membership
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Type" options={typeOptions} {...register('membership_type')} />
            <Select label="Tier" options={tierOptions} {...register('membership_tier')} />
          </div>
        </div>

        {/* Tags */}
        <div>
          <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-3">
            Tags
          </p>
          <div className="space-y-3">
            {Object.entries(tagsByCategory).map(([category, categoryTags]) => (
              <div key={category}>
                <p className="text-xs font-medium text-text-muted capitalize mb-1.5">{category}</p>
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
                            : 'bg-surface text-text-muted border-border hover:border-border-hover'
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

        {/* Notes */}
        <Textarea label="Notes" rows={2} placeholder="Internal notes..." {...register('notes')} />

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            Add Member
          </Button>
        </div>
      </form>
    </Modal>
  )
}
