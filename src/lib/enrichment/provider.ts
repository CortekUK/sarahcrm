import type { EnrichmentResult } from './types'

// A single, swappable enrichment provider. Implementations must never throw
// on a "not found" / gated response — they resolve with null fields instead.
export interface EnrichmentProvider {
  name: string
  enrich(input: {
    domain: string | null
    firstName?: string
    lastName?: string
  }): Promise<EnrichmentResult>
}
