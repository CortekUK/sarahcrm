'use client'

import { Suspense } from 'react'
import { CallsPage } from '@/views/admin/calls/CallsPage'

// Suspense: CallsPage reads useSearchParams() for the ?call=<id> deep link.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <CallsPage />
    </Suspense>
  )
}
