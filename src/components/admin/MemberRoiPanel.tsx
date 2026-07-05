'use client'

// Commercial value / ROI rollup for a single member (Feature #5).
// Self-fetching so the host page only needs to drop it in with a memberId.

import { useEffect, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { formatCurrency } from '@/lib/utils'
import { computeMemberRoi, type MemberRoi } from '@/lib/members/roi'

function Tile({
  label,
  value,
  source,
  emphasis = false,
}: {
  label: string
  value: string | number
  source?: string
  emphasis?: boolean
}) {
  return (
    <div className="bg-surface-2 border border-border rounded-[var(--radius-md)] px-4 py-3">
      <p className="font-[family-name:var(--font-label)] text-[0.625rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-1.5">
        {label}
      </p>
      <p
        className={
          emphasis
            ? 'font-[family-name:var(--font-heading)] text-2xl font-semibold text-gold'
            : 'font-[family-name:var(--font-heading)] text-xl font-semibold text-text'
        }
      >
        {value}
      </p>
      {source && <p className="text-[0.625rem] text-text-dim mt-1">{source}</p>}
    </div>
  )
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.18em] text-text-muted mb-2">
      {children}
    </p>
  )
}

export function MemberRoiPanel({ memberId }: { memberId: string }) {
  const [roi, setRoi] = useState<MemberRoi | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    computeMemberRoi(memberId)
      .then((r) => {
        if (active) setRoi(r)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [memberId])

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-gold" />
          <CardTitle>Commercial value / ROI</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {loading || !roi ? (
          <p className="text-sm text-text-dim">Calculating…</p>
        ) : (
          <>
            {/* Headline: the renewal number */}
            <div className="mb-5">
              <Tile
                label="Commercial value delivered"
                value={formatCurrency(roi.commercialValueDeliveredPence)}
                source="Revenue generated for them via introductions"
                emphasis
              />
            </div>

            {/* Group 1 — value The Club delivered TO the member */}
            <div className="mb-5">
              <GroupLabel>Value The Club delivered</GroupLabel>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                <Tile
                  label="Revenue via introductions"
                  value={formatCurrency(roi.introRevenuePence)}
                  source="from won introductions"
                />
                <Tile
                  label="Opportunities / pipeline"
                  value={formatCurrency(roi.pipelineValuePence)}
                  source="estimated intro value"
                />
                <Tile label="Intros made" value={roi.introsMade} source="they introduced others" />
                <Tile label="Intros received" value={roi.introsReceived} source="introduced to them" />
                <Tile label="Meetings held" value={roi.meetingsHeld} source="from introductions" />
                <Tile label="Deals won" value={roi.dealsWon} source="closed via intros" />
              </div>
            </div>

            {/* Group 2 — what the member spent WITH The Club */}
            <div>
              <GroupLabel>Their spend with The Club</GroupLabel>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                <Tile
                  label="Revenue paid"
                  value={formatCurrency(roi.revenuePaidPence)}
                  source="from paid invoices"
                />
                <Tile
                  label="Event spend"
                  value={formatCurrency(roi.eventSpendPence)}
                  source="from confirmed bookings"
                />
                <Tile
                  label="Sponsorship spend"
                  value={formatCurrency(roi.sponsorshipSpendPence)}
                  source="from sponsorship packages"
                />
                <Tile
                  label="Concierge spend"
                  value={formatCurrency(roi.conciergeSpendPence)}
                  source="from booked concierge"
                />
                <Tile
                  label="Events attended"
                  value={roi.eventsAttended}
                  source="checked in / accepted"
                />
                <Tile
                  label="Lifetime value"
                  value={formatCurrency(roi.totalValuePence)}
                  source="total commercial relationship"
                />
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
