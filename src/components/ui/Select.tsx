import {
  forwardRef,
  useState,
  useRef,
  useEffect,
  type SelectHTMLAttributes,
} from 'react'
import { cn } from '../../lib/utils'
import { ChevronDown, Check } from 'lucide-react'

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
  (
    {
      label,
      error,
      hint,
      options,
      placeholder,
      className,
      id,
      onChange,
      disabled,
      value,
      defaultValue,
      name,
      onBlur,
      ...props
    },
    ref
  ) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-')
    const [open, setOpen] = useState(false)
    const [highlightedIndex, setHighlightedIndex] = useState(-1)
    const containerRef = useRef<HTMLDivElement>(null)
    const hiddenRef = useRef<HTMLSelectElement | null>(null)

    // Controlled vs uncontrolled value tracking
    const isControlled = value !== undefined
    const [uncontrolledValue, setUncontrolledValue] = useState<string>(
      (defaultValue as string) ?? ''
    )
    const currentValue = isControlled ? (value as string) : uncontrolledValue

    // Sync uncontrolled value from hidden select (handles RHF reset/setValue)
    useEffect(() => {
      if (!isControlled && hiddenRef.current) {
        const elValue = hiddenRef.current.value
        if (elValue !== uncontrolledValue) {
          setUncontrolledValue(elValue)
        }
      }
    })

    const selectedOption = options.find((o) => o.value === currentValue)
    const displayLabel = selectedOption?.label ?? placeholder ?? ''

    // Close on outside click
    useEffect(() => {
      if (!open) return
      function handleMouseDown(e: MouseEvent) {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setOpen(false)
        }
      }
      document.addEventListener('mousedown', handleMouseDown)
      return () => document.removeEventListener('mousedown', handleMouseDown)
    }, [open])

    // Reset highlight index when opening
    useEffect(() => {
      if (open) {
        const idx = options.findIndex((o) => o.value === currentValue)
        setHighlightedIndex(idx >= 0 ? idx : 0)
      }
    }, [open, currentValue, options])

    function handleSelect(optValue: string) {
      setOpen(false)
      if (!isControlled) setUncontrolledValue(optValue)

      // Update hidden select and dispatch native change event for React/RHF compat
      const el = hiddenRef.current
      if (el) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          HTMLSelectElement.prototype,
          'value'
        )?.set
        nativeSetter?.call(el, optValue)
        el.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }

    function handleKeyDown(e: React.KeyboardEvent) {
      if (disabled) return

      if (!open) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
          e.preventDefault()
          setOpen(true)
        }
        return
      }

      switch (e.key) {
        case 'Escape':
          e.preventDefault()
          setOpen(false)
          break
        case 'ArrowDown':
          e.preventDefault()
          setHighlightedIndex((i) => Math.min(i + 1, options.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setHighlightedIndex((i) => Math.max(i - 1, 0))
          break
        case 'Enter':
        case ' ':
          e.preventDefault()
          if (highlightedIndex >= 0 && highlightedIndex < options.length) {
            handleSelect(options[highlightedIndex].value)
          }
          break
      }
    }

    function mergeRefs(el: HTMLSelectElement | null) {
      hiddenRef.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref)
        (ref as React.MutableRefObject<HTMLSelectElement | null>).current = el
    }

    return (
      <div className="space-y-1.5" ref={containerRef}>
        {label && (
          <label
            htmlFor={selectId}
            className="block font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted"
          >
            {label}
          </label>
        )}

        {/* Hidden native select for ref/form compatibility */}
        <select
          ref={mergeRefs}
          id={selectId}
          name={name}
          value={isControlled ? currentValue : undefined}
          defaultValue={!isControlled ? (defaultValue as string) : undefined}
          onChange={onChange}
          onBlur={onBlur}
          tabIndex={-1}
          className="sr-only"
          aria-hidden="true"
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

        {/* Custom trigger + dropdown */}
        <div className="relative">
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-controls={selectId ? `${selectId}-listbox` : undefined}
            disabled={disabled}
            onClick={() => !disabled && setOpen((o) => !o)}
            onKeyDown={handleKeyDown}
            className={cn(
              'w-full flex items-center justify-between px-3.5 py-2.5 bg-surface text-text text-sm rounded-[var(--radius-md)] border border-border outline-none text-left',
              'transition-[border-color,box-shadow] duration-200',
              'focus:border-gold focus:shadow-[0_0_0_3px_var(--color-gold-muted)]',
              open &&
                'border-gold shadow-[0_0_0_3px_var(--color-gold-muted)]',
              error &&
                'border-accent-warm focus:border-accent-warm focus:shadow-[0_0_0_3px_rgba(196,105,74,0.1)]',
              disabled && 'opacity-50 cursor-not-allowed bg-surface-2',
              className
            )}
          >
            <span
              className={cn(
                'truncate',
                !selectedOption && placeholder && 'text-text-dim'
              )}
            >
              {displayLabel}
            </span>
            <ChevronDown
              size={16}
              strokeWidth={1.5}
              className={cn(
                'text-text-dim shrink-0 ml-2 transition-transform duration-200',
                open && 'rotate-180'
              )}
            />
          </button>

          {/* Dropdown panel */}
          {open && (
            <div
              role="listbox"
              id={selectId ? `${selectId}-listbox` : undefined}
              className="absolute z-50 mt-1 w-full bg-surface border border-border rounded-[var(--radius-md)] shadow-[var(--shadow-card)] py-1 max-h-60 overflow-auto"
            >
              {options.map((opt, idx) => (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={opt.value === currentValue}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  onClick={() => handleSelect(opt.value)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left transition-colors',
                    opt.value === currentValue
                      ? 'text-gold font-medium'
                      : 'text-text',
                    idx === highlightedIndex && 'bg-surface-2'
                  )}
                >
                  <Check
                    size={14}
                    strokeWidth={2}
                    className={cn(
                      'shrink-0 transition-opacity',
                      opt.value === currentValue
                        ? 'opacity-100 text-gold'
                        : 'opacity-0'
                    )}
                  />
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-xs text-accent-warm">{error}</p>}
        {hint && !error && <p className="text-xs text-text-dim">{hint}</p>}
      </div>
    )
  }
)

Select.displayName = 'Select'
