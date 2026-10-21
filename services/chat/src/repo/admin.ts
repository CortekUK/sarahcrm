// Blocks, reports and staff oversight grants.
import { supabase, must } from '../supabase.js'
import type { Cursor } from '../cursor.js'

export interface ReportRow {
  id: string
  conversation_id: string
  message_id: string | null
  reporter_id: string | null
  reason: string
  status: 'open' | 'reviewed' | 'dismissed'
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  /** Member Feed reports (20261022_member_feed.sql); undefined before it's applied */
  post_id?: string | null
  comment_id?: string | null
}

const q = (v: string) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

export async function addBlock(blocker: string, blocked: string) {
  must(
    await supabase
      .from('chat_blocks')
      .upsert({ blocker_id: blocker, blocked_id: blocked }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true }),
    'block',
  )
}

export async function removeBlock(blocker: string, blocked: string) {
  must(await supabase.from('chat_blocks').delete().eq('blocker_id', blocker).eq('blocked_id', blocked), 'unblock')
}

export async function createReport(row: {
  conversationId: string
  messageId: string | null
  reporterId: string
  reason: string
  postId?: string | null
  commentId?: string | null
}) {
  const res = await supabase
    .from('chat_reports')
    .insert({
      conversation_id: row.conversationId,
      message_id: row.messageId,
      reporter_id: row.reporterId,
      reason: row.reason,
      // Only send the feed columns when set, so chat reports keep working before the feed migration.
      ...(row.postId ? { post_id: row.postId } : {}),
      ...(row.commentId ? { comment_id: row.commentId } : {}),
    })
    .select('*')
    .single()
  return must(res, 'create report') as ReportRow
}

export async function listReports(status: string | null, after: Cursor | null, limit: number): Promise<ReportRow[]> {
  let query = supabase
    .from('chat_reports')
    .select('*')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1)
  if (status) query = query.eq('status', status)
  if (after?.key) query = query.or(`created_at.lt.${q(after.key)},and(created_at.eq.${q(after.key)},id.lt.${after.id})`)
  return must(await query, 'reports') as ReportRow[]
}

export async function updateReport(id: string, status: ReportRow['status'], by: string): Promise<ReportRow | null> {
  const res = await supabase
    .from('chat_reports')
    .update({ status, reviewed_by: status === 'open' ? null : by, reviewed_at: status === 'open' ? null : new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .maybeSingle()
  return must(res, 'update report') as ReportRow | null
}

export async function hasStaffAccess(profileId: string): Promise<boolean> {
  const res = await supabase.from('chat_staff_access').select('profile_id').eq('profile_id', profileId).maybeSingle()
  return !!must(res, 'staff access')
}

export async function listStaff() {
  return must(await supabase.from('chat_staff_access').select('*').order('created_at', { ascending: true }), 'staff list') as {
    profile_id: string
    granted_by: string | null
    created_at: string
  }[]
}

export async function grantStaff(profileId: string, by: string) {
  must(
    await supabase
      .from('chat_staff_access')
      .upsert({ profile_id: profileId, granted_by: by }, { onConflict: 'profile_id', ignoreDuplicates: true }),
    'grant staff',
  )
}

export async function revokeStaff(profileId: string) {
  must(await supabase.from('chat_staff_access').delete().eq('profile_id', profileId), 'revoke staff')
}

export async function ownerFromSettings(): Promise<string | null> {
  const res = await supabase.from('app_settings').select('value').eq('key', 'media_owner').maybeSingle()
  const row = must(res, 'media_owner') as { value: { profileId?: unknown } | null } | null
  const id = row?.value?.profileId
  return typeof id === 'string' && id ? id : null
}
