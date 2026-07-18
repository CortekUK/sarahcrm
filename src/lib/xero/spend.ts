// Xero historic member spend — Chunk 4 (final).
//
// Pull how much each member has ACTUALLY PAID across their Xero ACCREC (sales)
// invoices and store it on `members.xero_spend_pence`. This surfaces real spend
// history that may predate the CRM, so Sarah can say "you've spent £X" at
// renewal. Builds on the Chunk-1 client (`xeroApiFetch` via `xeroFetch429`) —
// auth, refresh, tenant header, and 429 rate-limit handling are all upstream.
//
// EFFICIENT PULL: rather than one call per member (~88 calls), we page through
// ALL ACCREC invoices ONCE (Xero paginates at 100/page) and aggregate
// AmountPaid by Contact.ContactID into a Map. Then we update each matched
// member from that Map. DELETED/VOIDED invoices are ignored.
//
// Currency note: the demo org is "Global" and we deliberately don't force a
// currency (same rationale as the invoice push). AmountPaid is in the org base
// currency; amounts are numerically correct pence via Math.round(total * 100).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { XeroNotConnectedError } from '@/lib/xero/client'
import { xeroFetch429 } from '@/lib/xero/invoices'

type XeroDb = SupabaseClient<Database>

const INVOICES_BASE = '/api.xro/2.0/Invoices'
const PAGE_SIZE = 100
const MAX_PAGES = 200

// Minimal shape of the Xero Invoices API JSON we consume.
interface XeroInvoicesPage {
  Invoices?: {
    Contact?: { ContactID?: string }
    AmountPaid?: number
    Status?: string
  }[]
}

export interface PullSpendResult {
  membersUpdated: number
  invoicesScanned: number
  contactsWithSpend: number
}

/**
 * Page through all ACCREC invoices, aggregate AmountPaid by ContactID (in
 * pence), then write `xero_spend_pence` onto every non-deleted member with a
 * `xero_contact_id` (0 when the contact has no paid invoices, so a re-run
 * reflects reality). Rethrows XeroNotConnectedError.
 */
export async function pullMemberSpend(db: XeroDb): Promise<PullSpendResult> {
  // Accumulate paid amount (in pounds) per Xero ContactID across all pages.
  const spendByContact = new Map<string, number>()
  let invoicesScanned = 0

  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await xeroFetch429(
      db,
      `${INVOICES_BASE}?where=${encodeURIComponent('Type=="ACCREC"')}&page=${page}`,
    )
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Xero invoices fetch failed (${res.status}): ${body}`)
    }

    const json = (await res.json()) as XeroInvoicesPage
    const invoices = json.Invoices ?? []
    if (invoices.length === 0) break

    for (const inv of invoices) {
      invoicesScanned += 1
      const status = inv.Status
      if (status === 'DELETED' || status === 'VOIDED') continue
      const contactId = inv.Contact?.ContactID
      if (!contactId) continue
      const paid = inv.AmountPaid ?? 0
      if (!paid) continue
      spendByContact.set(contactId, (spendByContact.get(contactId) ?? 0) + paid)
    }

    // Last page reached (Xero paginates at 100/page).
    if (invoices.length < PAGE_SIZE) break
  }

  const contactsWithSpend = spendByContact.size

  // Load every non-deleted member that has been matched to a Xero contact.
  const { data, error } = await db
    .from('members')
    .select('id, xero_contact_id')
    .not('xero_contact_id', 'is', null)
    .is('deleted_at', null)
  if (error) throw new Error(`Failed to load members: ${error.message}`)

  const syncedAt = new Date().toISOString()
  let membersUpdated = 0

  for (const member of data ?? []) {
    const contactId = member.xero_contact_id
    if (!contactId) continue
    const pounds = spendByContact.get(contactId) ?? 0
    const pence = Math.round(pounds * 100)
    const { error: updateError } = await db
      .from('members')
      .update({ xero_spend_pence: pence, xero_spend_synced_at: syncedAt })
      .eq('id', member.id)
    if (updateError) throw new Error(`Failed to update member spend: ${updateError.message}`)
    membersUpdated += 1
  }

  return { membersUpdated, invoicesScanned, contactsWithSpend }
}
