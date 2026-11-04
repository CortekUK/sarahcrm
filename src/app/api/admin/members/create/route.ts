// POST /api/admin/members/create
//
// Manually provisions a member from the admin "Add member" modal — the
// non-application path (e.g. a long-standing contact the team wants to
// onboard without making them fill in the public form).
//
// Steps:
//   1. Create the auth user via service role with inviteUserByEmail so
//      Supabase sends the same branded "Welcome to The Club — set your
//      password" email we use for application approvals. `redirectTo`
//      points at the same /set-password page.
//   2. Update the auto-created profile with the rest of the info.
//   3. Insert the members row with the chosen tier + type.
//   4. Attach the selected tags.
//
// Body:
//   {
//     first_name, last_name, email, phone?, job_title?,
//     company_name?, company_description?, company_website?,
//     membership_type: 'individual' | 'business',
//     membership_tier:  'tier_1' | 'tier_2' | 'tier_3',
//     status?: 'active' | 'pending',     // defaults to 'pending'
//     send_invite?: boolean,             // defaults to true
//     notes?: string,
//     tag_ids?: string[],
//   }

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { sendInviteEmail } from '@/lib/email/invite'
import { planForTier, introQuotaForTier } from '@/lib/membership/plans'
import { siteUrl } from '@/lib/email/site-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RequestBody {
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  job_title?: string
  company_name?: string
  company_description?: string
  company_website?: string
  // membership_type is derived from the tier (the plan) — not accepted from
  // the client. The chosen plan is the tier.
  membership_tier?: 'tier_1' | 'tier_2' | 'tier_3'
  status?: 'active' | 'pending'
  send_invite?: boolean
  notes?: string
  tag_ids?: string[]
}

function getAdminDb() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

const VALID_TIERS = ['tier_1', 'tier_2', 'tier_3']
const VALID_STATUSES = ['active', 'pending']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Clear 400 messages instead of letting the DB reject bad values as a 500.
function validateBody(b: RequestBody): string | null {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  if (!str(b.first_name)) return 'First name is required.'
  if (!str(b.last_name)) return 'Last name is required.'
  if (!str(b.email)) return 'Email is required.'
  if (!EMAIL_RE.test(str(b.email)) || str(b.email).length > 254) return 'Please enter a valid email address.'
  if (b.membership_tier !== undefined && !VALID_TIERS.includes(b.membership_tier)) {
    return 'Unknown membership plan.'
  }
  if (b.status !== undefined && !VALID_STATUSES.includes(b.status)) {
    return "Status must be 'active' or 'pending'."
  }
  const limits: [keyof RequestBody, string, number][] = [
    ['first_name', 'First name', 100],
    ['last_name', 'Last name', 100],
    ['phone', 'Phone', 40],
    ['job_title', 'Job title', 150],
    ['company_name', 'Company name', 200],
    ['company_website', 'Company website', 500],
    ['company_description', 'Company description', 5000],
    ['notes', 'Notes', 10000],
  ]
  for (const [key, label, max] of limits) {
    const v = b[key]
    if (v === undefined || v === null) continue
    if (typeof v !== 'string') return `${label} must be text.`
    if (v.length > max) return `${label} must be ${max} characters or fewer.`
  }
  if (b.company_website?.trim() && !/^https?:\/\/[^\s]+$/i.test(b.company_website.trim())) {
    return 'Company website must start with http:// or https://.'
  }
  if (b.tag_ids !== undefined && (!Array.isArray(b.tag_ids) || b.tag_ids.some((t) => typeof t !== 'string' || !UUID_RE.test(t)))) {
    return 'Invalid tag selection.'
  }
  return null
}

// Escape LIKE wildcards so an ilike() is an exact, case-insensitive match.
function escapeLike(v: string): string {
  return v.replace(/[\\%_]/g, (c) => `\\${c}`)
}

function isAlreadyRegistered(message: string | null | undefined): boolean {
  return /already (been )?registered|already exists|duplicate key/i.test(message ?? '')
}

