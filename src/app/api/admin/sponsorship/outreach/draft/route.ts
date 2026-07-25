// POST /api/admin/sponsorship/outreach/draft — generate a DRAFT outreach sequence.
//
// Given a prospect (+ its event) and optionally a decision-maker, this writes a
// first-touch + follow-up sequence of on-brand sponsorship outreach emails and
// persists them as DRAFT sponsor_outreach rows for the human to review.
//
// This route NEVER sends. Every message is inserted with status='draft'; a
// human must approve (via the queue PATCH) and then explicitly send (via
// send/route.ts). It degrades gracefully to a single templated first-touch
// draft when no OPENAI_API_KEY is set or the call fails, so the queue is never
// left empty.

import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { z } from 'zod'
import { requireAdmin, getAdmin } from '@/lib/marketing/admin'
import { logOpenAIUsage } from '@/lib/ai/usage-logger'
import { renderClubEmail } from '@/lib/email/club-email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Club brand-voice guidance — mirrors the marketing/generate + match routes.
const CLUB_VOICE = `The Club by Sarah Restrick is a private membership community of exceptional founders and senior leaders. Its events are curated, intimate, luxury gatherings built on trusted introductions — never mass-market. Voice: warm, considered and intimate, never corporate or salesy. British English spelling. Confident and understated.`

interface DraftBody {
  prospect_id?: string
  decision_maker_id?: string | null
  voice?: string | null
  steps?: number | null
  note?: string | null
}

// marketing_voices row shape (shared with marketing/generate so voice edits
// apply everywhere).
interface VoiceRow {
  key: string
  name: string
  guidance: string | null
  samples: unknown
}

// Build the reference voice-context block injected into prompts, from a voice
// row's guidance + reference samples. Falls back to the hardcoded Club tone if
// the row is missing/empty.
//
// NOTE: buildVoiceContext is NOT exported from marketing/generate/route.ts (it
// is a route-local helper), so it is copied here verbatim to keep behaviour
// identical. Same marketing_voices rows are read, so voice edits apply here too.
function buildVoiceContext(voice: VoiceRow | undefined | null): string {
  const guidance = voice?.guidance?.trim()
  const samples: { label: string; text: string }[] = Array.isArray(voice?.samples)
    ? (voice!.samples as unknown[])
        .map((s) => {
          const o = (s ?? {}) as Record<string, unknown>
          return { label: String(o.label ?? '').trim(), text: String(o.text ?? '').trim() }
        })
        .filter((s) => s.text)
    : []

  if (!guidance && samples.length === 0) return CLUB_VOICE

  const parts = [guidance || CLUB_VOICE]
  if (samples.length > 0) {
    const rendered = samples
      .map((s, i) => `Sample ${i + 1}${s.label ? ` — ${s.label}` : ''}:\n${s.text}`)
      .join('\n\n')
    parts.push(
      `Reference sample messages written in this voice — mimic their tone, rhythm and register, but do NOT copy them verbatim and do NOT reuse their specific facts:\n\n${rendered}`,
    )
  }
  return parts.join('\n\n')
}

const sequenceSchema = z.object({
  messages: z.array(
    z.object({
      step: z.number().int(),
      subject: z.string(),
      body_paragraphs: z.array(z.string()),
    }),
  ),
})

function sequenceJsonSchema() {
  return {
    name: 'outreach_sequence',
    strict: true as const,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        messages: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              step: { type: 'integer' },
              subject: { type: 'string' },
              body_paragraphs: { type: 'array', items: { type: 'string' } },
            },
            required: ['step', 'subject', 'body_paragraphs'],
          },
        },
      },
      required: ['messages'],
    },
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return 'a date to be confirmed'
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(String(iso)))
  } catch {
    return String(iso)
  }
}

