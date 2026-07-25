// Shared channel metadata for the Marketing AI Engine (Module 2).
//
// Pure data (no server-only imports) so it can be used by both the API routes
// and the client views. The full 9-channel set, human labels, one-line hints,
// and the sensible groupings used in the create modal + approval queue.

export const MARKETING_CHANNELS = [
  'seo_blog',
  'recap_blog',
  'linkedin',
  'instagram_feed',
  'instagram_carousel',
  'instagram_reel',
  'newsletter',
  'press_release',
  'sponsor_recap',
] as const

export type MarketingChannelKey = (typeof MARKETING_CHANNELS)[number]

// Every channel that produces plain text/copy handled by the structured
// generation call. Newsletter is the exception — it produces real email blocks
// and is handed off to the branded email designer.
export const TEXT_CHANNELS = [
  'seo_blog',
  'recap_blog',
  'linkedin',
  'instagram_feed',
  'instagram_carousel',
  'instagram_reel',
  'press_release',
  'sponsor_recap',
] as const

export type TextChannelKey = (typeof TEXT_CHANNELS)[number]

export interface ChannelMeta {
  key: MarketingChannelKey
  label: string
  hint: string
  group: MarketingChannelGroup
}

export type MarketingChannelGroup =
  | 'Blogs'
  | 'LinkedIn'
  | 'Instagram'
  | 'Newsletter'
  | 'PR'
  | 'Sponsor'

export const CHANNEL_META: Record<MarketingChannelKey, ChannelMeta> = {
  seo_blog: { key: 'seo_blog', label: 'SEO blog', hint: 'Long-form search article', group: 'Blogs' },
  recap_blog: { key: 'recap_blog', label: 'Recap blog', hint: 'Event write-up with highlights', group: 'Blogs' },
  linkedin: { key: 'linkedin', label: 'LinkedIn', hint: 'Single post, Club voice', group: 'LinkedIn' },
  instagram_feed: { key: 'instagram_feed', label: 'Instagram feed', hint: 'Single caption + hashtags', group: 'Instagram' },
  instagram_carousel: { key: 'instagram_carousel', label: 'Instagram carousel', hint: 'Per-slide caption lines', group: 'Instagram' },
  instagram_reel: { key: 'instagram_reel', label: 'Instagram reel', hint: 'Hook + caption', group: 'Instagram' },
  newsletter: { key: 'newsletter', label: 'Newsletter', hint: 'Branded email → designer', group: 'Newsletter' },
  press_release: { key: 'press_release', label: 'Press release', hint: 'Formal PR structure', group: 'PR' },
  sponsor_recap: { key: 'sponsor_recap', label: 'Sponsor recap', hint: 'Recap addressed to a sponsor', group: 'Sponsor' },
}

// Ordering used to group the approval queue + the create modal.
export const CHANNEL_GROUP_ORDER: MarketingChannelGroup[] = [
  'Blogs',
  'LinkedIn',
  'Instagram',
  'Newsletter',
  'PR',
  'Sponsor',
]

// Ordering of individual channels (queue rendering, deterministic).
export const CHANNEL_ORDER: MarketingChannelKey[] = [...MARKETING_CHANNELS]

// ── Brand voices (Module 3) ──────────────────────────────────
export const VOICE_KEYS = ['club', 'sarah'] as const
export type VoiceKey = (typeof VOICE_KEYS)[number]

export const VOICE_LABELS: Record<VoiceKey, string> = {
  club: 'The Club',
  sarah: 'Sarah',
}

// ── LinkedIn variants (Module 3) ─────────────────────────────
// LinkedIn always produces FOUR drafts within one campaign, one per
// variant, distinguished by marketing_assets.variant. Non-LinkedIn
// channels leave `variant` null.
export const LINKEDIN_VARIANTS = [
  'voice_club',
  'voice_sarah',
  'sponsor',
  'founder_spotlight',
] as const

export type LinkedInVariantKey = (typeof LINKEDIN_VARIANTS)[number]

export interface LinkedInVariantMeta {
  key: LinkedInVariantKey
  label: string // short label appended after "LinkedIn · "
  voice: VoiceKey // which brand voice this variant is written in
}

export const LINKEDIN_VARIANT_META: Record<LinkedInVariantKey, LinkedInVariantMeta> = {
  voice_club: { key: 'voice_club', label: 'The Club', voice: 'club' },
  voice_sarah: { key: 'voice_sarah', label: 'Sarah', voice: 'sarah' },
  sponsor: { key: 'sponsor', label: 'Sponsor', voice: 'club' },
  founder_spotlight: { key: 'founder_spotlight', label: 'Founder spotlight', voice: 'sarah' },
}

export function isLinkedInVariant(v: string): v is LinkedInVariantKey {
  return (LINKEDIN_VARIANTS as readonly string[]).includes(v)
}

// Human label for an asset row: "LinkedIn · The Club" etc. Non-LinkedIn
// assets fall back to their channel label (with voice appended elsewhere).
export function linkedInVariantLabel(variant: string | null | undefined): string {
  if (variant && isLinkedInVariant(variant)) return LINKEDIN_VARIANT_META[variant].label
  return ''
}

export function isTextChannel(channel: string): channel is TextChannelKey {
  return (TEXT_CHANNELS as readonly string[]).includes(channel)
}

export function isMarketingChannel(channel: string): channel is MarketingChannelKey {
  return (MARKETING_CHANNELS as readonly string[]).includes(channel)
}
