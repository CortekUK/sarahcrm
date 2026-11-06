// POST /api/admin/applications/email
//
// Send a one-off email to a membership applicant, written in the email
// designer opened in compose mode (/dashboard/communications/compose — the
// "Email applicant" button on the application file). The designer posts its
// in-memory blocks + theme (nothing is saved as a template); we render them
// exactly like a template send (renderBlocksToHTML), fill merge tags from the
// applicant ({{first_name}}, {{last_name}}, {{email}}, {{phone}}) and the
// signed-in admin ({{sender_*}}), add an unsubscribe link if the design has
// none, and ship through the branded Resend sender. Logged to email_log as
// 'application_email'; the application itself is unchanged.
//
// Body: { application_id: string, subject: string, blocks: EditorBlock[], theme?: TemplateTheme }
// Returns: { ok: true } or { error }

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { escapeMergeData, sendClubEmail } from '@/lib/email/club-email'
import { replaceMergeTags } from '@/lib/utils-templates/merge-tags-core'
import { buildMergeData } from '@/lib/communications/merge-data'
import { siteUrl } from '@/lib/email/site-url'
import { memberUnsubscribeUrl, unsubscribeFooterHtml } from '@/lib/email/unsubscribe'
import { renderBlocksToHTML } from '@/lib/templates/render-html'
import { cleanBlocks } from '@/lib/templates/clean-blocks'
import type { TemplateTheme } from '@/lib/templates/editor-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getAdminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function POST(request: Request) {
  // ── Admin gate ──────────────────────────────────────────────────
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, first_name, last_name, email, phone, job_title')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') {
    return Response.json({ error: 'Admin only.' }, { status: 403 })
  }

  // ── Parse + validate ────────────────────────────────────────────
  let payload: { application_id?: string; subject?: string; blocks?: unknown; theme?: unknown }
  try {
    payload = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const applicationId = typeof payload.application_id === 'string' ? payload.application_id.trim() : ''
  // The subject is a plain-text header: strip any tags typed into it and
  // collapse whitespace/newlines (header injection).
  const subjectInput =
    typeof payload.subject === 'string'
      ? payload.subject.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
      : ''
  const blocks = cleanBlocks(payload.blocks)
  const theme =
    payload.theme && typeof payload.theme === 'object' ? (payload.theme as TemplateTheme) : null
  if (!applicationId) return Response.json({ error: 'application_id is required.' }, { status: 400 })
  if (!subjectInput) return Response.json({ error: 'Add a subject line first.' }, { status: 400 })
  if (subjectInput.length > 200) return Response.json({ error: 'Subject is too long.' }, { status: 400 })
  if (blocks.length === 0) {
    return Response.json({ error: 'The email is empty — add at least one block.' }, { status: 400 })
  }

  const admin = getAdminDb()

  // ── Load the application (need the recipient) ───────────────────
  const { data: application, error: loadError } = await admin
    .from('membership_applications')
    .select('id, email, first_name, last_name, phone')
    .eq('id', applicationId)
    .single()
  if (loadError || !application) {
    return Response.json({ error: 'Application not found.' }, { status: 404 })
  }
  if (!application.email) {
    return Response.json({ error: 'This application has no email address.' }, { status: 400 })
  }

  // ── Render + merge ──────────────────────────────────────────────
  let templateHtml: string
  try {
    templateHtml = renderBlocksToHTML(blocks, theme)
  } catch (e) {
    console.error('[applications/email] render failed:', e)
    return Response.json(
      { error: 'This email could not be rendered — check its blocks and try again.' },
      { status: 400 },
    )
  }
  const unsubscribeUrl = memberUnsubscribeUrl(application.email)
  const data = buildMergeData({
    // An applicant isn't a member yet — feed their details in the member
    // shape so the shared merge-tag resolver fills the same tags.
    member: {
      id: application.id,
      membership_tier: null,
      company_name: null,
      profile: {
        id: application.id,
        first_name: application.first_name,
        last_name: application.last_name,
        email: application.email,
        phone: application.phone,
        job_title: null,
        company_name: null,
      },
    },
    sender: {
      full_name: `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || 'Sarah Restrick',
      title: profile.job_title ?? 'Founder, The Club',
      email: profile.email ?? '',
      phone: profile.phone ?? '',
      booking_link: `${siteUrl()}/events`,
    },
    unsubscribeUrl,
  })
  const subject = replaceMergeTags(subjectInput, data) || subjectInput
  let html = replaceMergeTags(templateHtml, escapeMergeData(data))
  if (!/\{\{\s*unsubscribe_url/.test(templateHtml)) {
    const footer = unsubscribeFooterHtml(unsubscribeUrl)
    const i = html.toLowerCase().lastIndexOf('</body>')
    html = i >= 0 ? `${html.slice(0, i)}${footer}${html.slice(i)}` : `${html}${footer}`
  }

  const result = await sendClubEmail({
    to: application.email,
    subject,
    html,
    category: 'application_email',
  })
  if (!result.sent) {
    return Response.json({ error: result.error ?? 'Failed to send email.' }, { status: 502 })
  }

  return Response.json({ ok: true })
}
