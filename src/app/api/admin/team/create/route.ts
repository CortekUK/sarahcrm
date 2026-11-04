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
import { siteUrl } from '@/lib/email/site-url'

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isAlreadyRegistered(message: string | null | undefined): boolean {
  return /already (been )?registered|already exists|duplicate key/i.test(message ?? '')
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
    const firstName = typeof body.first_name === 'string' ? body.first_name.trim() : ''
    const lastName = typeof body.last_name === 'string' ? body.last_name.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!firstName || !lastName || !email) {
      return Response.json(
        { error: 'first_name, last_name, and email are required.' },
        { status: 400 },
      )
    }
    if (!EMAIL_RE.test(email) || email.length > 254) {
      return Response.json({ error: 'Please enter a valid email address.' }, { status: 400 })
    }
    if (firstName.length > 100 || lastName.length > 100 || (body.job_title?.length ?? 0) > 150) {
      return Response.json({ error: 'Name or job title is too long.' }, { status: 400 })
    }
    body.first_name = firstName
    body.last_name = lastName
    body.email = email

    const admin = getAdminDb()

    // Refuse an email that already belongs to ANY account (case-insensitive).
    // Reusing it would silently turn a member into staff (losing their
    // portal) or demote an admin.
    const { data: existingProfiles } = await admin
      .from('profiles')
      .select('id, role')
      .ilike('email', email.replace(/[\\%_]/g, (c) => `\\${c}`))
      .limit(1)
    const existingProfile = existingProfiles?.[0]
    if (existingProfile) {
      const r = existingProfile.role as string
      const error =
        r === 'admin'
          ? 'This email belongs to an admin account. Use a different email.'
          : r === 'team_member' || r === 'freelancer'
            ? 'This person is already on the team — use "Send login" to email their credentials.'
            : 'This email belongs to a member account. Use a different email for their staff login.'
      return Response.json({ error }, { status: 409 })
    }

    const origin = siteUrl() // fixed site URL — never the request's Origin/Host
    let userId: string
    let inviteSent = false
    let inviteError: string | null = null

    {
      const send = body.send_invite !== false
      if (send) {
        const inv = await sendInviteEmail(admin, {
          email: body.email,
          firstName: body.first_name,
          redirectTo: `${origin}/admin/login`,
          loginUrl: `${origin}/admin/login`,
        })
        if (!inv.userId) {
          if (isAlreadyRegistered(inv.error)) {
            return Response.json({ error: 'An account with this email already exists.' }, { status: 409 })
          }
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
          if (isAlreadyRegistered(created.error?.message)) {
            return Response.json({ error: 'An account with this email already exists.' }, { status: 409 })
          }
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
      reused_existing_user: false,
    })
  } catch (e) {
    console.error('[team-create] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}
