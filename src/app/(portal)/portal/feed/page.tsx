import { Suspense } from 'react'
import { PortalFeedPage } from '@/views/portal/PortalFeedPage'

export default function Page() {
  // Suspense: the feed keeps an opened post in ?post= (useSearchParams).
  return (
    <Suspense fallback={null}>
      <PortalFeedPage />
    </Suspense>
  )
}
