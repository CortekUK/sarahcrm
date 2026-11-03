// The Contacts screen's filters (search box, sector pill, "Emailable only"),
// shared by the list route and bulk actions so "select all N matching" acts on
// exactly the rows the admin sees.

import { SECTOR_KEYS } from './sectors'

export interface ContactListFilter {
  q?: string | null
  sector?: string | null
  subscribed?: boolean | null
}

export function escapeContactSearch(q: string): string {
  return q.replace(/[,()*\\]/g, ' ').trim()
}

// Works on any PostgREST filter builder; typed loosely on purpose — the
// builder's full generic type is too deep for TypeScript to infer here.
interface Filterable {
  eq(column: string, value: unknown): unknown
  or(filters: string): unknown
}

export function applyContactFilters<T>(query: T, f: ContactListFilter): T {
  let out = query as unknown as Filterable
  const sector = f.sector ?? 'all'
  if (sector !== 'all' && SECTOR_KEYS.includes(sector)) out = out.eq('sector', sector) as Filterable
  if (f.subscribed) out = out.eq('email_subscribed', true) as Filterable
  const q = escapeContactSearch(f.q ?? '')
  if (q) {
    out = out.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,company_name.ilike.%${q}%`) as Filterable
  }
  return out as unknown as T
}
