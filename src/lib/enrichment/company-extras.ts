// Extra company facts read out of a row's stored `enrichment_raw` — fields the
// provider returns that have no dedicated column (description, headquarters,
// company type, total funding). Browser-safe: no server imports, so the
// enquiry / member enrichment panels can call it directly.
//
// Raw shapes differ by provider, so this is defensive throughout — every field
// is optional and a missing / malformed value just yields null (never throws):
//   - 'clay'   → raw = { company: <Clay company row>, person: … }
//                (see ClayProvider.enrich). All four fields.
//   - 'apollo' → historical rows: raw = { organization: { organization: {…} } }.
//                Only a description is available (short_/seo_description).
//   - anything else → nothing.

import { formatUsdCompact } from './format-usd'

export interface CompanyExtras {
  description: string | null
  headquarters: string | null // e.g. "South San Francisco, California · United States"
  companyType: string | null // e.g. "Privately Held"
  totalFunding: string | null // compact USD, e.g. "$705M"
}

const EMPTY: CompanyExtras = {
  description: null,
  headquarters: null,
  companyType: null,
  totalFunding: null,
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

export function companyExtrasFromRaw(raw: unknown, source: string | null | undefined): CompanyExtras {
  const root = obj(raw)
  if (!root) return EMPTY
  const provider = source?.trim().toLowerCase()

  if (provider === 'clay') {
    const c = obj(root.company)
    if (!c) return EMPTY
    const location = str(c.location)
    const country = str(c.country)
    return {
      description: str(c.description),
      headquarters: [location, country].filter(Boolean).join(' · ') || null,
      companyType: str(c.type),
      // 0 / missing funding = nothing to show.
      totalFunding:
        Number(c.total_funding_amount_range_usd) > 0
          ? formatUsdCompact(c.total_funding_amount_range_usd)
          : null,
    }
  }

  if (provider === 'apollo') {
    const org = obj(obj(root.organization)?.organization)
    return { ...EMPTY, description: str(org?.short_description) ?? str(org?.seo_description) }
  }

  return EMPTY
}
