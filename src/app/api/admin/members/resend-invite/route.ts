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
      .select('id, profile_id, profiles(email, first_name)')
      .eq('id', body.member_id)
      .maybeSingle()

    if (memberErr || !member) {
      return Response.json({ error: 'Member not found.' }, { status: 404 })
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

    const origin = req.headers.get('origin') ?? `https://${req.headers.get('host')}`
    const redirectTo = `${origin}/login`

    // Does an auth user already exist for this profile? profile_id === auth uid.
    const existingUser = member.profile_id
      ? await admin.auth.admin.getUserById(member.profile_id)
      : null
    const hasAuthUser = !!existingUser?.data?.user && !existingUser.error

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
