// Inbox mailbox-access helpers — typed getters/setters over the untyped
// service-role client (mirrors src/lib/google/media-access.ts style).
//
// ACCESS MODEL
//   • The inbox catalogue is the single source of truth in
//     `gmail_sync_config` (app_settings) — read via getSyncConfig from
//     src/lib/google/sync-config.ts. We never hard-code the mailbox list here.
//   • Admins get every ENABLED inbox in the catalogue.
//   • Every other user gets the intersection of the inboxes granted to them
//     (rows in `mailbox_access`) and the catalogue's enabled inboxes.
//   • Extensible without a rebuild: grant/revoke access by inserting/deleting
//     `mailbox_access` rows — no code change needed.
//
// All mailbox comparisons are case-insensitive.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getSyncConfig, type SyncInbox } from '@/lib/google/sync-config'

// The service-role admin client is intentionally untyped (see marketing/admin.ts)
// so the new inbox tables are queryable without type friction.
type Admin = SupabaseClient

export type InboxAddress = string

export interface MailboxInfo {
  email: string
  label: string
  enabled: boolean
}

export interface MailboxGrant {
  id: string
  profile_id: string
  mailbox: string
  created_at: string
}

const norm = (s: string): string => s.trim().toLowerCase()

// The configured inbox catalogue (all 7), each with its enabled flag so the
// access UI can list every mailbox while normal reads filter to enabled ones.
export async function getInboxCatalog(admin: Admin): Promise<MailboxInfo[]> {
  const cfg = await getSyncConfig(admin as unknown as SupabaseClient<Database>)
  return cfg.inboxes.map((i: SyncInbox) => ({
    email: i.email,
    label: i.label,
    enabled: i.enabled,
  }))
}

// Mailbox emails the given profile may read.
//   • admin → all ENABLED catalogue inboxes.
//   • otherwise → granted mailboxes ∩ enabled catalogue inboxes.
export async function allowedMailboxes(
  admin: Admin,
  profile: { id: string; role: string },
): Promise<string[]> {
  const catalog = await getInboxCatalog(admin)
  const enabled = catalog.filter((m) => m.enabled).map((m) => m.email)

  if (profile.role === 'admin') return enabled

  const enabledSet = new Set(enabled.map(norm))
  const grants = await listGrants(admin, profile.id)
  const seen = new Set<string>()
  const out: string[] = []
  for (const g of grants) {
    const key = norm(g.mailbox)
    if (enabledSet.has(key) && !seen.has(key)) {
      seen.add(key)
      // Return the catalogue's canonical spelling of the email.
      const canonical = enabled.find((e) => norm(e) === key)
      out.push(canonical ?? g.mailbox)
    }
  }
  return out
}

// All grants, or the grants for one profile.
export async function listGrants(
  admin: Admin,
  profileId?: string,
): Promise<MailboxGrant[]> {
  let query = admin
    .from('mailbox_access')
    .select('id, profile_id, mailbox, created_at')
  if (profileId) query = query.eq('profile_id', profileId)
  const { data } = await query.order('created_at', { ascending: true })
  return (data ?? []) as MailboxGrant[]
}

// Grant a mailbox to a profile. Idempotent — a pre-existing grant is left
// untouched. (The unique index is on (profile_id, lower(mailbox)), an
// expression index PostgREST can't use as an upsert arbiter, so we check
// first; mailboxes are stored lower-cased to keep the index authoritative.)
export async function grantMailbox(
  admin: Admin,
  profileId: string,
  mailbox: string,
  byId: string | null,
): Promise<void> {
  const value = norm(mailbox)
  const { data: existing } = await admin
    .from('mailbox_access')
    .select('id')
    .eq('profile_id', profileId)
    .ilike('mailbox', value)
    .maybeSingle()
  if (existing) return
  await admin
    .from('mailbox_access')
    .insert({ profile_id: profileId, mailbox: value, created_by: byId })
}

// Revoke a mailbox from a profile (case-insensitive on the mailbox address).
export async function revokeMailbox(
  admin: Admin,
  profileId: string,
  mailbox: string,
): Promise<void> {
  await admin
    .from('mailbox_access')
    .delete()
    .eq('profile_id', profileId)
    .ilike('mailbox', norm(mailbox))
}

// Case-insensitive membership check against an allowed-mailbox list.
export function canAccessMailbox(
  allowed: string[],
  mailbox: string | null,
): boolean {
  if (!mailbox) return false
  const target = norm(mailbox)
  return allowed.some((m) => norm(m) === target)
}
