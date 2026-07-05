'use client'

// Relationship scores for a single member (Feature #4 display).
// Reads the member's stored score columns and offers an admin-only
// "Recompute scores" action that recomputes just this member, then refetches.

import { useEffect, useState } from 'react'
import { Activity, RefreshCw } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { toast } from '@/lib/hooks/use-toast'
import {
  computeMemberScoresWithExplanations,
  type MemberScores,
  type MemberScoreExplanations,
} from '@/lib/members/scoring'

// A labelled 0–100 meter with its plain-English reasons. `warm` inverts the
// good/bad colour (high = bad), used for churn risk.
function Meter({
  label,
  value,
  reasons,
  warm = false,
}: {
  label: string
  value: number | null
  reasons: string[]
  warm?: boolean
}) {
  const has = value !== null && value !== undefined
  const v = has ? Math.max(0, Math.min(100, value as number)) : 0
  const barColour = warm ? 'bg-accent-warm' : 'bg-accent'
  const valColour = warm ? 'text-accent-warm' : 'text-accent'
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted">
          {label}
        </span>
        <span
          className={
            has
              ? `font-[family-name:var(--font-heading)] text-lg font-semibold ${valColour}`
              : 'text-sm text-text-dim'
          }
        >
          {has ? v : '—'}
        </span>
      </div>
      <div className="h-2 rounded-full bg-surface-2 border border-border overflow-hidden">
        <div
          className={`h-full ${barColour} transition-all`}
          style={{ width: `${has ? v : 0}%` }}
        />
      </div>
      {reasons.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {reasons.map((r, i) => (
            <li key={i} className="text-[0.6875rem] text-text-dim leading-snug">
              {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function MemberScoresPanel({ memberId }: { memberId: string }) {
  const [scores, setScores] = useState<MemberScores | null>(null)
  const [explanations, setExplanations] = useState<MemberScoreExplanations | null>(null)
  const [loading, setLoading] = useState(true)
  const [recomputing, setRecomputing] = useState(false)

  async function loadScores() {
    setLoading(true)
    try {
      const { scores, explanations } = await computeMemberScoresWithExplanations(memberId)
      setScores(scores)
      setExplanations(explanations)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadScores()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId])

  async function recompute() {
    setRecomputing(true)
    try {
      const res = await fetch(
        `/api/admin/members/recompute-scores?member_id=${encodeURIComponent(memberId)}`,
        { method: 'POST' },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to recompute')
      toast({ title: 'Scores recomputed & saved' })
      await loadScores()
    } catch (err) {
      toast({
        title: 'Could not recompute scores',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setRecomputing(false)
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-gold" />
            <CardTitle>Relationship scores</CardTitle>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={recompute}
            disabled={recomputing}
          >
            <RefreshCw size={14} className={recomputing ? 'animate-spin' : ''} />
            {recomputing ? 'Recomputing…' : 'Recompute scores'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading || !scores || !explanations ? (
          <p className="text-sm text-text-dim">Loading…</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
            <Meter
              label="Engagement"
              value={scores.engagement_score}
              reasons={explanations.engagement}
            />
            <Meter
              label="Relationship capital"
              value={scores.relationship_capital_score}
              reasons={explanations.relationship_capital}
            />
            <Meter
              label="Relationship health"
              value={scores.relationship_health_score}
              reasons={explanations.relationship_health}
            />
            <Meter
              label="Churn risk"
              value={scores.churn_risk_score}
              reasons={explanations.churn_risk}
              warm
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
