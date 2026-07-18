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
//         intent?: string[], message, source? }
// Returns: { ok: true, id } or { ok: false, error }

import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { scoreEnquiry } from '@/lib/leads/scoring'
import { renderClubEmail, sendClubEmail } from '@/lib/email/club-email'
import { notifyAdmins } from '@/lib/email/admin-notify'
import { enrichEnquiry } from '@/lib/enrichment'

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

  const first_name = body.first_name?.trim()
  const last_name = body.last_name?.trim()
  const email = body.email?.trim()
  const message = body.message?.trim()
  const intent = Array.isArray(body.intent)
    ? body.intent.filter((i): i is string => typeof i === 'string' && i.length > 0)
    : []
  const source = body.source?.trim() || 'website'

  if (!first_name || !last_name || !email || !message) {
    return Response.json(
      { ok: false, error: 'first_name, last_name, email and message are required.' },
      { status: 400 },
    )
  }
  // Cheap email sanity check (RLS/insert is public — keep it honest).
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ ok: false, error: 'A valid email is required.' }, { status: 400 })
  }

  const admin = getAdminDb()

  // ── (a) Compute the score, then insert the enquiry ──────────────
  // Score the payload up-front so the row lands already scored.
  const { score, reasons } = scoreEnquiry({
    email,
    phone: body.phone,
    company: body.company,
    intent,
    message,
  })

  const { data: inserted, error: insertError } = await admin
    .from('enquiries')
    .insert({
      first_name,
      last_name,
      email,
      phone: body.phone?.trim() || null,
      company: body.company?.trim() || null,
      position: body.position?.trim() || null,
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
    return Response.json(
      { ok: false, error: insertError?.message ?? 'Could not save the enquiry.' },
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
    const routed = firstIntent ? routing[firstIntent] : undefined
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

  // ── (e) Notify the admin team about the new scored lead ─────────
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
    await notifyAdmins(admin, {
      subject: `New enquiry · ${fullName} (score ${score})`,
      heading: `New ${intentLabel(firstIntent)} enquiry — lead score ${score}/100`,
      paragraphs: [
        `<strong>${fullName}</strong>${body.company ? ` · ${body.company}` : ''} just submitted a ${intentLabel(firstIntent)} enquiry via ${source}.`,
        `Lead score: <strong>${score}/100</strong>. ${reasons.join('; ')}.`,
        `Email: ${email}${body.phone ? ` · Phone: ${body.phone}` : ''}.`,
      ],
      ctaUrl: appUrl ? `${appUrl}/dashboard/enquiries` : undefined,
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

  // ── (g) Best-effort auto-enrich via the configured provider ─────
  // Behind the provider interface (Apollo today). Never fails the enquiry —
  // provider fetches are individually timeout-bounded and enrichEnquiry
  // never throws.
  try {
    await enrichEnquiry(admin, enquiryId)
  } catch (e) {
    console.error('[enquiries/intake] enrichment failed:', e)
  }

  // ── (h) Done ────────────────────────────────────────────────────
  return Response.json({ ok: true, id: enquiryId })
}
