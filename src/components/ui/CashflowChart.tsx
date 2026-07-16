'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'
import type { CashflowBucket } from '@/lib/finance/metrics'

// Themed recharts bar chart for the 12-month cashflow (Feature #2).
//
// Grouped bars per month — Cash in (gold) beside Cash out (warm) — with a
// warm-luxury hover tooltip showing that month's In / Out / Net. All colours
// come from theme tokens (var(--color-*)) so it tracks light/dark themes and
// never uses default recharts palette.

interface TooltipPayloadItem {
  payload: CashflowBucket
}

function CashflowTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: TooltipPayloadItem[]
}) {
  if (!active || !payload || payload.length === 0) return null
  const b = payload[0].payload
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2.5 shadow-[var(--shadow-card)] min-w-[9rem]">
      <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim mb-2">
        {b.label}
      </p>
      <div className="space-y-1 text-xs">
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-text-muted">
            <span className="h-2 w-2 rounded-full bg-gold" /> Cash in
          </span>
          <span className="tabular-nums text-text">{formatCurrency(b.inPence)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-text-muted">
            <span className="h-2 w-2 rounded-full bg-accent-warm" /> Cash out
          </span>
          <span className="tabular-nums text-text">{formatCurrency(b.outPence)}</span>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-border pt-1 mt-1">
          <span className="text-text-muted">Net</span>
          <span
            className={`tabular-nums font-medium ${
              b.netPence >= 0 ? 'text-text' : 'text-accent-warm'
            }`}
          >
            {formatCurrency(b.netPence)}
          </span>
        </div>
      </div>
    </div>
  )
}

export function CashflowChart({ data }: { data: CashflowBucket[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barGap={2}>
          <CartesianGrid
            vertical={false}
            stroke="var(--color-border)"
            strokeDasharray="3 3"
          />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: 'var(--color-border)' }}
            tick={{ fill: 'var(--color-text-dim)', fontSize: 11 }}
            dy={4}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tick={{ fill: 'var(--color-text-dim)', fontSize: 11 }}
            tickFormatter={(v: number) => formatCurrency(v)}
          />
          <Tooltip
            cursor={{ fill: 'var(--color-surface-2)', opacity: 0.5 }}
            content={<CashflowTooltip />}
          />
          <Bar
            dataKey="inPence"
            name="Cash in"
            fill="var(--color-gold)"
            radius={[3, 3, 0, 0]}
            maxBarSize={22}
          />
          <Bar
            dataKey="outPence"
            name="Cash out"
            fill="var(--color-accent-warm)"
            radius={[3, 3, 0, 0]}
            maxBarSize={22}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
