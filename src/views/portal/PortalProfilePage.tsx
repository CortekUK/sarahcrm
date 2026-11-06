'use client'

import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/providers/AuthProvider'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'
import { Camera, Check, Eye, Loader2, Save } from 'lucide-react'
import {
  PortalBadge,
  PortalButton,
  PortalCard,
  PortalField,
  PortalInput,
  PortalLoading,
  PortalModal,
  PortalPageHeader,
  PortalSectionTitle,
  PortalTextarea,
} from '@/components/portal/PortalChrome'
import { dbErrorMessage } from '@/components/portal/portal-utils'
import type { Database } from '@/types/database'

type Tag = Database['public']['Tables']['tags']['Row']
type MemberTier = Database['public']['Enums']['membership_tier']

const profileSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required'),
  last_name: z.string().trim().min(1, 'Last name is required'),
  phone: z.string().optional(),
  job_title: z.string().optional(),
  bio: z.string().optional(),
  linkedin_url: z.string().optional(),
  website_url: z.string().optional(),
  company_name: z.string().optional(),
  company_description: z.string().optional(),
  company_website: z.string().optional(),
  // ── Relationship intelligence (member-owned fields) — these drive
  //    matchmaking. Members fill them here; admins see the same values. ──
  sector: z.string().optional(),
  sub_sector: z.string().optional(),
  employee_count: z.string().optional(),
  annual_turnover: z.string().optional(),
  intro_target_types: z.string().optional(),
  intro_target_criteria: z.string().optional(),
  dream_introductions: z.string().optional(),
  what_they_can_offer: z.string().optional(),
  business_objectives: z.string().optional(),
  budgets: z.string().optional(),
  partner_name: z.string().optional(),
  assistant_name: z.string().optional(),
  dietary_requirements: z.string().optional(),
})

type ProfileFormData = z.infer<typeof profileSchema>

const tierLabels: Record<MemberTier, string> = {
  tier_1: 'Access',
  tier_2: 'The Club Membership',
  tier_3: 'The Club Business Membership',
}

const CATEGORY_HEADINGS: Record<string, string> = {
  industry: 'Your industry',
  interest: 'Your interests',
  need: "What you're looking for",
}

