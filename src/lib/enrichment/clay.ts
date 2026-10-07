// ClayProvider — lead enrichment + sponsor discovery via Clay's Public Search
// API (synchronous; see ./clay-client.ts for the HTTP side and
// ./clay-query.ts for how queries are built).
//
// What Clay's search gives us, and the honest gaps:
//   - Companies: name, domain, industry, LinkedIn, description, and BUCKETED
//     size ("10,001+") / revenue ("1B-10B"). No website URL — we derive
//     https://<domain>. employeeCount = the bucket's lower bound; revenue
//     (exact USD) stays null and revenuePrinted carries the bucket string.
//   - People: name, LinkedIn, location and the matched (current) experience.
//     NO email and NO seniority field — email is always null and seniority is
//     derived from the job title (seniorityFromTitle below), else null.
//
// Contract (provider.ts: never throw on not-found / gated responses):
//   - enrich(): a genuine zero-row company result — including Clay's 400 "No
//     matching companies found" for an unknown domain, which clay-client
//     turns into zero rows — resolves with company:null (→ 'not_found'), and
//     the person search is then skipped (no company = nothing to attach a
//     person to, so it would only spend quota). If the COMPANY search itself
//     FAILS (quota exhausted, HTTP error, timeout) it THROWS an Error carrying
//     only a safe message (HTTP status + Clay's message — never the request
//     config or key). enrichEnquiry / enrichMember catch it and record
//     enrichment_status='failed', so a failure never masquerades as
//     "not found". A failed PERSON search after a good company search does
//     not throw: the company data is kept and the failure noted in `raw`.
//   - Search methods never throw; they resolve with a status (an unknown
//     domain in searchPeople is 'ok' with zero people):
//     402 quota exhausted → 'upgrade_required', other failures → 'error',
//     criteria with nothing usable → 'unavailable' (no unfiltered search).
//
// Every call spends Clay search quota, so enrichment is MANUAL only (admin
// Enrich buttons) — nothing calls this automatically.

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
import { runSearch, type ClaySearchOutcome } from './clay-client'
import {
  companyByDomainQuery,
  companySearchQuery,
  decisionMakersQuery,
  normalizeDomain,
  personAtCompanyQuery,
} from './clay-query'

// ── Clay result rows (only the fields we read; everything is kept in raw) ──

interface ClayCompanyRow {
  clay_company_id?: number | null
  name?: string | null
  size?: string | null
  type?: string | null
  domain?: string | null
  country?: string | null
  industry?: string | null
  location?: string | null
  description?: string | null
  linkedin_url?: string | null
  annual_revenue?: string | null
}

interface ClayExperience {
  company?: string | null
  title?: string | null
  location?: string | null
  start_date?: string | null
  end_date?: string | null
}

interface ClayPersonRow {
  clay_profile_id?: number | null
  name?: string | null
  first_name?: string | null
  last_name?: string | null
  linkedin_url?: string | null
  location?: { name?: string | null } | null
  matched_experiences?: ClayExperience[] | null
}

const DECISION_MAKER_LIMIT = 10

// Whole-enrich() time budget (company search + person search). The enrich
// routes run with maxDuration = 60, so the person search only gets what the
// company search left of this (each runSearch is itself capped at 50s).
const ENRICH_BUDGET_MS = 55_000

// ── Mapping helpers ───────────────────────────────────────────────────────

// Lower bound of a size bucket as a number: "10,001+" → 10001, "51-200" → 51.
function sizeLowerBound(size: string | null | undefined): number | null {
  if (!size) return null
  const m = size.replace(/,/g, '').match(/\d+/)
  const n = m ? parseInt(m[0], 10) : NaN
  return Number.isFinite(n) ? n : null
}

function websiteFor(domain: string | null | undefined): string | null {
  return domain ? `https://${domain}` : null
}

// The role we report for a person: the current matched experience (empty
// end_date) if any, else the first one Clay matched.
function currentExperience(p: ClayPersonRow): ClayExperience | null {
  const exps = Array.isArray(p.matched_experiences) ? p.matched_experiences : []
  return exps.find((e) => !e.end_date) ?? exps[0] ?? null
}

// Clay people rows carry no seniority, so derive one from the job title using
// Clay's own seniority vocabulary. Checked in order — the first match wins:
//   founder / co-founder              → Founder
//   owner                             → Owner
//   board member / chair / trustee / non-executive → Board Member
//   managing director                 → C-suite  (UK usage: the company head)
//   vp / svp / evp / vice president   → VP       (before "president")
//   chief / ceo / cfo / coo / cto / cmo / cio / cro / cpo / president → C-suite
//   partner (not "partnerships")      → Partner
//   director                          → Director
//   head (of …)                       → Head
//   manager                           → Manager
// Anything else → null (we don't guess).
const SENIORITY_RULES: [RegExp, string][] = [
  [/\b(co-?founder|founder)\b/i, 'Founder'],
  [/\bowner\b/i, 'Owner'],
  [/\b(board member|chairman|chairwoman|chairperson|chair|trustee|non-executive)\b/i, 'Board Member'],
  [/\bmanaging director\b/i, 'C-suite'],
  [/\b(vp|svp|evp|vice president)\b/i, 'VP'],
  [/\b(chief|ceo|cfo|coo|cto|cmo|cio|cro|cpo|president)\b/i, 'C-suite'],
  [/\bpartner\b/i, 'Partner'],
  [/\bdirector\b/i, 'Director'],
  [/\bhead\b/i, 'Head'],
  [/\bmanager\b/i, 'Manager'],
]

