'use client'

import { AuthProvider } from '@/providers/AuthProvider'

export default function AuthGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthProvider>
      {children}
    </AuthProvider>
  )
}
