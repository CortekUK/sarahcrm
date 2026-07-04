// POST /api/admin/signatures/send
//
// Sends a document to a member for e-signature via DocuSign and records it in
// `signature_requests` (with the returned `envelope_id`, so status can be
// polled). Two input modes:
//
//   • Contract mode (the builder): pass `body_html` (or `contract_template_id`
//     to load the saved contract's HTML). Member merge tags ({{first_name}}…)
//     are substituted from the selected member, [[signature]]/[[initials]]/…
//     field tokens become DocuSign anchor tabs, and the HTML is sent as an HTML
//     document (DocuSign converts it to a PDF of record).
//   • PDF mode (legacy): pass `file_base64` of a PDF; a signature tab is placed
//     on the last page.
//
// On completion the signed PDF is filed into the member vault (see ./status).

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import {
  getDocuSignConfig,
  getAccessToken,
  createEnvelope,
  createEnvelopeFromHtml,
  countPdfPages,
  DocuSignError,
  type AnchorTabType,
} from '@/lib/docusign/client'
import { injectDocuSignAnchors, CONTRACT_FIELDS } from '@/lib/contracts/fields'
import { buildMergeData, type MemberRow, type SenderProfile, DEFAULT_SENDER } from '@/lib/communications/merge-data'
import { replaceMergeTags } from '@/lib/utils-templates/merge-tags-core'
import type { Database } from '@/types/database'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_MB = 12

interface RequestBody {
  member_id?: string
  signer_name?: string
  signer_email?: string
  doc_type?: string
  title?: string
  subject?: string
  message?: string
  // Contract mode
  body_html?: string
  contract_template_id?: string
  // PDF mode (legacy)
  file_base64?: string
  file_name?: string
}

