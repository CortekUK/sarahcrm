// Provider-agnostic enrichment shapes. Clay (./clay.ts) is the live
// implementation; any other vendor could map onto the same shapes later with
// zero downstream change.

export interface EnrichmentCompany {
  domain: string | null
  website: string | null
  linkedinUrl: string | null
  industry: string | null
  employeeCount: number | null
  revenue: number | null // whole USD units, when the provider gives a figure (Clay: null — bucket only)
  revenuePrinted: string | null // display string, e.g. a Clay bucket "1B-10B"
  description: string | null // company blurb
}

export interface EnrichmentPerson {
  title: string | null
  seniority: string | null
  linkedinUrl: string | null
}

export interface EnrichmentResult {
  company: EnrichmentCompany | null
  person: EnrichmentPerson | null
  raw: unknown
}

// ── Sponsor discovery (additive) ─────────────────────────────────────────
// The sponsorship feature searches for candidate companies and their decision
// makers. These shapes are provider-agnostic too: Clay maps onto them today,
// another vendor could later with no downstream change.

export interface SearchCriteria {
  industries?: string[]
  keywords?: string[]
  employeeMin?: number
  employeeMax?: number
  revenueMin?: number // whole USD
  locations?: string[]
  limit?: number
}

export interface SponsorCandidate {
  companyName: string
  domain: string | null
  website: string | null
  linkedinUrl: string | null
  industry: string | null
  employeeCount: number | null
  revenuePrinted: string | null
  description: string | null
  raw: unknown
}

export interface DecisionMaker {
  firstName: string | null
  lastName: string | null
  title: string | null
  seniority: string | null
  email: string | null
  linkedinUrl: string | null
  raw: unknown
}

// Whether a capability ran, is not offered, needs a paid plan, or errored.
export type CapabilityStatus = 'ok' | 'unavailable' | 'upgrade_required' | 'error'

export interface SearchResult<T> {
  status: CapabilityStatus
  items: T[]
  message?: string
}
