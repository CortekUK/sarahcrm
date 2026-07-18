// Xero contact sync — Chunk 2.
//
// Find-or-create a Xero Contact for each member and store the resulting
// Xero ContactID on `members.xero_contact_id`. Builds on the Chunk-1 client
// (`xeroApiFetch` / `getValidAccessToken`) — auth, refresh, and the tenant
// header are all handled there; we only speak the Accounting API here.
//
// Design notes:
//   - Xero requires Contact `Name` to be UNIQUE per org. We derive a Name from
//     the member's profile name → company_name → email → member id, and if a
//     create fails with a duplicate-name validation error we retry ONCE with a
//     short member-id suffix.
//   - Rate limits: ~60 calls/min/tenant, 5 concurrent. We process members
//     SEQUENTIALLY and, on HTTP 429, honour the Retry-After header once.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { xeroApiFetch, XeroNotConnectedError } from '@/lib/xero/client'

type XeroDb = SupabaseClient<Database>

// Minimal shapes of the Xero Accounting API JSON we consume.
interface XeroContact {
  ContactID: string
  Name?: string
  EmailAddress?: string
}
interface XeroContactsResponse {
  Contacts?: XeroContact[]
}

// A member row joined to its profile, as loaded below.
export interface MemberForSync {
  id: string
  xero_contact_id: string | null
  company_name: string | null
  profiles: {
    first_name: string | null
    last_name: string | null
    email: string | null
  } | null
}

const ACCOUNTING_BASE = '/api.xro/2.0/Contacts'
const MAX_RETRY_AFTER_MS = 60_000
// Xero rate-limits at ~60 calls/min/tenant. A full member sync is well over 60
// calls, so we must ride through several rate-limit windows in one run — retry
// 429s repeatedly (not just once), honouring Retry-After each time.
const MAX_429_RETRIES = 8

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Wrapper around `xeroApiFetch` that transparently rides HTTP 429 rate-limit
 * responses, waiting the Retry-After each time (up to MAX_429_RETRIES). Auth and
 * the tenant header are handled upstream in `xeroApiFetch`.
 */
async function xeroContactFetch(
  db: XeroDb,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  let res = await xeroApiFetch(db, path, init)
  for (let attempt = 0; res.status === 429 && attempt < MAX_429_RETRIES; attempt++) {
    const retryAfter = Number(res.headers.get('Retry-After'))
    const waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS)
        : 1000
    await sleep(waitMs)
    res = await xeroApiFetch(db, path, init)
  }
  return res
}

