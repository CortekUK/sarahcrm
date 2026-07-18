// Xero invoice push — Chunk 3.
//
// Push the CRM `payments` ledger into Xero as ACCREC (sales) invoices. For each
// paid payment whose member has a `xero_contact_id`, we create an AUTHORISED
// invoice, write the resulting Xero InvoiceID back to `payments.xero_invoice_id`,
// then best-effort mark it paid via a bank-account Payment. Builds on the Chunk-1
// client (`xeroApiFetch` / `getValidAccessToken`) — auth, refresh, and the tenant
// header are all handled there; we only speak the Accounting API here.
//
// Design notes:
//   - Accounts are resolved ONCE per run: a REVENUE account (preferring Code
//     '200', Xero's universal Sales code) for the line item, and a BANK account
//     for the mark-paid step (null if the org has none → invoice stays AUTHORISED).
//   - We deliberately omit CurrencyCode: the demo org is "Global" and GBP may not
//     be enabled, so we let Xero use the org base currency. LineAmountTypes
//     "NoTax" makes UnitAmount the exact total with no tax math.
//   - Rate limits: ~60 calls/min/tenant. We process payments SEQUENTIALLY and, on
//     HTTP 429, ride the Retry-After header (up to MAX_429_RETRIES) each time.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { xeroApiFetch, XeroNotConnectedError } from '@/lib/xero/client'

type XeroDb = SupabaseClient<Database>

// --- Minimal shapes of the Xero Accounting API JSON we consume ---------------
interface XeroAccount {
  Code?: string
  Name?: string
  Type?: string
}
interface XeroAccountsResponse {
  Accounts?: XeroAccount[]
}
interface XeroInvoice {
  InvoiceID?: string
}
interface XeroInvoicesResponse {
  Invoices?: XeroInvoice[]
}

// A payment row joined to its member's Xero ContactID, as loaded below. The
// Supabase relational result types `members` as an object-or-array union.
export interface PaymentForSync {
  id: string
  amount_pence: number
  payment_type: string
  description: string | null
  paid_at: string | null
  due_date: string | null
  created_at: string
  member_id: string
  xero_invoice_id: string | null
  members: { xero_contact_id: string | null } | { xero_contact_id: string | null }[] | null
}

export interface ResolvedAccounts {
  salesCode: string
  bankCode: string | null
  expenseCode: string
}

const ACCOUNTS_BASE = '/api.xro/2.0/Accounts'
const INVOICES_BASE = '/api.xro/2.0/Invoices'
const PAYMENTS_BASE = '/api.xro/2.0/Payments'
const DEFAULT_SALES_CODE = '200'
const DEFAULT_EXPENSE_CODE = '400'
const MAX_RETRY_AFTER_MS = 60_000
// Xero rate-limits at ~60 calls/min/tenant. A full push can exceed 60 calls, so
// we must ride through several rate-limit windows in one run — retry 429s
// repeatedly (not just once), honouring Retry-After each time.
const MAX_429_RETRIES = 8

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Wrapper around `xeroApiFetch` that transparently rides HTTP 429 rate-limit
 * responses, waiting the Retry-After each time (up to MAX_429_RETRIES). Auth and
 * the tenant header are handled upstream in `xeroApiFetch`.
 */
