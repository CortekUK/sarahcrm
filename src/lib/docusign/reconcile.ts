// Shared signature-request reconciliation — used by the manual status route,
// the auto-refresh-on-load path, and the DocuSign Connect webhook. Given a
// signature_requests row, it reads the envelope's live status, persists any
// change, and (once completed) files the signed PDF into the member document
// vault exactly once.

import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  getEnvelopeStatus,
  getCombinedDocument,
  type DocuSignConfig,
} from './client'

type AdminDb = SupabaseClient<Database>
type SignatureRow = Database['public']['Tables']['signature_requests']['Row']

const BUCKET = 'member-documents'

// A request needs no further polling once declined/voided, or completed AND
// already filed into the vault.
export function isSettled(row: SignatureRow): boolean {
  if (row.status === 'declined' || row.status === 'voided') return true
  if (row.status === 'completed' && row.signed_document_id) return true
  return false
}

function slugify(name: string): string {
  const dot = name.lastIndexOf('.')
  const base = (dot >= 0 ? name.slice(0, dot) : name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return base || 'document'
}

async function vaultSignedDocument(
  admin: AdminDb,
  cfg: DocuSignConfig,
  token: string,
  row: SignatureRow,
): Promise<string> {
  const bytes = await getCombinedDocument(cfg, token, row.envelope_id as string)
  const stamp = Date.now()
  const rand = crypto.randomBytes(4).toString('hex')
  const label = slugify(row.title || row.source_file_name || 'agreement')
  const path = `${row.member_id}/${stamp}-${rand}-signed-${label}.pdf`

  const up = await admin.storage.from(BUCKET).upload(path, Buffer.from(bytes), {
    contentType: 'application/pdf',
    upsert: false,
  })
  if (up.error) throw new Error(`Vault upload failed: ${up.error.message}`)

  const { data: doc, error: docErr } = await admin
    .from('member_documents')
    .insert({
      member_id: row.member_id,
      doc_type: row.doc_type,
      title: row.title,
      file_name: `Signed — ${row.title || row.source_file_name || 'Agreement'}.pdf`,
      file_path: path,
      content_type: 'application/pdf',
      size_bytes: bytes.byteLength,
      uploaded_by: row.sent_by,
    })
    .select('id')
    .single()

  if (docErr || !doc) {
    await admin.storage.from(BUCKET).remove([path])
    throw new Error(`Could not file the signed document: ${docErr?.message ?? 'unknown error'}`)
  }
  return doc.id
}

// Refreshes one row against DocuSign and persists any change (status, decline
// reason, and — on completion — the vaulted signed document). Returns the
// updated row. Safe to call repeatedly: vaulting only happens once.
export async function syncSignatureRequest(
  admin: AdminDb,
  cfg: DocuSignConfig,
  token: string,
  row: SignatureRow,
): Promise<SignatureRow> {
  if (!row.envelope_id) return row

  const nowIso = new Date().toISOString()
  const update: Database['public']['Tables']['signature_requests']['Update'] = {
    last_checked_at: nowIso,
  }

  try {
    const env = await getEnvelopeStatus(cfg, token, row.envelope_id)
    update.status = env.status
    if (env.status === 'declined' && env.declinedReason) update.declined_reason = env.declinedReason

    if (env.status === 'completed' && !row.signed_document_id) {
      try {
        const docId = await vaultSignedDocument(admin, cfg, token, row)
        update.signed_document_id = docId
        update.completed_at = env.completedDateTime || nowIso
        update.error = null
      } catch (e) {
        update.error = e instanceof Error ? e.message : 'Could not file signed document'
      }
    }
  } catch (e) {
    update.error = e instanceof Error ? e.message : 'Status check failed'
  }

  const { data: updated } = await admin
    .from('signature_requests')
    .update(update)
    .eq('id', row.id)
    .select('*')
    .single()

  return updated ?? row
}
