// ClayProvider — documented STUB (modelled on marketing/publish/metricool.ts).
//
// This is the drop-in slot for Clay-powered enrichment + sponsor discovery.
// To wire Clay, nothing else in the app changes — just:
//   1. Implement the three methods below (enrich / searchCompanies /
//      searchPeople) against the Clay API, mapping results onto the shared
//      EnrichmentResult / SponsorCandidate / DecisionMaker shapes.
//   2. Set ENRICHMENT_PROVIDER=clay and CLAY_API_KEY in the environment.
// getEnrichmentProvider() already routes to this provider once both are set,
// and all feature code goes through the safe wrappers in ./index.ts.
//
// Until then: search methods return a graceful status:'error' (never throw, so
// the wrappers stay honest), and enrich() throws NotImplemented so it can never
// silently no-op or fake a result.

import type { EnrichmentProvider } from './provider'
import type {
  DecisionMaker,
  EnrichmentResult,
  SearchCriteria,
  SearchResult,
  SponsorCandidate,
} from './types'

export class ClayProvider implements EnrichmentProvider {
  name = 'clay'

  capabilities = { searchCompanies: true, searchPeople: true }

  async enrich(): Promise<EnrichmentResult> {
    throw new Error('ClayProvider not implemented yet — see 20260801 plan')
  }

  async searchCompanies(_criteria: SearchCriteria): Promise<SearchResult<SponsorCandidate>> {
    return { status: 'error', items: [], message: 'Clay not wired yet' }
  }

  async searchPeople(
    _domain: string,
    _roleFilters?: string[],
  ): Promise<SearchResult<DecisionMaker>> {
    return { status: 'error', items: [], message: 'Clay not wired yet' }
  }
}
