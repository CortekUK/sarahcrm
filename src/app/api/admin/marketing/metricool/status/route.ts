// Metricool connection status — read-only.
//
// GET /api/admin/marketing/metricool/status
//   → { configured, mode, timezone }
// GET /api/admin/marketing/metricool/status?test=1
//   → { configured, mode, timezone, brands?: [{ blogId, name }], brandFound?, error? }
//
// Without ?test=1 it only reads env (no network), so the Marketing hub can show
// the badge on every load. ?test=1 is the "Test connection" button: when
// configured it calls Metricool's read-only list-brands endpoint — it never
// creates, schedules or changes anything. `brandFound` says whether the
// configured METRICOOL_BLOG_ID is among the brands the token can see.
// The token / userId are never returned. Admin only (requireAdmin).

import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/marketing/admin'
import {
  getMetricoolConfig,
  getMetricoolMode,
  getMetricoolTimezone,
  listBrands,
} from '@/lib/marketing/publish/metricool-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// listBrands: 20s timeout + up to two short retries.
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const cfg = getMetricoolConfig()
  const base = {
    configured: cfg !== null,
    mode: getMetricoolMode(),
    timezone: getMetricoolTimezone(),
  }
  if (!cfg || req.nextUrl.searchParams.get('test') !== '1') {
    return Response.json(base)
  }

  const res = await listBrands()
  if (!res.ok) return Response.json({ ...base, error: res.message })
  return Response.json({
    ...base,
    brands: res.data,
    brandFound: res.data.some((b) => b.blogId === cfg.blogId),
  })
}
