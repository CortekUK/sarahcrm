import type { EnrichmentProvider } from './provider'
import type {
  DecisionMaker,
  SearchCriteria,
  SearchResult,
  SponsorCandidate,
} from './types'
import { ClayProvider } from './clay'
import { StubProvider } from './stub'

export type { EnrichmentProvider } from './provider'
export type {
  EnrichmentCompany,
  EnrichmentPerson,
  EnrichmentResult,
  SearchCriteria,
  SponsorCandidate,
  DecisionMaker,
  CapabilityStatus,
  SearchResult,
} from './types'
export { enrichEnquiry } from './enrich'
export { enrichMember } from './enrich-member'

// Returns the configured provider. Clay is the platform's enrichment provider:
// it's used whenever CLAY_API_KEY is set. ENRICHMENT_PROVIDER is an optional
// override (defaults to 'clay'); set it to 'stub' (or anything other than
// 'clay') to force the safe no-op Stub, e.g. to pause all Clay usage. Without
// a key we always fall back to the Stub so callers never need to branch.
export function getEnrichmentProvider(): EnrichmentProvider {
  const selected = (process.env.ENRICHMENT_PROVIDER || 'clay').trim().toLowerCase()
  if (selected === 'clay' && process.env.CLAY_API_KEY) {
    return new ClayProvider()
  }
  return new StubProvider()
}

// True only when the provider both advertises the capability AND actually
// implements the method — so callers never invoke a missing function.
export function providerCan(
  p: EnrichmentProvider,
  cap: 'searchCompanies' | 'searchPeople',
): boolean {
  return !!p.capabilities?.[cap] && typeof (p as any)[cap] === 'function'
}

// Safe wrapper: sponsor company discovery. Feature code calls this and never
// touches provider internals or names. Returns a graceful status when the
// active provider can't (unavailable) or blows up (error).
export async function searchSponsorCompanies(
  criteria: SearchCriteria,
): Promise<SearchResult<SponsorCandidate>> {
  const p = getEnrichmentProvider()
  if (!providerCan(p, 'searchCompanies')) {
    return { status: 'unavailable', items: [] }
  }
  try {
    return await p.searchCompanies!(criteria)
  } catch (e) {
    return {
      status: 'error',
      items: [],
      message: e instanceof Error ? e.message : String(e),
    }
  }
}

// Safe wrapper: decision-maker discovery for a company domain. Same contract as
// searchSponsorCompanies.
export async function searchDecisionMakers(
  domain: string,
  roleFilters?: string[],
): Promise<SearchResult<DecisionMaker>> {
  const p = getEnrichmentProvider()
  if (!providerCan(p, 'searchPeople')) {
    return { status: 'unavailable', items: [] }
  }
  try {
    return await p.searchPeople!(domain, roleFilters)
  } catch (e) {
    return {
      status: 'error',
      items: [],
      message: e instanceof Error ? e.message : String(e),
    }
  }
}
