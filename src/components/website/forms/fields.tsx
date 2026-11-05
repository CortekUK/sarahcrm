'use client'

import { forwardRef, useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown, FileText, Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FORM_UPLOAD_MAX_BYTES, FORM_UPLOAD_TYPES } from './sources'

// Field primitives for the website forms — the night design's underline
// inputs, small-caps labels and bronze tiles (same vocabulary as the
// Contact / Concierge forms). Theme tokens only, so they read in day and
// night modes.

export const labelClass =
  'block font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-slate-haze mb-3'
const inputClass =
  'w-full px-0 py-3 bg-transparent border-b border-graphite-line/80 focus:border-bronze focus:outline-none text-[15px] text-ivory placeholder:text-slate-dim transition-colors'

export function FieldError({ error }: { error?: string }) {
  if (!error) return null
  return <p className="mt-2 text-[12px] text-bronze-light italic">{error}</p>
}

export function FieldHint({ hint }: { hint?: string }) {
  if (!hint) return null
  return <p className="mt-2 text-[12px] text-slate-haze leading-relaxed">{hint}</p>
}

function Req({ required }: { required?: boolean }) {
  return required ? null : <span className="normal-case tracking-normal text-slate-dim"> (optional)</span>
}

interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement | HTMLTextAreaElement> {
  label: string
  error?: string
  hint?: string
  as?: 'input' | 'textarea'
  rows?: number
  optionalMark?: boolean
}