function alreadyExistsMessage(role: string | null): string {
  if (role === 'admin') return 'This email belongs to an admin account. Use a different email.'
  if (role === 'team_member' || role === 'freelancer') {
    return 'This email belongs to a team member account. Use a different email.'
  }
  return 'An account with this email already exists. Open that member instead of adding them again.'
}

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', status: 401 as const }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') {
    return { error: 'Admin only.', status: 403 as const }
  }
  return { admin: profile }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) {
      return Response.json({ error: auth.error }, { status: auth.status })
    }

    let body: RequestBody
    try {
      body = (await req.json()) as RequestBody
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const invalid = validateBody(body)
    if (invalid) return Response.json({ error: invalid }, { status: 400 })
    // Normalised from here on: trimmed, and the email lower-cased so a
    // capitalised duplicate is caught as a duplicate (not a 500).
    body.first_name = body.first_name!.trim()
    body.last_name = body.last_name!.trim()
    body.email = body.email!.trim().toLowerCase()

    const admin = getAdminDb()

    // 1. Refuse an email that already belongs to an account (member, admin
    //    or staff). Reusing it would silently overwrite that person's name
    //    and turn an admin or staff login into a plain member.
    const { data: existingProfiles } = await admin
      .from('profiles')
      .select('id, role')
      .ilike('email', escapeLike(body.email))
      .limit(1)
    const existingProfile = existingProfiles?.[0]
    if (existingProfile) {
      return Response.json(
        { error: alreadyExistsMessage(existingProfile.role as string) },
        { status: 409 },
      )
    }

    let userId: string
    let inviteSent = false

    {
      const origin = siteUrl() // fixed site URL — never the request's Origin/Host
      const send = body.send_invite !== false
      if (send) {
        // Branded invite via Resend (not Supabase's default mailer).
        const inv = await sendInviteEmail(admin, {
          email: body.email,
          firstName: body.first_name,
          redirectTo: `${origin}/set-password`,
        })
        if (!inv.userId) {
          if (isAlreadyRegistered(inv.error)) {
            return Response.json({ error: alreadyExistsMessage(null) }, { status: 409 })
          }
          return Response.json(
            { error: inv.error ?? 'Failed to create auth user' },
            { status: 500 },
          )
        }
        userId = inv.userId
        inviteSent = inv.emailSent
      } else {
        const created = await admin.auth.admin.createUser({
          email: body.email,
          email_confirm: true,
          user_metadata: { first_name: body.first_name, last_name: body.last_name },
        })
        if (created.error || !created.data.user) {
          if (isAlreadyRegistered(created.error?.message)) {
            return Response.json({ error: alreadyExistsMessage(null) }, { status: 409 })
          }
          return Response.json(
            { error: created.error?.message ?? 'Failed to create auth user' },
            { status: 500 },
          )
        }
        userId = created.data.user.id
      }
    }

    // 2. Update the (brand-new) profile with the rest of the info.
    await admin
      .from('profiles')
      .update({
        role: 'member',
        first_name: body.first_name,
        last_name: body.last_name,
        phone: body.phone ?? null,
        company_name: body.company_name ?? null,
        job_title: body.job_title ?? null,
      })
      .eq('id', userId)

    // 3. Members row — if one already exists for this profile, reactivate.
    const { data: existingMember } = await admin
      .from('members')
      .select('id')
      .eq('profile_id', userId)
      .maybeSingle()

    // The plan (tier) is the source of truth — membership_type and the
    // monthly intro quota are derived from it so they can never mismatch.
    const tier = body.membership_tier ?? 'tier_1'
    const memberPayload = {
      profile_id: userId,
      membership_type: planForTier(tier).membershipType,
      membership_tier: tier,
      monthly_intro_quota: await introQuotaForTier(admin, tier),
      membership_status: body.status ?? 'pending',
      company_name: body.company_name ?? null,
      company_description: body.company_description ?? null,
      company_website: body.company_website ?? null,
      notes: body.notes ?? null,
      membership_start_date: new Date().toISOString().slice(0, 10),
      deleted_at: null,
    }

    let memberId: string
    if (existingMember) {
      const { data: upd, error: updErr } = await admin
        .from('members')
        .update(memberPayload)
        .eq('id', existingMember.id)
        .select('id')
        .single()
      if (updErr) return Response.json({ error: updErr.message }, { status: 500 })
      memberId = upd.id
    } else {
      const { data: ins, error: insErr } = await admin
        .from('members')
        .insert(memberPayload)
        .select('id')
        .single()
      if (insErr) return Response.json({ error: insErr.message }, { status: 500 })
      memberId = ins.id
    }

    // 3b. Connect any prior GUEST bookings made with this email to the
    //     member, so a contact who attended as a guest before being added
    //     sees those bookings in their portal (and they show under the
    //     member in admin). Case-insensitive match; only unlinked rows.
    if (body.email) {
      await admin
        .from('bookings')
        .update({ member_id: memberId, is_guest: false })
        .is('member_id', null)
        .ilike('guest_email', escapeLike(body.email))
    }

    // 4. Tags
    if (body.tag_ids && body.tag_ids.length > 0) {
      // Clear any old tags first so the modal's selection is the source
      // of truth.
      await admin.from('member_tags').delete().eq('member_id', memberId)
      await admin
        .from('member_tags')
        .insert(body.tag_ids.map((tag_id) => ({ member_id: memberId, tag_id })))
    }

    return Response.json({
      ok: true,
      member_id: memberId,
      profile_id: userId,
      invite_sent: inviteSent,
      reused_existing_user: false,
    })
  } catch (e) {
    console.error('[create-member] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}
