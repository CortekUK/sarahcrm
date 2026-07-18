import type { EnrichmentProvider } from './provider'
import { ApolloProvider } from './apollo'
import { StubProvider } from './stub'

export type { EnrichmentProvider } from './provider'
export type { EnrichmentCompany, EnrichmentPerson, EnrichmentResult } from './types'
export { enrichEnquiry } from './enrich'
export { enrichMember } from './enrich-member'

// Returns the configured provider. Apollo when explicitly selected AND keyed;
// otherwise the safe no-op Stub so callers never need to branch.
export function getEnrichmentProvider(): EnrichmentProvider {
  if (process.env.ENRICHMENT_PROVIDER === 'apollo' && process.env.APOLLO_API_KEY) {
    return new ApolloProvider()
  }
  return new StubProvider()
}