function formatEventContext(e: Record<string, unknown>): string {
  const lines: string[] = []
  if (e.title) lines.push(`Title: ${e.title}`)
  if (e.event_type) lines.push(`Type: ${e.event_type}`)
  if (e.start_date) lines.push(`Date: ${fmtDate(e.start_date as string)}`)
  const venue = [e.venue_name, e.venue_city].filter(Boolean).join(', ')
  if (venue) lines.push(`Venue: ${venue}`)
  if (e.description)
    lines.push(`Description: ${String(e.description).replace(/\s+/g, ' ').trim().slice(0, 800)}`)
  return lines.join('\n')
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

    let body: DraftBody
    try {
      body = (await req.json()) as DraftBody
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    if (!body.prospect_id) {
      return Response.json({ error: 'prospect_id is required' }, { status: 400 })
    }

    const admin = getAdmin()

    // ── Load prospect ────────────────────────────────────────────────────
    const { data: prospect, error: pErr } = await admin
      .from('sponsor_prospects')
      .select('id, event_id, company_name, company_domain, industry, description, temperature, status')
      .eq('id', body.prospect_id)
      .maybeSingle()
    if (pErr || !prospect) return Response.json({ error: 'Prospect not found' }, { status: 404 })

    const eventId = (prospect.event_id as string) ?? null

    // ── Load event (via prospect.event_id) ───────────────────────────────
    let event: Record<string, unknown> | null = null
    if (eventId) {
      const { data: ev } = await admin
        .from('events')
        .select('id, title, start_date, venue_name, venue_city, description, event_type')
        .eq('id', eventId)
        .maybeSingle()
      event = (ev as Record<string, unknown>) ?? null
    }

    // ── Resolve decision-maker (given id → else the prospect's primary) ──
    let decisionMaker: Record<string, unknown> | null = null
    if (body.decision_maker_id) {
      const { data: dm } = await admin
        .from('sponsor_decision_makers')
        .select('id, first_name, last_name, title, seniority, email, is_primary')
        .eq('id', body.decision_maker_id)
        .maybeSingle()
      decisionMaker = (dm as Record<string, unknown>) ?? null
    } else {
      const { data: dm } = await admin
        .from('sponsor_decision_makers')
        .select('id, first_name, last_name, title, seniority, email, is_primary')
        .eq('prospect_id', prospect.id as string)
        .eq('is_primary', true)
        .limit(1)
        .maybeSingle()
      decisionMaker = (dm as Record<string, unknown>) ?? null
    }

    const dmId = decisionMaker ? (decisionMaker.id as string) : null
    const dmFirstName = decisionMaker ? ((decisionMaker.first_name as string) || '') : ''
    const dmLastName = decisionMaker ? ((decisionMaker.last_name as string) || '') : ''
    const dmFullName = `${dmFirstName} ${dmLastName}`.trim()
    const dmTitle = decisionMaker ? ((decisionMaker.title as string) || '') : ''
    const toEmail = decisionMaker ? ((decisionMaker.email as string) || null) : null

    // Greeting: named where we have one, else a graceful company/general open.
    const companyLabel = (prospect.company_name as string) || 'your organisation'
    const greeting = dmFirstName
      ? `Dear ${dmFirstName},`
      : `Dear ${companyLabel} team,`

    // ── Load voice row from marketing_voices ─────────────────────────────
    const voiceKey = body.voice === 'sarah' ? 'sarah' : 'club'
    let voiceRow: VoiceRow | null = null
    {
      const { data } = await admin
        .from('marketing_voices')
        .select('key, name, guidance, samples')
        .eq('key', voiceKey)
        .maybeSingle()
      voiceRow = (data as VoiceRow) ?? null
    }
    const voiceContext = buildVoiceContext(voiceRow)

    const steps = clamp(Math.round(Number(body.steps ?? 3)) || 3, 1, 5)

    const eventTitle = (event?.title as string) || 'an upcoming evening'
    const eventLine = `A partnership on ${eventTitle}.`

    // Render + insert one DRAFT row per message. Shared so the AI path and the
    // fallback path persist identically.
    const insertMessage = async (m: {
      step: number
      subject: string
      body_paragraphs: string[]
    }): Promise<Record<string, unknown> | null> => {
      const paragraphs = [greeting, ...m.body_paragraphs.filter((p) => p && p.trim())]
      const bodyHtml = renderClubEmail({
        eyebrow: 'Partnership with The Club',
        heading: m.subject || eventLine,
        paragraphs,
      })
      const bodyText = paragraphs.join('\n\n')
      const { data: ins, error: insErr } = await admin
        .from('sponsor_outreach')
        .insert({
          prospect_id: prospect.id as string,
          decision_maker_id: dmId,
          event_id: eventId,
          step: m.step,
          channel: 'email',
          sender: 'resend',
          voice: voiceKey,
          subject: m.subject || eventLine,
          body_html: bodyHtml,
          body_text: bodyText,
          status: 'draft',
          to_email: toEmail,
        })
        .select('*')
        .maybeSingle()
      if (insErr) {
        console.error('[sponsorship/outreach/draft] insert failed:', insErr.message)
        return null
      }
      return (ins as Record<string, unknown>) ?? null
    }

    // ── Generate the sequence (OpenAI structured, or templated fallback) ─
    const apiKey = process.env.OPENAI_API_KEY ?? null
    let messages: { step: number; subject: string; body_paragraphs: string[] }[] | null = null

    if (apiKey) {
      const openai = new OpenAI({ apiKey })
      const model = process.env.OPENAI_MODEL || 'gpt-4o-2024-08-06'
      const startedAt = performance.now()

      const systemPrompt = `You are the sponsorship outreach writer for The Club by Sarah Restrick.
${CLUB_VOICE}

Brand voice for this sequence:
${voiceContext}

Task: write a sponsorship outreach SEQUENCE of ${steps} email${steps > 1 ? 's' : ''} to a PROSPECTIVE SPONSOR for THIS specific event. step 0 is the first touch; steps 1..${steps - 1} are follow-ups that each acknowledge no reply yet, get progressively SHORTER, escalate the value on offer, and never become pushy — always warm and considered. Personalise to the company, the decision-maker (where named) and the event. Each message has a "subject" and 2-4 short paragraphs in "body_paragraphs". Do NOT include a greeting line (it is added by the shell) and do NOT include a sign-off line (the shell signs off). The FINAL paragraph of each message should gently invite a conversation. Return exactly ${steps} messages, one per step from 0 to ${steps - 1}. Do NOT invent facts, dates or figures that aren't in the source.`

      const userMessage = `EVENT:
${event ? formatEventContext(event) : '(event details unavailable)'}

PROSPECTIVE SPONSOR:
Company: ${companyLabel}
${prospect.industry ? `Industry: ${prospect.industry}` : ''}
${prospect.description ? `About: ${String(prospect.description).replace(/\s+/g, ' ').trim().slice(0, 600)}` : ''}
Temperature: ${prospect.temperature ?? 'unknown'}

DECISION-MAKER:
${dmFullName ? `Name: ${dmFullName}` : 'Name: (not yet identified — do not fabricate a name)'}
${dmTitle ? `Title: ${dmTitle}` : ''}
${body.note ? `\nADMIN NOTE:\n${String(body.note).slice(0, 1000)}` : ''}

Write the ${steps}-step outreach sequence (steps 0 to ${steps - 1}).`

      try {
        const response = await openai.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          response_format: { type: 'json_schema', json_schema: sequenceJsonSchema() },
          temperature: 0.6,
        })
        await logOpenAIUsage({
          feature: 'sponsorship_outreach_draft',
          model,
          usage: response.usage,
          startedAt,
          userId: auth.profile.id,
        })
        const raw = response.choices[0]?.message?.content
        const parsed = raw ? sequenceSchema.safeParse(JSON.parse(raw)) : null
        if (parsed && parsed.success && parsed.data.messages.length > 0) {
          messages = parsed.data.messages
            .slice()
            .sort((a, b) => a.step - b.step)
            .slice(0, steps)
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : 'OpenAI request failed'
        console.error('[sponsorship/outreach/draft] OpenAI failed, using fallback:', e)
        await logOpenAIUsage({
          feature: 'sponsorship_outreach_draft',
          model,
          startedAt,
          error: message,
          userId: auth.profile.id,
        })
      }
    }

    // Graceful fallback — a single templated first-touch draft so the queue is
    // never empty (mirrors the proposal route's fallbackParagraphs pattern).
    if (!messages) {
      const where = [event?.venue_name, event?.venue_city].filter(Boolean).join(', ')
      const when = fmtDate(event?.start_date as string | null)
      messages = [
        {
          step: 0,
          subject: `A partnership on ${eventTitle}`,
          body_paragraphs: [
            `I am writing from The Club by Sarah Restrick — a private membership community of exceptional founders and senior leaders — about ${eventTitle}${where ? ` at ${where}` : ''}${event?.start_date ? ` on ${when}` : ''}.`,
            `Our events are curated, intimate gatherings built on trusted introductions, and I think ${companyLabel} would be a considered fit for the audience in the room. I would love to explore a partnership that puts your brand at the centre of the evening.`,
            `If it would be useful, I would be glad to share the detail and tailor something to your goals. Might you have time for a short conversation?`,
          ],
        },
      ]
    }

    const inserted: Record<string, unknown>[] = []
    for (const m of messages) {
      const row = await insertMessage(m)
      if (row) inserted.push(row)
    }

    return Response.json({ ok: true, drafts: inserted })
  } catch (e) {
    console.error('[sponsorship/outreach/draft] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}
