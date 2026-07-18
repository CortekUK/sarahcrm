// Provider-agnostic enrichment shapes. Apollo is one implementation; Clay /
// Clearbit could map onto the same shapes later with zero downstream change.

export interface EnrichmentCompany {
  domain: string | null
  website: string | null
  linkedinUrl: string | null
  industry: string | null
  employeeCount: number | null
  revenue: number | null // whole USD units (Apollo `annual_revenue`)
  revenuePrinted: string | null // e.g. "6.9B"
  description: string | null // company blurb (Apollo `short_description`)
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
