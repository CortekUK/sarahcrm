// In-app "tell the marketing team" for the Marketing AI Engine.
//
// Marketing notifications must stay IN-APP — the older notifyAdmins() helper
// (src/lib/email/admin-notify.ts) EMAILS every admin, so it is not used.
// Two in-app writes, both best-effort:
//   1. An UNASSIGNED task in the Task Management module (Dashboard → Tasks)
//      — the precedent set by the enquiry intake and the renewal automation,
//      and visible to the whole team today.
//   2. An admin_notifications row via createAdminNotification()
//      (src/lib/notifications/in-app.ts — the generic in-app feed, table from
//      20261016_concierge_events_calls.sql). It swallows its own errors, so
//      it is harmless until that migration is applied / a feed UI exists.
// Nothing is emailed or messaged. Failures are logged and swallowed so they
// never break the publish that triggered them.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminNotification } from '@/lib/notifications/in-app'

export async function notifyMarketingTeamInApp(
  admin: SupabaseClient,
  args: {
    kind: string
    title: string
    description: string
    link?: string | null // in-app path for the notification feed
    eventId?: string | null
  },
): Promise<void> {
  try {
    const { error } = await admin.from('tasks').insert({
      title: args.title.slice(0, 200),
      description: args.description,
      status: 'todo',
      priority: 'medium',
      category: 'general',
      assigned_to: null,
      related_event_id: args.eventId ?? null,
      due_date: new Date().toISOString().slice(0, 10),
    })
    if (error) console.error('[marketing/notify] task insert failed:', error.message)
  } catch (e) {
    console.error('[marketing/notify] task insert failed:', e)
  }

  await createAdminNotification(admin, {
    kind: args.kind,
    title: args.title,
    body: args.description,
    link: args.link ?? null,
  })
}