function getAdminDb() {
  return createSupabaseAdminClient<Database>(
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Normalises Supabase's object-or-array join shape.
function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

type AdminDb = ReturnType<typeof getAdminDb>

async function loadMember(admin: AdminDb, memberId: string): Promise<MemberRow | null> {
  const { data } = await admin
    .from('members')
    .select(
      'id, membership_tier, company_name, profiles(id, first_name, last_name, email, phone, job_title, company_name)',
    )
    .eq('id', memberId)
    .maybeSingle()
  if (!data) return null
  const profile = one(data.profiles as unknown)
  return {
    id: data.id,
    membership_tier: data.membership_tier ?? null,
    company_name: data.company_name ?? null,
    profile: (profile as MemberRow['profile']) ?? null,
  }
}

async function loadSender(admin: AdminDb, adminId: string): Promise<SenderProfile> {
  const { data } = await admin
    .from('profiles')
    .select('first_name, last_name, job_title, email, phone')
    .eq('id', adminId)
    .maybeSingle()
  if (!data) return DEFAULT_SENDER
  const name = `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim()
  return {
    full_name: name || DEFAULT_SENDER.full_name,
    title: data.job_title || DEFAULT_SENDER.title,
    email: data.email || DEFAULT_SENDER.email,
    phone: data.phone || '',
    booking_link: DEFAULT_SENDER.booking_link,
  }
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

    const memberId = body.member_id?.trim()
    const subject = body.subject?.trim()
    if (!memberId) return Response.json({ error: 'member_id is required.' }, { status: 400 })
    if (!subject) return Response.json({ error: 'An email subject is required.' }, { status: 400 })

    const cfg = getDocuSignConfig()
    if (!cfg) {
      return Response.json(
        { error: 'DocuSign isn’t configured yet. Add the DocuSign keys to the environment.' },
        { status: 400 },
      )
    }

    const admin = getAdminDb()
    const member = await loadMember(admin, memberId)
    if (!member) return Response.json({ error: 'Member not found.' }, { status: 404 })

    // Signer defaults to the member; the modal may override the name/email.
    const signerName =
      body.signer_name?.trim() ||
      `${member.profile?.first_name ?? ''} ${member.profile?.last_name ?? ''}`.trim()
    const signerEmail = body.signer_email?.trim() || member.profile?.email || ''
    if (!signerName) return Response.json({ error: 'A signer name is required.' }, { status: 400 })
    if (!signerEmail || !EMAIL_RE.test(signerEmail))
      return Response.json({ error: 'A valid signer email is required.' }, { status: 400 })

    const isContract = typeof body.body_html === 'string' || !!body.contract_template_id

    const token = await getAccessToken(cfg)

    let envelope: { envelopeId: string; status: string }
    let sourceFileName: string

    if (isContract) {
      // ── Contract HTML flow ─────────────────────────────────────
      let html = body.body_html?.trim() || ''
      if (!html && body.contract_template_id) {
        const { data: tpl } = await admin
          .from('contract_templates')
          .select('body_html, name')
          .eq('id', body.contract_template_id)
          .maybeSingle()
        if (!tpl) return Response.json({ error: 'Contract not found.' }, { status: 404 })
        html = tpl.body_html || ''
      }
      if (!html) return Response.json({ error: 'The contract has no content.' }, { status: 400 })

      // 1) Merge member data into the document (read-only by construction).
      const sender = await loadSender(admin, auth.admin.id)
      const mergeData = buildMergeData({ member, sender })
      html = replaceMergeTags(html, mergeData)

      // 2) Turn [[field]] tokens into hidden anchors + collect the tabs present.
      const { html: anchoredHtml, presentTabs } = injectDocuSignAnchors(html)
      const anchorByTab = new Map<AnchorTabType, string>(
        CONTRACT_FIELDS.map((f) => [f.tab, f.anchor]),
      )
      const anchorTabs = presentTabs.map((tab) => ({ tab, anchor: anchorByTab.get(tab)! }))

      sourceFileName = body.title?.trim() || 'Agreement'
      envelope = await createEnvelopeFromHtml(cfg, token, {
        signerName,
        signerEmail,
        subject,
        message: body.message?.trim() || undefined,
        html: anchoredHtml,
        fileName: sourceFileName,
        anchorTabs,
      })
    } else {
      // ── Legacy PDF flow ────────────────────────────────────────
      const fileName = body.file_name?.trim()
      let fileBase64 = body.file_base64 ?? ''
      if (!fileName) return Response.json({ error: 'A document is required.' }, { status: 400 })
      if (!fileBase64) return Response.json({ error: 'The document is empty.' }, { status: 400 })

      const comma = fileBase64.indexOf(',')
      if (fileBase64.startsWith('data:') && comma >= 0) fileBase64 = fileBase64.slice(comma + 1)
      fileBase64 = fileBase64.replace(/\s/g, '')

      const bytes = Buffer.from(fileBase64, 'base64')
      if (bytes.length === 0)
        return Response.json({ error: 'The document is empty.' }, { status: 400 })
      if (bytes.length > MAX_MB * 1024 * 1024)
        return Response.json({ error: `The document is too large (max ${MAX_MB} MB).` }, { status: 400 })
      if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-')
        return Response.json({ error: 'Please upload a PDF document.' }, { status: 400 })

      const signPage = await countPdfPages(new Uint8Array(bytes))
      sourceFileName = fileName
      envelope = await createEnvelope(cfg, token, {
        signerName,
        signerEmail,
        subject,
        message: body.message?.trim() || undefined,
        fileBase64,
        fileName,
        signPage,
      })
    }

    const nowIso = new Date().toISOString()
    const { data: row, error: insertErr } = await admin
      .from('signature_requests')
      .insert({
        member_id: memberId,
        contract_template_id: body.contract_template_id ?? null,
        envelope_id: envelope.envelopeId,
        status: envelope.status || 'sent',
        doc_type: body.doc_type?.trim() || 'contract',
        title: body.title?.trim() || null,
        signer_name: signerName,
        signer_email: signerEmail,
        subject,
        message: body.message?.trim() || null,
        source_file_name: sourceFileName,
        sent_by: auth.admin.id,
        sent_at: nowIso,
        last_checked_at: nowIso,
      })
      .select('*')
      .single()

    if (insertErr || !row) {
      return Response.json(
        {
          error: `Envelope sent (id ${envelope.envelopeId}) but could not be saved: ${insertErr?.message ?? 'unknown error'}`,
          envelope_id: envelope.envelopeId,
        },
        { status: 500 },
      )
    }

    return Response.json({ ok: true, request: row })
  } catch (err) {
    if (err instanceof DocuSignError) {
      return Response.json(
        { error: err.message, consentUrl: err.consentUrl },
        { status: err.status ?? 502 },
      )
    }
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return Response.json({ error: message }, { status: 500 })
  }
}
