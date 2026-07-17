'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'

// Themed recharts bar chart for the Executive Dashboard's five pipeline
// streams (open value per stream). Mirrors the CashflowChart pattern: all
// colours come from theme tokens (var(--color-*)) so it tracks the
// light/dark themes and never falls back to the default recharts palette.
// A warm-luxury hover tooltip shows each stream's open value + count.

export interface StreamDatum {
  key: string
  label: string
  valuePence: number
  count: number
  color: string // a var(--color-*) token
}

function StreamTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload: StreamDatum }[]
}) {
  if (!active || !payload || payload.length === 0) return null
  const d = payload[0].payload
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2.5 shadow-[var(--shadow-card)] min-w-[9rem]">
      <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim mb-2">
        {d.label}
      </p>
      <div className="space-y-1 text-xs">
        <div className="flex items-center justify-between gap-4">
          <span className="text-text-muted">Open value</span>
          <span className="tabular-nums text-text">{formatCurrency(d.valuePence)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-text-muted">Open items</span>
          <span className="tabular-nums text-text">{d.count.toLocaleString('en-GB')}</span>
        </div>
      </div>
    </div>
  )
}

export function PipelineStreamsChart({ data }: { data: StreamDatum[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
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
          <Tooltip cursor={{ fill: 'var(--color-surface-2)', opacity: 0.5 }} content={<StreamTooltip />} />
          <Bar dataKey="valuePence" name="Open value" radius={[3, 3, 0, 0]} maxBarSize={48}>
            {data.map((d) => (
              <Cell key={d.key} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
