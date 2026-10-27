// Marketing content generation — the engine's core (Module 2: ALL channels).
//
// POST /api/admin/marketing/generate
//   body: {
//     campaign_id: string,
//     channels: MarketingChannelKey[],       // any of the full 11-channel set
//     regenerate_asset_id?: string,          // regenerate a single asset
//   }
//
// Loads the campaign, builds source context from its event / topic_brief /
// transcript (enriched for recap + sponsor channels), then:
//   * TEXT channels (blogs, LinkedIn, Instagram, Facebook, TikTok, PR, sponsor recap) → one
//     structured OpenAI call, Zod-validated, one draft per channel.
//   * NEWSLETTER → generated as REAL email blocks (email ai-schema), stored as
//     an email_templates row (category='campaign', is_draft) and linked to the
//     marketing_asset via email_template_id. The admin finishes/approves/sends
//     in the branded email designer — NOT here, and never through the adapter.
//
// Nothing is published here. Module 1 hardcodes the Club voice for text
// channels (Module 3 makes voices editable).

import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { z } from 'zod'
import { requireAdmin, getAdmin } from '@/lib/marketing/admin'
import { logOpenAIUsage } from '@/lib/ai/usage-logger'
import {
  TEXT_CHANNELS,
  isMarketingChannel,
  isTextChannel,
  LINKEDIN_VARIANTS,
  LINKEDIN_VARIANT_META,
  VOICE_KEYS,
} from '@/lib/marketing/channels'
import type {
  TextChannelKey,
  MarketingChannelKey,
  VoiceKey,
  LinkedInVariantKey,
} from '@/lib/marketing/channels'
import { generateNewsletterDraft } from '@/lib/marketing/newsletter'
import { buildSlotValues } from '@/lib/marketing/graphics/store'
import { coerceShape, coerceBackground, coerceSlots } from '@/lib/marketing/graphics/resolve'
import { carouselShapeFor } from '@/lib/marketing/graphics/types'
import type { CarouselSlide, MarketingTemplate, SlotValues } from '@/lib/marketing/graphics/types'
import { parseCarouselBody, slidesFromText } from '@/lib/marketing/graphics/carousel'
import { labelStripOptions, stripPostLabels } from '@/lib/marketing/reel'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Channels that carry a rendered template graphic (the caption text is still
// produced as today; the graphic is the accompanying image).
const SOCIAL_GRAPHIC_CHANNELS = new Set<string>([
  'instagram_feed',
  'instagram_carousel',
  // NOT instagram_reel: a reel is a VIDEO the admin attaches in the approval
  // queue (publish_target.video_url) — no template graphic is assigned.
  'linkedin',
  // Facebook takes the same optional graphic (text-only posts are allowed).
  'facebook',
  // TikTok photo posts REQUIRE an image; the template graphic is rendered
  // vertically (9:16) for TikTok in the approval queue.
  'tiktok',
])

// TikTok's hard caption limit. The brief aims for < 300 characters; this is
// only a safety net so an over-long draft can never be refused at publish.
const TIKTOK_CAPTION_MAX = 2200

// Public website pages the blog channels may link to internally (SEO
// internal links + calls to action). Only these real paths are offered to
// the model so it never invents a URL.
const SITE_LINKS = `Internal links you may use (site-relative paths only — never invent other URLs):
- /memberships — membership tiers and benefits
- /membership-application — apply for membership (the primary call to action)
- /events — the events calendar
- /private-event-services — bespoke private events
- /concierge — the members' concierge service
- /about — about The Club and Sarah Restrick
- /contact-us — get in touch
- /blog — The Journal (other articles)`

interface GenerateBody {
  campaign_id?: string
  channels?: string[]
  regenerate_asset_id?: string | null
  // Default voice for the single-voice text channels (blogs, instagram_*,
  // facebook, tiktok, press_release, sponsor_recap). LinkedIn ignores this — it always
  // produces all four variants. Defaults to 'club'.
  default_voice?: string | null
  // Template Graphics. The AI writes the caption + derives the on-graphic
  // heading/subtext and ASSIGNS a template, but does NOT pick or render an
  // image — the admin picks one from Google Drive per-post in the approval
  // queue, which renders the graphic there. template_id forces a specific
  // template (else the default template is assigned).
  template_id?: string | null
  // Graphic mode from the create modal. 'auto' (or absent) = assign the
  // default template (admin picks the image + renders in the queue); 'none' =
  // explicitly SKIP graphics entirely (caption-only social posts). A specific
  // template is passed via template_id.
  graphic_mode?: string | null
}

interface VoiceRow {
  key: VoiceKey
  name: string
  guidance: string | null
  samples: unknown
}

// Club brand-voice guidance — condensed from the email builder's SYSTEM_PROMPT.
// Module 3 will make this editable.
const CLUB_VOICE = `Voice — "The Club by Sarah Restrick" (formal luxury): warm, considered and intimate, never corporate or salesy. British English spelling. Confident and understated — this is a private membership community of exceptional people, not a mass mailing list. Short, elegant sentences. Specific over flowery. Refer naturally to the three core member experiences where relevant: curated luxury events, bespoke member introductions, and a warm communications practice.`

const CHANNEL_BRIEFS: Record<TextChannelKey, string> = {
  seo_blog: `seo_blog: a search-optimised long-form blog article for the website's Journal (roughly 500-800 words). "title" is an SEO-friendly headline (under ~65 characters, the main keyword near the start); "body" is the full article in clean Markdown — an opening paragraph of 1-2 sentences that works as the search meta description (it is used as one), 2-4 short sections with "## " subheadings, and a closing line. Weave the topic's natural keywords in without stuffing. Add 2-3 INTERNAL links as Markdown links [anchor text](/path) using ONLY the internal links listed below (plus the event page if one is given in the source), with descriptive anchor text — never "click here". End with a short call-to-action paragraph that links to /membership-application or /events (whichever fits). No fabricated statistics or quotes.`,
  recap_blog: `recap_blog: a warm event recap / write-up for the website's Journal (roughly 400-700 words). "title" is an evocative headline (under ~65 characters); "body" is Markdown — a scene-setting opening paragraph of 1-2 sentences (used as the search meta description), the highlights (lean on the event's speakers, agenda, atmosphere and — where noted — attendees and photos), a memorable moment or two, and a closing line that looks ahead. Add 1-3 INTERNAL links as Markdown links [anchor text](/path) using ONLY the internal links listed below (plus the event page if one is given in the source), and end with a short call-to-action paragraph inviting readers to the next events (/events) or to apply (/membership-application). Celebratory but understated. Only use details present in the source; never invent quotes or numbers.`,
  linkedin: `linkedin: a single LinkedIn post (roughly 120-220 words) in the Club voice. "title" is a short internal label (e.g. the hook line); "body" is the post text — a strong first-line hook, 2-4 short paragraphs, tasteful line breaks, an inviting close. At most a few relevant hashtags on the final line. No "click the link in bio"-style filler.`,
  instagram_feed: `instagram_feed: a single Instagram feed caption. "title" is a short internal label; "body" is the caption — an arresting first line, 1-3 short lines of copy, and a final line with 5-10 relevant hashtags. Warm and visual. Text only (Instagram Stories cannot be auto-published, so do NOT write Story frames).`,
  instagram_carousel: `instagram_carousel: an Instagram carousel (several swipeable image slides + one caption). "title" is a short internal label. "body" is ONLY the caption that gets posted, exactly as it should appear: 2-5 short lines then a final line of 5-10 relevant hashtags — NO "Slide 1:" lines and NO "Caption:" label in the body. Put the on-image slide text in "slides": 3-7 items, each { "heading", "subtext" } — heading at most ~8 words, subtext at most ~16 words, no hashtags, no emoji strings, no quotation marks around them. Slide 1 is the hook / title slide that stops the scroll; the middle slides each carry one idea; the LAST slide is the call to action. Concise and punchy.`,
  facebook: `facebook: a single Facebook page post. "title" is a short internal label; "body" is the post — a warm, conversational opening line, 2-4 short paragraphs that tell the story (Facebook readers will read a little more than on Instagram), and an inviting close (e.g. an invitation to an upcoming event or to find out more about membership). At most 1-3 relevant hashtags, or none. No "link in bio" filler and no raw URLs unless one is given in the source. Works with or without an image.`,
  tiktok: `tiktok: a single TikTok photo post (a vertical image, or a short swipeable photo carousel). "title" is the ON-SCREEN HOOK LINE — at most ~8 words, a scroll-stopping line that is overlaid on the vertical graphic (so no hashtags, no emoji strings, no quotation marks around it). "body" is ONLY the caption that gets posted, exactly as it should appear: 1-3 short, punchy lines in a lighter, more conversational TikTok tone that still sounds like the brand voice above (never slangy, never clickbait, no "link in bio" filler, no raw URLs), then a final line of 3-6 relevant hashtags. Keep the WHOLE caption, hashtags included, under 300 characters. No "Hook:" / "Caption:" labels in the body.`,
  instagram_reel: `instagram_reel: the caption for an Instagram reel (the team attaches the video later). "title" is the ON-SCREEN HOOK — a 1-line scroll-stopper of at most ~8 words that the team can put on the video's opening frame (no hashtags, no emoji strings, no quotation marks around it). "body" is ONLY the caption that gets posted, exactly as it should appear: 2-4 short lines describing the reel, then a final line of 5-10 relevant hashtags. NO "Hook:" / "Caption:" / "Hashtags:" labels anywhere in the body, and do not repeat the hook as a labelled line. Text only — no scene-by-scene video direction.`,
  press_release: `press_release: a formal press release. "title" is the release HEADLINE. "body" is Markdown structured as: a dateline (CITY — Date, using only a real date if present in the source, else omit), 2-4 body paragraphs written in third person and formal register, an optional short quote ONLY if a real one exists in the source, and a closing "About The Club by Sarah Restrick" boilerplate paragraph (a private membership community curated by Sarah Restrick offering curated luxury events, bespoke member introductions and a warm communications practice). No hype, no fabricated statistics.`,
  sponsor_recap: `sponsor_recap: a warm recap addressed directly to the event's sponsor, thanking them and reflecting on the partnership. "title" is a short internal label. "body" is the message (roughly 200-350 words) — open by addressing the sponsor, recap the event and how their sponsorship package/benefits and brand alignment came through, note the value delivered, and close warmly with a look toward continuing the partnership. Use ONLY sponsor details present in the source; if none are provided, keep it graceful and general.`,
}

// Per-variant briefs for the LinkedIn fan-out. Every campaign produces
// ONE draft per variant. voice_club/voice_sarah differ only in voice;
// sponsor + founder_spotlight add an angle.
const LINKEDIN_VARIANT_BRIEFS: Record<LinkedInVariantKey, string> = {
  voice_club: `voice_club: a single LinkedIn post (roughly 120-220 words) written in THE CLUB voice. "title" is a short internal label (e.g. the hook line); "body" is the post — a strong first-line hook, 2-4 short paragraphs, tasteful line breaks, an inviting close, at most a few relevant hashtags on the final line.`,
  voice_sarah: `voice_sarah: the SAME LinkedIn post idea but written in SARAH's warm, first-person founder voice (she is speaking as herself). Roughly 120-220 words, a personal hook, 2-4 short paragraphs, an inviting close, at most a few hashtags. Distinctly warmer and more personal than the Club version — not a copy of it.`,
  sponsor: `sponsor: a single LinkedIn post (roughly 120-220 words) in THE CLUB voice that leans into the SPONSOR / partnership angle — thank and spotlight the event's sponsor(s), what the partnership made possible, and the shared values. Use ONLY sponsor details present in the source; if none are provided, keep it a graceful, general nod to partners and supporters. A few relevant hashtags on the final line.`,
  founder_spotlight: `founder_spotlight: a single LinkedIn post (roughly 120-220 words) in SARAH's first-person founder voice with a FOUNDER-SPOTLIGHT angle — Sarah reflecting personally on why she built The Club, what this moment/event means to her, and the community she's proud of. Human and a little vulnerable, still elegant. A few relevant hashtags on the final line.`,
}

const responseSchema = z.object({
  assets: z.array(
    z.object({
      channel: z.enum(TEXT_CHANNELS),
      title: z.string(),
      body: z.string(),
      // instagram_carousel only — empty for every other channel.
      slides: z
        .array(z.object({ heading: z.string(), subtext: z.string() }))
        .optional()
        .default([]),
    }),
  ),
})

// Build the reference voice-context block injected into prompts, from a
// voice row's guidance + reference samples. Falls back to the hardcoded
// Club tone if the row is missing/empty.
function buildVoiceContext(voice: VoiceRow | undefined | null): string {
  const guidance = voice?.guidance?.trim()
  const samples: { label: string; text: string }[] = Array.isArray(voice?.samples)
    ? (voice!.samples as unknown[])
        .map((s) => {
          const o = (s ?? {}) as Record<string, unknown>
          return { label: String(o.label ?? '').trim(), text: String(o.text ?? '').trim() }
        })
        .filter((s) => s.text)
    : []

  if (!guidance && samples.length === 0) return CLUB_VOICE

  const parts = [guidance || CLUB_VOICE]
  if (samples.length > 0) {
    const rendered = samples
      .map((s, i) => `Sample ${i + 1}${s.label ? ` — ${s.label}` : ''}:\n${s.text}`)
      .join('\n\n')
    parts.push(
      `Reference sample posts written in this voice — mimic their tone, rhythm and register, but do NOT copy them verbatim and do NOT reuse their specific facts:\n\n${rendered}`,
    )
  }
  return parts.join('\n\n')
}

const linkedinResponseSchema = z.object({
  assets: z.array(
    z.object({
      variant: z.enum(LINKEDIN_VARIANTS),
      title: z.string(),
      body: z.string(),
    }),
  ),
})

function linkedinJsonSchemaFor(variants: readonly LinkedInVariantKey[]) {
  return {
    name: 'linkedin_variants',
    strict: true as const,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        assets: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              variant: { type: 'string', enum: [...variants] },
              title: { type: 'string' },
              body: { type: 'string' },
            },
            required: ['variant', 'title', 'body'],
          },
        },
      },
      required: ['assets'],
    },
  }
}

