// "The Club in numbers" + every About-page figure/chart.
//
// ONE editable source: app_settings row key 'club_stats' (jsonb), edited at
// /dashboard/website/club-numbers. This module is pure (no server imports)
// so the admin editor (client) and the public reader (server) share the
// shape, the defaults and the normaliser.
//
// DEFAULT_CLUB_STATS mirrors supabase/migrations/20261106_e_site_settings.sql
// — the public site falls back to it if the row is missing or unreadable.

export interface StatTile {
  value: string
  label: string
}

export interface StatBar {
  label: string
  /** Percentage, 0–100. */
  pct: number
}

export interface ChannelCount {
  label: string
  value: string
}

export interface ClubStats {
  /** The six homepage / About tiles. */
  numbers: StatTile[]
  /** Ecosystem graphic extras (5 event series · 6 UK cities + Europe · …). */
  ecosystem: StatTile[]
  sectors: StatBar[]
  sectors_source: string
  regions: StatBar[]
  company_size: StatBar[]
  company_size_note: string
  /** Small stamp beside the region / size charts, e.g. "Sept 2026". */
  demographics_stamp: string
  /** Beyond the room: CRM, social and content. */
  beyond: StatTile[]
  channels: ChannelCount[]
  /** Optional audience lines under the channel counts. */
  audience_notes: string[]
}

export const DEFAULT_CLUB_STATS: ClubStats = {
  numbers: [
    { value: '7,000+', label: 'Profiled business and HNW contacts' },
    { value: '£18m', label: 'In business converted through our referrals' },
    { value: '16,300+', label: 'Engaged followers across The Club and founder channels' },
    { value: '200', label: 'Events delivered, from ten-guest round tables to 300-guest showcases' },
    { value: '50+', label: 'Events a year across five programmes, UK and overseas' },
    { value: '7 years', label: 'Building the network' },
  ],
  ecosystem: [
    { value: '5', label: 'Event series' },
    { value: '6', label: 'UK cities + Europe' },
    { value: '£1m–£100m+', label: 'Member turnover' },
  ],
  sectors: [
    { label: 'Hospitality, restaurants & leisure', pct: 22.7 },
    { label: 'Financial services, wealth & investment', pct: 13.3 },
    { label: 'Retail, luxury & fashion', pct: 10.4 },
    { label: 'Legal & professional services', pct: 9.9 },
    { label: 'Marketing, media, PR & creative', pct: 9.7 },
    { label: 'Property, construction & development', pct: 8.9 },
    { label: 'Technology, software & IT', pct: 7.1 },
    { label: 'Sport, wellness & health', pct: 6.0 },
    { label: 'Other sectors', pct: 5.9 },
    { label: 'Education, public sector & non-profit', pct: 2.8 },
    { label: 'Automotive & motor', pct: 1.7 },
    { label: 'Manufacturing & industrial', pct: 1.6 },
  ],
  sectors_source: 'The Club CRM, September 2026',
  regions: [
    { label: 'North West', pct: 38 },
    { label: 'Yorkshire', pct: 19 },
    { label: 'London & South East', pct: 19 },
    { label: 'Rest of UK', pct: 23 },
    { label: 'International', pct: 1 },
  ],
  company_size: [
    { label: '2–10', pct: 22 },
    { label: '11–50', pct: 26 },
    { label: '51–200', pct: 17 },
    { label: '201–1,000', pct: 17 },
    { label: '1,000+', pct: 18 },
  ],
  company_size_note:
    'Two thirds of the database is founder-led or owner-managed: the decision maker is in the room.',
  demographics_stamp: 'Sept 2026',
  beyond: [
    { value: '16,300+', label: 'Combined following across The Club and founder channels' },
    { value: '98,000', label: 'Instagram views in 90 days, from 12,400 individual viewers' },
    { value: '7,000+', label: 'Contacts in the email database, segmented and profiled' },
    { value: '2,700+', label: 'Profile visits in 90 days, with 2,200+ direct interactions' },
  ],
  channels: [
    { label: 'LinkedIn', value: '6,451' },
    { label: 'Instagram', value: '6,143' },
    { label: 'Facebook', value: '3,226' },
    { label: 'TikTok', value: '388' },
  ],
  audience_notes: ['64.5% women · 35.5% men', '64% aged 35–54 · 71% UK'],
}

// ── Normaliser ───────────────────────────────────────────────────────
// The row is admin-edited jsonb, so never trust its shape. Each field falls
// back to the default independently; malformed list items are dropped.

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : ''
}

function tiles(v: unknown, fallback: StatTile[]): StatTile[] {
  if (!Array.isArray(v)) return fallback
  return v
    .map((t) => ({ value: str((t as StatTile)?.value), label: str((t as StatTile)?.label) }))
    .filter((t) => t.value || t.label)
}

function bars(v: unknown, fallback: StatBar[]): StatBar[] {
  if (!Array.isArray(v)) return fallback
  return v
    .map((b) => {
      const raw = (b as StatBar)?.pct
      const n = typeof raw === 'number' ? raw : Number.parseFloat(str(raw))
      return { label: str((b as StatBar)?.label), pct: Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0 }
    })
    .filter((b) => b.label)
}

function channels(v: unknown, fallback: ChannelCount[]): ChannelCount[] {
  if (!Array.isArray(v)) return fallback
  return v
    .map((c) => ({ label: str((c as ChannelCount)?.label), value: str((c as ChannelCount)?.value) }))
    .filter((c) => c.label || c.value)
}

function text(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v.trim() : fallback
}

export function normaliseClubStats(raw: unknown): ClubStats {
  const d = DEFAULT_CLUB_STATS
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d
  const r = raw as Record<string, unknown>
  return {
    numbers: tiles(r.numbers, d.numbers),
    ecosystem: tiles(r.ecosystem, d.ecosystem),
    sectors: bars(r.sectors, d.sectors),
    sectors_source: text(r.sectors_source, d.sectors_source),
    regions: bars(r.regions, d.regions),
    company_size: bars(r.company_size, d.company_size),
    company_size_note: text(r.company_size_note, d.company_size_note),
    demographics_stamp: text(r.demographics_stamp, d.demographics_stamp),
    beyond: tiles(r.beyond, d.beyond),
    channels: channels(r.channels, d.channels),
    audience_notes: Array.isArray(r.audience_notes)
      ? r.audience_notes.map(str).filter(Boolean)
      : d.audience_notes,
  }
}

export function formatPct(n: number): string {
  // 22.7 → "22.7%", 38 → "38%"
  return `${Number.isInteger(n) ? n : n.toFixed(1)}%`
}
