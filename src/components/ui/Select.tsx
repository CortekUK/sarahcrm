import {
  forwardRef,
  useState,
  useRef,
  useEffect,
  type SelectHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
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
    // The dropdown panel is rendered in a portal with fixed positioning so it
    // is never clipped by an ancestor's overflow (e.g. inside a Modal).
    const triggerRef = useRef<HTMLButtonElement>(null)
    const panelRef = useRef<HTMLDivElement>(null)
    const [mounted, setMounted] = useState(false)
    const [menuPos, setMenuPos] = useState<{
      top: number
      bottom: number
      left: number
      width: number
      openUp: boolean
    } | null>(null)

    useEffect(() => setMounted(true), [])

    // Position the portal panel against the trigger, flipping up when there's
    // not enough room below. Re-computes on scroll/resize while open.
    useEffect(() => {
      if (!open) return
      const compute = () => {
        const el = triggerRef.current
        if (!el) return
        const r = el.getBoundingClientRect()
        const spaceBelow = window.innerHeight - r.bottom
        const openUp = spaceBelow < 264 && r.top > spaceBelow
        setMenuPos({
          top: r.bottom + 4,
          bottom: window.innerHeight - r.top + 4,
          left: r.left,
          width: r.width,
          openUp,
        })
      }
      compute()
      window.addEventListener('scroll', compute, true)
      window.addEventListener('resize', compute)
      return () => {
        window.removeEventListener('scroll', compute, true)
        window.removeEventListener('resize', compute)
      }
    }, [open])

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
        const target = e.target as Node
        const inContainer = containerRef.current?.contains(target)
        const inPanel = panelRef.current?.contains(target)
        if (!inContainer && !inPanel) {
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
            ref={triggerRef}
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

          {/* Dropdown panel — portalled + fixed so it escapes ancestor overflow */}
          {open && mounted && menuPos &&
            createPortal(
            <div
              ref={panelRef}
              role="listbox"
              id={selectId ? `${selectId}-listbox` : undefined}
              style={{
                position: 'fixed',
                left: menuPos.left,
                width: menuPos.width,
                ...(menuPos.openUp
                  ? { bottom: menuPos.bottom }
                  : { top: menuPos.top }),
              }}
              className="z-[120] bg-surface border border-border rounded-[var(--radius-md)] shadow-[var(--shadow-card)] py-1 max-h-60 overflow-auto"
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
            </div>,
            document.body,
          )}
        </div>

        {error && <p className="text-xs text-accent-warm">{error}</p>}
        {hint && !error && <p className="text-xs text-text-dim">{hint}</p>}
      </div>
    )
  }
)

Select.displayName = 'Select'
