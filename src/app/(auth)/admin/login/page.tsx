'use client'

import { Suspense } from 'react'
import { LoginPage } from '@/views/auth/LoginPage'

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-bg flex items-center justify-center px-4">
          <div className="text-sm text-text-muted">Loading…</div>
        </div>
      }
    >
      <LoginPage role="admin" />
    </Suspense>
  )
}
