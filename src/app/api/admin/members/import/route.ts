// POST /api/admin/members/import
//
// Bulk-onboards members from a parsed CSV (the admin "Import members"
// modal sends already-parsed rows as JSON — parsing happens client-side
// so we never handle file uploads here).
//
// For each row we:
//   1. Reuse an existing auth user/profile if the email is already known
//      (so re-importing the same sheet is safe and idempotent).
//   2. Otherwise create the auth user. By default we DO NOT email anyone
//      (bulk import of historic contacts shouldn't blast invites); pass
//      send_invites=true to send the branded set-password email instead.
//   3. Upsert the profile + members row with the row's details.
//   4. Attach any tags chosen for the whole batch.
//
// Returns a per-row result list so the modal can show exactly what
// happened (created / reused / skipped + why).
//
// Body:
//   {
//     rows: Array<{
//       first_name, last_name, email,
//       phone?, company_name?, job_title?,
//       membership_tier?, membership_status?,
//     }>,
//     send_invites?: boolean,          // default false
//     default_tier?: 'tier_1'|'tier_2'|'tier_3',   // fallback per row
//     default_status?: 'active'|'pending',          // fallback per row
//     tag_ids?: string[],               // applied to every imported member
//   }

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { sendInviteEmail } from '@/lib/email/invite'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Tier = 'tier_1' | 'tier_2' | 'tier_3'
type Status = 'active' | 'pending'

interface ImportRow {
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  company_name?: string
  job_title?: string
  membership_tier?: string
  membership_status?: string
}

interface RequestBody {
  rows?: ImportRow[]
  send_invites?: boolean
  default_tier?: Tier
  default_status?: Status
  tag_ids?: string[]
}

interface RowResult {
  row: number
  email: string
  status: 'created' | 'reused' | 'skipped'
  reason?: string
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

const VALID_TIERS: Tier[] = ['tier_1', 'tier_2', 'tier_3']
const VALID_STATUSES: Status[] = ['active', 'pending']

function normaliseTier(v: string | undefined, fallback: Tier): Tier {
  if (!v) return fallback
  const t = v.toLowerCase().replace(/\s+/g, '_').replace('tier', 'tier_').replace('__', '_')
  // Accept "1" / "tier 1" / "tier_1"
  if (t === '1' || t === 'tier_1') return 'tier_1'
  if (t === '2' || t === 'tier_2') return 'tier_2'
  if (t === '3' || t === 'tier_3') return 'tier_3'
  return VALID_TIERS.includes(t as Tier) ? (t as Tier) : fallback
}

function normaliseStatus(v: string | undefined, fallback: Status): Status {
  if (!v) return fallback
  const s = v.toLowerCase().trim()
  return VALID_STATUSES.includes(s as Status) ? (s as Status) : fallback
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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

    const rows = Array.isArray(body.rows) ? body.rows : []
    if (rows.length === 0) {
      return Response.json({ error: 'No rows to import.' }, { status: 400 })
    }
    if (rows.length > 1000) {
      return Response.json(
        { error: 'Too many rows — import up to 1000 at a time.' },
        { status: 400 },
      )
    }

    const sendInvites = body.send_invites === true
    const defaultTier: Tier = body.default_tier ?? 'tier_1'
    const defaultStatus: Status = body.default_status ?? 'pending'
    const tagIds = Array.isArray(body.tag_ids) ? body.tag_ids : []

    const admin = getAdminDb()
    const origin = req.headers.get('origin') ?? `https://${req.headers.get('host')}`

    const results: RowResult[] = []
    let created = 0
    let reused = 0
    let skipped = 0

    // Sequential on purpose — bulk auth-user creation in parallel risks
    // rate limits and makes per-row error reporting muddier.
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const email = (r.email ?? '').trim().toLowerCase()
      const rowNum = i + 1

      if (!email || !EMAIL_RE.test(email)) {
        skipped++
        results.push({ row: rowNum, email: email || '(blank)', status: 'skipped', reason: 'Missing or invalid email' })
        continue
      }
      if (!r.first_name?.trim() && !r.last_name?.trim()) {
        skipped++
        results.push({ row: rowNum, email, status: 'skipped', reason: 'Missing name' })
        continue
      }

      const firstName = (r.first_name ?? '').trim()
      const lastName = (r.last_name ?? '').trim()
      const tier = normaliseTier(r.membership_tier, defaultTier)
      const status = normaliseStatus(r.membership_status, defaultStatus)

      try {
        // 1. Existing user?
        const { data: existingProfile } = await admin
          .from('profiles')
          .select('id')
          .eq('email', email)
          .maybeSingle()

        let userId: string
        let didReuse = false

        if (existingProfile) {
          userId = existingProfile.id
          didReuse = true
        } else if (sendInvites) {
          const inv = await sendInviteEmail(admin, {
            email,
            firstName,
            redirectTo: `${origin}/set-password`,
          })
          if (!inv.userId) {
            skipped++
            results.push({ row: rowNum, email, status: 'skipped', reason: inv.error ?? 'Could not create user' })
            continue
          }
          userId = inv.userId
        } else {
          const c = await admin.auth.admin.createUser({
            email,
            email_confirm: true,
            user_metadata: { first_name: firstName, last_name: lastName },
          })
          if (c.error || !c.data.user) {
            skipped++
            results.push({ row: rowNum, email, status: 'skipped', reason: c.error?.message ?? 'Could not create user' })
            continue
          }
          userId = c.data.user.id
        }

        // 2. Profile
        await admin
          .from('profiles')
          .update({
            role: 'member',
            first_name: firstName || null,
            last_name: lastName || null,
            phone: r.phone?.trim() || null,
            company_name: r.company_name?.trim() || null,
            job_title: r.job_title?.trim() || null,
          })
          .eq('id', userId)

        // 3. Members row (reactivate if present)
        const { data: existingMember } = await admin
          .from('members')
          .select('id')
          .eq('profile_id', userId)
          .maybeSingle()

        const memberPayload = {
          profile_id: userId,
          membership_type: 'individual' as const,
          membership_tier: tier,
          membership_status: status,
          company_name: r.company_name?.trim() || null,
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
          if (updErr) throw new Error(updErr.message)
          memberId = upd.id
        } else {
          const { data: ins, error: insErr } = await admin
            .from('members')
            .insert(memberPayload)
            .select('id')
            .single()
          if (insErr) throw new Error(insErr.message)
          memberId = ins.id
        }

        // 4. Tags (additive — don't wipe existing tags on reuse)
        if (tagIds.length > 0) {
          await admin
            .from('member_tags')
            .upsert(
              tagIds.map((tag_id) => ({ member_id: memberId, tag_id })),
              { onConflict: 'member_id,tag_id', ignoreDuplicates: true },
            )
        }

        if (didReuse) {
          reused++
          results.push({ row: rowNum, email, status: 'reused' })
        } else {
          created++
          results.push({ row: rowNum, email, status: 'created' })
        }
      } catch (e) {
        skipped++
        const msg = e instanceof Error ? e.message : 'Unknown error'
        results.push({ row: rowNum, email, status: 'skipped', reason: msg })
      }
    }

    return Response.json({
      ok: true,
      summary: { total: rows.length, created, reused, skipped },
      results,
    })
  } catch (e) {
    console.error('[members/import] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}
