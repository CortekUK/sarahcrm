import type { EnrichmentProvider } from './provider'
import type {
  DecisionMaker,
  EnrichmentCompany,
  EnrichmentPerson,
  EnrichmentResult,
  SearchCriteria,
  SearchResult,
  SponsorCandidate,
} from './types'

// Apollo.io enrichment. VERIFIED on the real key:
//  - Organization enrich works on the free key.
//  - People match is gated to PAID plans and returns
//    { error_code: 'API_INACCESSIBLE' } on free — we degrade to person=null.
// Header auth: X-Api-Key. Every fetch is bounded by AbortSignal.timeout so the
// caller (public intake) can never hang.
//
// Sponsor discovery (searchCompanies / searchPeople) reuses the same fetch +
// timeout + X-Api-Key pattern. People search is a PAID capability: on the free
// key Apollo returns 403 / error_code:'API_INACCESSIBLE', which we surface as
// status:'upgrade_required' rather than an error, so the UI can prompt sensibly.

const APOLLO_BASE = 'https://api.apollo.io/api/v1'
const TIMEOUT_MS = 8000

interface ApolloOrg {
  name?: string | null
  website_url?: string | null
  primary_domain?: string | null
  linkedin_url?: string | null
  industry?: string | null
  estimated_num_employees?: number | null
  annual_revenue?: number | null
  annual_revenue_printed?: string | null
  short_description?: string | null
  seo_description?: string | null
}

interface ApolloPerson {
  title?: string | null
  seniority?: string | null
  linkedin_url?: string | null
}

// Person shape returned by the people-search endpoint (superset of match).
interface ApolloSearchPerson extends ApolloPerson {
  first_name?: string | null
  last_name?: string | null
  email?: string | null
}

export class ApolloProvider implements EnrichmentProvider {
  name = 'apollo'

  capabilities = { searchCompanies: true, searchPeople: true }

  private get apiKey(): string {
    return process.env.APOLLO_API_KEY ?? ''
  }

  private mapOrg(org: ApolloOrg): SponsorCandidate {
    return {
      companyName: org.name ?? '',
      domain: org.primary_domain ?? null,
      website: org.website_url ?? null,
      linkedinUrl: org.linkedin_url ?? null,
      industry: org.industry ?? null,
      employeeCount:
        typeof org.estimated_num_employees === 'number' ? org.estimated_num_employees : null,
      revenuePrinted: org.annual_revenue_printed ?? null,
      description: org.short_description ?? org.seo_description ?? null,
      raw: org,
    }
  }

  async enrich(input: {
    domain: string | null
    firstName?: string
    lastName?: string
  }): Promise<EnrichmentResult> {
    const { domain, firstName, lastName } = input
    let company: EnrichmentCompany | null = null
    let person: EnrichmentPerson | null = null
    let orgRaw: unknown = null
    let personRaw: unknown = null

    if (!domain) return { company: null, person: null, raw: null }

    // ── Organization enrichment (works on free key) ────────────────
    try {
      const res = await fetch(
        `${APOLLO_BASE}/organizations/enrich?domain=${encodeURIComponent(domain)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': this.apiKey,
          },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      )
      if (res.ok) {
        const json = (await res.json()) as { organization?: ApolloOrg | null }
        orgRaw = json
        const org = json.organization
        if (org && (org.primary_domain || org.name)) {
          company = {
            domain: org.primary_domain ?? domain,
            website: org.website_url ?? null,
            linkedinUrl: org.linkedin_url ?? null,
            industry: org.industry ?? null,
            employeeCount:
              typeof org.estimated_num_employees === 'number'
                ? org.estimated_num_employees
                : null,
            revenue: typeof org.annual_revenue === 'number' ? org.annual_revenue : null,
            revenuePrinted: org.annual_revenue_printed ?? null,
            description: org.short_description ?? org.seo_description ?? null,
          }
        }
      } else {
        orgRaw = { status: res.status, error: await safeText(res) }
      }
    } catch (e) {
      orgRaw = { error: e instanceof Error ? e.message : String(e) }
    }

    // ── People match (gated to PAID — degrade gracefully) ──────────
    if (firstName && lastName) {
      try {
        const params = new URLSearchParams({
          first_name: firstName,
          last_name: lastName,
          domain,
        })
        const res = await fetch(`${APOLLO_BASE}/people/match?${params.toString()}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': this.apiKey,
          },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        const json = (await res.json().catch(() => null)) as
          | { person?: ApolloPerson | null; error_code?: string; error?: string }
          | null
        personRaw = json
        // On free plan / any error, json.person is absent — leave person=null.
        if (res.ok && json?.person) {
          const p = json.person
          person = {
            title: p.title ?? null,
            seniority: p.seniority ?? null,
            linkedinUrl: p.linkedin_url ?? null,
          }
        }
      } catch (e) {
        personRaw = { error: e instanceof Error ? e.message : String(e) }
      }
    }

