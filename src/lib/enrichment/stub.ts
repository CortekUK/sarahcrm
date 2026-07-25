import type { EnrichmentProvider } from './provider'
import type { DecisionMaker, EnrichmentResult, SearchResult, SponsorCandidate } from './types'

// No-op provider used when no real provider/key is configured, so the whole
// enrichment path scaffolds and runs safely regardless of environment. It
// advertises no discovery capabilities; the search methods return 'unavailable'.
export class StubProvider implements EnrichmentProvider {
  name = 'stub'

  capabilities = { searchCompanies: false, searchPeople: false }

  async enrich(): Promise<EnrichmentResult> {
    return { company: null, person: null, raw: null }
  }

  async searchCompanies(): Promise<SearchResult<SponsorCandidate>> {
    return { status: 'unavailable' as const, items: [] }
  }

  async searchPeople(): Promise<SearchResult<DecisionMaker>> {
    return { status: 'unavailable' as const, items: [] }
  }
}
