import { CATEGORY_SUGGESTIONS, type SopRow } from '@/lib/sops'

// SOP categories are free text, so "General" and "general " must count as one
// group. Compare case-insensitively (trimmed, inner spaces collapsed) and show
// one canonical spelling: the suggested spelling if it is one, otherwise the
// first spelling seen.
export function categoryKey(raw: string | null | undefined): string {
  return (raw ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function buildCategoryCanon(names: (string | null | undefined)[]): Map<string, string> {
  const canon = new Map<string, string>()
  for (const s of CATEGORY_SUGGESTIONS as readonly string[]) canon.set(categoryKey(s), s)
  for (const n of names) {
    const tidy = (n ?? '').trim().replace(/\s+/g, ' ')
    if (!tidy) continue
    const k = categoryKey(tidy)
    if (!canon.has(k)) canon.set(k, tidy)
  }
  return canon
}

// Rewrite each row's category to its canonical spelling (display only).
export function normaliseSopCategories<T extends Pick<SopRow, 'category'>>(rows: T[]): T[] {
  const canon = buildCategoryCanon(rows.map((r) => r.category))
  return rows.map((r) => {
    const k = categoryKey(r.category)
    return { ...r, category: k ? (canon.get(k) ?? r.category) : 'General' }
  })
}
