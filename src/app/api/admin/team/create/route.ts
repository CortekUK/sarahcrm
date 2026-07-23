// POST /api/admin/team/create
//
// Provisions a STAFF login (team member or freelancer) for the Accountability
// system. Mirrors /api/admin/members/create but writes a profile with a staff
// role instead of creating a member. Reuses the same branded Resend invite
// (temporary password) email flow — staff sign in at /admin/login.
//
// Body:
//   {
//     first_name, last_name, email,
//     role: 'team_member' | 'freelancer',
//     job_title?: string,
//     send_invite?: boolean,   // default true
//   }

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { sendInviteEmail } from '@/lib/email/invite'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RequestBody {
  first_name?: string
  last_name?: string
  email?: string
  role?: 'team_member' | 'freelancer'
  job_title?: string
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

    const role = body.role === 'freelancer' ? 'freelancer' : 'team_member'
    if (!body.first_name || !body.last_name || !body.email) {
      return Response.json(
        { error: 'first_name, last_name, and email are required.' },
        { status: 400 },
      )
    }

    const admin = getAdminDb()

    // Reuse an existing auth user / profile if the email is already known.
    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('email', body.email)
      .maybeSingle()

    const origin = req.headers.get('origin') ?? `https://${req.headers.get('host')}`
    let userId: string
    let inviteSent = false
    let inviteError: string | null = null

    if (existingProfile) {
      userId = existingProfile.id
      inviteError = 'An account with this email already existed — use "Send login" to email their credentials.'
    } else {
      const send = body.send_invite !== false
      if (send) {
        const inv = await sendInviteEmail(admin, {
          email: body.email,
          firstName: body.first_name,
          redirectTo: `${origin}/admin/login`,
          loginUrl: `${origin}/admin/login`,
        })
        if (!inv.userId) {
          return Response.json(
            { error: inv.error ?? 'Failed to create auth user' },
            { status: 500 },
          )
        }
        userId = inv.userId
        inviteSent = inv.emailSent
        if (!inv.emailSent) inviteError = inv.error ?? 'The invite email could not be sent.'
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

    // Write the staff profile.
    const { error: updErr } = await admin
      .from('profiles')
      .update({
        role,
        first_name: body.first_name,
        last_name: body.last_name,
        job_title: body.job_title ?? null,
        staff_status: 'active',
      })
      .eq('id', userId)
    if (updErr) return Response.json({ error: updErr.message }, { status: 500 })

    return Response.json({
      ok: true,
      profile_id: userId,
      invite_sent: inviteSent,
      invite_error: inviteError,
      reused_existing_user: !!existingProfile,
    })
  } catch (e) {
    console.error('[team-create] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}
