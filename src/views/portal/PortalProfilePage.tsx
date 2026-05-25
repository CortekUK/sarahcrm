'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/providers/AuthProvider'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'
import { Check, Save } from 'lucide-react'
import {
  PortalBadge,
  PortalButton,
  PortalCard,
  PortalField,
  PortalInput,
  PortalLoading,
  PortalPageHeader,
  PortalSectionTitle,
  PortalTextarea,
} from '@/components/portal/PortalChrome'
import type { Database } from '@/types/database'

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

const tierLabels: Record<MemberTier, string> = {
  tier_1: 'Tier I',
  tier_2: 'Tier II',
  tier_3: 'Tier III',
}

const CATEGORY_HEADINGS: Record<string, string> = {
  industry: 'Your industry',
  interest: 'Your interests',
  need: "What you're looking for",
}

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
      supabase
        .from('members')
        .select('id, membership_tier, company_name, company_description, company_website')
        .eq('profile_id', userId)
        .single(),
      supabase.from('tags').select('*').order('category').order('name'),
    ])

    // Pre-fill fallback: when this member applied via the public
    // "Become a Member" widget, we captured a lot of detail in
    // membership_applications. Use the latest approved (or, failing
    // that, most recent) application keyed by email as a fallback for
    // any profile/member field that's empty — so the form arrives
    // pre-populated instead of blank.
    const email = profileRes.data?.email ?? null
    type AppFallback = {
      first_name: string | null
      last_name: string | null
      phone: string | null
      position: string | null
      bio: string | null
      linkedin_url: string | null
      website_url: string | null
      company: string | null
    }
    let app: AppFallback | null = null
    if (email) {
      const { data: appData } = await supabase
        .from('membership_applications')
        .select(
          'first_name, last_name, phone, position, bio, linkedin_url, website_url, company',
        )
        .eq('email', email)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      // Double-cast through unknown — Supabase's strict row types from
      // database.ts don't structurally overlap with this manual shape
      // (column nullability differs), so the direct cast fails type-
      // checking even though the runtime fields match.
      if (appData) app = appData as unknown as AppFallback
    }

    // Profile field || application fallback || empty string. Once the
    // user saves, the application-sourced values get persisted to
    // profiles/members so subsequent loads don't need the fallback.
    const pick = (
      profileVal: string | null | undefined,
      appVal: string | null | undefined,
    ) => profileVal ?? appVal ?? ''

    if (profileRes.data) {
      const p = profileRes.data
      reset({
        first_name: pick(p.first_name, app?.first_name),
        last_name: pick(p.last_name, app?.last_name),
        phone: pick(p.phone, app?.phone),
        job_title: pick(p.job_title, app?.position),
        bio: pick(p.bio, app?.bio),
        linkedin_url: pick(p.linkedin_url, app?.linkedin_url),
        website_url: pick(p.website_url, app?.website_url),
        company_name: pick(
          memberRes.data?.company_name ?? p.company_name,
          app?.company,
        ),
        company_description: memberRes.data?.company_description ?? '',
        company_website: memberRes.data?.company_website ?? '',
      })
    }

    if (memberRes.data) {
      setMemberId(memberRes.data.id)
      setMemberTier(memberRes.data.membership_tier)

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
      prev.includes(tagId) ? prev.filter((i) => i !== tagId) : [...prev, tagId],
    )
  }

  async function onSubmit(data: ProfileFormData) {
    if (!user?.id) return
    setSaving(true)
    setSaved(false)

    await supabase
      .from('profiles')
      .update({
        first_name: data.first_name,
        last_name: data.last_name,
        phone: data.phone || null,
        job_title: data.job_title || null,
        bio: data.bio || null,
        linkedin_url: data.linkedin_url || null,
        website_url: data.website_url || null,
      })
      .eq('id', user.id)

    if (memberId) {
      await supabase
        .from('members')
        .update({
          company_name: data.company_name || null,
          company_description: data.company_description || null,
          company_website: data.company_website || null,
        })
        .eq('id', memberId)

      await supabase.from('member_tags').delete().eq('member_id', memberId)
      if (memberTagIds.length > 0) {
        await supabase
          .from('member_tags')
          .insert(memberTagIds.map((tagId) => ({ member_id: memberId, tag_id: tagId })))
      }
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (loading) {
    return (
      <div className="max-w-[1000px] mx-auto px-6 lg:px-10 py-12">
        <PortalLoading label="Loading your profile" />
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
    <div className="max-w-[1000px] mx-auto px-6 lg:px-10 py-12 lg:py-16">
      <PortalPageHeader
        eyebrow="Your File"
        title="Profile."
        subtitle="The details we hold about you. Keep these current — they drive your introductions and how members find you."
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 lg:space-y-7">
        {/* Identity card */}
        <PortalCard className="p-6 lg:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            <Avatar name={name || profile?.email || '?'} src={profile?.avatar_url} size="xl" />
            <div className="flex-1 min-w-0">
              <h2 className="font-[family-name:var(--font-display)] text-[clamp(1.5rem,2vw,2rem)] text-ivory leading-tight">
                {name || 'Member'}
              </h2>
              <p className="mt-2 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.28em] text-slate-haze">
                {profile?.email}
              </p>
              {memberTier && (
                <div className="mt-4">
                  <PortalBadge variant="upcoming" dot>
                    {tierLabels[memberTier]}
                  </PortalBadge>
                </div>
              )}
            </div>
          </div>
        </PortalCard>

        {/* Personal details */}
        <PortalCard className="p-6 lg:p-8">
          <PortalSectionTitle eyebrow="Personal">Your details.</PortalSectionTitle>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
              <PortalField label="First name" error={errors.first_name?.message}>
                <PortalInput {...register('first_name')} />
              </PortalField>
              <PortalField label="Last name" error={errors.last_name?.message}>
                <PortalInput {...register('last_name')} />
              </PortalField>
              <PortalField label="Phone">
                <PortalInput {...register('phone')} />
              </PortalField>
              <PortalField label="Job title">
                <PortalInput {...register('job_title')} />
              </PortalField>
              <PortalField label="LinkedIn">
                <PortalInput placeholder="https://linkedin.com/in/…" {...register('linkedin_url')} />
              </PortalField>
              <PortalField label="Website">
                <PortalInput placeholder="https://" {...register('website_url')} />
              </PortalField>
            </div>
            <PortalField
              label="A short bio"
              hint="A few lines about you — read by other members and the team."
            >
              <PortalTextarea rows={4} {...register('bio')} />
            </PortalField>
          </div>
        </PortalCard>

        {/* Company */}
        <PortalCard className="p-6 lg:p-8">
          <PortalSectionTitle eyebrow="Your Business">Company.</PortalSectionTitle>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
              <PortalField label="Company name">
                <PortalInput {...register('company_name')} />
              </PortalField>
              <PortalField label="Company website">
                <PortalInput placeholder="https://" {...register('company_website')} />
              </PortalField>
            </div>
            <PortalField label="Company description">
              <PortalTextarea rows={3} {...register('company_description')} />
            </PortalField>
          </div>
        </PortalCard>

        {/* Tags */}
        <PortalCard className="p-6 lg:p-8">
          <PortalSectionTitle eyebrow="Discovery">Tags & interests.</PortalSectionTitle>
          <p className="mb-6 font-[family-name:var(--font-editorial)] italic text-[14px] leading-[1.7] text-ivory-soft/85">
            These drive your introductions — the more specific, the better your matches.
          </p>
          <div className="space-y-7">
            {Object.entries(tagsByCategory).map(([category, categoryTags]) => (
              <div key={category}>
                <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-bronze-light/85 mb-3">
                  {CATEGORY_HEADINGS[category] ?? category}
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
                          'px-3.5 py-1.5 text-[10.5px] font-[family-name:var(--font-meta)] uppercase tracking-[0.22em] rounded-full border transition-all duration-300',
                          selected
                            ? 'border-bronze bg-bronze/15 text-bronze-light'
                            : 'border-graphite-line/55 bg-graphite/30 text-ivory/75 hover:border-bronze/55 hover:text-bronze-light',
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
        </PortalCard>

        {/* Save bar */}
        <div className="flex items-center justify-end gap-5 pt-2 pb-4">
          {saved && (
            <span className="inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.28em] text-emerald-300">
              <Check size={13} strokeWidth={2} />
              Saved
            </span>
          )}
          <PortalButton
            type="submit"
            icon={<Save size={13} strokeWidth={1.5} />}
            loading={saving}
          >
            Save profile
          </PortalButton>
        </div>
      </form>
    </div>
  )
}
