// Xero revenue push — Chunk 3b.
//
// Extends the Chunk-3 payment push to cover the club's other confirmed-revenue
// streams — sponsorships, concierge sales, introduction commissions — plus the
// referral payouts the club OWES members (ACCPAY bills), and a guest-contact
// fix so memberless payments still land in Xero.
//
// Accounting decisions:
//   - Sponsorships / concierge / intro commissions / guest payments → ACCREC
//     (money owed TO the club) on the sales/revenue account.
//   - Referral payouts → ACCPAY bills (money the club OWES the member) on the
//     expense/purchases account. In Xero a bill is just an Invoice with
//     Type:'ACCPAY', so both go to the /Invoices endpoint.
//
// Reuses the Chunk-3 primitives (xeroFetch429, resolveAccounts, toYmd,
// penceToAmount) and the Chunk-2 contact helpers (findXeroContactByEmail,
// createXeroContact) — nothing is duplicated. Each stream is processed
// SEQUENTIALLY; a single row failure is tallied, never fatal; a
// XeroNotConnectedError aborts the whole run.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { XeroNotConnectedError } from '@/lib/xero/client'
import {
  xeroFetch429,
  resolveAccounts,
  toYmd,
  penceToAmount,
  pushAllPayments,
  type ResolvedAccounts,
  type PushAllResult,
} from '@/lib/xero/invoices'
import { findXeroContactByEmail, createXeroContact } from '@/lib/xero/contacts'

type XeroDb = SupabaseClient<Database>

const INVOICES_BASE = '/api.xro/2.0/Invoices'
const GUEST_CONTACT_SETTINGS_KEY = 'xero_guest_contact_id'
const GUEST_CONTACT_NAME = 'The Club — Guest Bookings'

interface XeroInvoice {
  InvoiceID?: string
}
interface XeroInvoicesResponse {
  Invoices?: XeroInvoice[]
}

/** Per-stream tally shared by every push function. */
export interface StreamResult {
  created: number
  skipped: number
  failed: number
  errors: { id: string; error: string }[]
}

function newStreamResult(): StreamResult {
  return { created: 0, skipped: 0, failed: 0, errors: [] }
}

/** Read a member's ContactID from an object-or-array relational result. */
function relContactId(
  rel: { xero_contact_id: string | null } | { xero_contact_id: string | null }[] | null,
): string | null {
  if (!rel) return null
  const m = Array.isArray(rel) ? rel[0] : rel
  return m?.xero_contact_id ?? null
}

/**
 * Find-or-create the shared "guest bookings" Xero contact used for memberless
 * payments/bookings. Caches its ContactID in app_settings so we only create it
 * once per org.
 */
