// GET /api/admin/inbox/threads?mailbox=all|<email>&q=&includeNoise=0|1&limit=30&offset=0
//
// Thread-level listing for the current mailbox selection. Mailbox access is
// enforced HERE (never trust the client): a specific `mailbox` must be in the
// caller's allowed set, `all` expands to the whole allowed set. Grouping /
// pagination / unread are done by the inbox_thread_list SQL function, called via
// the service-role client AFTER access has been computed.

import { NextRequest } from 'next/server'
import { requireInboxAccess } from '@/lib/inbox/guard'
import { canAccessMailbox } from '@/lib/inbox/access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireInboxAccess()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { allowed, admin, profile } = auth
  const sp = req.nextUrl.searchParams

  // Resolve the target mailbox set from the (untrusted) param.
  const mailboxParam = (sp.get('mailbox') ?? 'all').trim()
  let mailboxes: string[]
  if (mailboxParam === 'all' || mailboxParam === '') {
    mailboxes = allowed
  } else if (canAccessMailbox(allowed, mailboxParam)) {
    // Use the canonical spelling from `allowed`.
    mailboxes = allowed.filter((m) => m.toLowerCase() === mailboxParam.toLowerCase())
  } else {
    return Response.json({ error: 'No access to that mailbox' }, { status: 403 })
  }

  if (mailboxes.length === 0) {
    return Response.json({ threads: [], nextOffset: null })
  }

  const q = (sp.get('q') ?? '').trim() || null
  const includeNoise = sp.get('includeNoise') === '1'
  const limit = Math.min(Math.max(Number(sp.get('limit')) || 30, 1), 100)
  const offset = Math.max(Number(sp.get('offset')) || 0, 0)

  const { data, error } = await admin.rpc('inbox_thread_list', {
    p_mailboxes: mailboxes,
    p_include_noise: includeNoise,
    p_query: q,
    p_profile: profile.id,
    p_limit: limit,
    p_offset: offset,
  })

  if (error) {
    console.error('[inbox/threads] rpc error', error)
    return Response.json({ error: 'Failed to load threads' }, { status: 500 })
  }

  const threads = (data ?? []) as unknown[]
  const nextOffset = threads.length === limit ? offset + limit : null
  return Response.json({ threads, nextOffset })
}
