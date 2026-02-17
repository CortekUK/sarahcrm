import { forwardRef, type SelectHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'
import { ChevronDown } from 'lucide-react'

interface SelectOption {
  value: string
  label: string
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string
  error?: string
  hint?: string
  options: SelectOption[]
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, options, placeholder, className, id, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="block font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              'w-full appearance-none px-3.5 py-2.5 pr-10 bg-surface text-text text-sm rounded-[var(--radius-md)] border border-border outline-none',
              'transition-[border-color,box-shadow] duration-200',
              'focus:border-gold focus:shadow-[0_0_0_3px_var(--color-gold-muted)]',
              error && 'border-accent-warm focus:border-accent-warm focus:shadow-[0_0_0_3px_rgba(196,105,74,0.1)]',
              props.disabled && 'opacity-50 cursor-not-allowed bg-surface-2',
              className
            )}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={16}
            strokeWidth={1.5}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim pointer-events-none"
          />
        </div>
        {error && <p className="text-xs text-accent-warm">{error}</p>}
        {hint && !error && <p className="text-xs text-text-dim">{hint}</p>}
      </div>
    )
  }
)

Select.displayName = 'Select'