/** Returns an existing Xero ContactID for `email`, or null if none matches. */
export async function findXeroContactByEmail(
  db: XeroDb,
  email: string,
): Promise<string | null> {
  const where = encodeURIComponent(`EmailAddress=="${email}"`)
  const res = await xeroContactFetch(db, `${ACCOUNTING_BASE}?where=${where}`)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Xero contact lookup failed (${res.status}): ${body}`)
  }
  const json = (await res.json()) as XeroContactsResponse
  const contact = json.Contacts?.[0]
  return contact?.ContactID ?? null
}

function isDuplicateNameError(status: number, body: string): boolean {
  if (status !== 400) return false
  const lower = body.toLowerCase()
  return lower.includes('contact name must be unique') || lower.includes('already exists')
}

async function postContact(
  db: XeroDb,
  contact: { Name: string; FirstName?: string; LastName?: string; EmailAddress?: string },
): Promise<Response> {
  return xeroContactFetch(db, ACCOUNTING_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Contacts: [contact] }),
  })
}

/**
 * Create a Xero Contact and return its ContactID. On a duplicate-name
 * validation error, retries ONCE with the Name suffixed by a short id.
 */
export async function createXeroContact(
  db: XeroDb,
  params: { name: string; firstName?: string; lastName?: string; email?: string; memberId?: string },
): Promise<string> {
  const base = {
    Name: params.name,
    ...(params.firstName ? { FirstName: params.firstName } : {}),
    ...(params.lastName ? { LastName: params.lastName } : {}),
    ...(params.email ? { EmailAddress: params.email } : {}),
  }

  let res = await postContact(db, base)
  if (!res.ok) {
    const body = await res.text()
    if (isDuplicateNameError(res.status, body) && params.memberId) {
      const suffix = params.memberId.slice(0, 8)
      res = await postContact(db, { ...base, Name: `${params.name} (${suffix})` })
      if (!res.ok) {
        const retryBody = await res.text()
        throw new Error(`Xero contact create failed (${res.status}): ${retryBody}`)
      }
    } else {
      throw new Error(`Xero contact create failed (${res.status}): ${body}`)
    }
  }

  const json = (await res.json()) as XeroContactsResponse
  const id = json.Contacts?.[0]?.ContactID
  if (!id) throw new Error('Xero contact create returned no ContactID.')
  return id
}

/** Build a non-empty, org-unique-ish display Name for a member. */
function buildContactName(member: MemberForSync): string {
  const first = member.profiles?.first_name?.trim() ?? ''
  const last = member.profiles?.last_name?.trim() ?? ''
  const full = `${first} ${last}`.trim()
  if (full) return full
  if (member.company_name?.trim()) return member.company_name.trim()
  if (member.profiles?.email?.trim()) return member.profiles.email.trim()
  return member.id
}

async function persistContactId(db: XeroDb, memberId: string, contactId: string): Promise<void> {
  const { error } = await db
    .from('members')
    .update({ xero_contact_id: contactId })
    .eq('id', memberId)
  if (error) throw new Error(`Failed to persist xero_contact_id: ${error.message}`)
}

/**
 * Sync one member to a Xero Contact. Match by email → else create. Persists the
 * resolved ContactID back to `members.xero_contact_id`. If the member already
 * has one it is returned as 'skipped', unless `force` is set.
 */
export async function syncMemberToXeroContact(
  db: XeroDb,
  member: MemberForSync,
  opts: { force?: boolean } = {},
): Promise<{ contactId: string; action: 'matched' | 'created' | 'skipped' }> {
  if (member.xero_contact_id && !opts.force) {
    return { contactId: member.xero_contact_id, action: 'skipped' }
  }

  const email = member.profiles?.email?.trim() || undefined

  if (email) {
    const matched = await findXeroContactByEmail(db, email)
    if (matched) {
      await persistContactId(db, member.id, matched)
      return { contactId: matched, action: 'matched' }
    }
  }

  const contactId = await createXeroContact(db, {
    name: buildContactName(member),
    firstName: member.profiles?.first_name?.trim() || undefined,
    lastName: member.profiles?.last_name?.trim() || undefined,
    email,
    memberId: member.id,
  })
  await persistContactId(db, member.id, contactId)
  return { contactId, action: 'created' }
}

export interface SyncAllResult {
  created: number
  matched: number
  skipped: number
  failed: number
  errors: { memberId: string; error: string }[]
}

/**
 * Sync all non-deleted members to Xero Contacts, sequentially. Without `force`,
 * only members lacking a xero_contact_id are processed. Per-member errors are
 * collected without aborting the run; XeroNotConnectedError aborts immediately.
 */
export async function syncAllMembers(
  db: XeroDb,
  opts: { force?: boolean } = {},
): Promise<SyncAllResult> {
  let query = db
    .from('members')
    .select('id, xero_contact_id, company_name, profiles(first_name, last_name, email)')
    .is('deleted_at', null)
  if (!opts.force) query = query.is('xero_contact_id', null)

  const { data, error } = await query
  if (error) throw new Error(`Failed to load members: ${error.message}`)

  const members = (data ?? []) as unknown as MemberForSync[]
  const result: SyncAllResult = { created: 0, matched: 0, skipped: 0, failed: 0, errors: [] }

  for (const member of members) {
    try {
      const { action } = await syncMemberToXeroContact(db, member, { force: opts.force })
      result[action] += 1
    } catch (err) {
      if (err instanceof XeroNotConnectedError) throw err
      result.failed += 1
      result.errors.push({
        memberId: member.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return result
}
