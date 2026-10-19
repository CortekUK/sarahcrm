// In-app admin notifications — rows in `admin_notifications` that the CRM
// surfaces to admins (no email, no message to anyone). Written with the
// service-role client by server code; read/marked-read by admins under
// is_admin() RLS. See supabase/migrations/20261016_concierge_events_calls.sql.
//
// Best-effort: a failure (including the table not existing yet because the
// migration hasn't been applied) is logged and swallowed so it never breaks
// the flow that triggered it.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface AdminNotificationInput {
  kind: string // e.g. 'concierge_call_booked'
  title: string
  body?: string | null
  link?: string | null // in-app path, e.g. '/dashboard/enquiries'
  related_enquiry_id?: string | null
}

export async function createAdminNotification(
  admin: SupabaseClient,
  input: AdminNotificationInput,
): Promise<void> {
  try {
    const { error } = await admin.from('admin_notifications').insert({
      kind: input.kind,
      title: input.title.slice(0, 300),
      body: input.body?.slice(0, 2000) ?? null,
      link: input.link ?? null,
      related_enquiry_id: input.related_enquiry_id ?? null,
    })
    if (error) throw error
  } catch (e) {
    console.error('[notifications/in-app] insert failed:', e)
  }
}
