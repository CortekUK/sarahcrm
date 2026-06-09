// POST /api/admin/members/add-rep
//
// Adds a representative to a business (or partner) membership. A rep is a
// normal members row whose parent_member_id points at the billed business
// account — so they get their own portal login and share the company's
// tier, while billing stays on the parent (rep rows carry no Stripe
// subscription).
//
// Steps:
//   1. Load the parent member (must exist) to inherit tier + company.
//   2. Reuse an existing auth user/profile by email, else create one
//      (branded invite via Resend when send_invite, otherwise silent).
//   3. Update the profile, then insert/reactivate the rep members row
//      with parent_member_id set.
//
// Body:
//   {
//     parent_member_id: string,
//     first_name, last_name, email,
//     rep_role?: string,
//     phone?: string,
//     is_primary?: boolean,
//     send_invite?: boolean,   // default true
//   }

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { sendInviteEmail } from '@/lib/email/invite'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RequestBody {
  parent_member_id?: string
  first_name?: string
  last_name?: string
  email?: string
  rep_role?: string
  phone?: string
  is_primary?: boolean
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
    if (!body.parent_member_id || !body.first_name || !body.last_name || !body.email) {
      return Response.json(
        { error: 'parent_member_id, first_name, last_name and email are required.' },
        { status: 400 },
      )
    }

    const admin = getAdminDb()

    // 1. Parent membership — inherit tier + company.
    const { data: parent, error: parentErr } = await admin
      .from('members')
      .select('id, membership_tier, membership_type, company_name, company_description, company_website')
      .eq('id', body.parent_member_id)
      .single()
    if (parentErr || !parent) {
      return Response.json({ error: 'Parent membership not found.' }, { status: 404 })
    }

    const email = body.email.trim().toLowerCase()

    // 2. Existing user / profile?
    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    let userId: string
    let inviteSent = false

    if (existingProfile) {
      userId = existingProfile.id
    } else {
      const origin = req.headers.get('origin') ?? `https://${req.headers.get('host')}`
      const send = body.send_invite !== false
      if (send) {
        const inv = await sendInviteEmail(admin, {
          email,
          firstName: body.first_name,
          redirectTo: `${origin}/set-password`,
        })
        if (!inv.userId) {
          return Response.json({ error: inv.error ?? 'Failed to create auth user' }, { status: 500 })
        }
        userId = inv.userId
        inviteSent = inv.emailSent
      } else {
        const created = await admin.auth.admin.createUser({
          email,
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

    // 3. Profile.
    await admin
      .from('profiles')
      .update({
        role: 'member',
        first_name: body.first_name,
        last_name: body.last_name,
        phone: body.phone ?? null,
        company_name: parent.company_name ?? null,
        job_title: body.rep_role ?? null,
      })
      .eq('id', userId)

    // If this rep is being made primary, demote any existing primary on
    // the same parent first.
    if (body.is_primary) {
      await admin
        .from('members')
        .update({ is_primary_rep: false })
        .eq('parent_member_id', parent.id)
    }

    // 4. Rep members row (reactivate if one already exists for this user).
    const { data: existingMember } = await admin
      .from('members')
      .select('id')
      .eq('profile_id', userId)
      .maybeSingle()

    const repPayload = {
      profile_id: userId,
      parent_member_id: parent.id,
      is_primary_rep: body.is_primary === true,
      rep_role: body.rep_role ?? null,
      membership_type: parent.membership_type,
      membership_tier: parent.membership_tier,
      membership_status: 'active' as const,
      company_name: parent.company_name ?? null,
      company_description: parent.company_description ?? null,
      company_website: parent.company_website ?? null,
      membership_start_date: new Date().toISOString().slice(0, 10),
      deleted_at: null,
    }

    let memberId: string
    if (existingMember) {
      const { data: upd, error: updErr } = await admin
        .from('members')
        .update(repPayload)
        .eq('id', existingMember.id)
        .select('id')
        .single()
      if (updErr) return Response.json({ error: updErr.message }, { status: 500 })
      memberId = upd.id
    } else {
      const { data: ins, error: insErr } = await admin
        .from('members')
        .insert(repPayload)
        .select('id')
        .single()
      if (insErr) return Response.json({ error: insErr.message }, { status: 500 })
      memberId = ins.id
    }

    return Response.json({
      ok: true,
      member_id: memberId,
      profile_id: userId,
      invite_sent: inviteSent,
      reused_existing_user: !!existingProfile,
    })
  } catch (e) {
    console.error('[add-rep] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}
