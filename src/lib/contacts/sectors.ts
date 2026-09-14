// Sector taxonomy + normaliser for the Contacts module.
//
// The source data has no usable sector column: the me&u export fills `Sector`
// on only 4% of rows with 257 different spellings, and Clay's `Industry` — the
// good signal — has 128 distinct values across ~1,725 rows. Both are mapped
// onto the 14 canonical sectors below by keyword, first match wins.
//
// Verified against the real exports: 100% of Clay's Industry values map to a
// real sector; the me&u leftovers that don't are genuine junk ("Customer",
// "|", "The", "8") and correctly fall through to Unsegmented.
//
// KEEP IN SYNC with supabase/migrations/20260806_contacts.sql, which seeds
// `contact_sectors` with these exact keys.

export interface SectorDef {
  key: string
  label: string
  /** Lower-cased substrings; a raw value matching any of them maps here. */
  keywords: string[]
}

export const UNSEGMENTED = 'unsegmented'

// Order matters — the first definition whose keyword appears wins. More
// specific sectors are listed before the broader ones they could collide with
// (e.g. Legal before Professional Services).
export const SECTORS: SectorDef[] = [
  {
    key: 'hospitality',
    label: 'Hospitality',
    keywords: ['hospitality', 'restaurant', 'food', 'beverage', 'catering', 'hotel', 'accommodation', 'wine', 'spirits', 'brewer', 'nightclub'],
  },
  {
    key: 'financial',
    label: 'Financial Services',
    keywords: ['financial', 'finance', 'accounting', 'accountan', 'investment', 'banking', 'bank', 'insurance', 'capital market', 'venture capital', 'private equity', 'wealth', 'mortgage', 'fintech', 'tax', 'audit'],
  },
  {
    key: 'property',
    label: 'Property',
    keywords: ['real estate', 'property', 'construction', 'architect', 'building', 'surveyor', 'developer', 'estate agent', 'interior design', 'facilities', 'civil engineering'],
  },
  {
    key: 'legal',
    label: 'Legal',
    keywords: ['law', 'legal', 'solicitor', 'barrister', 'attorney'],
  },
  {
    key: 'retail',
    label: 'Retail & Luxury',
    keywords: ['retail', 'luxury', 'jewel', 'apparel', 'fashion', 'cosmetic', 'furniture', 'wholesale', 'watch', 'boutique', 'groceries', 'art dealer'],
  },
  {
    key: 'events',
    label: 'Events & Entertainment',
    keywords: ['event', 'entertainment', 'spectator sports', 'performing arts', 'musician', 'sports team', 'recreation', 'artists and writers', 'leisure', 'photograph', 'sporting goods', 'sports and recreation'],
  },
  {
    key: 'marketing',
    label: 'Marketing & Media',
    keywords: ['advertis', 'public relations', 'marketing', 'media', 'design', 'publishing', 'broadcast', 'graphic', 'communications', 'printing', 'translation', 'periodical'],
  },
  {
    key: 'technology',
    label: 'Technology',
    keywords: ['software', 'technology', 'information technology', 'it services', 'internet', 'computer', 'telecommunication', 'saas', 'network', 'digital', 'nanotechnology', 'social networking', 'online', 'information services'],
  },
  {
    key: 'professional',
    label: 'Professional Services',
    keywords: ['consult', 'staffing', 'recruit', 'training', 'coaching', 'human resources', 'professional services', 'executive offices', 'outsourc', 'engineering', 'holding compan', 'business services', 'machinery', 'consumer services'],
  },
  {
    key: 'health',
    label: 'Health & Wellness',
    keywords: ['health', 'wellness', 'fitness', 'medical', 'hospital', 'care', 'pharma', 'veterinar', 'elderly', 'spa', 'beauty', 'personal care'],
  },
  {
    key: 'automotive',
    label: 'Automotive',
    keywords: ['automotive', 'motor vehicle', 'vehicle', 'dealership', 'aviation', 'airline'],
  },
  {
    key: 'travel',
    label: 'Travel & Aviation',
    keywords: ['travel', 'tourism', 'maritime', 'transport', 'logistics', 'airport'],
  },
  {
    key: 'nonprofit',
    label: 'Non-profit & Public',
    keywords: ['non-profit', 'nonprofit', 'charit', 'government', 'fundrais', 'education', 'religious', 'civic', 'public safety', 'philanthropic', 'family services', 'social'],
  },
  {
    key: 'industrial',
    label: 'Manufacturing & Industrial',
    keywords: ['manufactur', 'farming', 'utilities', 'industrial', 'electronics', 'appliance', 'equipment', 'supply chain', 'energy'],
  },
]

export const SECTOR_LABELS: Record<string, string> = {
  ...Object.fromEntries(SECTORS.map((s) => [s.key, s.label])),
  [UNSEGMENTED]: 'Unsegmented',
}

export const SECTOR_KEYS: string[] = [...SECTORS.map((s) => s.key), UNSEGMENTED]

/**
 * Map raw industry/sector strings onto a canonical sector key.
 * Pass the best signal first (Clay's Industry, then the source's own Sector);
 * the first argument that matches anything wins. Falls back to 'unsegmented'.
 */
export function toSector(...rawValues: (string | null | undefined)[]): string {
  for (const raw of rawValues) {
    if (!raw) continue
    const s = raw.trim().toLowerCase()
    if (!s) continue
    for (const sector of SECTORS) {
      if (sector.keywords.some((k) => s.includes(k))) return sector.key
    }
  }
  return UNSEGMENTED
}
