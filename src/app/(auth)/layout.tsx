'use client'

import { AuthProvider } from '@/providers/AuthProvider'

// `theme-night-admin` is the same dark scope the dashboard uses — applied
// here so /login (and any future auth pages) inherit the midnight + bronze
// vibe instead of falling back to the legacy cream defaults.
export default function AuthGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthProvider>
      <div className="theme-night-admin min-h-screen">{children}</div>
    </AuthProvider>
  )
}
