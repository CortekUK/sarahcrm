// Journal strands + types, safe to import from client components
// (no Supabase client here). Server readers live in ./blog.ts.

export type JournalStrand = 'press' | 'founders_letter' | 'stories' | 'members'

export const JOURNAL_STRANDS: { value: JournalStrand; label: string; membersOnly: boolean }[] = [
  { value: 'press', label: 'Press', membersOnly: false },
  { value: 'founders_letter', label: "Founder's Letters", membersOnly: false },
  { value: 'stories', label: 'Stories', membersOnly: false },
  { value: 'members', label: "Members' Editorial", membersOnly: true },
]

export function journalStrandLabel(v: string | null | undefined): string {
  return JOURNAL_STRANDS.find((s) => s.value === v)?.label ?? 'Stories'
}

export interface JournalPostSummary {
  id: string
  slug: string
  title: string
  excerpt: string | null
  hero_image_url: string | null
  published_at: string | null
  strand: JournalStrand
  visibility: 'public' | 'members'
  author_name: string | null
  author_type: 'sarah' | 'member' | 'guest'
  outlet: string | null
  original_url: string | null
  tags: string[]
}
