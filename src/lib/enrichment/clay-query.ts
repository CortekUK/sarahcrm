// Clay search query builder — turns our provider-agnostic inputs into Clay
// query-language strings (`select from companies|people where ... limit N`).
//
// SAFETY: every user / AI / CRM-supplied string goes through quote() before it
// is interpolated. Clay strings are double-quoted with NO escape syntax
// (STRING = '"' [^"]* '"'), so double quotes and backslashes are stripped
// rather than escaped — a stray quote in a member's sector or an event brief
// can never break out of the literal or inject extra predicates.
//
// Enum fields (industry, company_size, annual_revenue, country_name,
// seniority) only accept the exact values in ./clay-constants.ts. Free text is
// matched onto those lists case-insensitively and anything unmatched is
// DROPPED, because one unknown enum value fails the whole search.
//
// Pure functions only — no network. ./clay.ts runs the queries.

import {
  CLAY_COMPANY_SIZE_BUCKETS,
  CLAY_COUNTRIES,
  CLAY_INDUSTRIES,
  CLAY_LEADERSHIP_SENIORITIES,
  CLAY_REVENUE_BUCKETS,
} from './clay-constants'
import type { SearchCriteria } from './types'

const MAX_STRING_LEN = 200
const MAX_LIST_VALUES = 25

// ── Quoting ───────────────────────────────────────────────────────────────

// Make a value safe to place inside a Clay string literal: drop double quotes,
// backslashes and control characters, collapse whitespace, cap the length.
export function sanitizeValue(value: string): string {
  const printable = Array.from(value)
    .map((ch) => {
      const code = ch.charCodeAt(0)
      return code < 32 || code === 127 ? ' ' : ch
    })
    .join('')
  return printable
    .replace(/["\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_STRING_LEN)
}

// A quoted Clay string literal ("...").
export function quote(value: string): string {
  return `"${sanitizeValue(value)}"`
}

// A Clay value list ("a", "b"). Sanitises, drops empties and case-insensitive
// duplicates (Clay text matching is case-insensitive), caps the list size.
export function quoteList(values: readonly string[]): string {
  return `(${uniqueClean(values).map((v) => `"${v}"`).join(', ')})`
}

function uniqueClean(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of values) {
    if (typeof raw !== 'string') continue
    const v = sanitizeValue(raw)
    const key = v.toLowerCase()
    if (!v || seen.has(key)) continue
    seen.add(key)
    out.push(v)
    if (out.length >= MAX_LIST_VALUES) break
  }
  return out
}

// ── Domain normalisation ──────────────────────────────────────────────────

// Bare, lowercased host ("https://www.Acme.co.uk/about" → "acme.co.uk"), or
// null if it doesn't look like a domain. Only a valid domain is ever sent.
export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null
  const host = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0]
    .trim()
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(host) ? host : null
}

// ── Enum matching ─────────────────────────────────────────────────────────

// Comparison key: lowercase, "&" → "and", collapse whitespace. This lets older
// CRM values such as "apparel & fashion" match Clay's "Apparel and Fashion".
function enumKey(value: string): string {
  return value.toLowerCase().replace(/&/g, ' and ').replace(/\s+/g, ' ').trim()
}

const INDUSTRY_BY_KEY = new Map(CLAY_INDUSTRIES.map((v) => [enumKey(v), v]))
const COUNTRY_BY_KEY = new Map(CLAY_COUNTRIES.map((v) => [enumKey(v), v]))

// Common shorthand → Clay's canonical country_name. The UK home nations map to
// "United Kingdom" (Clay has no separate England/Scotland/Wales value).
const COUNTRY_ALIASES: Record<string, string> = {
  uk: 'United Kingdom',
  'u.k.': 'United Kingdom',
  gb: 'United Kingdom',
  'great britain': 'United Kingdom',
  britain: 'United Kingdom',
  england: 'United Kingdom',
  scotland: 'United Kingdom',
  wales: 'United Kingdom',
  'northern ireland': 'United Kingdom',
  us: 'United States',
  usa: 'United States',
  'u.s.': 'United States',
  'u.s.a.': 'United States',
  'united states of america': 'United States',
  america: 'United States',
  uae: 'United Arab Emirates',
}

// Free-text industries → exact Clay industry values; unknowns dropped.
export function matchIndustries(values: readonly string[] | undefined): string[] {
  const out = new Set<string>()
  for (const v of values ?? []) {
    if (typeof v !== 'string') continue
    const hit = INDUSTRY_BY_KEY.get(enumKey(v))
    if (hit) out.add(hit)
  }
  return Array.from(out)
}

// Split free-text locations into Clay HQ countries vs cities. A value that is a
// known country (or alias) is a country; anything else is treated as a city,
// using the part before any comma ("London, UK" → city "London").
export function splitLocations(values: readonly string[] | undefined): {
  countries: string[]
  cities: string[]
} {
  const countries = new Set<string>()
  const cities = new Set<string>()
  for (const v of values ?? []) {
    if (typeof v !== 'string') continue
    const key = enumKey(v)
    if (!key) continue
    const country = COUNTRY_BY_KEY.get(key) ?? COUNTRY_ALIASES[key]
    if (country) {
      countries.add(country)
      continue
    }
    const city = sanitizeValue(v.split(',')[0] ?? '')
    if (city) cities.add(city)
  }
  return { countries: Array.from(countries), cities: Array.from(cities) }
}