export const TextField = forwardRef<HTMLInputElement | HTMLTextAreaElement, TextFieldProps>(
  ({ label, error, hint, as = 'input', rows, id, required, optionalMark = true, ...rest }, ref) => {
    const autoId = useId()
    const fieldId = id ?? autoId
    return (
      <div>
        <label htmlFor={fieldId} className={labelClass}>
          {label}
          {optionalMark && <Req required={required} />}
        </label>
        {as === 'textarea' ? (
          <textarea
            ref={ref as React.Ref<HTMLTextAreaElement>}
            id={fieldId}
            aria-invalid={error ? true : undefined}
            rows={rows ?? 4}
            className={inputClass + ' resize-none'}
            {...(rest as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
          />
        ) : (
          <input
            ref={ref as React.Ref<HTMLInputElement>}
            id={fieldId}
            aria-invalid={error ? true : undefined}
            className={inputClass}
            {...(rest as React.InputHTMLAttributes<HTMLInputElement>)}
          />
        )}
        <FieldHint hint={hint} />
        <FieldError error={error} />
      </div>
    )
  },
)
TextField.displayName = 'TextField'

// Branded dropdown (same look as the membership application's
// EditorialSelect): a native <select> opens the OS picker with its own
// highlight colours, which breaks the night/day design. Button + panel we
// control: bronze hover, keyboard support, click-outside / Escape to close.
export function SelectField({
  label,
  value,
  onChange,
  options,
  error,
  hint,
  required,
  placeholder = 'Choose…',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: readonly string[]
  error?: string
  hint?: string
  required?: boolean
  placeholder?: string
}) {
  const labelId = useId()
  const buttonId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => {
    if (!open) return
    const i = options.indexOf(value)
    setActive(i >= 0 ? i : 0)
  }, [open, options, value])

  useEffect(() => {
    if (!open || active < 0) return
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  function choose(o: string) {
    onChange(o)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      setActive((a) =>
        e.key === 'ArrowDown' ? Math.min(options.length - 1, a + 1) : Math.max(0, a - 1),
      )
      return
    }
    if ((e.key === 'Enter' || e.key === ' ') && open && active >= 0) {
      e.preventDefault()
      choose(options[active])
    }
  }

  return (
    <div className="relative" ref={wrapRef} onKeyDown={onKeyDown}>
      <label id={labelId} htmlFor={buttonId} className={labelClass}>
        {label}
        <Req required={required} />
      </label>
      <button
        id={buttonId}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={error ? true : undefined}
        aria-labelledby={`${labelId} ${buttonId}`}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'w-full flex items-center justify-between gap-3 px-0 py-3 bg-transparent border-b text-[15px] text-left transition-colors focus:outline-none',
          open ? 'border-bronze' : 'border-graphite-line/80 hover:border-bronze/50 focus:border-bronze',
        )}
      >
        <span className={cn(value ? 'text-ivory' : 'text-slate-dim')}>{value || placeholder}</span>
        <ChevronDown
          size={14}
          strokeWidth={1.5}
          className={cn('text-slate-haze transition-transform duration-300', open && 'rotate-180 text-bronze-light')}
        />
      </button>

      {open && (
        // data-lenis-prevent: keep the site's smooth-scroll from hijacking
        // wheel events inside the list.
        <div
          data-lenis-prevent
          className="absolute left-0 right-0 top-full mt-2 z-50 bg-graphite day:bg-white border border-bronze/40 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.6)] day:shadow-lg"
        >
          <div
            ref={listRef}
            role="listbox"
            aria-labelledby={labelId}
            className="max-h-64 overflow-y-auto overscroll-contain"
          >
            {options.map((o, i) => {
              const selected = value === o
              return (
                <button
                  key={o}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-index={i}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(o)}
                  className={cn(
                    'w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-[13.5px] transition-colors',
                    selected
                      ? 'bg-bronze/15 text-bronze-light'
                      : i === active
                        ? 'bg-bronze/10 text-ivory'
                        : 'text-ivory-soft hover:bg-bronze/10 hover:text-ivory',
                  )}
                >
                  <span>{o}</span>
                  {selected && <Check size={12} strokeWidth={2} className="text-bronze-light" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
      <FieldHint hint={hint} />
      <FieldError error={error} />
    </div>
  )
}

/** Bronze tile checklist — single (radio) or multiple (checkbox) choice. */
export function ChoiceTiles({
  label,
  options,
  value,
  onChange,
  multiple,
  error,
  hint,
  required,
  columns = 3,
}: {
  label: string
  options: readonly string[]
  value: string | string[]
  onChange: (v: string | string[]) => void
  multiple?: boolean
  error?: string
  hint?: string
  required?: boolean
  columns?: 2 | 3 | 4
}) {
  const selected = Array.isArray(value) ? value : value ? [value] : []
  function toggle(opt: string) {
    if (multiple) {
      onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt])
    } else {
      onChange(selected.includes(opt) && !required ? '' : opt)
    }
  }
  return (
    <fieldset>
      <legend className={labelClass}>
        {label}
        <Req required={required} />
      </legend>
      <div
        className={cn(
          'grid grid-cols-1 sm:grid-cols-2 gap-3',
          columns === 3 && 'lg:grid-cols-3',
          columns === 4 && 'lg:grid-cols-4',
        )}
      >
        {options.map((opt) => {
          const on = selected.includes(opt)
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              aria-pressed={on}
              className={cn(
                'group relative flex items-center gap-3 px-4 py-3 border text-left transition-all duration-300',
                on
                  ? 'border-bronze bg-bronze/10'
                  : 'border-graphite-line/70 bg-graphite/30 hover:border-bronze/55 hover:bg-bronze/5 day:bg-white day:border-graphite-line/55',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'shrink-0 w-4 h-4 flex items-center justify-center border transition-all duration-300',
                  !multiple && 'rounded-full',
                  on ? 'bg-bronze border-bronze' : 'border-graphite-line/80 group-hover:border-bronze/60',
                )}
              >
                {on && <Check size={10} strokeWidth={3} className="text-ink" />}
              </span>
              <span
                className={cn(
                  'font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.14em] leading-snug transition-colors duration-300',
                  on ? 'text-bronze-light' : 'text-ivory-soft group-hover:text-ivory',
                )}
              >
                {opt}
              </span>
            </button>
          )
        })}
      </div>
      <FieldHint hint={hint} />
      <FieldError error={error} />
    </fieldset>
  )
}

/** Segmented toggle — e.g. Private / Corporate, Yes / No. */
export function SegmentToggle({
  label,
  options,
  value,
  onChange,
  error,
  required,
}: {
  label: string
  options: readonly string[]
  value: string
  onChange: (v: string) => void
  error?: string
  required?: boolean
}) {
  return (
    <fieldset>
      <legend className={labelClass}>
        {label}
        <Req required={required} />
      </legend>
      <div className="inline-flex flex-wrap border border-graphite-line/70 rounded-full p-1 gap-1">
        {options.map((opt) => {
          const on = value === opt
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              aria-pressed={on}
              className={cn(
                'px-5 py-2 rounded-full font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.24em] transition-colors duration-300',
                on ? 'bg-bronze text-ink' : 'text-ivory-soft hover:text-ivory',
              )}
            >
              {opt}
            </button>
          )
        })}
      </div>
      <FieldError error={error} />
    </fieldset>
  )
}

/** Tick box with rich label (consent, acknowledgements). */
export function CheckField({
  checked,
  onChange,
  children,
  error,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  children: React.ReactNode
  error?: string
}) {
  const id = useId()
  return (
    <div>
      <div className="flex items-start gap-3">
        <button
          id={id}
          type="button"
          role="checkbox"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={cn(
            'mt-0.5 shrink-0 w-[18px] h-[18px] flex items-center justify-center border transition-colors duration-300',
            checked ? 'bg-bronze border-bronze' : 'border-graphite-line hover:border-bronze/70',
          )}
        >
          {checked && <Check size={11} strokeWidth={3} className="text-ink" />}
        </button>
        <label
          htmlFor={id}
          onClick={(e) => {
            // Let links inside the label work without toggling.
            if ((e.target as HTMLElement).closest('a')) return
            e.preventDefault()
            onChange(!checked)
          }}
          className="text-[13.5px] leading-relaxed text-ivory-soft cursor-pointer"
        >
          {children}
        </label>
      </div>
      <FieldError error={error} />
    </div>
  )
}

export const FILE_ACCEPT = '.pdf,.pptx,.xlsx,.docx'

/** File picker — the file is only uploaded on submit (private bucket). */
export function FileField({
  label,
  file,
  onChange,
  error,
  hint,
  required,
}: {
  label: string
  file: File | null
  onChange: (f: File | null) => void
  error?: string
  hint?: string
  required?: boolean
}) {
  const id = useId()
  // Refuse a file the moment it's picked (over 20MB / wrong type) instead
  // of showing it as attached and failing at submit.
  const [rejected, setRejected] = useState<string | null>(null)
  return (
    <div>
      <span className={labelClass}>
        {label}
        <Req required={required} />
      </span>
      {file ? (
        <div className="flex items-center gap-3 border border-bronze/40 bg-bronze/5 px-4 py-3">
          <FileText size={16} strokeWidth={1.5} className="text-bronze-light shrink-0" />
          <span className="text-[13.5px] text-ivory truncate flex-1">{file.name}</span>
          <span className="text-[11px] text-slate-haze shrink-0">
            {(file.size / (1024 * 1024)).toFixed(1)}MB
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={`Remove ${file.name}`}
            className="text-slate-haze hover:text-ivory transition-colors"
          >
            <X size={15} />
          </button>
        </div>
      ) : (
        <label
          htmlFor={id}
          className="flex items-center gap-3 border border-dashed border-graphite-line/80 hover:border-bronze/60 px-4 py-4 cursor-pointer transition-colors"
        >
          <Upload size={16} strokeWidth={1.5} className="text-bronze-light shrink-0" />
          <span className="text-[13.5px] text-ivory-soft">Choose a file</span>
          <span className="ml-auto text-[11px] text-slate-dim">PDF, PPTX, XLSX or DOCX · 20MB max</span>
        </label>
      )}
      <input
        id={id}
        type="file"
        accept={FILE_ACCEPT}
        className="sr-only"
        onChange={(e) => {
          const picked = e.target.files?.[0] ?? null
          e.target.value = ''
          if (!picked) return
          const ext = picked.name.split('.').pop()?.toLowerCase() ?? ''
          if (!Object.prototype.hasOwnProperty.call(FORM_UPLOAD_TYPES, ext)) {
            setRejected(`“${picked.name}” isn’t a PDF, PPTX, XLSX or DOCX file.`)
            return
          }
          if (picked.size > FORM_UPLOAD_MAX_BYTES) {
            setRejected(
              `“${picked.name}” is ${(picked.size / (1024 * 1024)).toFixed(1)}MB — files must be 20MB or smaller.`,
            )
            return
          }
          setRejected(null)
          onChange(picked)
        }}
      />
      <FieldHint hint={hint} />
      <FieldError error={rejected ?? error} />
    </div>
  )
}
