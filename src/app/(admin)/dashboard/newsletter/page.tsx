'use client'

import { Suspense } from 'react'
import { NewsletterPage } from '@/views/admin/newsletter/NewsletterPage'

// Suspense: NewsletterPage reads ?tab= with useSearchParams.
export default function Page() {
  return (
    <Suspense>
      <NewsletterPage />
    </Suspense>
  )
}
