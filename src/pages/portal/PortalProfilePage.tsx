import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../../lib/supabase/client'
import { useAuth } from '../../providers/AuthProvider'
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { Avatar } from '../../components/ui/Avatar'
import { Badge } from '../../components/ui/Badge'
import { cn } from '../../lib/utils'
import { Save, Check } from 'lucide-react'
import type { Database } from '../../types/database'

type Tag = Database['public']['Tables']['tags']['Row']
type MemberTier = Database['public']['Enums']['membership_tier']

const profileSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  phone: z.string().optional(),
  job_title: z.string().optional(),
  bio: z.string().optional(),
  linkedin_url: z.string().optional(),
  website_url: z.string().optional(),
  company_name: z.string().optional(),
  company_description: z.string().optional(),
  company_website: z.string().optional(),
})

type ProfileFormData = z.infer<typeof profileSchema>

const tierLabels: Record<MemberTier, string> = { tier_1: 'Tier 1', tier_2: 'Tier 2', tier_3: 'Tier 3' }

export function PortalProfilePage() {
  const { profile, user } = useAuth()
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [memberTagIds, setMemberTagIds] = useState<string[]>([])
  const [memberId, setMemberId] = useState<string | null>(null)
  const [memberTier, setMemberTier] = useState<MemberTier | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
  })

  useEffect(() => {
    if (user?.id) fetchProfileData(user.id)
  }, [user?.id])

  async function fetchProfileData(userId: string) {
    const [profileRes, memberRes, tagsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('members').select('id, membership_tier, company_name, company_description, company_website').eq('profile_id', userId).single(),
      supabase.from('tags').select('*').order('category').order('name'),
    ])

    if (profileRes.data) {
      const p = profileRes.data
      reset({
        first_name: p.first_name ?? '',
        last_name: p.last_name ?? '',
        phone: p.phone ?? '',
        job_title: p.job_title ?? '',
        bio: p.bio ?? '',
        linkedin_url: p.linkedin_url ?? '',
        website_url: p.website_url ?? '',
        company_name: memberRes.data?.company_name ?? p.company_name ?? '',
        company_description: memberRes.data?.company_description ?? '',
        company_website: memberRes.data?.company_website ?? '',
      })
    }

    if (memberRes.data) {
      setMemberId(memberRes.data.id)
      setMemberTier(memberRes.data.membership_tier)

      // Fetch member tags
      const { data: tagData } = await supabase
        .from('member_tags')
        .select('tag_id')
        .eq('member_id', memberRes.data.id)
      if (tagData) setMemberTagIds(tagData.map((t) => t.tag_id))
    }

    if (tagsRes.data) setAllTags(tagsRes.data)
    setLoading(false)
  }

  function toggleTag(tagId: string) {
    setMemberTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((i) => i !== tagId) : [...prev, tagId]
    )
  }

  async function onSubmit(data: ProfileFormData) {
    if (!user?.id) return
    setSaving(true)
    setSaved(false)

    // Update profile
    await supabase.from('profiles').update({
      first_name: data.first_name,
      last_name: data.last_name,
      phone: data.phone || null,
      job_title: data.job_title || null,
      bio: data.bio || null,
      linkedin_url: data.linkedin_url || null,
      website_url: data.website_url || null,
    }).eq('id', user.id)

    // Update member company fields
    if (memberId) {
      await supabase.from('members').update({
        company_name: data.company_name || null,
        company_description: data.company_description || null,
        company_website: data.company_website || null,
      }).eq('id', memberId)

      // Sync tags
      await supabase.from('member_tags').delete().eq('member_id', memberId)
      if (memberTagIds.length > 0) {
        await supabase.from('member_tags').insert(
          memberTagIds.map((tagId) => ({ member_id: memberId, tag_id: tagId }))
        )
      }
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-12">
        <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
        <span className="text-sm text-text-muted">Loading profile...</span>
      </div>
    )
  }

  const name = `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim()
  const tagsByCategory = allTags.reduce<Record<string, Tag[]>>((acc, t) => {
    if (!acc[t.category]) acc[t.category] = []
    acc[t.category].push(t)
    return acc
  }, {})

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-text">
          My Profile
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Update your details and interests
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Avatar + summary */}
        <Card>
          <CardContent className="py-6">
            <div className="flex items-center gap-5">
              <Avatar name={name || profile?.email || '?'} src={profile?.avatar_url} size="xl" />
              <div>
                <h2 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-text">
                  {name || 'Member'}
                </h2>
                <p className="text-sm text-text-muted">{profile?.email}</p>
                {memberTier && (
                  <div className="mt-2">
                    <Badge variant="info">{tierLabels[memberTier]}</Badge>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Personal details */}
        <Card>
          <CardHeader><CardTitle>Personal Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="First Name" error={errors.first_name?.message} {...register('first_name')} />
              <Input label="Last Name" error={errors.last_name?.message} {...register('last_name')} />
              <Input label="Phone" {...register('phone')} />
              <Input label="Job Title" {...register('job_title')} />
              <Input label="LinkedIn" placeholder="https://linkedin.com/in/..." {...register('linkedin_url')} />
              <Input label="Website" placeholder="https://" {...register('website_url')} />
            </div>
            <Textarea label="Bio" rows={3} placeholder="Tell other members about yourself..." {...register('bio')} />
          </CardContent>
        </Card>

        {/* Company */}
        <Card>
          <CardHeader><CardTitle>Company</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Company Name" {...register('company_name')} />
              <Input label="Company Website" placeholder="https://" {...register('company_website')} />
            </div>
            <Textarea label="Company Description" rows={2} {...register('company_description')} />
          </CardContent>
        </Card>

        {/* Tags */}
        <Card>
          <CardHeader><CardTitle>Interests & Expertise</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-text-muted mb-4">
              Select tags that represent your industry, interests, and what you're looking for.
              These help us find the best introductions for you.
            </p>
            <div className="space-y-4">
              {Object.entries(tagsByCategory).map(([category, categoryTags]) => (
                <div key={category}>
                  <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-2 capitalize">
                    {category}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {categoryTags.map((tag) => {
                      const selected = memberTagIds.includes(tag.id)
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleTag(tag.id)}
                          className={cn(
                            'px-3 py-1.5 text-sm rounded-full border transition-colors',
                            selected
                              ? 'bg-gold text-white border-gold'
                              : 'bg-surface text-text-muted border-border hover:border-gold hover:text-gold'
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
          </CardContent>
        </Card>

        {/* Save */}
        <div className="flex items-center justify-end gap-3 pb-8">
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-accent">
              <Check size={16} /> Saved successfully
            </span>
          )}
          <Button type="submit" icon={<Save size={14} />} loading={saving}>
            Save Profile
          </Button>
        </div>
      </form>
    </div>
  )
}
