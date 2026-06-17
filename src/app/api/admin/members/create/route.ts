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
    if (!body.first_name || !body.last_name || !body.email) {
      return Response.json(
        { error: 'first_name, last_name, and email are required.' },
        { status: 400 },
      )
    }

    const admin = getAdminDb()

    // 1. Check for existing auth user / profile by email — avoids
    //    "user already exists" errors when the email's already in the
    //    system from a prior application.
    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id, role')
      .eq('email', body.email)
      .maybeSingle()

    let userId: string
    let inviteSent = false

    if (existingProfile) {
      userId = existingProfile.id
    } else {
      const origin = req.headers.get('origin') ?? `https://${req.headers.get('host')}`
      const send = body.send_invite !== false
      if (send) {
        // Branded invite via Resend (not Supabase's default mailer).
        const inv = await sendInviteEmail(admin, {
          email: body.email,
          firstName: body.first_name,
          redirectTo: `${origin}/set-password`,
        })
        if (!inv.userId) {
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
          return Response.json(
            { error: created.error?.message ?? 'Failed to create auth user' },
            { status: 500 },
          )
        }
        userId = created.data.user.id
      }
    }

    // 2. Update profile with the rest of the info.
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
        .ilike('guest_email', body.email)
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
      reused_existing_user: !!existingProfile,
    })
  } catch (e) {
    console.error('[create-member] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}
