import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getEnrichmentProvider } from './index'

type Db = SupabaseClient<Database>

// Free/personal email providers — an address here gives us no business domain,
// so there's nothing to enrich against. Mirrors the set used in enrich.ts.
const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'yahoo.com',
  'yahoo.co.uk',
  'icloud.com',
  'me.com',
  'aol.com',
  'protonmail.com',
  'proton.me',
  'gmx.com',
  'msn.com',
])

// Parse a bare host from a website URL: strip protocol, www., and any path.
function domainFromWebsite(website: string | null | undefined): string | null {
  if (!website) return null
  const host = website
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split('?')[0]
    .split('#')[0]
    .trim()
  if (!host || !host.includes('.')) return null
  return host
}

// Derive a business domain from an email. Returns null for free-email providers
// or malformed addresses.
function businessDomainFromEmail(email: string | null | undefined): string | null {
  if (!email) return null
  const at = email.lastIndexOf('@')
  if (at < 0) return null
  const domain = email.slice(at + 1).trim().toLowerCase()
  if (!domain || !domain.includes('.')) return null
  if (FREE_EMAIL_DOMAINS.has(domain)) return null
  return domain
}

// Best-effort enrichment for a single member. NEVER throws — always resolves
// with the resulting enrichment_status and writes it back. Autofills GAPS ONLY:
// an existing (non-empty) admin-entered field is never overwritten.
// On 'failed', `error` carries a short reason for the admin toast (e.g. the
// provider throwing because the Clay search failed or the quota is used up).
export async function enrichMember(
  db: Db,
  memberId: string,
): Promise<{ status: string; error?: string }> {
  const nowIso = new Date().toISOString()
  // Set once the provider is about to be called, so a failed run still
  // records WHICH provider it was (and never leaves an older provider's name
  // showing next to a fresh status/date).
  let providerName: string | null = null

  try {
    const { data: member, error } = await db
      .from('members')
      .select(
        'id, annual_turnover, employee_count, sector, company_linkedin_url, company_website, company_description, profile_id, profiles(email, first_name, last_name, linkedin_url)',
      )
      .eq('id', memberId)
      .single()

    if (error || !member) {
      return { status: 'failed' }
    }

    // profiles() returns a single related row here (FK) — normalise it.
    const profile = (member as unknown as {
      profiles: {
        email: string | null
        first_name: string | null
        last_name: string | null
        linkedin_url: string | null
      } | null
    }).profiles

    // Derive the company domain: prefer the member's website, else the
    // (business) email domain.
    const domain =
      domainFromWebsite(member.company_website) ?? businessDomainFromEmail(profile?.email)

    // No business domain → nothing to enrich. No provider was called, so the
    // source is cleared: the panel then shows just the date beside "No
    // business domain", rather than an older provider's name that would
    // wrongly suggest that provider ran at this time.
    if (!domain) {
      await db
        .from('members')
        .update({ enrichment_status: 'no_domain', enriched_at: nowIso, enrichment_source: null })
        .eq('id', memberId)
      return { status: 'no_domain' }
    }

    const provider = getEnrichmentProvider()
    providerName = provider.name
    const result = await provider.enrich({
      domain,
      firstName: profile?.first_name ?? undefined,
      lastName: profile?.last_name ?? undefined,
    })

    const { company, person, raw } = result

    let status: string
    if (company && person) status = 'enriched'
    else if (company) status = 'partial'
    else status = 'not_found'

    const isEmpty = (v: string | null | undefined) => v == null || v.trim() === ''

    // Build the members update dynamically so gaps-only holds — only include a
    // key when the current value is empty AND we have something to write.
    const memberUpdate: Database['public']['Tables']['members']['Update'] = {
      enrichment_status: status,
      enriched_at: nowIso,
      enrichment_source: provider.name,
      enrichment_raw: (raw ?? null) as Database['public']['Tables']['members']['Update']['enrichment_raw'],
    }

    if (company) {
      if (isEmpty(member.annual_turnover) && company.revenuePrinted)
        memberUpdate.annual_turnover = company.revenuePrinted
      if (isEmpty(member.employee_count) && company.employeeCount != null)
        memberUpdate.employee_count = String(company.employeeCount)
      if (isEmpty(member.sector) && company.industry) memberUpdate.sector = company.industry
      if (isEmpty(member.company_linkedin_url) && company.linkedinUrl)
        memberUpdate.company_linkedin_url = company.linkedinUrl
      if (isEmpty(member.company_website) && company.website)
        memberUpdate.company_website = company.website
      if (isEmpty(member.company_description) && company.description)
        memberUpdate.company_description = company.description
    }

    await db.from('members').update(memberUpdate).eq('id', memberId)

    // Person LinkedIn onto the profile — gap-only, and only when the provider
    // matched the named person (needs first + last name). Separate update
    // from the members row.
    if (person?.linkedinUrl && isEmpty(profile?.linkedin_url) && member.profile_id) {
      await db
        .from('profiles')
        .update({ linkedin_url: person.linkedinUrl })
        .eq('id', member.profile_id)
    }

    return { status }
  } catch (e) {
    console.error('[enrichMember] failed:', e)
    try {
      // Record the provider too when the failure came from (or after) the
      // provider call; if we failed before reaching it, leave the source alone.
      await db
        .from('members')
        .update({
          enrichment_status: 'failed',
          enriched_at: nowIso,
          ...(providerName ? { enrichment_source: providerName } : {}),
        })
        .eq('id', memberId)
    } catch {
      /* swallow — best-effort */
    }
    return { status: 'failed', error: e instanceof Error ? e.message : undefined }
  }
}
