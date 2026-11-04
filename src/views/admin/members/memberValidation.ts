// Shared field rules for the admin member forms (Add member + Edit member).
// Mirrors the server's 400 checks in /api/admin/members/create so bad data
// is caught in the form with a clear message instead of being saved
// (QA #40: javascript: links, phone "abc", blank names, 5,000-char names).

import { z } from 'zod'

export const NAME_MAX = 100
export const SHORT_MAX = 200
export const URL_MAX = 500
export const LONG_MAX = 5000

export function requiredName(label: string) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(NAME_MAX, `${label} must be ${NAME_MAX} characters or fewer`)
}

export const emailField = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .max(254, 'Email is too long')
  .email('Please enter a valid email address')

export const phoneField = z
  .string()
  .trim()
  .max(30, 'Phone number is too long')
  .refine((v) => v === '' || (/^[0-9+()\s.-]+$/.test(v) && /\d{6,}/.test(v.replace(/\D/g, ''))), {
    message: 'Enter a valid phone number (digits and + ( ) - only)',
  })
  .optional()

function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v)
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.')
  } catch {
    return false
  }
}

// Members type links without a scheme ("acme.co.uk", "linkedin.com/in/x")
// in the portal, which doesn't validate them — add https:// rather than
// refusing an admin save over a value that's otherwise fine.
function withScheme(v: string): string {
  return v !== '' && !/^[a-z][a-z0-9+.-]*:/i.test(v) && /^[^\s/]+\.[^\s]+$/.test(v) ? `https://${v}` : v
}

/** Optional http(s) link. Rejects javascript:, data:, bare words. */
export const urlField = z
  .string()
  .trim()
  .max(URL_MAX, `Link must be ${URL_MAX} characters or fewer`)
  .transform(withScheme)
  .refine((v) => v === '' || isHttpUrl(v), {
    message: 'Enter a full link starting with https://',
  })
  .optional()

export const linkedinField = z
  .string()
  .trim()
  .max(URL_MAX, `Link must be ${URL_MAX} characters or fewer`)
  .transform(withScheme)
  .refine(
    (v) => {
      if (v === '') return true
      if (!isHttpUrl(v)) return false
      const host = new URL(v).hostname.toLowerCase()
      return host === 'linkedin.com' || host.endsWith('.linkedin.com')
    },
    { message: 'Enter a LinkedIn link, e.g. https://www.linkedin.com/in/name' },
  )
  .optional()

export const shortText = z
  .string()
  .max(SHORT_MAX, `Keep this under ${SHORT_MAX} characters`)
  .optional()

export const longText = z
  .string()
  .max(LONG_MAX, `Keep this under ${LONG_MAX.toLocaleString('en-GB')} characters`)
  .optional()

/** Read an API response body without throwing on an empty / non-JSON reply. */
export async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const j = await res.json()
    return j && typeof j === 'object' ? (j as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** The server's message for a failed admin-members call (400/409 are written for the admin). */
export function apiErrorText(res: Response, json: Record<string, unknown>, fallback: string): string {
  if (typeof json.error === 'string' && json.error.trim()) return json.error
  if (res.status === 409) return 'An account with this email already exists.'
  if (res.status === 401 || res.status === 403) return 'Your session has expired — sign in again.'
  return `${fallback} (HTTP ${res.status}).`
}
