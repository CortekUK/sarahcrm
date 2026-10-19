'use client'

// Payment-method row for the admin member Subscription card: shows whether
// the member pays by card or by UK Direct Debit through Stripe (Bacs), the
// mandate status (pending / active / failed / cancelled) and the mandate
// reference. Fields are set by the approve flow and the stripe-webhook edge
// function (mandate.updated). Reads loosely-typed fields because the
// member row is fetched with `select('*')` and the Direct Debit columns come
// from a newer migration.

import { Landmark } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import {
  DIRECT_DEBIT_STATUS_LABEL,
  isDirectDebitStatus,
  type DirectDebitStatus,
} from '@/lib/billing/direct-debit'

export interface MemberDirectDebitFields {
  direct_debit_active?: boolean | null
  stripe_payment_method_type?: string | null
  direct_debit_status?: string | null
  direct_debit_reference?: string | null
  stripe_mandate_id?: string | null
}

const statusVariant: Record<DirectDebitStatus, 'active' | 'upcoming' | 'urgent' | 'draft'> = {
  active: 'active',
  pending: 'upcoming',
  failed: 'urgent',
  inactive: 'draft',
}

const labelClass =
  'font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim'

export function MemberDirectDebitStatus({ member }: { member: MemberDirectDebitFields }) {
  const isDirectDebit = member.stripe_payment_method_type === 'bacs_debit'
  // Fall back to the legacy boolean when only that is set (e.g. manually
  // ticked before Stripe Direct Debit existed).
  const status: DirectDebitStatus | null = isDirectDebitStatus(member.direct_debit_status)
    ? member.direct_debit_status
    : member.direct_debit_active
      ? 'active'
      : null

  // Card members (or nothing recorded): render nothing, so the existing
  // Subscription card looks exactly as before.
  if (!isDirectDebit && !status) return null

  return (
    <div className="mt-5 pt-4 border-t border-border grid grid-cols-2 sm:grid-cols-4 gap-4">
      <div>
        <p className={labelClass}>Payment method</p>
        <p className="text-sm text-text mt-1 inline-flex items-center gap-1.5">
          <Landmark size={13} className="text-gold" />
          {isDirectDebit ? 'Direct Debit (Stripe Bacs)' : 'Direct Debit'}
        </p>
      </div>
      <div>
        <p className={labelClass}>Direct Debit</p>
        <div className="mt-1">
          {status ? (
            <Badge variant={statusVariant[status]} dot>
              {DIRECT_DEBIT_STATUS_LABEL[status]}
            </Badge>
          ) : (
            <span className="text-sm text-text-muted">—</span>
          )}
        </div>
      </div>
      <div>
        <p className={labelClass}>Mandate reference</p>
        <p className="text-sm text-text-muted mt-1 font-mono truncate">
          {member.direct_debit_reference || '—'}
        </p>
      </div>
      <div>
        <p className={labelClass}>Stripe mandate</p>
        <p className="text-sm text-text-muted mt-1 font-mono truncate">
          {member.stripe_mandate_id || '—'}
        </p>
      </div>
      {status === 'pending' && (
        <p className="col-span-2 sm:col-span-4 text-xs text-text-dim">
          Bacs confirms new mandates in about 3 working days; each payment then takes 3–5
          working days to clear.
        </p>
      )}
      {(status === 'failed' || status === 'inactive') && (
        <p className="col-span-2 sm:col-span-4 text-xs text-accent-warm">
          The mandate was refused or cancelled by the bank. Future renewals will fail until
          the member sets up Direct Debit again (portal → Billing) or adds a card.
        </p>
      )}
    </div>
  )
}
