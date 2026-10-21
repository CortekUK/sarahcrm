import type { Viewport } from 'next'
import { MessagesAdminPage } from '@/views/admin/messages/MessagesAdminPage'

// Server wrapper so the route can ask Android/Chrome to RESIZE the layout for
// the on-screen keyboard (keeps the docked composer visible; dvh tracks it).
export const viewport: Viewport = { interactiveWidget: 'resizes-content' }

export default function Page() {
  return <MessagesAdminPage />
}
