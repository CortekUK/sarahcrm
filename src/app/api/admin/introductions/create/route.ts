// POST /api/admin/introductions/create
//
// Sarah approves a suggested match. Creates the introduction row at status
// 'approved' (approved_by = the admin). Returns the ordered pair with the
// detail the Review & Send modal needs to compose both emails.
//
// Body: { target_member_id, match_member_id, match_score?, match_reason?, matching_tags? }
// Returns: { introduction_id, member_a, member_b }  (each: { id, first_name, name, company })

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { orderedPair } from '@/lib/introductions/matching'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getAdminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

interface MemberLite {
  id: string
  first_name: string | null
  name: string
  company: string | null
  email: string | null
}

async function loadMember(
  admin: ReturnType<typeof getAdminDb>,
  id: string,
): Promise<MemberLite | null> {
  const { data } = await admin
    .from('members')
    .select('id, company_name, profiles(first_name, last_name, company_name, email)')
    .eq('id', id)
    .single()
  if (!data) return null
  const p = (data.profiles ?? {}) as {
    first_name?: string | null
    last_name?: string | null
    company_name?: string | null
    email?: string | null
  }
  return {
    id: data.id,
    first_name: p.first_name ?? null,
    name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Member',
    company: data.company_name ?? p.company_name ?? null,
    email: p.email ?? null,
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') {
    return Response.json({ error: 'Admin only.' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    introduction_id?: string
    target_member_id?: string
    match_member_id?: string
    match_score?: number
    match_reason?: string
    matching_tags?: string[]
  }

  const admin = getAdminDb()
  let introId: string
  let aId: string
  let bId: string

  if (body.introduction_id) {
    // Operate on a SPECIFIC existing introduction (Manage, or approve a
    // member-initiated request) — addressed by id, never by pair.
    const { data: intro } = await admin
      .from('introductions')
      .select('id, status, member_a_id, member_b_id')
      .eq('id', body.introduction_id)
      .single()
    if (!intro) return Response.json({ error: 'Introduction not found.' }, { status: 404 })
    introId = intro.id
    aId = intro.member_a_id
    bId = intro.member_b_id
    // Promote a still-suggested request to approved.
    if (intro.status === 'suggested') {
      await admin
        .from('introductions')
        .update({
          status: 'approved',
          approved_by: profile.id,
          approved_at: new Date().toISOString(),
          ...(typeof body.match_score === 'number' ? { match_score: body.match_score } : {}),
          ...(body.match_reason ? { match_reason: body.match_reason } : {}),
        })
        .eq('id', intro.id)
    }
  } else {
    // Fresh approve from a suggested match → always a NEW record (a pair can
    // have multiple introductions over time).
    if (!body.target_member_id || !body.match_member_id) {
      return Response.json(
        { error: 'target_member_id and match_member_id (or introduction_id) are required.' },
        { status: 400 },
      )
    }
    if (body.target_member_id === body.match_member_id) {
      return Response.json({ error: 'Cannot introduce a member to themselves.' }, { status: 400 })
    }
    ;[aId, bId] = orderedPair(body.target_member_id, body.match_member_id)
    const { data: created, error } = await admin
      .from('introductions')
      .insert({
        member_a_id: aId,
        member_b_id: bId,
        status: 'approved',
        approved_by: profile.id,
        approved_at: new Date().toISOString(),
        match_score: typeof body.match_score === 'number' ? body.match_score : null,
        match_reason: body.match_reason ?? null,
        matching_tags: body.matching_tags ?? null,
      })
      .select('id')
      .single()
    if (error || !created) {
      console.error('[introductions/create] insert failed:', error)
      return Response.json({ error: 'Could not create introduction.' }, { status: 500 })
    }
    introId = created.id
  }

  const [memberA, memberB] = await Promise.all([loadMember(admin, aId), loadMember(admin, bId)])

  // Current per-side state so the composer can show what's already sent/scheduled/declined.
  const { data: st } = await admin
    .from('introductions')
    .select('email_a_sent_at, email_b_sent_at, email_a_scheduled_at, email_b_scheduled_at, member_a_response, member_b_response')
    .eq('id', introId)
    .single()

  return Response.json({
    introduction_id: introId,
    member_a: memberA,
    member_b: memberB,
    state: {
      a: { sentAt: st?.email_a_sent_at ?? null, scheduledAt: st?.email_a_scheduled_at ?? null, response: st?.member_a_response ?? 'pending' },
      b: { sentAt: st?.email_b_sent_at ?? null, scheduledAt: st?.email_b_scheduled_at ?? null, response: st?.member_b_response ?? 'pending' },
    },
  })
}
