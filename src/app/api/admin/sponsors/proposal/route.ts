// POST /api/admin/sponsors/proposal
//
// Two actions on a single sponsorship, both admin-only:
//   • action:'generate' — OpenAI writes a sponsorship proposal from the
//     event + package + investment, stored on sponsorships.proposal_html.
//     Reuses the repo's OpenAI setup (new OpenAI({apiKey}), OPENAI_MODEL ||
//     gpt-4o, chat.completions) exactly like the email-AI + welcome-report.
//   • action:'send'     — emails the stored proposal to the sponsor via
//     the shared sendClubEmail() Resend sender.
//
// DEFERRED (blocked): "AI finds ideal sponsors / matches guestlist to
// brands" needs the lead-enrichment vendor (Apollo/Clay) — NOT built here.

import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { renderClubEmail, sendClubEmail } from '@/lib/email/club-email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RequestBody {
  sponsorship_id?: string
  action?: 'generate' | 'send'
}

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

// Local per-route admin gate (copied, not shared — repo convention).
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
  return { profile }
}

function fmtGBP(pence: number | null | undefined): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(((pence ?? 0) as number) / 100)
}

function fmtDate(iso: string | null): string {
  if (!iso) return 'a date to be confirmed'
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

interface SponsorRow {
  id: string
  package_name: string
  amount_pence: number
  status: string
  brand_alignment: string | null
  showcase_slot: string | null
  sponsor_name: string | null
  sponsor_email: string | null
  sponsor_company: string | null
  member_id: string | null
  proposal_html: string | null
  events: {
    title: string
    start_date: string
    venue_name: string | null
    venue_city: string | null
    description: string | null
    event_type: string | null
  } | null
}

// Resolve the sponsor's name + recipient email (external row, or the linked
// member's profile) — mirrors the invite route.
async function resolveSponsor(
  admin: ReturnType<typeof getAdmin>,
  sp: SponsorRow,
): Promise<{ name: string; email: string; company: string | null }> {
  let name = sp.sponsor_name ?? ''
  let email = sp.sponsor_email ?? ''
  let company = sp.sponsor_company ?? null
  if ((!name || !email) && sp.member_id) {
    const { data: m } = await admin
      .from('members')
      .select('company_name, profiles(first_name, last_name, company_name, email)')
      .eq('id', sp.member_id)
      .single()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prof = (m as any)?.profiles as
      | { first_name?: string; last_name?: string; company_name?: string; email?: string }
      | null
    if (!name) name = `${prof?.first_name ?? ''} ${prof?.last_name ?? ''}`.trim()
    if (!email) email = prof?.email ?? ''
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!company) company = (m as any)?.company_name ?? prof?.company_name ?? null
  }
  return { name: name || company || 'there', email, company }
}

