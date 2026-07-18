import type { EnrichmentProvider } from './provider'
import type { EnrichmentCompany, EnrichmentPerson, EnrichmentResult } from './types'

// Apollo.io enrichment. VERIFIED on the real key:
//  - Organization enrich works on the free key.
//  - People match is gated to PAID plans and returns
//    { error_code: 'API_INACCESSIBLE' } on free — we degrade to person=null.
// Header auth: X-Api-Key. Every fetch is bounded by AbortSignal.timeout so the
// caller (public intake) can never hang.

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
}

interface ApolloPerson {
  title?: string | null
  seniority?: string | null
  linkedin_url?: string | null
}

export class ApolloProvider implements EnrichmentProvider {
  name = 'apollo'

  private get apiKey(): string {
    return process.env.APOLLO_API_KEY ?? ''
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
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ''
  }
}
