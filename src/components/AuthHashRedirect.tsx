'use client'

import { useEffect } from 'react'

// Safety net for Supabase auth action links (invite / recovery / magic link).
//
// Supabase appends the session tokens to the URL *hash* and redirects to the
// configured redirect target. In some configurations that redirect lands on
// the site root ("/") instead of "/set-password", leaving the member stranded
// on the marketing homepage with a `#access_token=…` fragment.
//
// Because the hash is never sent to the server, only the client can recover
// it. This component — mounted once at the root — detects an auth token hash
// on any page other than /set-password and forwards the full hash there, where
// SetPasswordPage knows how to complete the flow.
export function AuthHashRedirect() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = window.location.hash
    if (!hash || window.location.pathname === '/set-password') return
    const hasToken = hash.includes('access_token=')
    const isAuthFlow = /type=(invite|recovery|signup|magiclink)/.test(hash)
    if (hasToken && isAuthFlow) {
      window.location.replace(`/set-password${hash}`)
    }
  }, [])

  return null
}
