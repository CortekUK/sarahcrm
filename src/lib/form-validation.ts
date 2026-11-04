// Small client-side helpers shared by the admin forms: readable database
// errors, strict money parsing and link / email checks.

// Rules in the database raise errors that start with an upper-case token, e.g.
//   "OFFER_HAS_CLAIMS: members have claimed this offer — switch it off instead of deleting it."
// Strip the token and return the human part (capitalised). Anything without a
// token is returned as-is, or the fallback when there's no message at all.
export function dbErrorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  let msg = ''
  if (typeof err === 'string') msg = err
  else if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message
    if (typeof m === 'string') msg = m
  }
  msg = msg.trim()
  if (!msg) return fallback
  return humaniseDbMessage(msg)
}

// The token that prefixes a database rule error ("OFFER_HAS_CLAIMS"), or null.
export function dbErrorCode(err: unknown): string | null {
  const msg =
    typeof err === 'string'
      ? err
      : err && typeof err === 'object' && 'message' in err && typeof (err as { message?: unknown }).message === 'string'
        ? ((err as { message: string }).message)
        : ''
  const m = /^\s*([A-Z][A-Z0-9_]{2,}):\s/.exec(msg)
  return m ? m[1] : null
}

export function humaniseDbMessage(msg: string): string {
  const m = /^\s*[A-Z][A-Z0-9_]{2,}:\s*(.*)$/s.exec(msg)
  const rest = (m ? m[1] : msg).trim()
  if (!rest) return msg
  return rest.charAt(0).toUpperCase() + rest.slice(1)
}

// Parse a pounds amount typed by an admin into pence.
//   ''            → { pence: null }         (blank is allowed — caller decides)
//   '12.50'/'£1,200' → { pence: 1250 / 120000 }
//   'abc', '1e9', '-5', '1.234' → { error }
export function parsePoundsInput(
  raw: string | number | null | undefined,
  opts: { label?: string; max?: number } = {},
): { pence: number | null; error?: undefined } | { pence?: undefined; error: string } {
  const label = opts.label ?? 'Amount'
  const s = String(raw ?? '').trim().replace(/^£/, '').replace(/,/g, '').trim()
  if (s === '') return { pence: null }
  if (s.startsWith('-')) return { error: `${label} can't be negative.` }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { error: `${label} must be a number in pounds, e.g. 125 or 125.50.` }
  const pence = Math.round(parseFloat(s) * 100)
  const max = opts.max ?? 10_000_000_00 // £10m
  if (pence > max) return { error: `${label} is too large.` }
  return { pence }
}

// Whole, non-negative number (guests, display order …).
export function parseWholeNumberInput(
  raw: string | number | null | undefined,
  opts: { label?: string; min?: number; max?: number } = {},
): { value: number | null; error?: undefined } | { value?: undefined; error: string } {
  const label = opts.label ?? 'Value'
  const s = String(raw ?? '').trim().replace(/,/g, '')
  if (s === '') return { value: null }
  if (s.startsWith('-')) return { error: `${label} can't be negative.` }
  if (!/^\d+$/.test(s)) return { error: `${label} must be a whole number.` }
  const n = parseInt(s, 10)
  if (opts.min != null && n < opts.min) return { error: `${label} must be at least ${opts.min}.` }
  if (opts.max != null && n > opts.max) return { error: `${label} must be at most ${opts.max}.` }
  return { value: n }
}

// http(s) links only — rejects javascript:, ftp:, "not a url".
export function isHttpUrl(value: string | null | undefined): boolean {
  const s = (value ?? '').trim()
  if (!s) return false
  try {
    const u = new URL(s)
    return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname && u.hostname.includes('.')
  } catch {
    return false
  }
}

// Site-relative path ("/memberships") or an http(s) link — for buttons / CTAs.
export function isHttpUrlOrPath(value: string | null | undefined): boolean {
  const s = (value ?? '').trim()
  if (!s) return false
  if (s.startsWith('/') && !s.startsWith('//')) return !/\s/.test(s)
  if (s.startsWith('#')) return true
  return isHttpUrl(s)
}

export function isYouTubeUrl(value: string | null | undefined): boolean {
  if (!isHttpUrl(value)) return false
  const host = new URL((value as string).trim()).hostname.replace(/^www\.|^m\./, '')
  return host === 'youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com'
}

export function isValidEmail(value: string | null | undefined): boolean {
  const s = (value ?? '').trim()
  return /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[a-z]{2,}$/i.test(s)
}

// Lower-case slug: letters, numbers and single hyphens ("summer-party-2026").
export function isValidSlug(value: string | null | undefined): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test((value ?? '').trim())
}
