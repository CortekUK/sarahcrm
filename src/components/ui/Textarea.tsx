import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={textareaId}
            className="block font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            'w-full px-3.5 py-2.5 bg-surface text-text text-sm rounded-[var(--radius-md)] border border-border outline-none resize-y min-h-[100px]',
            'transition-[border-color,box-shadow] duration-200',
            'placeholder:text-text-dim',
            'focus:border-gold focus:shadow-[0_0_0_3px_var(--color-gold-muted)]',
            error && 'border-accent-warm focus:border-accent-warm focus:shadow-[0_0_0_3px_rgba(196,105,74,0.1)]',
            props.disabled && 'opacity-50 cursor-not-allowed bg-surface-2',
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-accent-warm">{error}</p>}
        {hint && !error && <p className="text-xs text-text-dim">{hint}</p>}
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'