    return { company, person, raw: { organization: orgRaw, person: personRaw } }
  }

  // ── Sponsor company discovery (works on the free key) ──────────
  async searchCompanies(criteria: SearchCriteria): Promise<SearchResult<SponsorCandidate>> {
    try {
      // Build "min,max" employee ranges when a bound is present.
      const employeeRanges: string[] = []
      if (
        typeof criteria.employeeMin === 'number' ||
        typeof criteria.employeeMax === 'number'
      ) {
        const min = criteria.employeeMin ?? 1
        const max = criteria.employeeMax ?? 1000000
        employeeRanges.push(`${min},${max}`)
      }

      const keywordTags = [...(criteria.keywords ?? []), ...(criteria.industries ?? [])]

      const body: Record<string, unknown> = {
        page: 1,
        per_page: criteria.limit ?? 10,
      }
      if (employeeRanges.length) body.organization_num_employees_ranges = employeeRanges
      if (keywordTags.length) {
        body.q_organization_keyword_tags = keywordTags
        body.q_keywords = keywordTags.join(' ')
      }
      if (criteria.locations?.length) body.organization_locations = criteria.locations

      const res = await fetch(`${APOLLO_BASE}/mixed_companies/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })

      if (!res.ok) {
        return { status: 'error', items: [], message: `Apollo ${res.status}: ${await safeText(res)}` }
      }

      const json = (await res.json().catch(() => null)) as
        | { organizations?: ApolloOrg[] | null; accounts?: ApolloOrg[] | null }
        | null
      const orgs = json?.organizations ?? json?.accounts ?? []
      return { status: 'ok', items: orgs.map((o) => this.mapOrg(o)) }
    } catch (e) {
      return { status: 'error', items: [], message: e instanceof Error ? e.message : String(e) }
    }
  }

  // ── Decision-maker discovery (PAID — degrades on the free key) ──
  async searchPeople(
    domain: string,
    roleFilters?: string[],
  ): Promise<SearchResult<DecisionMaker>> {
    try {
      const body = {
        q_organization_domains: [domain],
        person_seniorities: roleFilters?.length
          ? undefined
          : ['owner', 'founder', 'c_suite', 'partner', 'vp', 'head', 'director'],
        person_titles: roleFilters,
        page: 1,
        per_page: 5,
      }

      const res = await fetch(`${APOLLO_BASE}/mixed_people/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })

      const json = (await res.json().catch(() => null)) as
        | { people?: ApolloSearchPerson[] | null; error_code?: string; error?: string }
        | null

      // Free-tier degrade: people search is gated to paid plans.
      if (res.status === 403 || json?.error_code === 'API_INACCESSIBLE') {
        return {
          status: 'upgrade_required',
          items: [],
          message: 'People search needs a paid vendor plan.',
        }
      }
      if (!res.ok) {
        return { status: 'error', items: [], message: `Apollo ${res.status}: ${json?.error ?? ''}` }
      }

      const people = json?.people ?? []
      const items: DecisionMaker[] = people.map((p) => ({
        firstName: p.first_name ?? null,
        lastName: p.last_name ?? null,
        title: p.title ?? null,
        seniority: p.seniority ?? null,
        email: p.email ?? null,
        linkedinUrl: p.linkedin_url ?? null,
        raw: p,
      }))
      return { status: 'ok', items }
    } catch (e) {
      return { status: 'error', items: [], message: e instanceof Error ? e.message : String(e) }
    }
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ''
  }
}