export function seniorityFromTitle(title: string | null | undefined): string | null {
  if (!title) return null
  for (const [re, label] of SENIORITY_RULES) if (re.test(title)) return label
  return null
}

function splitName(p: ClayPersonRow): { firstName: string | null; lastName: string | null } {
  if (p.first_name || p.last_name) {
    return { firstName: p.first_name || null, lastName: p.last_name || null }
  }
  const parts = (p.name ?? '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return { firstName: null, lastName: null }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') || null }
}

// A failed person search, for `raw` (status + message only — no request config).
function failureNote(o: ClaySearchOutcome<unknown>): unknown {
  return o.ok ? null : { error: o.message, status: o.httpStatus, kind: o.kind }
}

export class ClayProvider implements EnrichmentProvider {
  name = 'clay'

  capabilities = { searchCompanies: true, searchPeople: true }

  private mapCompany(row: ClayCompanyRow): SponsorCandidate {
    const domain = normalizeDomain(row.domain)
    return {
      companyName: row.name ?? '',
      domain,
      website: websiteFor(domain),
      linkedinUrl: row.linkedin_url ?? null,
      industry: row.industry ?? null,
      employeeCount: sizeLowerBound(row.size),
      revenuePrinted: row.annual_revenue ?? null,
      description: row.description ?? null,
      raw: row,
    }
  }

  private mapPerson(row: ClayPersonRow): DecisionMaker {
    const { firstName, lastName } = splitName(row)
    const title = currentExperience(row)?.title || null
    return {
      firstName,
      lastName,
      title,
      seniority: seniorityFromTitle(title),
      email: null, // Clay search never returns emails
      linkedinUrl: row.linkedin_url ?? null,
      raw: row,
    }
  }

  async enrich(input: {
    domain: string | null
    firstName?: string
    lastName?: string
  }): Promise<EnrichmentResult> {
    const domain = normalizeDomain(input.domain)
    if (!domain) return { company: null, person: null, raw: null }

    let company: EnrichmentCompany | null = null
    let person: EnrichmentPerson | null = null
    let personRaw: unknown = null

    const startedAt = Date.now()

    // ── Company by exact domain ─────────────────────────────────────
    // A failed search (not an empty one) throws — see the contract above.
    // co.message is built from status + Clay's message only, so it's safe.
    const co = await runSearch<ClayCompanyRow>(companyByDomainQuery(domain), 1)
    if (!co.ok) throw new Error(co.message)
    const companyRow = co.rows[0] ?? null
    if (companyRow && (companyRow.domain || companyRow.name)) {
      const rowDomain = normalizeDomain(companyRow.domain) ?? domain
      company = {
        domain: rowDomain,
        website: websiteFor(rowDomain),
        linkedinUrl: companyRow.linkedin_url ?? null,
        industry: companyRow.industry ?? null,
        employeeCount: sizeLowerBound(companyRow.size),
        revenue: null, // Clay only exposes a revenue bucket, not a figure
        revenuePrinted: companyRow.annual_revenue ?? null,
        description: companyRow.description ?? null,
      }
    }

    // ── Named person at the company (only with a full name) ─────────
    // Only when the company was found (the status would be 'not_found'
    // regardless, so a person search would just spend quota). Best-effort: a
    // failure here keeps the company data and is noted in raw.
    const first = input.firstName?.trim()
    const last = input.lastName?.trim()
    if (company && first && last) {
      const pe = await runSearch<ClayPersonRow>(
        personAtCompanyQuery(domain, `${first} ${last}`),
        1,
        ENRICH_BUDGET_MS - (Date.now() - startedAt),
      )
      if (pe.ok) {
        const personRow = pe.rows[0] ?? null
        personRaw = personRow
        if (personRow) {
          const title = currentExperience(personRow)?.title || null
          person = {
            title,
            seniority: seniorityFromTitle(title),
            linkedinUrl: personRow.linkedin_url ?? null,
          }
        }
      } else {
        personRaw = failureNote(pe)
      }
    }

    return { company, person, raw: { company: companyRow, person: personRaw } }
  }

  // ── Sponsor company discovery ────────────────────────────────────
  async searchCompanies(criteria: SearchCriteria): Promise<SearchResult<SponsorCandidate>> {
    const built = companySearchQuery(criteria)
    if (!built) {
      return {
        status: 'unavailable',
        items: [],
        message:
          'No usable search criteria (industries, keywords, locations, size or revenue) — skipped to avoid an unfiltered Clay search.',
      }
    }
    const res = await runSearch<ClayCompanyRow>(built.query, built.limit)
    if (!res.ok) {
      return {
        status: res.kind === 'quota_exhausted' ? 'upgrade_required' : 'error',
        items: [],
        message: res.message,
      }
    }
    return { status: 'ok', items: res.rows.map((r) => this.mapCompany(r)) }
  }

  // ── Decision-maker discovery ─────────────────────────────────────
  async searchPeople(
    domain: string,
    roleFilters?: string[],
  ): Promise<SearchResult<DecisionMaker>> {
    const clean = normalizeDomain(domain)
    if (!clean) {
      return { status: 'error', items: [], message: `Not a valid company domain: ${domain}` }
    }
    const res = await runSearch<ClayPersonRow>(
      decisionMakersQuery(clean, roleFilters, DECISION_MAKER_LIMIT),
      DECISION_MAKER_LIMIT,
    )
    if (!res.ok) {
      return {
        status: res.kind === 'quota_exhausted' ? 'upgrade_required' : 'error',
        items: [],
        message: res.message,
      }
    }
    return { status: 'ok', items: res.rows.map((r) => this.mapPerson(r)) }
  }
}