export async function getOrCreateGuestContact(db: XeroDb): Promise<string> {
  const { data, error } = await db
    .from('app_settings')
    .select('value')
    .eq('key', GUEST_CONTACT_SETTINGS_KEY)
    .maybeSingle()
  if (error) throw new Error(`Failed to read guest contact setting: ${error.message}`)
  const cached = typeof data?.value === 'string' ? data.value : null
  if (cached) return cached

  const contactId = await createXeroContact(db, { name: GUEST_CONTACT_NAME })

  const { error: upsertError } = await db.from('app_settings').upsert(
    {
      key: GUEST_CONTACT_SETTINGS_KEY,
      value: contactId as unknown as Database['public']['Tables']['app_settings']['Insert']['value'],
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  )
  if (upsertError) throw new Error(`Failed to cache guest contact: ${upsertError.message}`)
  return contactId
}

/**
 * Generic create for an ACCREC invoice or an ACCPAY bill. Both go to the Xero
 * /Invoices endpoint — a bill is just Type:'ACCPAY'. Returns the InvoiceID.
 */
export async function createXeroDoc(
  db: XeroDb,
  params: {
    type: 'ACCREC' | 'ACCPAY'
    contactId: string
    date: string
    dueDate: string
    description: string
    amount: number
    reference: string
    accountCode: string
  },
): Promise<string> {
  const res = await xeroFetch429(db, INVOICES_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Invoices: [
        {
          Type: params.type,
          Contact: { ContactID: params.contactId },
          Date: params.date,
          DueDate: params.dueDate,
          LineAmountTypes: 'NoTax',
          LineItems: [
            {
              Description: params.description,
              Quantity: 1,
              UnitAmount: params.amount,
              AccountCode: params.accountCode,
            },
          ],
          Status: 'AUTHORISED',
          Reference: params.reference,
        },
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Xero ${params.type} create failed (${res.status}): ${body}`)
  }

  const json = (await res.json()) as XeroInvoicesResponse
  const invoiceId = json.Invoices?.[0]?.InvoiceID
  if (!invoiceId) throw new Error('Xero document create returned no InvoiceID.')
  return invoiceId
}

// --- Guest payments ----------------------------------------------------------

interface GuestPaymentRow {
  id: string
  amount_pence: number
  payment_type: string
  description: string | null
  paid_at: string | null
  due_date: string | null
  created_at: string
}

/**
 * Catch memberless PAYMENTS that pushAllPayments skips (member_id is null):
 * invoice each to the shared guest contact as ACCREC. Does NOT touch
 * pushAllPayments' own rows.
 */
export async function pushGuestPayments(
  db: XeroDb,
  accounts: ResolvedAccounts,
  guestContactId: string,
): Promise<StreamResult> {
  const result = newStreamResult()
  const { data, error } = await db
    .from('payments')
    .select('id, amount_pence, payment_type, description, paid_at, due_date, created_at')
    .eq('status', 'paid')
    .is('xero_invoice_id', null)
    .is('member_id', null)
  if (error) throw new Error(`Failed to load guest payments: ${error.message}`)

  const rows = (data ?? []) as GuestPaymentRow[]
  for (const row of rows) {
    try {
      const date = toYmd(row.paid_at ?? row.created_at)
      const dueDate = row.due_date ? toYmd(row.due_date) : date
      const label = row.description?.trim() || row.payment_type.replace(/_/g, ' ').trim() || 'CRM payment'
      const invoiceId = await createXeroDoc(db, {
        type: 'ACCREC',
        contactId: guestContactId,
        date,
        dueDate,
        description: label,
        amount: penceToAmount(row.amount_pence),
        reference: `CRM payment ${row.id}`,
        accountCode: accounts.salesCode,
      })
      const { error: upErr } = await db
        .from('payments')
        .update({ xero_invoice_id: invoiceId })
        .eq('id', row.id)
      if (upErr) throw new Error(`Failed to persist xero_invoice_id: ${upErr.message}`)
      result.created += 1
    } catch (err) {
      if (err instanceof XeroNotConnectedError) throw err
      result.failed += 1
      result.errors.push({ id: row.id, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return result
}

// --- Sponsorships ------------------------------------------------------------

interface SponsorshipRow {
  id: string
  member_id: string | null
  sponsor_name: string | null
  sponsor_company: string | null
  sponsor_email: string | null
  amount_pence: number
  created_at: string
  members: { xero_contact_id: string | null } | { xero_contact_id: string | null }[] | null
}

/**
 * Push confirmed-revenue sponsorships (status in confirmed/invoiced/paid) as
 * ACCREC invoices. Contact = member's ContactID if member_id, else find-or-
 * create by sponsor_email.
 */
export async function pushSponsorships(
  db: XeroDb,
  accounts: ResolvedAccounts,
): Promise<StreamResult> {
  const result = newStreamResult()
  const { data, error } = await db
    .from('sponsorships')
    .select(
      'id, member_id, sponsor_name, sponsor_company, sponsor_email, amount_pence, created_at, members(xero_contact_id)',
    )
    .in('status', ['confirmed', 'invoiced', 'paid'])
    .is('xero_invoice_id', null)
  if (error) throw new Error(`Failed to load sponsorships: ${error.message}`)

  const rows = (data ?? []) as unknown as SponsorshipRow[]
  for (const row of rows) {
    try {
      let contactId = row.member_id ? relContactId(row.members) : null
      if (!contactId) {
        const email = row.sponsor_email?.trim() || undefined
        if (email) contactId = await findXeroContactByEmail(db, email)
        if (!contactId) {
          contactId = await createXeroContact(db, {
            name: row.sponsor_company?.trim() || row.sponsor_name?.trim() || 'Sponsor',
            email,
          })
        }
      }
      if (!contactId) {
        result.skipped += 1
        continue
      }
      const date = toYmd(row.created_at)
      const invoiceId = await createXeroDoc(db, {
        type: 'ACCREC',
        contactId,
        date,
        dueDate: date,
        description: 'Sponsorship',
        amount: penceToAmount(row.amount_pence),
        reference: `CRM sponsorship ${row.id}`,
        accountCode: accounts.salesCode,
      })
      const { error: upErr } = await db
        .from('sponsorships')
        .update({ xero_invoice_id: invoiceId })
        .eq('id', row.id)
      if (upErr) throw new Error(`Failed to persist xero_invoice_id: ${upErr.message}`)
      result.created += 1
    } catch (err) {
      if (err instanceof XeroNotConnectedError) throw err
      result.failed += 1
      result.errors.push({ id: row.id, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return result
}

// --- Concierge ---------------------------------------------------------------

interface ConciergeRow {
  id: string
  member_id: string
  sale_price_pence: number | null
  status: string
  delivered_at: string | null
  created_at: string
  members: { xero_contact_id: string | null } | { xero_contact_id: string | null }[] | null
}

/**
 * Push booked/delivered/feedback concierge requests with a sale price as ACCREC
 * invoices to the member for the sale_price_pence.
 */
export async function pushConcierge(
  db: XeroDb,
  accounts: ResolvedAccounts,
): Promise<StreamResult> {
  const result = newStreamResult()
  const { data, error } = await db
    .from('concierge_requests')
    .select('id, member_id, sale_price_pence, status, delivered_at, created_at, members(xero_contact_id)')
    .in('status', ['booked', 'delivered', 'feedback'])
    .gt('sale_price_pence', 0)
    .is('xero_invoice_id', null)
  if (error) throw new Error(`Failed to load concierge requests: ${error.message}`)

  const rows = (data ?? []) as unknown as ConciergeRow[]
  for (const row of rows) {
    try {
      const contactId = relContactId(row.members)
      if (!contactId) {
        result.skipped += 1
        continue
      }
      const date = toYmd(row.delivered_at ?? row.created_at)
      const invoiceId = await createXeroDoc(db, {
        type: 'ACCREC',
        contactId,
        date,
        dueDate: date,
        description: `Concierge: ${row.status}`,
        amount: penceToAmount(row.sale_price_pence ?? 0),
        reference: `CRM concierge ${row.id}`,
        accountCode: accounts.salesCode,
      })
      const { error: upErr } = await db
        .from('concierge_requests')
        .update({ xero_invoice_id: invoiceId })
        .eq('id', row.id)
      if (upErr) throw new Error(`Failed to persist xero_invoice_id: ${upErr.message}`)
      result.created += 1
    } catch (err) {
      if (err instanceof XeroNotConnectedError) throw err
      result.failed += 1
      result.errors.push({ id: row.id, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return result
}

// --- Introduction commissions ------------------------------------------------

interface IntroRow {
  id: string
  member_a_id: string
  commission_pence: number | null
  created_at: string
  deal_closed_at: string | null
  members: { xero_contact_id: string | null } | { xero_contact_id: string | null }[] | null
}

/**
 * Push introduction commissions (the club's receivable on introduced business)
 * as ACCREC invoices to member_a_id, where commission_pence > 0.
 */
export async function pushIntroCommissions(
  db: XeroDb,
  accounts: ResolvedAccounts,
): Promise<StreamResult> {
  const result = newStreamResult()
  const { data, error } = await db
    .from('introductions')
    .select('id, member_a_id, commission_pence, created_at, deal_closed_at, members!introductions_member_a_id_fkey(xero_contact_id)')
    .gt('commission_pence', 0)
    .is('xero_invoice_id', null)
  if (error) throw new Error(`Failed to load introductions: ${error.message}`)

  const rows = (data ?? []) as unknown as IntroRow[]
  for (const row of rows) {
    try {
      const contactId = relContactId(row.members)
      if (!contactId) {
        result.skipped += 1
        continue
      }
      const date = toYmd(row.deal_closed_at ?? row.created_at)
      const invoiceId = await createXeroDoc(db, {
        type: 'ACCREC',
        contactId,
        date,
        dueDate: date,
        description: 'Introduction commission',
        amount: penceToAmount(row.commission_pence ?? 0),
        reference: `CRM intro ${row.id}`,
        accountCode: accounts.salesCode,
      })
      const { error: upErr } = await db
        .from('introductions')
        .update({ xero_invoice_id: invoiceId })
        .eq('id', row.id)
      if (upErr) throw new Error(`Failed to persist xero_invoice_id: ${upErr.message}`)
      result.created += 1
    } catch (err) {
      if (err instanceof XeroNotConnectedError) throw err
      result.failed += 1
      result.errors.push({ id: row.id, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return result
}

// --- Referral payouts (ACCPAY bills) -----------------------------------------

interface ReferralRow {
  id: string
  member_id: string
  referred_name: string | null
  commission_pence: number | null
  created_at: string
  members: { xero_contact_id: string | null } | { xero_contact_id: string | null }[] | null
}

/**
 * Push reward referral commissions the club OWES the member as ACCPAY bills,
 * where commission_pence > 0. Writes back to reward_referrals.xero_bill_id.
 */
export async function pushReferralPayouts(
  db: XeroDb,
  accounts: ResolvedAccounts,
): Promise<StreamResult> {
  const result = newStreamResult()
  const { data, error } = await db
    .from('reward_referrals')
    .select('id, member_id, referred_name, commission_pence, created_at, members(xero_contact_id)')
    .gt('commission_pence', 0)
    .is('xero_bill_id', null)
  if (error) throw new Error(`Failed to load reward referrals: ${error.message}`)

  const rows = (data ?? []) as unknown as ReferralRow[]
  for (const row of rows) {
    try {
      const contactId = relContactId(row.members)
      if (!contactId) {
        result.skipped += 1
        continue
      }
      const date = toYmd(row.created_at)
      const billId = await createXeroDoc(db, {
        type: 'ACCPAY',
        contactId,
        date,
        dueDate: date,
        description: `Referral payout: ${row.referred_name ?? 'referral'}`,
        amount: penceToAmount(row.commission_pence ?? 0),
        reference: `CRM referral ${row.id}`,
        accountCode: accounts.expenseCode,
      })
      const { error: upErr } = await db
        .from('reward_referrals')
        .update({ xero_bill_id: billId })
        .eq('id', row.id)
      if (upErr) throw new Error(`Failed to persist xero_bill_id: ${upErr.message}`)
      result.created += 1
    } catch (err) {
      if (err instanceof XeroNotConnectedError) throw err
      result.failed += 1
      result.errors.push({ id: row.id, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return result
}

// --- Aggregate ---------------------------------------------------------------

export interface RevenueResult {
  payments: PushAllResult
  guestPayments: StreamResult
  sponsorships: StreamResult
  concierge: StreamResult
  introCommissions: StreamResult
  referralPayouts: StreamResult
}

/**
 * Run every revenue stream once. Accounts + guest contact are resolved a single
 * time and shared. Each stream is isolated in its own try/catch so one failing
 * stream doesn't kill the others — EXCEPT XeroNotConnectedError, which aborts
 * the whole run.
 */
export async function pushAllRevenue(db: XeroDb): Promise<RevenueResult> {
  const accounts = await resolveAccounts(db)
  const guestContactId = await getOrCreateGuestContact(db)

  const result: RevenueResult = {
    payments: { created: 0, skipped: 0, failed: 0, errors: [] },
    guestPayments: newStreamResult(),
    sponsorships: newStreamResult(),
    concierge: newStreamResult(),
    introCommissions: newStreamResult(),
    referralPayouts: newStreamResult(),
  }

  // Run each stream isolated: a thrown stream is recorded as a single failure
  // and the run continues; XeroNotConnectedError alone aborts everything.
  async function runStream<T extends StreamResult>(
    slot: T,
    run: () => Promise<T>,
    label: string,
  ): Promise<T> {
    try {
      return await run()
    } catch (err) {
      if (err instanceof XeroNotConnectedError) throw err
      slot.failed += 1
      slot.errors.push({ id: label, error: err instanceof Error ? err.message : String(err) })
      return slot
    }
  }

  try {
    result.payments = await pushAllPayments(db)
  } catch (err) {
    if (err instanceof XeroNotConnectedError) throw err
    result.payments.failed += 1
    result.payments.errors.push({
      paymentId: 'payments',
      error: err instanceof Error ? err.message : String(err),
    })
  }
  result.guestPayments = await runStream(
    result.guestPayments,
    () => pushGuestPayments(db, accounts, guestContactId),
    'guestPayments',
  )
  result.sponsorships = await runStream(
    result.sponsorships,
    () => pushSponsorships(db, accounts),
    'sponsorships',
  )
  result.concierge = await runStream(result.concierge, () => pushConcierge(db, accounts), 'concierge')
  result.introCommissions = await runStream(
    result.introCommissions,
    () => pushIntroCommissions(db, accounts),
    'introCommissions',
  )
  result.referralPayouts = await runStream(
    result.referralPayouts,
    () => pushReferralPayouts(db, accounts),
    'referralPayouts',
  )

  return result
}
