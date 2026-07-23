// POST /api/admin/team/resend-invite
//
// Re-sends staff login details ("your temporary password") to an existing team
// member / freelancer. Mirrors /api/admin/members/resend-invite but points the
// sign-in link at the staff door (/admin/login).
//
// Body: { profile_id: string }

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { sendInviteEmail, resetPasswordAndSendCredentials } from '@/lib/email/invite'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RequestBody {
  profile_id?: string
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
    if (!body.profile_id) {
      return Response.json({ error: 'profile_id is required.' }, { status: 400 })
    }

    const admin = getAdminDb()

    const { data: profile, error: pErr } = await admin
      .from('profiles')
      .select('id, email, first_name')
      .eq('id', body.profile_id)
      .maybeSingle()
    if (pErr || !profile) {
      return Response.json({ error: 'Team member not found.' }, { status: 404 })
    }
    const email = profile.email as string | null
    if (!email) {
      return Response.json(
        { error: 'This team member has no email on file.' },
        { status: 400 },
      )
    }

    const origin = req.headers.get('origin') ?? `https://${req.headers.get('host')}`
    const loginUrl = `${origin}/admin/login`

    const existingUser = await admin.auth.admin.getUserById(profile.id)
    const hasAuthUser = !!existingUser?.data?.user && !existingUser.error

    const result = hasAuthUser
      ? await resetPasswordAndSendCredentials(admin, {
          userId: profile.id,
          email,
          firstName: profile.first_name,
          redirectTo: loginUrl,
          loginUrl,
        })
      : await sendInviteEmail(admin, {
          email,
          firstName: profile.first_name,
          redirectTo: loginUrl,
          loginUrl,
        })

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