export function PortalProfilePage() {
  const { profile, user } = useAuth()
  // Profile photo — kept locally so a new upload shows straight away.
  const [avatarUrl, setAvatarUrl] = useState<string | null | undefined>(undefined)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const avatarInput = useRef<HTMLInputElement>(null)
  const shownAvatar = avatarUrl === undefined ? profile?.avatar_url ?? null : avatarUrl

  async function uploadAvatar(file: File) {
    setAvatarError(null)
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setAvatarError('Please use a JPG, PNG or WebP image.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Photo must be 5 MB or smaller.')
      return
    }
    setAvatarBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/portal/profile/avatar', { method: 'POST', body: fd })
      const json = (await res.json().catch(() => ({}))) as { avatar_url?: string; error?: string }
      if (!res.ok || !json.avatar_url) setAvatarError(json.error ?? 'Upload failed. Please try again.')
      else {
        setAvatarUrl(json.avatar_url)
        setPreviewOpen(false)
      }
    } catch {
      setAvatarError('Upload failed. Please try again.')
    } finally {
      setAvatarBusy(false)
    }
  }

  async function removeAvatar() {
    setAvatarError(null)
    setAvatarBusy(true)
    try {
      const res = await fetch('/api/portal/profile/avatar', { method: 'DELETE' })
      if (res.ok) {
        setAvatarUrl(null)
        setPreviewOpen(false)
      } else setAvatarError('Could not remove your photo.')
    } finally {
      setAvatarBusy(false)
    }
  }
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [memberTagIds, setMemberTagIds] = useState<string[]>([])
  // Tags as last saved — so a save only inserts the new ones and deletes the
  // removed ones, instead of wiping and re-adding everything.
  const [savedTagIds, setSavedTagIds] = useState<string[]>([])
  const [memberId, setMemberId] = useState<string | null>(null)
  const [memberTier, setMemberTier] = useState<MemberTier | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

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
        .select(
          'id, membership_tier, company_name, company_description, company_website, sector, sub_sector, employee_count, annual_turnover, intro_target_types, intro_target_criteria, dream_introductions, what_they_can_offer, business_objectives, budgets, partner_name, assistant_name, dietary_requirements',
        )
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
        sector: memberRes.data?.sector ?? '',
        sub_sector: memberRes.data?.sub_sector ?? '',
        employee_count: memberRes.data?.employee_count ?? '',
        annual_turnover: memberRes.data?.annual_turnover ?? '',
        intro_target_types: memberRes.data?.intro_target_types ?? '',
        intro_target_criteria: memberRes.data?.intro_target_criteria ?? '',
        dream_introductions: memberRes.data?.dream_introductions ?? '',
        what_they_can_offer: memberRes.data?.what_they_can_offer ?? '',
        business_objectives: memberRes.data?.business_objectives ?? '',
        budgets: memberRes.data?.budgets ?? '',
        partner_name: memberRes.data?.partner_name ?? '',
        assistant_name: memberRes.data?.assistant_name ?? '',
        dietary_requirements: memberRes.data?.dietary_requirements ?? '',
      })
    }

    if (memberRes.data) {
      setMemberId(memberRes.data.id)
      setMemberTier(memberRes.data.membership_tier)

      const { data: tagData } = await supabase
        .from('member_tags')
        .select('tag_id')
        .eq('member_id', memberRes.data.id)
      if (tagData) {
        const ids = tagData.map((t) => t.tag_id)
        setMemberTagIds(ids)
        setSavedTagIds(ids)
      }
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
    setSaveError(null)

    const clean = (v: string | undefined) => {
      const t = (v ?? '').trim()
      return t ? t : null
    }
    const firstName = data.first_name.trim()
    const lastName = data.last_name.trim()
    if (!firstName || !lastName) {
      setSaveError('Please enter your first and last name.')
      setSaving(false)
      return
    }

    // Every write's error is checked — "Saved" only shows when all succeed.
    const fail = (err: { message?: string | null }) => {
      setSaveError(dbErrorMessage(err, 'We couldn’t save your profile. Please try again.'))
      setSaving(false)
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        first_name: firstName,
        last_name: lastName,
        phone: clean(data.phone),
        job_title: clean(data.job_title),
        bio: clean(data.bio),
        linkedin_url: clean(data.linkedin_url),
        website_url: clean(data.website_url),
      })
      .eq('id', user.id)
    if (profileError) return fail(profileError)

    if (memberId) {
      const { error: memberError } = await supabase
        .from('members')
        .update({
          company_name: clean(data.company_name),
          company_description: clean(data.company_description),
          company_website: clean(data.company_website),
          sector: clean(data.sector),
          sub_sector: clean(data.sub_sector),
          employee_count: clean(data.employee_count),
          annual_turnover: clean(data.annual_turnover),
          intro_target_types: clean(data.intro_target_types),
          intro_target_criteria: clean(data.intro_target_criteria),
          dream_introductions: clean(data.dream_introductions),
          what_they_can_offer: clean(data.what_they_can_offer),
          business_objectives: clean(data.business_objectives),
          budgets: clean(data.budgets),
          partner_name: clean(data.partner_name),
          assistant_name: clean(data.assistant_name),
          dietary_requirements: clean(data.dietary_requirements),
        })
        .eq('id', memberId)
      if (memberError) return fail(memberError)

      // Tags: add the new ones first, then remove the deselected ones. If
      // either step fails nothing already saved is lost.
      const toAdd = memberTagIds.filter((t) => !savedTagIds.includes(t))
      const toRemove = savedTagIds.filter((t) => !memberTagIds.includes(t))
      if (toAdd.length > 0) {
        const { error: addError } = await supabase
          .from('member_tags')
          .insert(toAdd.map((tagId) => ({ member_id: memberId, tag_id: tagId })))
        if (addError) return fail(addError)
      }
      if (toRemove.length > 0) {
        const { error: removeError } = await supabase
          .from('member_tags')
          .delete()
          .eq('member_id', memberId)
          .in('tag_id', toRemove)
        if (removeError) {
          // The additions did save — remember them so a retry doesn't
          // re-insert them.
          setSavedTagIds(Array.from(new Set([...savedTagIds, ...toAdd])))
          return fail(removeError)
        }
      }
      setSavedTagIds(memberTagIds)
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
            <div className="flex flex-col items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => (shownAvatar ? setPreviewOpen(true) : avatarInput.current?.click())}
                disabled={avatarBusy}
                className="group relative rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-bronze"
                aria-label={shownAvatar ? 'View profile photo' : 'Add profile photo'}
              >
                <Avatar name={name || profile?.email || '?'} src={shownAvatar} size="xl" />
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-ink/60 opacity-0 group-hover:opacity-100 transition-opacity">
                  {avatarBusy ? (
                    <Loader2 size={18} className="animate-spin text-ivory" />
                  ) : shownAvatar ? (
                    <Eye size={18} strokeWidth={1.5} className="text-ivory" />
                  ) : (
                    <Camera size={18} strokeWidth={1.5} className="text-ivory" />
                  )}
                </span>
              </button>
              <input
                ref={avatarInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) void uploadAvatar(f)
                }}
              />
              <div className="flex items-center gap-3 font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.22em]">
                <button
                  type="button"
                  onClick={() => avatarInput.current?.click()}
                  disabled={avatarBusy}
                  className="text-bronze-light hover:text-ivory transition-colors"
                >
                  {shownAvatar ? 'Change photo' : 'Add photo'}
                </button>
                {shownAvatar && (
                  <button
                    type="button"
                    onClick={removeAvatar}
                    disabled={avatarBusy}
                    className="text-slate-haze hover:text-ivory transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
              {avatarError && (
                <p role="alert" className="max-w-[180px] text-center text-[11.5px] text-accent-warm italic">
                  {avatarError}
                </p>
              )}
            </div>
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

        {/* Company depth — feeds matchmaking */}
        <PortalCard className="p-6 lg:p-8">
          <PortalSectionTitle eyebrow="Your Business">Company detail.</PortalSectionTitle>
          <p className="mb-6 font-[family-name:var(--font-editorial)] italic text-[14px] leading-[1.7] text-ivory-soft/85">
            A fuller picture of your business helps us place you with the right people.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            <PortalField label="Sector">
              <PortalInput placeholder="e.g. Hospitality, Fintech" {...register('sector')} />
            </PortalField>
            <PortalField label="Sub-sector">
              <PortalInput placeholder="e.g. Boutique hotels" {...register('sub_sector')} />
            </PortalField>
            <PortalField label="Team size">
              <PortalInput placeholder="e.g. 25" {...register('employee_count')} />
            </PortalField>
            <PortalField label="Annual turnover">
              <PortalInput placeholder="e.g. £2–5M" {...register('annual_turnover')} />
            </PortalField>
          </div>
        </PortalCard>

        {/* Introduction strategy — the heart of matchmaking */}
        <PortalCard className="p-6 lg:p-8">
          <PortalSectionTitle eyebrow="Introductions">Who you'd like to meet.</PortalSectionTitle>
          <p className="mb-6 font-[family-name:var(--font-editorial)] italic text-[14px] leading-[1.7] text-ivory-soft/85">
            The more specific you are, the better the introductions we can make for you.
          </p>
          <div className="space-y-6">
            <PortalField
              label="Who you want to meet"
              hint="The kinds of people or businesses you're hoping to connect with."
            >
              <PortalInput
                placeholder="e.g. Investors, founders in retail, family offices"
                {...register('intro_target_types')}
              />
            </PortalField>
            <PortalField
              label="What makes a great match"
              hint="Any criteria — sector, stage, geography, the situation you're solving for."
            >
              <PortalTextarea rows={3} {...register('intro_target_criteria')} />
            </PortalField>
            <PortalField
              label="Your dream introductions"
              hint="Specific people or companies you'd love to be introduced to."
            >
              <PortalTextarea rows={3} {...register('dream_introductions')} />
            </PortalField>
            <PortalField
              label="What you can offer other members"
              hint="Expertise, access, or opportunities you bring to the room."
            >
              <PortalTextarea rows={3} {...register('what_they_can_offer')} />
            </PortalField>
          </div>
        </PortalCard>

        {/* Goals & preferences */}
        <PortalCard className="p-6 lg:p-8">
          <PortalSectionTitle eyebrow="Goals & Preferences">What you're working towards.</PortalSectionTitle>
          <div className="space-y-6">
            <PortalField
              label="Your objectives"
              hint="What you're hoping to achieve through the club this year."
            >
              <PortalTextarea rows={3} {...register('business_objectives')} />
            </PortalField>
            <PortalField
              label="Budgets"
              hint="Optional — any marketing, events or partnership budget you're working with."
            >
              <PortalTextarea rows={2} {...register('budgets')} />
            </PortalField>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
              <PortalField label="Partner / guest name" hint="Who usually joins you at events.">
                <PortalInput {...register('partner_name')} />
              </PortalField>
              <PortalField label="Assistant / EA name" hint="Who we can copy on logistics.">
                <PortalInput {...register('assistant_name')} />
              </PortalField>
            </div>
            <PortalField
              label="Dietary requirements"
              hint="So dinners and events are arranged around you."
            >
              <PortalTextarea rows={2} {...register('dietary_requirements')} />
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
          {saveError && (
            <p
              role="alert"
              className="font-[family-name:var(--font-editorial)] italic text-[13px] text-accent-warm"
            >
              {saveError}
            </p>
          )}
          {saved && !saveError && (
            <span
              role="status"
              className="inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.28em] text-accent"
            >
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

      {/* Photo preview — outside the card/form so it covers the whole page. */}
      <PortalModal open={previewOpen && !!shownAvatar} onClose={() => setPreviewOpen(false)} title="Profile photo" size="md">
        <div className="flex flex-col items-center gap-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={shownAvatar ?? ''}
            alt={name ? `${name}'s profile photo` : 'Profile photo'}
            className="w-full max-w-[360px] aspect-square rounded-full object-cover border border-graphite-line/60"
          />
          {avatarError && (
            <p role="alert" className="text-[12px] text-accent-warm italic">
              {avatarError}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <PortalButton type="button" onClick={() => avatarInput.current?.click()} disabled={avatarBusy}>
              {avatarBusy ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
              Change photo
            </PortalButton>
            <PortalButton type="button" variant="secondary" onClick={removeAvatar} disabled={avatarBusy}>
              Remove
            </PortalButton>
            <PortalButton type="button" variant="ghost" onClick={() => setPreviewOpen(false)}>
              Close
            </PortalButton>
          </div>
        </div>
      </PortalModal>
    </div>
  )
}