// Every company_size bucket overlapping [min, max] (either bound optional).
export function sizeBucketsFor(min?: number, max?: number): string[] {
  const lo = typeof min === 'number' && Number.isFinite(min) ? min : null
  const hi = typeof max === 'number' && Number.isFinite(max) ? max : null
  if (lo === null && hi === null) return []
  return CLAY_COMPANY_SIZE_BUCKETS.filter(
    (b) => (lo === null || b.max >= lo) && (hi === null || b.min <= hi),
  ).map((b) => b.value)
}

// Every annual_revenue bucket that can contain revenue >= min (USD). The bucket
// holding the boundary is included, so the filter widens to the nearest bucket.
export function revenueBucketsFor(min?: number): string[] {
  if (typeof min !== 'number' || !Number.isFinite(min) || min <= 0) return []
  return CLAY_REVENUE_BUCKETS.filter((b) => b.max > min).map((b) => b.value)
}

// ── Query builders ────────────────────────────────────────────────────────

function clampLimit(limit: number | undefined, fallback: number, cap: number): number {
  const n = typeof limit === 'number' && Number.isFinite(limit) ? Math.floor(limit) : fallback
  return Math.min(cap, Math.max(1, n))
}

// One company by its exact domain (enrichment).
export function companyByDomainQuery(domain: string): string {
  return `select from companies where clay.include_company_identifiers(${quoteList([domain])}) limit 1`
}

// One named person currently at a company (enrichment). Clay has no
// first_name / last_name filter fields — full_name contains is the only option.
export function personAtCompanyQuery(domain: string, fullName: string): string {
  return (
    `select from people where clay.filter_to_companies(${quoteList([domain])})` +
    ` and full_name contains ${quote(fullName)} limit 1`
  )
}

// Decision makers currently at a company. With role filters, match the current
// job title against them (Clay expands synonyms); without, restrict to the
// leadership seniorities. Both live in ONE experiences.any(...) so they apply
// to the same (current) role.
export function decisionMakersQuery(
  domain: string,
  roleFilters: readonly string[] | undefined,
  limit = 10,
): string {
  const roles = uniqueClean(roleFilters ?? [])
  const roleCondition = roles.length
    ? `job_title is_similar_to ${quoteList(roles)}`
    : `seniority in ${quoteList(CLAY_LEADERSHIP_SENIORITIES)}`
  return (
    `select from people where clay.filter_to_companies(${quoteList([domain])})` +
    ` and experiences.any(is_current = true and ${roleCondition})` +
    ` limit ${clampLimit(limit, 10, 25)}`
  )
}

export const COMPANY_SEARCH_DEFAULT_LIMIT = 10
export const COMPANY_SEARCH_MAX_LIMIT = 25

// Sponsor discovery: SearchCriteria → companies query (+ the row limit it
// asks for), or null when nothing usable survives sanitising (we never run an
// unfiltered, quota-burning search).
//   industries   → industry in (...)              (enum; unknowns dropped)
//   keywords     → description contains (...)    (OR'd whole-word phrases) —
//                  FALLBACK ONLY: used when no industry survives matching.
//                  Callers pass generic brief words ("dinner", "evening");
//                  ANDing those with an industry filter would shrink the
//                  result to almost nothing, so a matched industry wins.
//   locations    → HQ country_name / city        (see splitLocations)
//   employeeMin/Max → company_size in (...)      (overlapping buckets)
//   revenueMin   → annual_revenue in (...)       (covering buckets)
export function companySearchQuery(
  criteria: SearchCriteria,
): { query: string; limit: number } | null {
  const predicates: string[] = []

  const industries = matchIndustries(criteria.industries)
  if (industries.length) predicates.push(`industry in ${quoteList(industries)}`)

  // Keywords only as a fallback vertical signal when no industry matched.
  if (!industries.length) {
    const keywords = uniqueClean(criteria.keywords ?? [])
    if (keywords.length) predicates.push(`description contains ${quoteList(keywords)}`)
  }

  const { countries, cities } = splitLocations(criteria.locations)
  const countryPred = countries.length
    ? `locations.any(is_headquarters = true and country_name in ${quoteList(countries)})`
    : null
  const cityPred = cities.length
    ? `locations.any(is_headquarters = true and city in ${quoteList(cities)})`
    : null
  // Each location is an alternative: HQ in any listed country OR any listed city.
  if (countryPred && cityPred) predicates.push(`(${countryPred} or ${cityPred})`)
  else if (countryPred) predicates.push(countryPred)
  else if (cityPred) predicates.push(cityPred)

  const sizes = sizeBucketsFor(criteria.employeeMin, criteria.employeeMax)
  // Every bucket selected = no real constraint; skip it rather than send noise.
  if (sizes.length && sizes.length < CLAY_COMPANY_SIZE_BUCKETS.length) {
    predicates.push(`company_size in ${quoteList(sizes)}`)
  }

  const revenues = revenueBucketsFor(criteria.revenueMin)
  if (revenues.length && revenues.length < CLAY_REVENUE_BUCKETS.length) {
    predicates.push(`annual_revenue in ${quoteList(revenues)}`)
  }

  if (!predicates.length) return null
  const limit = clampLimit(criteria.limit, COMPANY_SEARCH_DEFAULT_LIMIT, COMPANY_SEARCH_MAX_LIMIT)
  return { query: `select from companies where ${predicates.join(' and ')} limit ${limit}`, limit }
}
