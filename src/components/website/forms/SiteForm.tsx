'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { PhoneField } from '@/components/website/night/PhoneField'
import { cn } from '@/lib/utils'
import {
  CheckField,
  ChoiceTiles,
  FileField,
  SegmentToggle,
  SelectField,
  TextField,
  labelClass,
} from './fields'
import { PillButton, PillLink } from './SiteButton'
import {
  FORM_UPLOAD_BUCKET,
  FORM_UPLOAD_MAX_BYTES,
  FORM_UPLOAD_TYPES,
  SOURCE_META,
  type FormSource,
  type FormUploadSlot,
} from './sources'

// ─────────────────────────────────────────────────────────────────────
// SiteForm — the ONE shared website form (brief: "Use one shared form
// component so fields and styling stay consistent").
//
// Every form gets: name / email / phone (unless `hideContact`), the
// configured fields, a consent checkbox linking to /privacy-policy, a
// hidden honeypot `website`, inline errors, file uploads to the PRIVATE
// `form-uploads` bucket (signed upload URL from /api/forms/upload), and a
// thank-you state with a next-step suggestion.
//
// Default submit → POST /api/enquiries/intake with the CRM `source` tag.
// Field names `company`, `position` and `message` go to the enquiry's own
// columns; everything else lands in enquiries.form_data. Pass `submit` to
// send the payload somewhere else (members' concierge requests).
//
// Usage:
//   <SiteForm source="Web – Sponsorship" fields={[...]} submitLabel="Send"
//     thankYou={{ title: 'Thank you.', nextStep: { label: 'See the calendar', href: '/events' } }} />
// ─────────────────────────────────────────────────────────────────────

export type FormValue = string | string[] | boolean | File | null
export type FormValues = Record<string, FormValue>

interface BaseField {
  name: string
  label: string
  required?: boolean
  hint?: string
  /** Half width on md+ (two per row). */
  half?: boolean
  /** Only render (and submit) when this returns true. */
  showIf?: (values: FormValues) => boolean
}

export type FieldDef =
  | (BaseField & {
      type: 'text' | 'email' | 'date' | 'url'
      placeholder?: string
    })
  // Whole numbers only (guests, places, capacity…). Default range 1–100,000.
  | (BaseField & { type: 'number'; placeholder?: string; min?: number; max?: number })
  | (BaseField & { type: 'textarea'; rows?: number; placeholder?: string })
  | (BaseField & { type: 'select'; options: readonly string[]; placeholder?: string })
  | (BaseField & {
      type: 'choice'
      options: readonly string[]
      multiple?: boolean
      columns?: 2 | 3 | 4
    })
  | (BaseField & { type: 'toggle'; options: readonly string[] })
  | (BaseField & { type: 'check'; text: React.ReactNode })
  | (BaseField & { type: 'file'; slot: FormUploadSlot })
  | { type: 'heading'; name: string; label: string; showIf?: (values: FormValues) => boolean }
  | { type: 'note'; name: string; text: React.ReactNode; showIf?: (values: FormValues) => boolean }

export interface SubmitPayload {
  first_name: string
  last_name: string
  email: string
  phone: string | null
  company: string | null
  position: string | null
  message: string | null
  source: FormSource | null
  form_data: Record<string, unknown>
  consent: true
  website: string
}

export interface ThankYou {
  title: string
  body?: string
  nextStep?: { text?: string; label: string; href: string }
}

interface SiteFormProps {
  /** CRM source tag. Use `resolveSource` when it depends on an answer. */
  source?: FormSource
  resolveSource?: (values: FormValues) => FormSource
  fields: FieldDef[]
  initialValues?: FormValues
  submitLabel: string
  thankYou: ThankYou
  /** Hide name / email / phone (signed-in member flows). */
  hideContact?: boolean
  /** Phone required? Default optional. */
  phoneRequired?: boolean
  /** Extra context always filed in form_data (e.g. page, event slug). */
  context?: Record<string, string>
  /** Custom submit (e.g. concierge_requests). Return ok / error. */
  submit?: (payload: SubmitPayload) => Promise<{ ok: boolean; error?: string }>
  className?: string
}

const EMAIL_RE = /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/
const TOP_LEVEL = new Set(['company', 'position', 'message'])

function isVisible(f: FieldDef, values: FormValues) {
  return !f.showIf || f.showIf(values)
}

