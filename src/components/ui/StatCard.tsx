import { cn } from '../../lib/utils'

interface StatCardProps {
  label: string
  value: string | number
  changeText?: string
  changeType?: 'positive' | 'negative' | 'neutral'
  className?: string
}

export function StatCard({ label, value, changeText, changeType = 'neutral', className }: StatCardProps) {
  return (
    <div
      className={cn(
        // min-w-0 lets the card shrink inside a grid track instead of being
        // pushed wider by a long value; tighter padding on phones.
        'min-w-0 bg-surface border border-border rounded-[var(--radius-lg)] px-4 py-4 sm:px-6 sm:py-5 shadow-[var(--shadow-card)]',
        className
      )}
    >
      <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-2">
        {label}
      </p>
      {/* Smaller on phones (2-up grids are ~170px wide) so "£69,450.00" fits;
          desktop stays text-3xl. Wraps as a last resort rather than overflowing. */}
      <p className="font-[family-name:var(--font-heading)] text-xl sm:text-3xl font-semibold text-text mb-1 [overflow-wrap:anywhere]">
        {value}
      </p>
      {changeText && (
        <p
          className={cn(
            'text-xs font-medium',
            changeType === 'positive' && 'text-accent',
            changeType === 'negative' && 'text-accent-warm',
            changeType === 'neutral' && 'text-gold'
          )}
        >
          {changeText}
        </p>
      )}
    </div>
  )
}
