import { Suspense } from 'react'
import { FeedAdminPage } from '@/views/admin/feed/FeedAdminPage'

export default function Page() {
  // Suspense: ?group= / ?post= live in the URL (useSearchParams).
  return (
    <Suspense fallback={null}>
      <FeedAdminPage />
    </Suspense>
  )
}
