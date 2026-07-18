// POST /api/admin/sponsors/roi
//
// Post-event ROI report for one sponsorship, admin-only. Builds real
// reach / guest / attendance stats from the event's confirmed bookings,
// asks OpenAI for a short warm narrative around them (reusing the repo's
// OpenAI setup — new OpenAI({apiKey}), OPENAI_MODEL || gpt-4o,
// chat.completions), wraps it in the shared Club email shell, and stores it
// on sponsorships.roi_report_html (+ the headline reach on roi_reach).
//
// Falls back to a templated report if OpenAI is unavailable.

import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { renderClubEmail } from '@/lib/email/club-email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RequestBody {
  sponsorship_id?: string
}

function getAdmin() {
  return createAdminClient(
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
  return { profile }
}

interface RoiStats {
  confirmed: number
  attended: number
  members: number
  guests: number
  eventTitle: string
}

function statsPanel(s: RoiStats): string {
  const cell = (label: string, value: string) =>
    `<td style="padding:4px 10px 4px 0;vertical-align:top;">
       <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:26px;color:#2C2825;line-height:1.1;">${value}</p>
       <p style="margin:4px 0 0 0;font-family:'DM Sans',Arial,sans-serif;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#6B6560;">${label}</p>
     </td>`
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 18px 0;background:#FAFAF7;border:1px solid #EAE6DE;border-radius:6px;"><tr><td style="padding:20px 22px;">
       <p style="margin:0 0 14px 0;font-family:'DM Sans',Arial,sans-serif;font-size:11px;letter-spacing:0.24em;text-transform:uppercase;color:#B8975A;font-weight:600;">The evening in numbers</p>
       <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
         ${cell('Guests reached', String(s.attended))}
         ${cell('Confirmed', String(s.confirmed))}
         ${cell('Members', String(s.members))}
         ${cell('Guests', String(s.guests))}
       </tr></table>
     </td></tr></table>`
}

async function buildRoiHtml(
  sp: { package_name: string; sponsor_name: string | null; sponsor_company: string | null },
  s: RoiStats,
): Promise<string> {
  const sponsorLabel = sp.sponsor_company || sp.sponsor_name || 'there'
  const fallbackParagraphs = [
    `Dear ${sponsorLabel},`,
    `Thank you for partnering with us on <strong style="color:#B8975A;">${s.eventTitle}</strong> as our ${sp.package_name} sponsor. Here is a short report on the evening and the audience your brand reached.`,
    `We welcomed <strong style="color:#2C2825;">${s.attended}</strong> guests on the night — ${s.members} members and ${s.guests} invited guests — a curated, senior audience with your brand at the centre of the room.`,
    `We would be glad to build on this partnership for the season ahead.`,
  ]

  const apiKey = process.env.OPENAI_API_KEY
  if (apiKey) {
    try {
      const openai = new OpenAI({ apiKey })
      const model = process.env.OPENAI_MODEL || 'gpt-4o-2024-08-06'
      const completion = await openai.chat.completions.create({
        model,
        temperature: 0.6,
        messages: [
          {
            role: 'system',
            content:
              'You write for The Club by Sarah Restrick, a private members’ business club. Voice: warm, considered, intimate, British English — never corporate or flowery. You are writing the body of a post-event SPONSOR ROI REPORT. Return 2–3 short paragraphs of plain prose (no headings, no lists, no greeting line, no sign-off — added around your text). Thank the sponsor, reflect on the calibre of the audience they reached using the real figures given, and close by inviting continued partnership. Do not invent numbers beyond those provided.',
          },
          {
            role: 'user',
            content: `Sponsor: ${sponsorLabel}\nPackage: ${sp.package_name}\nEvent: ${s.eventTitle}\nGuests reached (attended): ${s.attended}\nConfirmed bookings: ${s.confirmed}\nMembers: ${s.members}\nInvited guests: ${s.guests}\n\nWrite the ROI report body.`,
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
          eyebrow: 'Sponsor ROI report',
          heading: `${s.eventTitle} — your impact.`,
          paragraphs,
          panelHtml: statsPanel(s),
          panelAfterIndex: 2,
        })
      }
    } catch (e) {
      console.error('[sponsors/roi] OpenAI failed, using fallback:', e)
    }
  }

  return renderClubEmail({
    eyebrow: 'Sponsor ROI report',
    heading: `${s.eventTitle} — your impact.`,
    paragraphs: fallbackParagraphs,
    panelHtml: statsPanel(s),
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

    const admin = getAdmin()
    const { data: sp, error } = await admin
      .from('sponsorships')
      .select('id, event_id, package_name, sponsor_name, sponsor_company, events(title)')
      .eq('id', body.sponsorship_id)
      .single()
    if (error || !sp) return Response.json({ error: 'Sponsor not found' }, { status: 404 })

    // Build reach/attendance stats from the event's confirmed bookings.
    const { data: bookings } = await admin
      .from('bookings')
      .select('is_guest, member_id, checked_in, attendance')
      .eq('event_id', sp.event_id)
      .eq('status', 'confirmed')
    const rows = (bookings ?? []) as Array<{
      is_guest: boolean | null
      member_id: string | null
      checked_in: boolean | null
      attendance: string | null
    }>
    const attendedRows = rows.filter(
      (b) => b.checked_in === true || b.attendance === 'attended',
    )
    // Before check-in data exists, fall back to confirmed count for reach.
    const attended = attendedRows.length > 0 ? attendedRows.length : rows.length
    const stats: RoiStats = {
      confirmed: rows.length,
      attended,
      members: rows.filter((b) => !b.is_guest && b.member_id).length,
      guests: rows.filter((b) => b.is_guest).length,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eventTitle: ((sp as any).events?.title as string) ?? 'the event',
    }

    const html = await buildRoiHtml(
      { package_name: sp.package_name, sponsor_name: sp.sponsor_name, sponsor_company: sp.sponsor_company },
      stats,
    )
    const { error: upErr } = await admin
      .from('sponsorships')
      .update({ roi_report_html: html, roi_reach: stats.attended })
      .eq('id', sp.id)
    if (upErr) return Response.json({ error: upErr.message }, { status: 500 })

    return Response.json({ ok: true, roi_report_html: html, stats })
  } catch (e) {
    console.error('[sponsors/roi] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}
