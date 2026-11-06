// POST /api/admin/members/resend-invite
//
// Re-sends portal login details ("set your password") to an existing member.
// Closes the onboarding gaps where a member ends up with an account but never
// received credentials — e.g. bulk-imported members (invites off by default),
// or applicants approved on the "already had a profile" path.
//
// Uses the same branded Resend pipeline as the initial invite. If the member
// already has an auth user we generate a `recovery` link; if somehow they have
// no auth user yet, we fall back to an `invite` link (which creates one).
//
// Body: { member_id: string }

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { sendInviteEmail, resetPasswordAndSendCredentials } from '@/lib/email/invite'
import { siteUrl } from '@/lib/email/site-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RequestBody {
  member_id?: string
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
    if (!body.member_id) {
      return Response.json({ error: 'member_id is required.' }, { status: 400 })
    }

    const admin = getAdminDb()

    // Resolve the member → their email + first name via the joined profile.
    const { data: member, error: memberErr } = await admin
      .from('members')
      .select('id, profile_id, membership_status, deleted_at, profiles(email, first_name)')
      .eq('id', body.member_id)
      .maybeSingle()

    if (memberErr || !member || member.deleted_at) {
      return Response.json({ error: 'Member not found.' }, { status: 404 })
    }
    // A cancelled member has no portal access to log in to — don't reset
    // their password or email them credentials.
    if (member.membership_status === 'cancelled') {
      return Response.json(
        { error: 'This membership is cancelled, so no login email was sent.' },
        { status: 409 },
      )
    }

    // Supabase types the joined profile loosely (object or array) — normalise.
    const profile = Array.isArray(member.profiles)
      ? member.profiles[0]
      : member.profiles
    const email = profile?.email as string | undefined
    const firstName = (profile?.first_name as string | null) ?? null

    if (!email) {
      return Response.json(
        { error: 'This member has no email on file.' },
        { status: 400 },
      )
    }

    const origin = siteUrl() // fixed site URL — never the request's Origin/Host
    const redirectTo = `${origin}/login`

    // Does an auth user already exist for this profile? profile_id === auth uid.
    const existingUser = member.profile_id
      ? await admin.auth.admin.getUserById(member.profile_id)
      : null
    const hasAuthUser = !!existingUser?.data?.user && !existingUser.error

    // The CRM email was changed after the account was made (or before email
    // changes synced the login): move the sign-in address to the CRM email
    // first, so the link is for — and sent to — the same address.
    const authEmail = existingUser?.data?.user?.email ?? null
    if (hasAuthUser && authEmail && authEmail.toLowerCase() !== email.toLowerCase()) {
      const { error: syncErr } = await admin.auth.admin.updateUserById(member.profile_id as string, {
        email,
        email_confirm: true,
      })
      if (syncErr) {
        return Response.json(
          { error: `Could not move their login to ${email}: ${syncErr.message}` },
          { status: 500 },
        )
      }
    }

    // Existing account → reset password and email the new credentials.
    // No account yet → create one with a temporary password and email it.
    const result = hasAuthUser
      ? await resetPasswordAndSendCredentials(admin, {
          userId: member.profile_id as string,
          email,
          firstName,
          redirectTo,
        })
      : await sendInviteEmail(admin, { email, firstName, redirectTo })

    if (!result.emailSent) {
      return Response.json(
        { error: result.error ?? 'Could not send the login email.' },
        { status: 500 },
      )
    }

    return Response.json({ ok: true, email, sent: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return Response.json({ error: message }, { status: 500 })
  }
}
