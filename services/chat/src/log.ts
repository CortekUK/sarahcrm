// Tiny structured logger. Never pass tokens or message bodies in here.
type Fields = Record<string, string | number | boolean | null | undefined>

function fmt(fields?: Fields): string {
  if (!fields) return ''
  return Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ')
}

export const log = {
  info: (event: string, fields?: Fields) => console.log(`[chat] ${event} ${fmt(fields)}`.trimEnd()),
  warn: (event: string, fields?: Fields) => console.warn(`[chat] ${event} ${fmt(fields)}`.trimEnd()),
  error: (event: string, err?: unknown, fields?: Fields) => {
    const msg = err instanceof Error ? err.message : err ? String(err) : ''
    console.error(`[chat] ${event} ${fmt(fields)} ${msg}`.trimEnd())
  },
}
