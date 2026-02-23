import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  prefix?: string
  suffix?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, prefix, suffix, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

    const inputClasses = cn(
      'w-full px-3.5 py-2.5 bg-surface text-text text-sm rounded-[var(--radius-md)] border border-border outline-none',
      'transition-[border-color,box-shadow] duration-200',
      'placeholder:text-text-dim',
      'focus:border-gold focus:shadow-[0_0_0_3px_var(--color-gold-muted)]',
      error && 'border-accent-warm focus:border-accent-warm focus:shadow-[0_0_0_3px_rgba(196,105,74,0.1)]',
      props.disabled && 'opacity-50 cursor-not-allowed bg-surface-2',
      prefix && 'pl-8',
      suffix && 'pr-10',
      className
    )

    const needsWrapper = prefix || suffix

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted"
          >
            {label}
          </label>
        )}
        {needsWrapper ? (
          <div className="relative">
            {prefix && (
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-text-dim pointer-events-none">
                {prefix}
              </span>
            )}
            <input ref={ref} id={inputId} className={inputClasses} {...props} />
            {suffix && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {suffix}
              </div>
            )}
          </div>
        ) : (
          <input ref={ref} id={inputId} className={inputClasses} {...props} />
        )}
        {error && (
          <p className="text-xs text-accent-warm">{error}</p>
        )}
        {hint && !error && (
          <p className="text-xs text-text-dim">{hint}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'
