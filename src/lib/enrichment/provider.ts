import type {
  DecisionMaker,
  EnrichmentResult,
  SearchCriteria,
  SearchResult,
  SponsorCandidate,
} from './types'

// A single, swappable enrichment provider. Implementations must never throw
// on a "not found" / gated response — they resolve with null fields instead.
//
// `enrich` is the original required capability. Sponsor discovery adds two
// OPTIONAL capabilities (searchCompanies / searchPeople): a provider advertises
// what it supports via `capabilities`, and callers must go through the safe
// wrappers in ./index.ts (never touch these methods directly).
export interface EnrichmentProvider {
  name: string
  enrich(input: {
    domain: string | null
    firstName?: string
    lastName?: string
  }): Promise<EnrichmentResult>

  // Optional, additive discovery capabilities.
  capabilities?: {
    searchCompanies: boolean
    searchPeople: boolean
  }
  searchCompanies?(criteria: SearchCriteria): Promise<SearchResult<SponsorCandidate>>
  searchPeople?(
    companyDomain: string,
    roleFilters?: string[],
  ): Promise<SearchResult<DecisionMaker>>
}
