'use client'

import { InboxPage } from '@/views/admin/inbox/InboxPage'

// Staff inbox — the same two-pane Inbox as admins, inside the /team portal.
// The /api/admin/inbox/* routes already limit a staff member to the mailboxes
// an admin granted them (Inbox → Access); with no grant they see the
// "No inbox access" state. Height = viewport minus the 64px staff top bar.
export default function Page() {
  return <InboxPage className="h-[calc(100dvh-4rem)]" />
}
