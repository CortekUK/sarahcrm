import { Suspense } from 'react'
import type { Viewport } from 'next'
import { PortalMessagesPage } from '@/views/portal/PortalMessagesPage'

// Server wrapper so the route can ask Android/Chrome to RESIZE the layout for
// the on-screen keyboard (keeps the docked composer visible; dvh tracks it).
export const viewport: Viewport = { interactiveWidget: 'resizes-content' }

export default function Page() {
  // Suspense: MessagesView keeps the open conversation in ?c= (useSearchParams).
  return (
    <Suspense fallback={null}>
      <PortalMessagesPage />
    </Suspense>
  )
}