function jsonSchemaFor() {
  return {
    name: 'marketing_assets',
    strict: true as const,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        assets: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              channel: { type: 'string', enum: [...TEXT_CHANNELS] },
              title: { type: 'string' },
              body: { type: 'string' },
              // instagram_carousel slide text; [] for other channels (strict
              // mode needs every property required).
              slides: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    heading: { type: 'string' },
                    subtext: { type: 'string' },
                  },
                  required: ['heading', 'subtext'],
                },
              },
            },
            required: ['channel', 'title', 'body', 'slides'],
          },
        },
      },
      required: ['assets'],
    },
  }
}

// Coerce a marketing_templates row into a MarketingTemplate.
function rowToTemplate(row: Record<string, unknown>): MarketingTemplate {
  return {
    id: row.id as string,
    name: row.name as string,
    shape: coerceShape(row.shape),
    background: coerceBackground(row.background),
    slots: coerceSlots(row.slots),
  }
}

// Load a specific template by id (manual override).
async function loadTemplate(
  admin: ReturnType<typeof getAdmin>,
  templateId: string,
): Promise<MarketingTemplate | null> {
  const { data } = await admin
    .from('marketing_templates')
    .select('id, name, shape, background, slots')
    .eq('id', templateId)
    .maybeSingle()
  return data ? rowToTemplate(data as Record<string, unknown>) : null
}