function emptyValue(v: FormValue): boolean {
  if (v == null || v === false) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  return false
}

// Upload one file to the private bucket via a one-time signed URL.
async function uploadFile(slot: FormUploadSlot, file: File): Promise<{ path: string; name: string }> {
  const res = await fetch('/api/forms/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slot, filename: file.name, size: file.size, content_type: file.type }),
  })
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean
    path?: string
    token?: string
    error?: string
  }
  if (!res.ok || !json.ok || !json.path || !json.token) {
    throw new Error(json.error || 'The upload could not start — please try again.')
  }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const { error } = await supabase.storage
    .from(FORM_UPLOAD_BUCKET)
    .uploadToSignedUrl(json.path, json.token, file, {
      contentType: FORM_UPLOAD_TYPES[ext] ?? file.type,
    })
  if (error) throw new Error('The upload failed — please check the file and try again.')
  return { path: json.path, name: file.name.slice(0, 200) }
}

async function postIntake(payload: SubmitPayload): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/enquiries/intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
    if (res.status === 429) {
      return {
        ok: false,
        error:
          'We’ve received several messages from you in a short time — please wait a few minutes and try again, or email us directly.',
      }
    }
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error || 'Something went wrong. Please try again, or email us directly.' }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Something went wrong. Please try again, or email us directly.' }
  }
}

