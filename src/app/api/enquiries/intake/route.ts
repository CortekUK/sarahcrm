// POST /api/enquiries/intake
//
// PUBLIC intake for website enquiries (contact form + concierge form). This
// REPLACES the old direct browser insert into `enquiries` so that scoring,
// owner routing, the acknowledgement email and the auto-created sales task
// all happen server-side with the service-role key.
//
// It is intentionally NOT admin-gated — anonymous visitors submit it. The
// insert is the only hard step; scoring/routing/email/task are all
// best-effort, so a failure in any of them never fails the enquiry itself.
//
// Body: { first_name, last_name, email, phone?, company?, position?,
//         intent?: string[], message, source?, website? /* honeypot */ }
// Returns: { ok: true, id } or { ok: false, error }
//
// Abuse protection (public + it sends email): a honeypot field (`website` /
// `company_url` — hidden on the form, so only bots fill it; they get a fake
// success and nothing is stored), per-field length limits, a per-IP and a
// per-email rate limit, a global burst cap, and at most one acknowledgement
// email per address per day (so the club's domain can't be used to email-
// bomb someone). `intent` is filtered to the known ENQUIRY_INTENTS — unknown
// values ('__proto__', 'constructor', …) are dropped, never stored.

import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { scoreEnquiry } from '@/lib/leads/scoring'
import { escapeHtml, renderClubEmail, sendClubEmail } from '@/lib/email/club-email'
import { notifyAdmins } from '@/lib/email/admin-notify'
import { siteUrl } from '@/lib/email/site-url'
import { ENQUIRY_INTENTS } from '@/lib/concierge/call-booking'
import { clientIp, overLimit } from '@/lib/public-intake/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Same service-role admin client the reply route builds — bypasses RLS so the
// public intake can write the routed/scored fields a plain anon insert can't.
function getAdminDb() {
  return createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

interface IntakeBody {
  first_name?: string
  last_name?: string
  email?: string
  phone?: string | null
  company?: string | null
  position?: string | null
  intent?: string[]
  message?: string
  source?: string
  // Honeypots — hidden inputs real visitors never fill.
  website?: string
  company_url?: string
}

// Field caps (characters). Generous enough for the concierge hand-off, which
// files the visitor's last few chat messages as the enquiry message.
const LIMITS = {
  name: 100,
  email: 254,
  phone: 40,
  company: 200,
  position: 200,
  message: 15000,
} as const

// Rate limits. The DB-backed ones hold across serverless instances; the
// per-IP one is in-memory (per instance) — a best-effort first line.
const MAX_PER_EMAIL_PER_HOUR = 3
const MAX_GLOBAL_PER_10_MIN = 30
const MAX_PER_IP_PER_10_MIN = 5

const KNOWN_INTENTS = new Set<string>(ENQUIRY_INTENTS)

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v.trim() : undefined
}

// Human label for a routing intent, used in the task title + notify copy.
function intentLabel(intent: string | undefined): string {
  if (!intent) return 'general'
  return intent.replace(/_/g, ' ')
}

