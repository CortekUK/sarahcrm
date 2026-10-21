// Opaque keyset cursors: base64url of `${key}|${id}`. `key` is a timestamp
// (messages, conversations, reports) or a sort name (people). Split on the
// LAST '|' because ids never contain one but names might.
import { badRequest } from './errors.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface Cursor {
  key: string | null
  id: string
}

export function encodeCursor(key: string | null, id: string): string {
  return Buffer.from(`${key ?? ''}|${id}`, 'utf8').toString('base64url')
}

export function decodeCursor(raw: string | undefined | null): Cursor | null {
  if (!raw) return null
  let text: string
  try {
    text = Buffer.from(raw, 'base64url').toString('utf8')
  } catch {
    throw badRequest('invalid cursor')
  }
  const at = text.lastIndexOf('|')
  if (at < 0) throw badRequest('invalid cursor')
  const key = text.slice(0, at)
  const id = text.slice(at + 1)
  if (!UUID_RE.test(id)) throw badRequest('invalid cursor')
  return { key: key === '' ? null : key, id }
}

/** Cursor whose key must be a timestamp (or null for "nulls last" tails). */
export function decodeTimeCursor(raw: string | undefined | null): Cursor | null {
  const c = decodeCursor(raw)
  if (c && c.key !== null && Number.isNaN(Date.parse(c.key))) throw badRequest('invalid cursor')
  return c
}

export function clampLimit(raw: unknown, def: number, max: number): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : typeof raw === 'number' ? raw : NaN
  if (!Number.isFinite(n) || n < 1) return def
  return Math.min(Math.floor(n), max)
}

export const isUuid = (s: unknown): s is string => typeof s === 'string' && UUID_RE.test(s)
