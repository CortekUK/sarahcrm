'use client'

// Member portal → Messages. A full-height app surface (WhatsApp-Web style)
// filling the viewport under the 72px portal header — no editorial hero, no
// floating card. Colours follow the portal's day/night theme via the chat
// theme tokens. The portal footer is hidden on this route (layout.tsx).

import { MessagesView } from '@/views/chat/MessagesView'

export function PortalMessagesPage() {
  return <MessagesView className="h-[calc(100dvh-72px)] border-t border-border" />
}