export async function POST(request: Request) {
  // ── Parse + validate ────────────────────────────────────────────
  let body: IntakeBody
  try {
    body = await request.json()
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    return Response.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  // Honeypot: pretend success so bots don't learn to skip the field.
  if (str(body.website) || str(body.company_url)) {
    return Response.json({ ok: true, id: null })
  }

  const first_name = str(body.first_name)
  const last_name = str(body.last_name)
  const email = str(body.email)?.toLowerCase()
  const message = str(body.message)
  const phone = str(body.phone) || null
  const company = str(body.company) || null
  const position = str(body.position) || null
  // Known intents only, de-duplicated. Anything else is silently dropped.
  const intent = Array.isArray(body.intent)
    ? [...new Set(body.intent.filter((i): i is string => typeof i === 'string' && KNOWN_INTENTS.has(i)))]
    : []
  const rawSource = str(body.source)
  const source = rawSource && /^[a-z0-9_-]{1,40}$/i.test(rawSource) ? rawSource : 'website'

  if (!first_name || !last_name || !email || !message) {
    return Response.json(
      { ok: false, error: 'first_name, last_name, email and message are required.' },
      { status: 400 },
    )
  }
  // Cheap email sanity check (RLS/insert is public — keep it honest).
  if (email.length > LIMITS.email || !/^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(email)) {
    return Response.json({ ok: false, error: 'A valid email is required.' }, { status: 400 })
  }
  if (
    first_name.length > LIMITS.name ||
    last_name.length > LIMITS.name ||
    (phone?.length ?? 0) > LIMITS.phone ||
    (company?.length ?? 0) > LIMITS.company ||
    (position?.length ?? 0) > LIMITS.position ||
    message.length > LIMITS.message
  ) {
    return Response.json(
      { ok: false, error: 'One or more fields are too long.' },
      { status: 400 },
    )
  }

  const tooMany = () =>
    Response.json(
      { ok: false, error: 'Too many enquiries — please try again a little later.' },
      { status: 429 },
    )
  if (overLimit(`enquiry:${clientIp(request)}`, MAX_PER_IP_PER_10_MIN, 10 * 60_000)) return tooMany()

  const admin = getAdminDb()

  // DB-backed limits: per email (1h) and a global burst cap (10 min).
  // Best-effort — a failed count never blocks a genuine enquiry.
  let ackedRecently = false
  // ilike for a case-insensitive match; escape its wildcards (`_` is common
  // in addresses).
  const emailPattern = email.replace(/[\\%_]/g, '\\$&')
  try {
    const hourAgo = new Date(Date.now() - 60 * 60_000).toISOString()
    const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString()
    const dayAgo = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
    const [perEmail, global, acked] = await Promise.all([
      admin
        .from('enquiries')
        .select('id', { count: 'exact', head: true })
        .ilike('email', emailPattern)
        .gte('created_at', hourAgo),
      admin
        .from('enquiries')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', tenMinAgo),
      admin
        .from('enquiries')
        .select('id', { count: 'exact', head: true })
        .ilike('email', emailPattern)
        .not('acknowledged_at', 'is', null)
        .gte('acknowledged_at', dayAgo),
    ])
    if ((perEmail.count ?? 0) >= MAX_PER_EMAIL_PER_HOUR) return tooMany()
    if ((global.count ?? 0) >= MAX_GLOBAL_PER_10_MIN) return tooMany()
    ackedRecently = (acked.count ?? 0) > 0
  } catch (e) {
    console.error('[enquiries/intake] rate-limit check failed:', e)
  }

  // ── (a) Compute the score, then insert the enquiry ──────────────
  // Score the payload up-front so the row lands already scored.
  const { score, reasons } = scoreEnquiry({
    email,
    phone,
    company,
    intent,
    message,
  })

  const { data: inserted, error: insertError } = await admin
    .from('enquiries')
    .insert({
      first_name,
      last_name,
      email,
      phone,
      company,
      position,
      intent: intent.length ? intent : null,
      message,
      source,
      status: 'new',
      lead_score: score,
      score_reasons: reasons,
    })
    .select('id')
    .single()

  if (insertError || !inserted) {
    console.error('[enquiries/intake] insert failed:', insertError)
    return Response.json(
      { ok: false, error: 'Could not save the enquiry.' },
      { status: 500 },
    )
  }

  const enquiryId = inserted.id
  const fullName = `${first_name} ${last_name}`.trim()
  const firstIntent = intent[0]

  // ── (b/c) Resolve the owner from app_settings, fallback to first admin ──
  // Best-effort — a routing failure must not fail the intake.
  let ownerId: string | null = null
  try {
    const { data: routingRow } = await admin
      .from('app_settings')
      .select('value')
      .eq('key', 'enquiry_routing')
      .maybeSingle()
    const routing = (routingRow?.value ?? {}) as Record<string, unknown>
    const routed =
      firstIntent && Object.prototype.hasOwnProperty.call(routing, firstIntent)
        ? routing[firstIntent]
        : undefined
    if (typeof routed === 'string' && routed) ownerId = routed

    if (!ownerId) {
      const { data: firstAdmin } = await admin
        .from('profiles')
        .select('id')
        .eq('role', 'admin')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      ownerId = firstAdmin?.id ?? null
    }

    if (ownerId) {
      await admin.from('enquiries').update({ assigned_to: ownerId }).eq('id', enquiryId)
    }
  } catch (e) {
    console.error('[enquiries/intake] owner routing failed:', e)
  }

  // ── (d) Acknowledgement email to the enquirer ───────────────────
  // At most one per address per 24h (see ackedRecently above).
  if (!ackedRecently) {
    try {
      const html = renderClubEmail({
        eyebrow: 'The Club',
        heading: `Thank you, ${first_name}.`,
        paragraphs: [
          'We’ve received your enquiry and it has reached the right person on our team.',
          'Someone will be in touch personally to take the next steps. In the meantime, quiet evenings await at all three clubs.',
        ],
      })
      const result = await sendClubEmail({
        to: email,
        subject: 'We’ve received your enquiry — The Club',
        html,
        category: 'enquiry_ack',
      })
      if (result.sent) {
        await admin
          .from('enquiries')
          .update({ acknowledged_at: new Date().toISOString() })
          .eq('id', enquiryId)
      }
    } catch (e) {
      console.error('[enquiries/intake] acknowledgement email failed:', e)
    }
  }

  // ── (e) Notify the admin team about the new scored lead ─────────
  try {
    await notifyAdmins(admin, {
      subject: `New enquiry · ${fullName} (score ${score})`,
      heading: `New ${intentLabel(firstIntent)} enquiry — lead score ${score}/100`,
      paragraphs: [
        `<strong>${escapeHtml(fullName)}</strong>${company ? ` · ${escapeHtml(company)}` : ''} just submitted a ${intentLabel(firstIntent)} enquiry via ${source}.`,
        `Lead score: <strong>${score}/100</strong>. ${escapeHtml(reasons.join('; '))}.`,
        `Email: ${escapeHtml(email)}${phone ? ` · Phone: ${escapeHtml(phone)}` : ''}.`,
      ],
      ctaUrl: `${siteUrl()}/dashboard/enquiries`,
      ctaLabel: 'Open enquiries',
    })
  } catch (e) {
    console.error('[enquiries/intake] admin notify failed:', e)
  }

  // ── (f) Auto-create a linked sales follow-up task ───────────────
  try {
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + 2)
    const { data: task, error: taskError } = await admin
      .from('tasks')
      .insert({
        title: `Follow up: ${fullName} (${intentLabel(firstIntent)})`,
        category: 'sales',
        priority: score >= 70 ? 'high' : 'medium',
        status: 'todo',
        assigned_to: ownerId,
        related_enquiry_id: enquiryId,
        due_date: dueDate.toISOString().slice(0, 10),
      })
      .select('id')
      .single()
    if (!taskError && task) {
      await admin.from('enquiries').update({ related_task_id: task.id }).eq('id', enquiryId)
    }
  } catch (e) {
    console.error('[enquiries/intake] task creation failed:', e)
  }

  // ── (g) No auto-enrichment ──────────────────────────────────────
  // Enrichment is deliberately MANUAL: an admin runs it from the Enrich
  // button on the enquiry (POST /api/admin/enquiries/enrich). This keeps
  // lead-enrichment (Clay search quota) usage under the club's control
  // instead of spending it on every anonymous form submission.

  // ── (h) Done ────────────────────────────────────────────────────
  return Response.json({ ok: true, id: enquiryId })
}
