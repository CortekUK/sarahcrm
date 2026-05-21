// POST /api/admin/applications/approve
//
// Approve a pending membership application: creates the auth user, links
// the profile, inserts a `members` row, and marks the application as
// approved. Sends the new member a Supabase invitation email so they can
// set their password — which lets them sign in to /portal immediately.
//
// Body: { application_id: string, tier?: 'tier_1' | 'tier_2' | 'tier_3' }
//
// Admin only.

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RequestBody {
  application_id?: string
  tier?: 'tier_1' | 'tier_2' | 'tier_3'
  // When true (default), Supabase sends the new user an invite email with a
  // password-reset link. Set to false to skip — useful if the admin plans
  // to email them manually.
  send_invite?: boolean
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

// Map the free-text `preferred_tier` value on an application to a real
// membership_tier enum. Free-text is whatever the form submitted —
// 'individual', 'tier_1', 'business', etc. We sensible-default to tier_1.
function resolveTier(input: string | null | undefined): 'tier_1' | 'tier_2' | 'tier_3' {
  const v = (input ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (v.includes('tier3') || v.includes('three') || v.includes('platinum')) return 'tier_3'
  if (v.includes('tier2') || v.includes('two') || v.includes('gold') || v.includes('business')) return 'tier_2'
  return 'tier_1'
}

function isBusiness(input: string | null | undefined): boolean {
  return (input ?? '').toLowerCase().includes('business')
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
    if (!body.application_id) {
      return Response.json({ error: 'application_id required' }, { status: 400 })
    }

    const admin = getAdminDb()

    // 1. Load the application
    const { data: app, error: appErr } = await admin
      .from('membership_applications')
      .select('*')
      .eq('id', body.application_id)
      .single()
    if (appErr || !app) {
      return Response.json({ error: 'Application not found' }, { status: 404 })
    }
    if (!app.email) {
      return Response.json({ error: 'Application has no email — cannot create account.' }, { status: 400 })
    }

    const tier = body.tier ?? resolveTier(app.preferred_tier)
    const membership_type = isBusiness(app.preferred_tier) ? 'business' : 'individual'

    // 2. Check if a profile already exists for this email — if so we link
    //    the member row to it instead of creating a fresh auth user. Avoids
    //    "Approve" failing for an applicant who already signed up.
    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id, role')
      .eq('email', app.email)
      .maybeSingle()

    let userId: string

    if (existingProfile) {
      userId = existingProfile.id
      // Don't downgrade an existing admin to member; otherwise upgrade.
      if (existingProfile.role !== 'admin') {
        await admin
          .from('profiles')
          .update({
            role: 'member',
            first_name: app.first_name,
            last_name: app.last_name,
            phone: app.phone ?? null,
            company_name: app.company ?? null,
            job_title: app.position ?? null,
            bio: app.bio ?? null,
            linkedin_url: app.linkedin_url ?? null,
          })
          .eq('id', userId)
      }
    } else {
      // 3. Create the auth user. We use inviteUserByEmail so Supabase
      //    sends them a "set your password" email — they don't need us to
      //    know or share a password manually. The handle_new_user trigger
      //    auto-creates a profile row keyed off the new auth.users.id.
      const send = body.send_invite !== false
      const inviteRes = send
        ? await admin.auth.admin.inviteUserByEmail(app.email, {
            data: {
              first_name: app.first_name,
              last_name: app.last_name,
            },
          })
        : await admin.auth.admin.createUser({
            email: app.email,
            email_confirm: true,
            user_metadata: {
              first_name: app.first_name,
              last_name: app.last_name,
            },
          })

      if (inviteRes.error || !inviteRes.data.user) {
        return Response.json(
          { error: inviteRes.error?.message ?? 'Failed to create auth user' },
          { status: 500 },
        )
      }
      userId = inviteRes.data.user.id

      // Trigger created a minimal profile; flesh it out with details from
      // the application. Phone / company / job_title / bio / linkedin_url
      // weren't part of the trigger insert so they need a follow-up update.
      await admin
        .from('profiles')
        .update({
          role: 'member',
          first_name: app.first_name,
          last_name: app.last_name,
          phone: app.phone ?? null,
          company_name: app.company ?? null,
          job_title: app.position ?? null,
          bio: app.bio ?? null,
          linkedin_url: app.linkedin_url ?? null,
        })
        .eq('id', userId)
    }

    // 4. Create the members row. If one already exists for this profile
    //    (e.g. the applicant was previously a member), reactivate it
    //    instead of creating a duplicate.
    const { data: existingMember } = await admin
      .from('members')
      .select('id')
      .eq('profile_id', userId)
      .maybeSingle()

    let memberId: string

    if (existingMember) {
      const { data: updated, error: updErr } = await admin
        .from('members')
        .update({
          membership_status: 'active',
          membership_tier: tier,
          membership_type,
          membership_start_date: new Date().toISOString().slice(0, 10),
          company_name: app.company ?? null,
          source: app.referral_source ?? null,
          deleted_at: null,
        })
        .eq('id', existingMember.id)
        .select('id')
        .single()
      if (updErr) {
        return Response.json({ error: updErr.message }, { status: 500 })
      }
      memberId = updated.id
    } else {
      const { data: inserted, error: insErr } = await admin
        .from('members')
        .insert({
          profile_id: userId,
          membership_type,
          membership_tier: tier,
          membership_status: 'active',
          membership_start_date: new Date().toISOString().slice(0, 10),
          company_name: app.company ?? null,
          source: app.referral_source ?? null,
        })
        .select('id')
        .single()
      if (insErr) {
        return Response.json({ error: insErr.message }, { status: 500 })
      }
      memberId = inserted.id
    }

    // 5. Mark the application approved
    const { error: markErr } = await admin
      .from('membership_applications')
      .update({
        status: 'approved',
        reviewed_by: auth.admin.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', app.id)
    if (markErr) {
      console.error('[approve] failed to mark application approved:', markErr)
    }

    return Response.json({
      ok: true,
      member_id: memberId,
      profile_id: userId,
      tier,
      membership_type,
      invite_sent: !existingProfile && body.send_invite !== false,
    })
  } catch (e) {
    console.error('[approve] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}