// Deterministically pick the auto-default template for a kind:
//   'photo' → a full-bleed event-photo template (is_default_photo)
//   'color' → the brand-colour text fallback (is_default_color)
// Portrait is preferred (the primary social shape); any default of the kind is
// used otherwise.
async function pickDefaultTemplate(
  admin: ReturnType<typeof getAdmin>,
  kind: 'photo' | 'color',
): Promise<MarketingTemplate | null> {
  const flag = kind === 'photo' ? 'is_default_photo' : 'is_default_color'
  const { data } = await admin
    .from('marketing_templates')
    .select('id, name, shape, background, slots')
    .eq(flag, true)
  const rows = (data ?? []) as Record<string, unknown>[]
  if (rows.length === 0) return null
  const chosen = rows.find((r) => r.shape === 'portrait') ?? rows[0]
  return rowToTemplate(chosen)
}

function formatEventContext(e: Record<string, unknown>): string {
  const lines: string[] = []
  if (e.title) lines.push(`Title: ${e.title}`)
  if (e.event_type) lines.push(`Type: ${e.event_type}`)
  const when = (() => {
    try {
      if (!e.start_date) return null
      const d = new Date(String(e.start_date))
      return new Intl.DateTimeFormat('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(d)
    } catch {
      return String(e.start_date ?? '')
    }
  })()
  if (when) lines.push(`Date: ${when}`)
  const venue = [e.venue_name, e.venue_city].filter(Boolean).join(', ')
  if (venue) lines.push(`Venue: ${venue}`)
  if (e.description) lines.push(`Description: ${String(e.description).replace(/\s+/g, ' ').trim()}`)
  if (e.speakers && Array.isArray(e.speakers) && e.speakers.length > 0) {
    lines.push(`Speakers: ${JSON.stringify(e.speakers).slice(0, 1500)}`)
  }
  if (e.agenda && Array.isArray(e.agenda) && e.agenda.length > 0) {
    lines.push(`Agenda: ${JSON.stringify(e.agenda).slice(0, 1500)}`)
  }
  if (e.cover_image_url) lines.push(`Cover image URL (a real asset — safe to use): ${e.cover_image_url}`)
  // Public event page — a valid internal link for the blog channels. Only
  // offered when the event is actually visible on the website.
  if (e.slug && ['published', 'live', 'completed'].includes(String(e.status ?? ''))) {
    lines.push(`Event page on the website (internal link): /events/${e.slug}`)
  }
  if (e.gallery_urls && Array.isArray(e.gallery_urls) && e.gallery_urls.length > 0) {
    lines.push(`Event photos: ${e.gallery_urls.length} image(s) available from the gallery.`)
  }
  return lines.join('\n')
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

    const apiKey = process.env.OPENAI_API_KEY ?? null
    if (!apiKey) {
      return Response.json({ error: 'OPENAI_API_KEY not configured.' }, { status: 500 })
    }

    let body: GenerateBody
    try {
      body = (await req.json()) as GenerateBody
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const campaignId = body.campaign_id
    if (!campaignId) return Response.json({ error: 'campaign_id is required' }, { status: 400 })

    const requested = (Array.isArray(body.channels) ? body.channels : []).filter(
      (c): c is MarketingChannelKey => isMarketingChannel(c),
    )
    if (requested.length === 0) {
      return Response.json(
        { error: 'channels must include at least one valid marketing channel.' },
        { status: 400 },
      )
    }
    const wantsNewsletter = requested.includes('newsletter')
    const wantsLinkedin = requested.includes('linkedin')
    // LinkedIn is handled by its own dual-voice + sponsor/founder fan-out,
    // so it is kept OUT of the shared single-voice text batch.
    const singleVoiceTextChannels = requested.filter(
      (c): c is TextChannelKey => isTextChannel(c) && c !== 'linkedin',
    )
    const defaultVoice: VoiceKey = body.default_voice === 'sarah' ? 'sarah' : 'club'

    const admin = getAdmin()

    // ── Load campaign + build source context ────────────────────────────
    const { data: campaign, error: cErr } = await admin
      .from('marketing_campaigns')
      .select('id, title, source_type, event_id, topic_brief, transcript')
      .eq('id', campaignId)
      .single()
    if (cErr || !campaign) {
      return Response.json({ error: 'Campaign not found' }, { status: 404 })
    }

    let sourceContext = ''
    // Library tagging (Module 5): the event this campaign draws from (when the
    // source is an event) and the primary resolved sponsorship member, stamped
    // best-effort onto assets so the content library can filter by event/sponsor.
    const eventStamp: string | null =
      campaign.source_type === 'event' ? (campaign.event_id ?? null) : null
    let sponsorMemberId: string | null = null
    if (campaign.source_type === 'event' && campaign.event_id) {
      const { data: event } = await admin
        .from('events')
        .select(
          'title, slug, status, description, event_type, speakers, agenda, venue_name, venue_city, start_date, end_date, cover_image_url, gallery_urls',
        )
        .eq('id', campaign.event_id)
        .single()
      if (event) {
        sourceContext = `SOURCE — an event:\n${formatEventContext(event)}`

        // Attendee count (recap channels lean on this). Best-effort — never fatal.
        const { count: attendeeCount } = await admin
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', campaign.event_id)
        if (typeof attendeeCount === 'number' && attendeeCount > 0) {
          sourceContext += `\nAttendees booked: ${attendeeCount}`
        }

        // Sponsor context for the sponsor_recap channel AND the LinkedIn
        // sponsor variant (LinkedIn always includes a sponsor angle).
        if (requested.includes('sponsor_recap') || requested.includes('linkedin')) {
          const { data: sponsorships } = await admin
            .from('sponsorships')
            .select('package_name, benefits, brand_alignment, member_id')
            .eq('event_id', campaign.event_id)
          if (Array.isArray(sponsorships) && sponsorships.length > 0) {
            const memberIds = sponsorships
              .map((s) => s.member_id)
              .filter((v): v is string => typeof v === 'string')
            // Primary sponsor for library tagging — the first resolved member.
            if (memberIds.length > 0) sponsorMemberId = memberIds[0]
            const companyByMember = new Map<string, string>()
            if (memberIds.length > 0) {
              const { data: members } = await admin
                .from('members')
                .select('id, company_name, first_name, last_name')
                .in('id', memberIds)
              for (const m of members ?? []) {
                const label =
                  (m.company_name as string) ||
                  [m.first_name, m.last_name].filter(Boolean).join(' ') ||
                  ''
                if (label) companyByMember.set(m.id as string, label)
              }
            }
            const sponsorLines = sponsorships.map((s, i) => {
              const who = (s.member_id && companyByMember.get(s.member_id)) || `Sponsor ${i + 1}`
              const parts = [`Sponsor: ${who}`]
              if (s.package_name) parts.push(`Package: ${s.package_name}`)
              if (s.brand_alignment) parts.push(`Brand alignment: ${s.brand_alignment}`)
              if (s.benefits) parts.push(`Benefits: ${JSON.stringify(s.benefits).slice(0, 800)}`)
              return parts.join(' · ')
            })
            sourceContext += `\n\nSponsorship details for this event:\n${sponsorLines.join('\n')}`
          }
        }
      }
    } else if (campaign.source_type === 'topic' && campaign.topic_brief) {
      sourceContext = `SOURCE — a topic brief typed by the admin:\n${campaign.topic_brief}`
    } else if (campaign.source_type === 'audio' && campaign.transcript) {
      sourceContext = `SOURCE — a transcript of an uploaded recording:\n${campaign.transcript.slice(0, 20000)}`
    }
    if (!sourceContext) {
      return Response.json(
        { error: 'Campaign has no usable source material to generate from.' },
        { status: 400 },
      )
    }

    // ── Load editable brand voices (Module 3) ───────────────────────────
    // Missing/empty rows gracefully fall back to the hardcoded Club tone.
    const voiceByKey = new Map<VoiceKey, VoiceRow>()
    {
      const { data: voiceRows } = await admin
        .from('marketing_voices')
        .select('key, name, guidance, samples')
        .in('key', [...VOICE_KEYS])
      for (const v of (voiceRows ?? []) as VoiceRow[]) {
        if (v && (v.key === 'club' || v.key === 'sarah')) voiceByKey.set(v.key, v)
      }
    }
    const voiceContext: Record<VoiceKey, string> = {
      club: buildVoiceContext(voiceByKey.get('club')),
      sarah: buildVoiceContext(voiceByKey.get('sarah')),
    }

    const openai = new OpenAI({ apiKey })
    const model =
      process.env.OPENAI_MODEL_TEMPLATE_AI ||
      process.env.OPENAI_MODEL ||
      'gpt-4o-2024-08-06'

    const written: unknown[] = []
    // instagram_carousel asset id → its AI slide text (stored on slot_values
    // in the template-graphic step below).
    const carouselSlides = new Map<string, CarouselSlide[]>()

    // Voice for the single-voice text batch: on regenerate reuse the
    // asset's stored voice; otherwise the campaign's default voice.
    let textBatchVoice: VoiceKey = defaultVoice
    if (body.regenerate_asset_id) {
      const { data: existing } = await admin
        .from('marketing_assets')
        .select('voice')
        .eq('id', body.regenerate_asset_id)
        .maybeSingle()
      if (existing?.voice === 'sarah' || existing?.voice === 'club') {
        textBatchVoice = existing.voice
      }
    }

    // ── TEXT channels (single voice): one structured call, one draft each ─
    if (singleVoiceTextChannels.length > 0) {
      const channelBriefs = singleVoiceTextChannels
        .map((c) => `- ${CHANNEL_BRIEFS[c]}`)
        .join('\n')
      const systemPrompt = `You are the marketing content writer for The Club by Sarah Restrick, a private membership community. You turn source material into polished, ready-to-review marketing copy for specific channels.

Write everything in this brand voice:
${voiceContext[textBatchVoice]}

You will receive source material and a list of channels. For EACH requested channel, produce exactly ONE asset. Return an object with an "assets" array; each item has "channel" (one of the requested channel keys), "title", "body" and "slides". "slides" is ONLY for instagram_carousel (its on-image slide text, per its brief) — for every other channel return an empty "slides" array. Do NOT invent facts, dates, names, statistics or quotes that aren't in the source — where a detail is missing, write around it gracefully. Produce only the requested channels, one asset each.

Channel briefs:
${channelBriefs}${
        singleVoiceTextChannels.some((c) => c === 'seo_blog' || c === 'recap_blog')
          ? `\n\n${SITE_LINKS}`
          : ''
      }`

      const userMessage = `Campaign: "${campaign.title}"

${sourceContext}

Requested channels (produce exactly one asset for each): ${singleVoiceTextChannels.join(', ')}`

      const startedAt = performance.now()
      let response
      try {
        response = await openai.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          response_format: { type: 'json_schema', json_schema: jsonSchemaFor() },
          temperature: 0.6,
        })
      } catch (e) {
        const message = e instanceof Error ? e.message : 'OpenAI request failed'
        console.error('[marketing/generate] OpenAI failed:', e)
        await logOpenAIUsage({
          feature: 'marketing-generate',
          model,
          startedAt,
          error: message,
          userId: auth.profile.id,
        })
        return Response.json({ error: `OpenAI: ${message}` }, { status: 502 })
      }
      await logOpenAIUsage({
        feature: 'marketing-generate',
        model,
        usage: response.usage,
        startedAt,
        userId: auth.profile.id,
      })

      const choice = response.choices[0]
      if (choice?.message?.refusal) {
        return Response.json({ error: `AI refused: ${choice.message.refusal}` }, { status: 422 })
      }
      const raw = choice?.message?.content
      if (!raw) return Response.json({ error: 'OpenAI returned an empty response.' }, { status: 502 })

      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        return Response.json({ error: 'OpenAI returned invalid JSON.' }, { status: 502 })
      }
      const validation = responseSchema.safeParse(parsed)
      if (!validation.success) {
        console.error('[marketing/generate] schema validation failed:', validation.error)
        return Response.json(
          { error: 'AI returned content that did not match the expected schema.' },
          { status: 502 },
        )
      }

      const byChannel = new Map<
        TextChannelKey,
        { title: string; body: string; slides: CarouselSlide[] }
      >()
      for (const a of validation.data.assets) {
        if ((singleVoiceTextChannels as readonly string[]).includes(a.channel)) {
          // TikTok rejects captions over 2,200 characters — trim defensively.
          let text =
            a.channel === 'tiktok' && a.body.length > TIKTOK_CAPTION_MAX
              ? a.body.slice(0, TIKTOK_CAPTION_MAX).trimEnd()
              : a.body
          let slides: CarouselSlide[] = []
          // Reel / TikTok: the body is posted verbatim — drop any "Hook:" /
          // "Caption:" labels the model slipped in (the hook belongs in title).
          const stripOpts = labelStripOptions(a.channel)
          if (stripOpts) {
            const stripped = stripPostLabels(text, stripOpts)
            if (stripped.hadScaffolding && stripped.caption) text = stripped.caption
          }
          if (a.channel === 'instagram_carousel') {
            // The body is posted verbatim as the caption — strip any
            // "Slide n:" / "Caption:" scaffolding the model slipped in, and
            // fall back to those slide lines if "slides" came back empty.
            const parsed = parseCarouselBody(text)
            if (parsed.hadScaffolding && parsed.caption) text = parsed.caption
            slides = slidesFromText(a.slides.length ? a.slides : parsed.slides)
          }
          byChannel.set(a.channel, { title: a.title, body: text, slides })
        }
      }

      for (const channel of singleVoiceTextChannels) {
        const content = byChannel.get(channel)
        if (!content) continue
        const voice = textBatchVoice
        // Library tags: sponsor_recap is addressed to the resolved sponsor.
        const sponsorMember = channel === 'sponsor_recap' ? sponsorMemberId : null

        const targetId = await resolveTargetAssetId(admin, {
          campaignId,
          channel,
          variant: undefined,
          regenerateAssetId: body.regenerate_asset_id ?? null,
        })

        if (targetId) {
          const { data: upd, error: uErr } = await admin
            .from('marketing_assets')
            .update({
              title: content.title,
              body: content.body,
              voice,
              status: 'draft',
              published_at: null,
              event_id: eventStamp,
              sponsor_member_id: sponsorMember,
            })
            .eq('id', targetId)
            .select('id, channel, variant, voice, title, body, status, email_template_id')
            .single()
          if (uErr) return Response.json({ error: uErr.message }, { status: 500 })
          written.push(upd)
          if (content.slides.length) carouselSlides.set(upd.id as string, content.slides)
        } else {
          const { data: ins, error: iErr } = await admin
            .from('marketing_assets')
            .insert({
              campaign_id: campaignId,
              channel,
              variant: null,
              voice,
              title: content.title,
              body: content.body,
              status: 'draft',
              event_id: eventStamp,
              sponsor_member_id: sponsorMember,
            })
            .select('id, channel, variant, voice, title, body, status, email_template_id')
            .single()
          if (iErr) return Response.json({ error: iErr.message }, { status: 500 })
          written.push(ins)
          if (content.slides.length) carouselSlides.set(ins.id as string, content.slides)
        }
      }
    }

    // ── LINKEDIN: dual-voice + sponsor + founder-spotlight fan-out ──────
    // Always four drafts per campaign (one per variant). Regenerating a
    // single LinkedIn card only touches that one variant.
    if (wantsLinkedin) {
      // Which variants to (re)generate. On a single-variant regenerate,
      // only that variant; otherwise all four.
      let variantsToProduce: LinkedInVariantKey[] = [...LINKEDIN_VARIANTS]
      if (body.regenerate_asset_id) {
        const { data: tgt } = await admin
          .from('marketing_assets')
          .select('channel, variant')
          .eq('id', body.regenerate_asset_id)
          .maybeSingle()
        if (
          tgt?.channel === 'linkedin' &&
          typeof tgt.variant === 'string' &&
          (LINKEDIN_VARIANTS as readonly string[]).includes(tgt.variant)
        ) {
          variantsToProduce = [tgt.variant as LinkedInVariantKey]
        }
      }

      const variantBriefs = variantsToProduce
        .map((v) => `- ${LINKEDIN_VARIANT_BRIEFS[v]}`)
        .join('\n')
      const systemPrompt = `You are the LinkedIn writer for The Club by Sarah Restrick, a private membership community. From the same source material you produce several distinct LinkedIn posts, each in a specific voice and angle.

There are two brand voices. Write each variant strictly in the voice its brief names.

=== VOICE: The Club (formal luxury) ===
${voiceContext.club}

=== VOICE: Sarah (warm founder, first person) ===
${voiceContext.sarah}

Return an object with an "assets" array; each item has "variant" (exactly one of the requested variant keys), "title" (a short internal label), and "body" (the LinkedIn post). Do NOT invent facts, dates, names, statistics or quotes that aren't in the source — write around missing detail gracefully. Produce exactly one asset per requested variant, and make the variants genuinely distinct from one another.

Variant briefs:
${variantBriefs}`

      const userMessage = `Campaign: "${campaign.title}"

${sourceContext}

Requested LinkedIn variants (produce exactly one asset for each): ${variantsToProduce.join(', ')}`

      const startedAt = performance.now()
      let response
      try {
        response = await openai.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: linkedinJsonSchemaFor(variantsToProduce),
          },
          temperature: 0.7,
        })
      } catch (e) {
        const message = e instanceof Error ? e.message : 'OpenAI request failed'
        console.error('[marketing/generate] LinkedIn OpenAI failed:', e)
        await logOpenAIUsage({
          feature: 'marketing-generate-linkedin',
          model,
          startedAt,
          error: message,
          userId: auth.profile.id,
        })
        return Response.json({ error: `OpenAI: ${message}` }, { status: 502 })
      }
      await logOpenAIUsage({
        feature: 'marketing-generate-linkedin',
        model,
        usage: response.usage,
        startedAt,
        userId: auth.profile.id,
      })

      const choice = response.choices[0]
      if (choice?.message?.refusal) {
        return Response.json({ error: `AI refused: ${choice.message.refusal}` }, { status: 422 })
      }
      const raw = choice?.message?.content
      if (!raw) return Response.json({ error: 'OpenAI returned an empty response.' }, { status: 502 })

      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        return Response.json({ error: 'OpenAI returned invalid JSON.' }, { status: 502 })
      }
      const validation = linkedinResponseSchema.safeParse(parsed)
      if (!validation.success) {
        console.error('[marketing/generate] LinkedIn schema validation failed:', validation.error)
        return Response.json(
          { error: 'AI returned LinkedIn content that did not match the expected schema.' },
          { status: 502 },
        )
      }

      const byVariant = new Map<LinkedInVariantKey, { title: string; body: string }>()
      for (const a of validation.data.assets) {
        if (variantsToProduce.includes(a.variant)) {
          byVariant.set(a.variant, { title: a.title, body: a.body })
        }
      }

      for (const variant of variantsToProduce) {
        const content = byVariant.get(variant)
        if (!content) continue
        const voice = LINKEDIN_VARIANT_META[variant].voice
        // Library tags: only the sponsor variant is tied to a sponsor member.
        const sponsorMember = variant === 'sponsor' ? sponsorMemberId : null

        const targetId = await resolveTargetAssetId(admin, {
          campaignId,
          channel: 'linkedin',
          variant,
          regenerateAssetId: body.regenerate_asset_id ?? null,
        })

        if (targetId) {
          const { data: upd, error: uErr } = await admin
            .from('marketing_assets')
            .update({
              title: content.title,
              body: content.body,
              voice,
              variant,
              status: 'draft',
              published_at: null,
              event_id: eventStamp,
              sponsor_member_id: sponsorMember,
            })
            .eq('id', targetId)
            .select('id, channel, variant, voice, title, body, status, email_template_id')
            .single()
          if (uErr) return Response.json({ error: uErr.message }, { status: 500 })
          written.push(upd)
        } else {
          const { data: ins, error: iErr } = await admin
            .from('marketing_assets')
            .insert({
              campaign_id: campaignId,
              channel: 'linkedin',
              variant,
              voice,
              title: content.title,
              body: content.body,
              status: 'draft',
              event_id: eventStamp,
              sponsor_member_id: sponsorMember,
            })
            .select('id, channel, variant, voice, title, body, status, email_template_id')
            .single()
          if (iErr) return Response.json({ error: iErr.message }, { status: 500 })
          written.push(ins)
        }
      }
    }

    // ── NEWSLETTER: real email blocks → email_templates row → linked asset ─
    if (wantsNewsletter) {
      let draft
      const startedAt = performance.now()
      try {
        draft = await generateNewsletterDraft({
          openai,
          model,
          campaignTitle: campaign.title,
          sourceContext,
        })
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Newsletter generation failed'
        console.error('[marketing/generate] newsletter failed:', e)
        await logOpenAIUsage({
          feature: 'marketing-generate-newsletter',
          model,
          startedAt,
          error: message,
          userId: auth.profile.id,
        })
        return Response.json({ error: message }, { status: 502 })
      }
      await logOpenAIUsage({
        feature: 'marketing-generate-newsletter',
        model,
        startedAt,
        userId: auth.profile.id,
      })

      const targetId = await resolveTargetAssetId(admin, {
        campaignId,
        channel: 'newsletter',
        variant: undefined,
        regenerateAssetId: body.regenerate_asset_id ?? null,
      })

      // Reuse the linked email_templates row on regenerate, else create one.
      let emailTemplateId: string | null = null
      if (targetId) {
        const { data: existingAsset } = await admin
          .from('marketing_assets')
          .select('email_template_id')
          .eq('id', targetId)
          .maybeSingle()
        emailTemplateId = (existingAsset?.email_template_id as string | null) ?? null
      }

      const templateRow = {
        name: draft.name,
        subject: draft.subject,
        preheader: draft.preheader,
        body_html: draft.bodyHtml,
        body_json: draft.bodyJson,
        theme: draft.theme,
        category: 'campaign' as const,
        is_draft: true,
      }

      if (emailTemplateId) {
        const { error: tErr } = await admin
          .from('email_templates')
          .update(templateRow)
          .eq('id', emailTemplateId)
        if (tErr) return Response.json({ error: tErr.message }, { status: 500 })
      } else {
        const { data: tIns, error: tErr } = await admin
          .from('email_templates')
          .insert({ ...templateRow, created_by_id: auth.profile.id })
          .select('id')
          .single()
        if (tErr) return Response.json({ error: tErr.message }, { status: 500 })
        emailTemplateId = tIns.id as string
      }

      const assetRow = {
        title: draft.subject,
        body: draft.textSummary,
        body_html: draft.bodyHtml,
        body_json: draft.bodyJson,
        email_template_id: emailTemplateId,
        voice: null,
        status: 'draft' as const,
        published_at: null,
        event_id: eventStamp, // library tag
      }

      if (targetId) {
        const { data: upd, error: uErr } = await admin
          .from('marketing_assets')
          .update(assetRow)
          .eq('id', targetId)
          .select('id, channel, voice, title, body, status, email_template_id')
          .single()
        if (uErr) return Response.json({ error: uErr.message }, { status: 500 })
        written.push(upd)
      } else {
        const { data: ins, error: iErr } = await admin
          .from('marketing_assets')
          .insert({
            campaign_id: campaignId,
            channel: 'newsletter',
            ...assetRow,
          })
          .select('id, channel, voice, title, body, status, email_template_id')
          .single()
        if (iErr) return Response.json({ error: iErr.message }, { status: 500 })
        written.push(ins)
      }
    }

    // ── TEMPLATE GRAPHIC: assign a template + AI text per social asset ───
    // NEW MODEL (client-confirmed): the AI writes the caption AND derives the
    // on-graphic heading/subtext AND assigns a template — but it does NOT pick
    // or generate an image, and NOTHING is rendered here. There is no image
    // yet: the admin picks one from Google Drive per-post in the approval-queue
    // editor, which renders the graphic there. So for each social asset we set
    // template_id + slot_values (the derived heading/subtext, photo null) and
    // leave graphic_url = NULL. The editor pre-fills from slot_values.
    //   * Template: an explicit override (body.template_id) wins, else the
    //     default template (photo template preferred so the editor prompts for
    //     a Drive image; colour default as fallback).
    //   * Heading/subtext come from THAT asset's own title/body (its angle) —
    //     no extra AI call.
    // Skipped entirely when the admin chose "No graphic (caption only)"
    // (graphic_mode === 'none') → template_id stays null, no graphic ever.
    // Best-effort — an assign failure never fails the (already-written) drafts.
    if (body.graphic_mode !== 'none') {
      const socialAssets = (written as Record<string, unknown>[]).filter(
        (a) =>
          a &&
          typeof a.channel === 'string' &&
          SOCIAL_GRAPHIC_CHANNELS.has(a.channel) &&
          typeof a.id === 'string',
      )

      if (socialAssets.length > 0) {
        try {
          // Resolve the template once: explicit override, else the default
          // template (photo template preferred; colour default as fallback).
          let template: MarketingTemplate | null = null
          if (body.template_id) {
            template = await loadTemplate(admin, body.template_id)
          }
          if (!template) {
            template =
              (await pickDefaultTemplate(admin, 'photo')) ??
              (await pickDefaultTemplate(admin, 'color'))
          }

          if (template) {
            for (const a of socialAssets) {
              try {
                // Per-post heading/subtext from the asset's own content — no AI
                // call, no image. Stored so the editor pre-fills them.
                const graphicText = {
                  heading: deriveGraphicHeading(a),
                  subtext: deriveGraphicSubtext(a),
                }
                let slotValues: SlotValues = buildSlotValues(template, graphicText, null)
                const update: Record<string, unknown> = {
                  template_id: template.id,
                  graphic_url: null,
                  slot_values: slotValues,
                }

                // Instagram carousel: one set of slide text per slide, all on
                // the same template/shape. Slide 1 also fills the template's
                // heading/subtext. Old slide renders (publish_target.media_urls)
                // are cleared — they belong to the previous draft.
                if (a.channel === 'instagram_carousel') {
                  const slides = carouselSlides.get(a.id as string) ?? []
                  slotValues = {
                    ...(slides.length
                      ? buildSlotValues(
                          template,
                          { heading: slides[0].heading, subtext: slides[0].subtext },
                          null,
                        )
                      : slotValues),
                    slides: slides.length
                      ? slides
                      : slidesFromText([{ heading: graphicText.heading, subtext: graphicText.subtext }]),
                    carousel_shape: carouselShapeFor(template.shape),
                  }
                  update.slot_values = slotValues
                  const target = await clearedCarouselTarget(admin, a.id as string)
                  if (target !== undefined) {
                    update.publish_target = target
                    a.publish_target = target
                  }
                }

                await admin
                  .from('marketing_assets')
                  .update(update)
                  .eq('id', a.id as string)

                // Reflect on the returned row so the client shows the assigned
                // template + pre-filled text (still NO graphic yet).
                a.template_id = template.id
                a.graphic_url = null
                a.slot_values = slotValues
              } catch (e) {
                console.error(
                  '[marketing/generate] per-asset graphic assign failed (non-fatal):',
                  e,
                )
              }
            }
          }
        } catch (e) {
          console.error('[marketing/generate] template graphic assign failed (non-fatal):', e)
        }
      }
    }
    {
      // Carousel slides not stored above (caption-only mode, or no template
      // exists): still keep the slide text so the admin can build the slides
      // in the queue later.
      for (const a of written as Record<string, unknown>[]) {
        if (a?.channel !== 'instagram_carousel' || typeof a.id !== 'string') continue
        if ((a.slot_values as SlotValues | undefined)?.slides) continue
        const slides = carouselSlides.get(a.id)
        if (!slides?.length) continue
        const slotValues: SlotValues = { slides, carousel_shape: carouselShapeFor(null) }
        const update: Record<string, unknown> = { slot_values: slotValues, graphic_url: null }
        const target = await clearedCarouselTarget(admin, a.id)
        if (target !== undefined) {
          update.publish_target = target
          a.publish_target = target
        }
        await admin.from('marketing_assets').update(update).eq('id', a.id)
        a.slot_values = slotValues
        a.graphic_url = null
      }
    }

    // Campaign is 'ready' once it has drafts to review.
    await admin.from('marketing_campaigns').update({ status: 'ready' }).eq('id', campaignId)

    return Response.json({ assets: written })
  } catch (e) {
    console.error('[marketing/generate] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}

// A regenerated carousel's old slide renders (publish_target.media_urls) no
// longer match its new slides — drop them, keep everything else (e.g. the
// "Send again" history). undefined = nothing to change.
async function clearedCarouselTarget(
  admin: ReturnType<typeof getAdmin>,
  assetId: string,
): Promise<Record<string, unknown> | null | undefined> {
  const { data } = await admin
    .from('marketing_assets')
    .select('publish_target')
    .eq('id', assetId)
    .maybeSingle()
  const t = (data?.publish_target as Record<string, unknown> | null) ?? null
  if (!t || !('media_urls' in t)) return undefined
  const rest = { ...t }
  delete rest.media_urls
  return Object.keys(rest).length ? rest : null
}

// Which existing row to overwrite for a (channel, variant): the explicit
// regenerate target if it matches, else the campaign's existing draft for
// that channel+variant (keeps ONE draft per channel/variant), else null →
// insert a new one. `variant` is `undefined` for single-draft channels
// (matched as variant IS NULL); a variant key for LinkedIn drafts.
async function resolveTargetAssetId(
  admin: ReturnType<typeof getAdmin>,
  args: {
    campaignId: string
    channel: string
    variant?: string | undefined
    regenerateAssetId: string | null
  },
): Promise<string | null> {
  const { campaignId, channel, variant, regenerateAssetId } = args
  if (regenerateAssetId) {
    const { data: tgt } = await admin
      .from('marketing_assets')
      .select('id, channel, variant')
      .eq('id', regenerateAssetId)
      .single()
    if (
      tgt &&
      tgt.channel === channel &&
      (variant === undefined || (tgt.variant ?? null) === variant)
    ) {
      return tgt.id as string
    }
  }
  let query = admin
    .from('marketing_assets')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('channel', channel)
  query = variant === undefined ? query.is('variant', null) : query.eq('variant', variant)
  const { data: existing } = await query.limit(1).maybeSingle()
  return existing ? (existing.id as string) : null
}

// Per-asset on-graphic text is derived from THAT asset's own generated
// title/body (its angle), so each social post's graphic is distinct — no extra
// AI call. Falls back to empty strings so the graphic still renders (fixed
// slots + photo) if a post somehow has no usable text.

// Light Markdown/label cleanup for on-image copy (no headings, emphasis, links,
// or "Slide 1:" / "Hook:" / "Caption:" scaffolding).
function cleanGraphicText(s: string): string {
  return s
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → label
    .replace(/[#*_>`~]/g, '') // md punctuation
    .replace(/^\s*(slide\s*\d+|hook|caption)\s*:\s*/i, '') // scaffolding labels
    .replace(/\s+/g, ' ')
    .trim()
}

function firstNonEmptyLine(body: string): string {
  return (
    body
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? ''
  )
}

// HEADING ← the asset's own title (its angle); fallback to the first line of
// its body. Trimmed to a graphic-friendly length.
function deriveGraphicHeading(a: Record<string, unknown>): string {
  const title = typeof a.title === 'string' ? cleanGraphicText(a.title) : ''
  if (title) return title.slice(0, 80)
  const body = typeof a.body === 'string' ? a.body : ''
  return cleanGraphicText(firstNonEmptyLine(body)).slice(0, 80)
}

// SUBTEXT ← a short slice of the asset's own body (first sentence-ish, capped).
function deriveGraphicSubtext(a: Record<string, unknown>): string {
  const body = typeof a.body === 'string' ? a.body : ''
  const cleaned = cleanGraphicText(body)
  if (!cleaned) return ''
  const sentence = cleaned.split(/(?<=[.!?])\s/)[0] ?? cleaned
  return sentence.slice(0, 140).trim()
}
