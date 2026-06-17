// GET /api/admin/integrations/status
//
// Real connection status for the Settings → Integrations cards. Each
// integration is "connected" when its credentials are actually present in
// this environment — no more hardcoded "Connected" badges. Secret keys are
// server-only, so the client can't read them directly; this admin-gated
// route reports presence (never the values).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY ?? ''
  const stripeMode = stripeKey
    ? stripeKey.startsWith('sk_live') || stripeKey.startsWith('rk_live')
      ? 'Live mode'
      : 'Test mode'
    : null

  const resendFrom = process.env.RESEND_FROM_EMAIL || process.env.FROM_EMAIL || ''
  const resendDomain = resendFrom.includes('@') ? resendFrom.split('@')[1] : null

  return NextResponse.json({
    stripe: {
      connected: !!stripeKey,
      detail: stripeMode,
    },
    gocardless: {
      // No GoCardless SDK/keys are wired in this app — direct debit is tracked
      // on member records but not collected through a live GoCardless link.
      connected: !!(process.env.GOCARDLESS_ACCESS_TOKEN || process.env.GC_ACCESS_TOKEN),
      detail: null,
    },
    xero: {
      connected: !!(process.env.XERO_CLIENT_ID || process.env.XERO_ACCESS_TOKEN),
      detail: null,
    },
    resend: {
      connected: !!process.env.RESEND_API_KEY,
      detail: resendDomain ? `Sending from ${resendDomain}` : null,
    },
  })
}
