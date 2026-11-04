// PITCH page — switches and content slots waiting on Sarah / Myerson.
// Everything that must stay off the public page until approved is gated
// here, in one place.

/**
 * Myerson legal sign-off (brief: "Get legal sign-off (Myerson) before launch
 * on: the investor section and form wording, the SEIS/EIS table … and the
 * success-fee wording").
 *
 * false → the For investors section, the Investor Panel application form,
 * the SEIS/EIS table and every success-fee line are NOT rendered; visitors
 * see "Investor Panel applications open soon — register interest" with a
 * short register-interest form instead.
 * Flip to true only once Myerson has approved the wording below.
 */
export const PITCH_LEGAL_APPROVED = false

/**
 * PENDING MYERSON — investor classification self-certification wording for
 * the Investor Panel application (brief Forms table: "investor
 * classification self-certification (wording from Myerson)"). Placeholder
 * text only — replace verbatim with Myerson's wording before switching
 * PITCH_LEGAL_APPROVED on.
 */
export const INVESTOR_SELF_CERT_TEXT =
  '[PENDING MYERSON] I confirm my investor classification as a certified High Net Worth Individual or a Self-Certified Sophisticated Investor, and I understand standard ID and AML checks will follow. (Wording from Myerson to replace this placeholder.)'

export const INVESTOR_CLASSIFICATIONS = [
  'Certified High Net Worth Individual',
  'Self-Certified Sophisticated Investor',
] as const

/**
 * Founders reel — only founders the brief names. Each still links to its
 * podcast episode once Sarah supplies the link (empty → no link shown).
 * Founder permissions still to be confirmed by Sarah.
 */
export const FOUNDERS_REEL: { company: string; image: string; podcastUrl: string }[] = [
  { company: 'Parced IO', image: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/pitch/founder-parced-io.jpg', podcastUrl: '' },
  { company: 'Hacien Tequila', image: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/pitch/founder-hacien-tequila.jpg', podcastUrl: '' },
  { company: 'Bloom Longevity Labs', image: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/pitch/founder-bloom-longevity-labs.jpg', podcastUrl: '' },
  { company: 'Next Gen MEM', image: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/pitch/founder-next-gen-mem.jpg', podcastUrl: '' },
]

/**
 * PITCH Podcast episodes (Sarah to supply). Empty → the episode grid and
 * the featured player are hidden; reach tiles + partner options still show.
 * youtubeId = the 11-character YouTube video id.
 */
export const PODCAST_EPISODES: {
  title: string
  founder: string
  youtubeId: string
  spotifyUrl?: string
  appleUrl?: string
}[] = []

/** Subscribe buttons (Sarah to supply). Empty href → button hidden. */
export const PODCAST_SUBSCRIBE: { label: string; href: string }[] = [
  { label: 'YouTube', href: '' },
  { label: 'Spotify', href: '' },
  { label: 'Apple Podcasts', href: '' },
]
