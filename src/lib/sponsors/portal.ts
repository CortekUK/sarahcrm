// Sponsor Portal resolver — server-only.
//
// The public Sponsor Portal (/sponsor/<token>) has NO login. It resolves a
// sponsorship by its per-sponsor token using the SERVICE-ROLE client, so we
// never open a public RLS policy on sponsorships / sponsor_deliverables. The
// token REUSED is `sponsorships.booking_token` (the same per-sponsor token
// already minted for the event booking link) — no separate portal_token.

import { createClient } from '@supabase/supabase-js'

export interface SponsorDeliverable {
  id: string
  label: string
  category: string | null
  due_date: string | null
  status: string
  notes: string | null
  file_name: string | null
  submitted_at: string | null
  sponsor_note: string | null
}

export interface SponsorPortalData {
  sponsorLabel: string
  packageName: string
  showcaseSlot: string | null
  status: string
  event: {
    title: string
    start_date: string
    end_date: string | null
    venue_name: string | null
    venue_city: string | null
  } | null
  deliverables: SponsorDeliverable[]
  roiReportHtml: string | null
  roiReach: number | null
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function loadSponsorPortal(token: string): Promise<SponsorPortalData | null> {
  if (!token || token.length < 6) return null
  const db = admin()

  const { data: sp, error } = await db
    .from('sponsorships')
    .select(
      'id, package_name, showcase_slot, status, sponsor_name, sponsor_company, member_id, roi_report_html, roi_reach, events(title, start_date, end_date, venue_name, venue_city)',
    )
    .eq('booking_token', token)
    .maybeSingle()
  if (error || !sp) return null

  // Sponsor display name: external row, else the linked member's profile.
  let sponsorLabel = sp.sponsor_company || sp.sponsor_name || ''
  if (!sponsorLabel && sp.member_id) {
    const { data: m } = await db
      .from('members')
      .select('company_name, profiles(first_name, last_name, company_name)')
      .eq('id', sp.member_id)
      .single()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prof = (m as any)?.profiles as
      | { first_name?: string; last_name?: string; company_name?: string }
      | null
    sponsorLabel =
      `${prof?.first_name ?? ''} ${prof?.last_name ?? ''}`.trim() ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (m as any)?.company_name ||
      prof?.company_name ||
      ''
  }

  const { data: deliverables } = await db
    .from('sponsor_deliverables')
    .select('id, label, category, due_date, status, notes, file_name, submitted_at, sponsor_note')
    .eq('sponsorship_id', sp.id)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  return {
    sponsorLabel: sponsorLabel || 'Valued sponsor',
    packageName: sp.package_name,
    showcaseSlot: sp.showcase_slot,
    status: sp.status,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    event: (sp.events as any) ?? null,
    deliverables: (deliverables as SponsorDeliverable[]) ?? [],
    roiReportHtml: sp.roi_report_html,
    roiReach: sp.roi_reach,
  }
}