export function SiteForm({
  source,
  resolveSource,
  fields,
  initialValues,
  submitLabel,
  thankYou,
  hideContact,
  phoneRequired,
  context,
  submit,
  className,
}: SiteFormProps) {
  const initial = useMemo<FormValues>(
    () => ({ first_name: '', last_name: '', email: '', phone: '', ...(initialValues ?? {}) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const [values, setValues] = useState<FormValues>(initial)
  const [consent, setConsent] = useState(false)
  const [website, setWebsite] = useState('') // honeypot
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState<false | 'uploading' | 'sending'>(false)
  const [done, setDone] = useState(false)

  function set(name: string, v: FormValue) {
    setValues((prev) => ({ ...prev, [name]: v }))
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }))
  }
  const str = (name: string) => (typeof values[name] === 'string' ? (values[name] as string) : '')

  function validate(): Record<string, string> {
    const e: Record<string, string> = {}
    if (!hideContact) {
      if (!str('first_name').trim()) e.first_name = 'Required'
      if (!str('last_name').trim()) e.last_name = 'Required'
      if (!EMAIL_RE.test(str('email').trim())) e.email = 'Please enter a valid email'
      if (phoneRequired && !str('phone').trim()) e.phone = 'Required'
    }
    for (const f of fields) {
      if (f.type === 'heading' || f.type === 'note' || !isVisible(f, values)) continue
      const v = values[f.name] ?? null
      if (f.required && emptyValue(v)) {
        e[f.name] = f.type === 'check' ? 'Please confirm to continue' : 'Required'
        continue
      }
      if (f.type === 'number' && typeof v === 'string' && v.trim()) {
        const min = f.min ?? 1
        const max = f.max ?? 100000
        const n = Number(v)
        if (!/^\d+$/.test(v.trim()) || n < min || n > max) {
          e[f.name] = `Please enter a whole number from ${min.toLocaleString('en-GB')} to ${max.toLocaleString('en-GB')}`
        }
      }
      if (f.type === 'email' && typeof v === 'string' && v.trim() && !EMAIL_RE.test(v.trim())) {
        e[f.name] = 'Please enter a valid email'
      }
      if (f.type === 'file' && v instanceof File) {
        const ext = v.name.split('.').pop()?.toLowerCase() ?? ''
        if (!Object.prototype.hasOwnProperty.call(FORM_UPLOAD_TYPES, ext)) {
          e[f.name] = 'PDF, PPTX, XLSX or DOCX only'
        } else if (v.size > FORM_UPLOAD_MAX_BYTES) {
          e[f.name] = 'Files must be 20MB or smaller'
        }
      }
    }
    if (!consent) e.__consent = 'Please confirm you agree to the Privacy Policy'
    return e
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    if (busy) return
    setFormError(null)
    const e = validate()
    if (Object.values(e).some(Boolean)) {
      setErrors(e)
      setFormError('Please check the highlighted fields.')
      return
    }

    // Build form_data from the visible, non-empty configured fields.
    const formData: Record<string, unknown> = { ...(context ?? {}) }
    const top: Record<string, string | null> = { company: null, position: null, message: null }
    const files: { path: string; name: string }[] = []
    try {
      const fileFields = fields.filter(
        (f): f is Extract<FieldDef, { type: 'file' }> =>
          f.type === 'file' && isVisible(f, values) && values[f.name] instanceof File,
      )
      if (fileFields.length) {
        setBusy('uploading')
        for (const f of fileFields) files.push(await uploadFile(f.slot, values[f.name] as File))
      }
    } catch (err) {
      setBusy(false)
      setFormError(err instanceof Error ? err.message : 'The upload failed — please try again.')
      return
    }
    for (const f of fields) {
      if (f.type === 'heading' || f.type === 'note' || f.type === 'file' || !isVisible(f, values)) continue
      const v = values[f.name]
      if (emptyValue(v ?? null)) continue
      if (TOP_LEVEL.has(f.name) && typeof v === 'string') {
        top[f.name] = v.trim()
        continue
      }
      formData[f.name] = typeof v === 'string' ? v.trim() : v
    }
    if (files.length) formData.files = files

    const payload: SubmitPayload = {
      first_name: str('first_name').trim(),
      last_name: str('last_name').trim(),
      email: str('email').trim(),
      phone: str('phone').trim() || null,
      company: top.company,
      position: top.position,
      message: top.message,
      source: resolveSource ? resolveSource(values) : source ?? null,
      form_data: formData,
      consent: true,
      website,
    }

    setBusy('sending')
    const result = submit ? await submit(payload) : await postIntake(payload)
    setBusy(false)
    if (!result.ok) {
      setFormError(result.error || 'Something went wrong. Please try again.')
      return
    }
    setDone(true)
  }

  if (done) {
    const src = resolveSource ? resolveSource(values) : source
    const next =
      thankYou.nextStep ?? null
    return (
      <div
        role="status"
        className={cn(
          'border border-bronze/40 bg-graphite/60 p-8 sm:p-12 text-center day:bg-white day:shadow-lg',
          className,
        )}
      >
        <div className="w-14 h-14 mx-auto rounded-full bg-bronze/15 border border-bronze/40 flex items-center justify-center mb-6">
          <Check size={24} strokeWidth={1.5} className="text-bronze-light" />
        </div>
        <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.4em] text-bronze-light mb-5">
          Received
        </p>
        <h3 className="display-md mb-5">{thankYou.title}</h3>
        <p className="font-[family-name:var(--font-editorial)] italic text-[16px] text-ivory-soft leading-relaxed max-w-md mx-auto">
          {thankYou.body ?? (src ? SOURCE_META[src].nextStep : 'We’ll be in touch personally.')}
        </p>
        {next && (
          <div className="mt-9">
            {next.text && (
              <p className="text-[13.5px] text-slate-haze mb-5">{next.text}</p>
            )}
            <PillLink href={next.href} small>
              {next.label}
            </PillLink>
          </div>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className={cn('relative', className)}>
      {/* Honeypot — visually hidden, skipped by keyboard + autofill. */}
      <div aria-hidden="true" className="absolute -left-[10000px] top-auto w-px h-px overflow-hidden">
        <label>
          Leave this empty
          <input
            type="text"
            name="hp_field"
            tabIndex={-1}
            autoComplete="new-password"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-7">
        {!hideContact && (
          <>
            <TextField
              label="First name"
              required
              autoComplete="given-name"
              value={str('first_name')}
              onChange={(e) => set('first_name', e.target.value)}
              error={errors.first_name}
            />
            <TextField
              label="Last name"
              required
              autoComplete="family-name"
              value={str('last_name')}
              onChange={(e) => set('last_name', e.target.value)}
              error={errors.last_name}
            />
            <TextField
              label="Email"
              type="email"
              required
              autoComplete="email"
              value={str('email')}
              onChange={(e) => set('email', e.target.value)}
              error={errors.email}
            />
            <PhoneField
              label={phoneRequired ? 'Phone' : 'Phone (optional)'}
              value={str('phone')}
              onChange={(v) => set('phone', v)}
              error={errors.phone}
            />
          </>
        )}

        {fields.map((f) => {
          if (!isVisible(f, values)) return null
          if (f.type === 'heading') {
            return (
              <p
                key={f.name}
                className="md:col-span-2 pt-4 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light border-t border-graphite-line/50"
              >
                <span className="block pt-6">{f.label}</span>
              </p>
            )
          }
          if (f.type === 'note') {
            return (
              <div key={f.name} className="md:col-span-2 text-[13.5px] leading-relaxed text-ivory-soft">
                {f.text}
              </div>
            )
          }
          const span = f.half ? '' : 'md:col-span-2'
          const err = errors[f.name]
          const v = values[f.name]
          let node: React.ReactNode
          switch (f.type) {
            case 'textarea':
              node = (
                <TextField
                  as="textarea"
                  label={f.label}
                  required={f.required}
                  rows={f.rows}
                  placeholder={f.placeholder}
                  hint={f.hint}
                  value={typeof v === 'string' ? v : ''}
                  onChange={(e) => set(f.name, e.target.value)}
                  error={err}
                />
              )
              break
            case 'select':
              node = (
                <SelectField
                  label={f.label}
                  required={f.required}
                  options={f.options}
                  placeholder={f.placeholder}
                  hint={f.hint}
                  value={typeof v === 'string' ? v : ''}
                  onChange={(x) => set(f.name, x)}
                  error={err}
                />
              )
              break
            case 'choice':
              node = (
                <ChoiceTiles
                  label={f.label}
                  required={f.required}
                  options={f.options}
                  multiple={f.multiple}
                  columns={f.columns}
                  hint={f.hint}
                  value={Array.isArray(v) ? v : typeof v === 'string' ? v : ''}
                  onChange={(x) => set(f.name, x)}
                  error={err}
                />
              )
              break
            case 'toggle':
              node = (
                <SegmentToggle
                  label={f.label}
                  required={f.required}
                  options={f.options}
                  value={typeof v === 'string' ? v : ''}
                  onChange={(x) => set(f.name, x)}
                  error={err}
                />
              )
              break
            case 'check':
              node = (
                <div>
                  <span className={labelClass}>{f.label}</span>
                  <CheckField checked={v === true} onChange={(x) => set(f.name, x)} error={err}>
                    {f.text}
                  </CheckField>
                </div>
              )
              break
            case 'file':
              node = (
                <FileField
                  label={f.label}
                  required={f.required}
                  hint={f.hint}
                  file={v instanceof File ? v : null}
                  onChange={(x) => set(f.name, x)}
                  error={err}
                />
              )
              break
            case 'number':
              node = (
                <TextField
                  label={f.label}
                  type="number"
                  inputMode="numeric"
                  min={f.min ?? 1}
                  max={f.max ?? 100000}
                  step={1}
                  required={f.required}
                  placeholder={f.placeholder}
                  hint={f.hint}
                  value={typeof v === 'string' ? v : ''}
                  // No minus signs, decimals or exponents — digits only.
                  onKeyDown={(e) => {
                    if (['-', '+', 'e', 'E', '.', ','].includes(e.key)) e.preventDefault()
                  }}
                  onChange={(e) => set(f.name, e.target.value.replace(/\D/g, ''))}
                  error={err}
                />
              )
              break
            default:
              node = (
                <TextField
                  label={f.label}
                  type={f.type}
                  required={f.required}
                  placeholder={f.placeholder}
                  hint={f.hint}
                  value={typeof v === 'string' ? v : ''}
                  onChange={(e) => set(f.name, e.target.value)}
                  error={err}
                />
              )
          }
          return (
            <div key={f.name} className={span}>
              {node}
            </div>
          )
        })}

        <div className="md:col-span-2 pt-2">
          <CheckField
            checked={consent}
            onChange={(x) => {
              setConsent(x)
              if (x) setErrors((p) => ({ ...p, __consent: '' }))
            }}
            error={errors.__consent}
          >
            I agree to The Club storing these details to respond to my request, as set out in the{' '}
            <Link href="/privacy-policy" className="text-bronze-light underline underline-offset-4 hover:text-ivory">
              Privacy Policy
            </Link>
            .
          </CheckField>
        </div>
      </div>

      {formError && (
        <div role="alert" className="mt-8 px-4 py-3 border border-plum-light/40 bg-plum/30 text-[13px] text-ivory">
          {formError}
        </div>
      )}

      <div className="mt-10">
        <PillButton type="submit" disabled={!!busy}>
          {busy === 'uploading' ? 'Uploading files…' : busy === 'sending' ? 'Sending…' : submitLabel}
        </PillButton>
      </div>
    </form>
  )
}
