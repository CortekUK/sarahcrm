'use client'

import { forwardRef, useId } from 'react'
import { Check, FileText, Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils'

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
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
        <Req required={required} />
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        className={cn(inputClass, 'appearance-none cursor-pointer', !value && 'text-slate-dim')}
      >
        <option value="" className="bg-ink text-ivory">
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o} value={o} className="bg-ink text-ivory">
            {o}
          </option>
        ))}
      </select>
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
          onChange(e.target.files?.[0] ?? null)
          e.target.value = ''
        }}
      />
      <FieldHint hint={hint} />
      <FieldError error={error} />
    </div>
  )
}
