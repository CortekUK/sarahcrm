'use client'

// Per-member recommendations (Feature #6). Suggests relevant upcoming
// EVENTS, SPONSORS / STRATEGIC PARTNERS and CURATED EXPERIENCES / TRAVEL for
// a member, computed on the fly from their profile + behaviour.
//
// RECOMMEND-ONLY: nothing here creates or sends anything — each item just
// deep-links to the relevant admin page so the admin can act manually. It
// deliberately excludes member-to-member introductions (already covered by
// MemberMatchesPanel). Self-fetching, so the host page only needs a memberId.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Compass, CalendarDays, Handshake, Plane, ArrowRight } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  computeMemberRecommendations,
  type MemberRecommendations,
} from '@/lib/members/recommendations'

const EVENT_TYPE_LABELS: Record<string, string> = {
  member_event: 'Member event',
  curated_luxury: 'Curated luxury',
  retreat: 'Retreat',
}

function GroupHeader({
  icon,
  title,
  count,
}: {
  icon: React.ReactNode
  title: string
  count: number
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gold/12 text-gold">
        {icon}
      </span>
      <p className="font-[family-name:var(--font-label)] text-[10px] font-medium uppercase tracking-[0.22em] text-gold-dark">
        {title}
      </p>
      <span className="text-[11px] text-text-dim">({count})</span>
    </div>
  )
}

function Row({
  href,
  title,
  meta,
  reason,
  right,
}: {
  href?: string
  title: string
  meta?: React.ReactNode
  reason: string
  right?: React.ReactNode
}) {
  const inner = (
    <div className="group flex items-start justify-between gap-3 rounded-[var(--radius-md)] bg-surface-2 border border-border p-3 transition-colors hover:border-border-gold">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="text-sm font-medium text-text truncate">{title}</span>
          {meta}
        </div>
        <p className="text-xs text-text-muted leading-relaxed">{reason}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {right}
        {href && (
          <ArrowRight
            size={14}
            className="text-text-dim group-hover:text-gold transition-colors"
          />
        )}
      </div>
    </div>
  )
  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  )
}

export function MemberRecommendationsPanel({ memberId }: { memberId: string }) {
  const [recs, setRecs] = useState<MemberRecommendations | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    computeMemberRecommendations(memberId)
      .then((r) => {
        if (active) setRecs(r)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [memberId])

  const isEmpty =
    recs &&
    recs.events.length === 0 &&
    recs.sponsors.length === 0 &&
    recs.experiences.length === 0

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Compass size={16} className="text-gold" />
          <CardTitle>Recommended for this member</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {loading || !recs ? (
          <p className="text-sm text-text-dim">Finding recommendations…</p>
        ) : !recs.hasSignals ? (
          <p className="text-sm text-text-dim">
            Add event &amp; travel preferences to personalise recommendations for this member.
          </p>
        ) : isEmpty ? (
          <p className="text-sm text-text-dim">
            No matches right now — nothing upcoming aligns with their current preferences.
          </p>
        ) : (
          <div className="space-y-7">
            {/* Events */}
            {recs.events.length > 0 && (
              <div>
                <GroupHeader
                  icon={<CalendarDays size={11} />}
                  title="Events to invite them to"
                  count={recs.events.length}
                />
                <div className="space-y-2">
                  {recs.events.map((e) => (
                    <Row
                      key={e.id}
                      href={`/dashboard/events/${e.id}`}
                      title={e.title}
                      meta={
                        <Badge variant="upcoming">
                          {EVENT_TYPE_LABELS[e.eventType] ?? e.eventType}
                        </Badge>
                      }
                      reason={[
                        formatDate(e.startDate),
                        e.venue ?? null,
                        e.reason,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      right={
                        e.pricePence > 0 ? (
                          <span className="font-[family-name:var(--font-heading)] text-sm font-semibold text-text">
                            {formatCurrency(e.pricePence)}
                          </span>
                        ) : null
                      }
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Sponsors / strategic partners */}
            {recs.sponsors.length > 0 && (
              <div>
                <GroupHeader
                  icon={<Handshake size={11} />}
                  title="Sponsors & strategic partners"
                  count={recs.sponsors.length}
                />
                <div className="space-y-2">
                  {recs.sponsors.map((s) => (
                    <Row
                      key={s.key}
                      href={s.exampleEventId ? `/dashboard/events/${s.exampleEventId}` : undefined}
                      title={s.company}
                      meta={
                        s.packageName ? (
                          <Badge variant="info">{s.packageName}</Badge>
                        ) : undefined
                      }
                      reason={s.alignment ? `${s.reason} · ${s.alignment}` : s.reason}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Curated experiences / travel */}
            {recs.experiences.length > 0 && (
              <div>
                <GroupHeader
                  icon={<Plane size={11} />}
                  title="Experiences & travel"
                  count={recs.experiences.length}
                />
                <div className="space-y-2">
                  {recs.experiences.map((x) => (
                    <Row
                      key={x.id}
                      href={x.linkUrl ?? undefined}
                      title={x.title}
                      reason={x.description ? `${x.reason} · ${x.description}` : x.reason}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