export async function xeroFetch429(db: XeroDb, path: string, init: RequestInit = {}): Promise<Response> {
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

/** Format an ISO timestamp/date string as YYYY-MM-DD. */
export function toYmd(value: string): string {
  return value.slice(0, 10)
}

/** Amount in pence → decimal pounds rounded to 2dp. */
export function penceToAmount(pence: number): number {
  return Math.round(pence) / 100
}

/** Read the member's ContactID out of the object-or-array relational result. */
function memberContactId(payment: PaymentForSync): string | null {
  const m = payment.members
  if (!m) return null
  const member = Array.isArray(m) ? m[0] : m
  return member?.xero_contact_id ?? null
}

/**
 * Resolve the two accounts we need, once per run:
 *   - salesCode: a REVENUE account (prefer Code '200', else the first REVENUE
 *     account, else the DEFAULT_SALES_CODE fallback).
 *   - bankCode: the first BANK account's Code, or null if the org has none.
 */
export async function resolveAccounts(db: XeroDb): Promise<ResolvedAccounts> {
  // Sales / revenue account.
  let salesCode = DEFAULT_SALES_CODE
  const revRes = await xeroFetch429(
    db,
    `${ACCOUNTS_BASE}?where=${encodeURIComponent('Type=="REVENUE"')}`,
  )
  if (revRes.ok) {
    const json = (await revRes.json()) as XeroAccountsResponse
    const accounts = json.Accounts ?? []
    const preferred = accounts.find((a) => a.Code === '200')
    const chosen = preferred?.Code ?? accounts.find((a) => a.Code)?.Code
    if (chosen) salesCode = chosen
  }

  // Bank account (for the mark-paid step).
  let bankCode: string | null = null
  const bankRes = await xeroFetch429(
    db,
    `${ACCOUNTS_BASE}?where=${encodeURIComponent('Type=="BANK"')}`,
  )
  if (bankRes.ok) {
    const json = (await bankRes.json()) as XeroAccountsResponse
    bankCode = json.Accounts?.find((a) => a.Code)?.Code ?? null
  }

  // Expense / purchases account (for ACCPAY bills, e.g. referral payouts).
  let expenseCode = DEFAULT_EXPENSE_CODE
  const expRes = await xeroFetch429(
    db,
    `${ACCOUNTS_BASE}?where=${encodeURIComponent('Type=="EXPENSE"')}`,
  )
  if (expRes.ok) {
    const json = (await expRes.json()) as XeroAccountsResponse
    const chosen = json.Accounts?.find((a) => a.Code)?.Code
    if (chosen) expenseCode = chosen
  }

  return { salesCode, bankCode, expenseCode }
}

/** A human-ish line description when the payment has no explicit one. */
function lineDescription(payment: PaymentForSync): string {
  if (payment.description?.trim()) return payment.description.trim()
  const label = payment.payment_type.replace(/_/g, ' ').trim()
  return label ? `${label.charAt(0).toUpperCase()}${label.slice(1)}` : 'CRM payment'
}

async function persistInvoiceId(db: XeroDb, paymentId: string, invoiceId: string): Promise<void> {
  const { error } = await db
    .from('payments')
    .update({ xero_invoice_id: invoiceId })
    .eq('id', paymentId)
  if (error) throw new Error(`Failed to persist xero_invoice_id: ${error.message}`)
}

/**
 * Best-effort mark an invoice paid via a bank-account Payment. Never throws —
 * the invoice is already created + written back, so a failure here is logged and
 * swallowed.
 */
async function markInvoicePaid(
  db: XeroDb,
  params: { invoiceId: string; bankCode: string; date: string; amount: number },
): Promise<void> {
  try {
    const res = await xeroFetch429(db, PAYMENTS_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Payments: [
          {
            Invoice: { InvoiceID: params.invoiceId },
            Account: { Code: params.bankCode },
            Date: params.date,
            Amount: params.amount,
          },
        ],
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      console.error(`Xero mark-paid failed for invoice ${params.invoiceId} (${res.status}): ${body}`)
    }
  } catch (err) {
    console.error(
      `Xero mark-paid threw for invoice ${params.invoiceId}:`,
      err instanceof Error ? err.message : String(err),
    )
  }
}

/**
 * Push one paid payment to Xero as an ACCREC invoice. Returns 'skipped' if the
 * member has no ContactID or the payment already has an xero_invoice_id.
 * Otherwise creates the invoice, writes the InvoiceID back, best-effort marks it
 * paid, and returns 'created'.
 */
export async function pushPaymentToXero(
  db: XeroDb,
  payment: PaymentForSync,
  accounts: ResolvedAccounts,
): Promise<'created' | 'skipped'> {
  if (payment.xero_invoice_id) return 'skipped'
  const contactId = memberContactId(payment)
  if (!contactId) return 'skipped'

  const date = toYmd(payment.paid_at ?? payment.created_at)
  const dueDate = payment.due_date ? toYmd(payment.due_date) : date
  const amount = penceToAmount(payment.amount_pence)

  const res = await xeroFetch429(db, INVOICES_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Invoices: [
        {
          Type: 'ACCREC',
          Contact: { ContactID: contactId },
          Date: date,
          DueDate: dueDate,
          LineAmountTypes: 'NoTax',
          LineItems: [
            {
              Description: lineDescription(payment),
              Quantity: 1,
              UnitAmount: amount,
              AccountCode: accounts.salesCode,
            },
          ],
          Status: 'AUTHORISED',
          Reference: `CRM payment ${payment.id}`,
        },
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Xero invoice create failed (${res.status}): ${body}`)
  }

  const json = (await res.json()) as XeroInvoicesResponse
  const invoiceId = json.Invoices?.[0]?.InvoiceID
  if (!invoiceId) throw new Error('Xero invoice create returned no InvoiceID.')

  await persistInvoiceId(db, payment.id, invoiceId)

  if (accounts.bankCode) {
    await markInvoicePaid(db, {
      invoiceId,
      bankCode: accounts.bankCode,
      date: payment.paid_at ? toYmd(payment.paid_at) : date,
      amount,
    })
  }

  return 'created'
}

export interface PushAllResult {
  created: number
  skipped: number
  failed: number
  errors: { paymentId: string; error: string }[]
}

/**
 * Push all paid payments lacking a Xero invoice, sequentially. Resolves accounts
 * once, then loops. Per-payment errors are collected without aborting the run;
 * XeroNotConnectedError aborts immediately.
 */
export async function pushAllPayments(db: XeroDb): Promise<PushAllResult> {
  const { data, error } = await db
    .from('payments')
    .select(
      'id, amount_pence, payment_type, description, paid_at, due_date, created_at, member_id, xero_invoice_id, members(xero_contact_id)',
    )
    .eq('status', 'paid')
    .is('xero_invoice_id', null)
  if (error) throw new Error(`Failed to load payments: ${error.message}`)

  const payments = (data ?? []) as unknown as PaymentForSync[]
  const result: PushAllResult = { created: 0, skipped: 0, failed: 0, errors: [] }

  const accounts = await resolveAccounts(db)

  for (const payment of payments) {
    try {
      const action = await pushPaymentToXero(db, payment, accounts)
      result[action] += 1
    } catch (err) {
      if (err instanceof XeroNotConnectedError) throw err
      result.failed += 1
      result.errors.push({
        paymentId: payment.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return result
}