// Build the proposal HTML — OpenAI writes warm on-brand body copy, wrapped in
// the shared Club email shell. Falls back to a templated proposal if OpenAI
// is unavailable (mirrors buildOpportunityReport in lib/automations/run.ts).
async function buildProposalHtml(sp: SponsorRow): Promise<string> {
  const ev = sp.events
  const eventTitle = ev?.title ?? 'an upcoming evening'
  const when = fmtDate(ev?.start_date ?? null)
  const where = [ev?.venue_name, ev?.venue_city].filter(Boolean).join(', ')
  const investment = fmtGBP(sp.amount_pence)
  const sponsorLabel = sp.sponsor_company || sp.sponsor_name || 'your organisation'

  const detailsPanel = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 18px 0;background:#FAFAF7;border:1px solid #EAE6DE;border-radius:6px;"><tr><td style="padding:20px 22px;">
       <p style="margin:0 0 12px 0;font-family:'DM Sans',Arial,sans-serif;font-size:11px;letter-spacing:0.24em;text-transform:uppercase;color:#B8975A;font-weight:600;">Proposal at a glance</p>
       <p style="margin:0 0 8px 0;font-family:'DM Sans',Arial,sans-serif;font-size:14px;line-height:1.6;color:#3A3530;"><strong style="color:#2C2825;">Event</strong> — ${eventTitle}${where ? `, ${where}` : ''}</p>
       <p style="margin:0 0 8px 0;font-family:'DM Sans',Arial,sans-serif;font-size:14px;line-height:1.6;color:#3A3530;"><strong style="color:#2C2825;">Date</strong> — ${when}</p>
       <p style="margin:0 0 8px 0;font-family:'DM Sans',Arial,sans-serif;font-size:14px;line-height:1.6;color:#3A3530;"><strong style="color:#2C2825;">Package</strong> — ${sp.package_name}${sp.showcase_slot ? ` · ${sp.showcase_slot}` : ''}</p>
       <p style="margin:0;font-family:'DM Sans',Arial,sans-serif;font-size:14px;line-height:1.6;color:#3A3530;"><strong style="color:#2C2825;">Investment</strong> — ${investment}</p>
     </td></tr></table>`

  const fallbackParagraphs = [
    `Dear ${sponsorLabel},`,
    `We would be delighted to welcome ${sponsorLabel} as our <strong style="color:#B8975A;">${sp.package_name}</strong> sponsor for ${eventTitle}${where ? ` at ${where}` : ''} on ${when}.`,
    `The Club by Sarah Restrick brings together an exceptional, private audience of founders and senior leaders. Sponsoring places your brand at the centre of a curated evening built on trusted introductions — the details of the package are set out below.`,
    `The investment is ${investment}. We would be glad to talk it through and tailor the partnership to your goals.`,
  ]

  const apiKey = process.env.OPENAI_API_KEY
  if (apiKey) {
    try {
      const openai = new OpenAI({ apiKey })
      const model = process.env.OPENAI_MODEL || 'gpt-4o-2024-08-06'
      const contextLines = [
        `Sponsor: ${sponsorLabel}`,
        `Event: ${eventTitle}`,
        ev?.event_type ? `Event type: ${ev.event_type}` : '',
        `Date: ${when}`,
        where ? `Venue: ${where}` : '',
        `Sponsorship package: ${sp.package_name}`,
        sp.showcase_slot ? `Showcase slot: ${sp.showcase_slot}` : '',
        `Investment: ${investment}`,
        sp.brand_alignment ? `Why this sponsor fits: ${sp.brand_alignment}` : '',
        ev?.description ? `Event description: ${ev.description.replace(/\s+/g, ' ').trim().slice(0, 400)}` : '',
      ].filter(Boolean).join('\n')

      const completion = await openai.chat.completions.create({
        model,
        temperature: 0.6,
        messages: [
          {
            role: 'system',
            content:
              'You write for The Club by Sarah Restrick, a private members’ business club. Voice: warm, considered, intimate, British English — never corporate or flowery. You are writing the body of a SPONSORSHIP PROPOSAL to a prospective sponsor. Return 3–4 short paragraphs of plain prose (no headings, no lists, no greeting line, no sign-off — those are added around your text). Open by inviting them to partner on the specific event, convey the calibre and privacy of the audience, describe what the named package gives them, and close by inviting a conversation. Reference the real event, package and investment figure you are given.',
          },
          {
            role: 'user',
            content: `Sponsorship details:\n${contextLines}\n\nWrite the proposal body.`,
          },
        ],
      })
      const text = completion.choices[0]?.message?.content?.trim()
      if (text) {
        const paragraphs = [
          `Dear ${sponsorLabel},`,
          ...text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
        ]
        return renderClubEmail({
          eyebrow: 'Sponsorship proposal',
          heading: `A partnership on ${eventTitle}.`,
          paragraphs,
          panelHtml: detailsPanel,
          panelAfterIndex: 2,
        })
      }
    } catch (e) {
      console.error('[sponsors/proposal] OpenAI failed, using fallback:', e)
    }
  }

  return renderClubEmail({
    eyebrow: 'Sponsorship proposal',
    heading: `A partnership on ${eventTitle}.`,
    paragraphs: fallbackParagraphs,
    panelHtml: detailsPanel,
    panelAfterIndex: 2,
  })
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

    let body: RequestBody
    try {
      body = (await req.json()) as RequestBody
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    if (!body.sponsorship_id) {
      return Response.json({ error: 'sponsorship_id is required' }, { status: 400 })
    }
    const action = body.action === 'send' ? 'send' : 'generate'

    const admin = getAdmin()
    const { data: sp, error } = await admin
      .from('sponsorships')
      .select(
        'id, package_name, amount_pence, status, brand_alignment, showcase_slot, sponsor_name, sponsor_email, sponsor_company, member_id, proposal_html, events(title, start_date, venue_name, venue_city, description, event_type)',
      )
      .eq('id', body.sponsorship_id)
      .single()
    if (error || !sp) return Response.json({ error: 'Sponsor not found' }, { status: 404 })
    const sponsor = sp as unknown as SponsorRow

    if (action === 'send') {
      if (!sponsor.proposal_html) {
        return Response.json({ error: 'Generate the proposal before sending it.' }, { status: 400 })
      }
      const { name, email } = await resolveSponsor(admin, sponsor)
      if (!email) {
        return Response.json(
          { error: 'This sponsor has no email address. Add one before sending.' },
          { status: 400 },
        )
      }
      const r = await sendClubEmail({
        to: email,
        subject: `A sponsorship proposal — ${sponsor.events?.title ?? 'The Club'}`,
        html: sponsor.proposal_html,
        category: 'sponsor_proposal',
        memberId: sponsor.member_id ?? undefined,
      })
      if (!r.sent) return Response.json({ error: r.error ?? 'Send failed' }, { status: 502 })
      return Response.json({ ok: true, to: email, sponsor: name })
    }

    // action === 'generate'
    const html = await buildProposalHtml(sponsor)
    const { error: upErr } = await admin
      .from('sponsorships')
      .update({ proposal_html: html })
      .eq('id', sponsor.id)
    if (upErr) return Response.json({ error: upErr.message }, { status: 500 })
    return Response.json({ ok: true, proposal_html: html })
  } catch (e) {
    console.error('[sponsors/proposal] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}
