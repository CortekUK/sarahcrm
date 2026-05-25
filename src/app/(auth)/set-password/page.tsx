'use client'

import { Suspense } from 'react'
import { SetPasswordPage } from '@/views/auth/SetPasswordPage'

// Landing page for invitation / password-recovery emails. The Supabase
// invite link redirects here with the access + refresh tokens in the URL
// hash; the page picks them up via the auto-detected session and lets
// the new member set their password.

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-bg flex items-center justify-center px-4">
          <div className="text-sm text-text-muted">Loading…</div>
        </div>
      }
    >
      <SetPasswordPage />
    </Suspense>
  )
}
