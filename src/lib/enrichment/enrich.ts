import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getEnrichmentProvider } from './index'

type Db = SupabaseClient<Database>

// Free/personal email providers — an address here gives us no business domain,
// so there's nothing to enrich against.
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

// Best-effort enrichment for a single enquiry. NEVER throws — always resolves
// with the resulting enrichment_status and writes it (plus any data) back.
// On 'failed', `error` carries a short reason for the admin toast (e.g. the
// provider throwing because the Clay search failed or the quota is used up).
export async function enrichEnquiry(
  db: Db,
  enquiryId: string,
): Promise<{ status: string; error?: string }> {
  const nowIso = new Date().toISOString()
  // Set once the provider is about to be called, so a failed run still
  // records WHICH provider it was (and never leaves an older provider's name
  // showing next to a fresh status/date).
  let providerName: string | null = null

  try {
    const { data: enquiry, error } = await db
      .from('enquiries')
      .select('id, email, first_name, last_name, company')
      .eq('id', enquiryId)
      .single()

    if (error || !enquiry) {
      return { status: 'failed' }
    }

    const domain = businessDomainFromEmail(enquiry.email)

    // No business domain → nothing to enrich. No provider was called, so the
    // source is cleared: the panel then shows just the date beside "No
    // business domain", rather than an older provider's name that would
    // wrongly suggest that provider ran at this time.
    if (!domain) {
      await db
        .from('enquiries')
        .update({ enrichment_status: 'no_domain', enriched_at: nowIso, enrichment_source: null })
        .eq('id', enquiryId)
      return { status: 'no_domain' }
    }

    const provider = getEnrichmentProvider()
    providerName = provider.name
    const result = await provider.enrich({
      domain,
      firstName: enquiry.first_name ?? undefined,
      lastName: enquiry.last_name ?? undefined,
    })

    const { company, person, raw } = result

    let status: string
    if (company && person) status = 'enriched'
    else if (company) status = 'partial'
    else status = 'not_found'

    await db
      .from('enquiries')
      .update({
        enrichment_status: status,
        enriched_at: nowIso,
        enrichment_source: provider.name,
        company_domain: domain,
        company_website: company?.website ?? null,
        company_linkedin_url: company?.linkedinUrl ?? null,
        company_industry: company?.industry ?? null,
        company_employee_count: company?.employeeCount ?? null,
        company_revenue: company?.revenue ?? null,
        company_revenue_printed: company?.revenuePrinted ?? null,
        person_title: person?.title ?? null,
        person_seniority: person?.seniority ?? null,
        person_linkedin_url: person?.linkedinUrl ?? null,
        enrichment_raw: (raw ?? null) as Database['public']['Tables']['enquiries']['Update']['enrichment_raw'],
      })
      .eq('id', enquiryId)

    return { status }
  } catch (e) {
    console.error('[enrichEnquiry] failed:', e)
    try {
      // Record the provider too when the failure came from (or after) the
      // provider call; if we failed before reaching it, leave the source alone.
      await db
        .from('enquiries')
        .update({
          enrichment_status: 'failed',
          enriched_at: nowIso,
          ...(providerName ? { enrichment_source: providerName } : {}),
        })
        .eq('id', enquiryId)
    } catch {
      /* swallow — best-effort */
    }
    return { status: 'failed', error: e instanceof Error ? e.message : undefined }
  }
}
