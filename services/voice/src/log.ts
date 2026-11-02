// Tiny structured logger. Never pass tokens, phone numbers in full, or what
// the caller said in here — transcripts live in the database, not the logs.
type Fields = Record<string, string | number | boolean | null | undefined>

function fmt(fields?: Fields): string {
  if (!fields) return ''
  return Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ')
}

export const log = {
  info: (event: string, fields?: Fields) => console.log(`[voice] ${event} ${fmt(fields)}`.trimEnd()),
  warn: (event: string, fields?: Fields) => console.warn(`[voice] ${event} ${fmt(fields)}`.trimEnd()),
  error: (event: string, err?: unknown, fields?: Fields) => {
    const msg = err instanceof Error ? err.message : err ? String(err) : ''
    console.error(`[voice] ${event} ${fmt(fields)} ${msg}`.trimEnd())
  },
}

/** "+447915919880" → "+44…880" for logs. */
export function maskPhone(p: string | null | undefined): string {
  if (!p) return '-'
  return p.length > 6 ? `${p.slice(0, 3)}…${p.slice(-3)}` : '…'
}
