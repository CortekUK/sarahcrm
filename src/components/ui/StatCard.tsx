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
        'bg-surface border border-border rounded-[var(--radius-lg)] px-6 py-5 shadow-[var(--shadow-card)]',
        className
      )}
    >
      <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-2">
        {label}
      </p>
      <p className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-text mb-1">
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
