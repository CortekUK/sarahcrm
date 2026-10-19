// Publishing adapter — shared types.
//
// The Marketing AI Engine NEVER auto-publishes. A human approves an asset in
// the approval queue; only THEN does the asset route hand it to a Publisher.
// This interface is the single seam every publisher implements: social
// channels go through MetricoolPublisher (./metricool.ts) when Metricool is
// configured, blog channels through BlogPublisher (./blog.ts — a public post
// on the website's /blog), everything else (and social when Metricool isn't
// configured) through the MockPublisher (./mock.ts). Email channels are handled by the existing
// Resend pipeline.

export type MarketingChannel =
  | 'seo_blog'
  | 'recap_blog'
  | 'linkedin'
  | 'instagram_feed'
  | 'instagram_carousel'
  | 'instagram_reel'
  | 'facebook'
  | 'tiktok'
  | 'newsletter'
  | 'press_release'
  | 'sponsor_recap'

// The minimal slice of a marketing_assets row a publisher needs.
export interface PublishableAsset {
  id: string
  channel: MarketingChannel
  title: string | null
  body: string | null
  body_html?: string | null
  // Rendered Template Graphic PNG URL (when the piece uses a template). The
  // mock publisher echoes it into the target so a future Metricool publisher
  // already has the image to attach.
  graphic_url?: string | null
  // When the piece should go out (marketing_assets.scheduled_at). Metricool
  // uses it as the publication time if it's in the future.
  scheduled_at?: string | null
  // Free-form per-asset publish hints. MetricoolPublisher reads two optional
  // keys from it (there are no dedicated columns yet):
  //   video_url  — public video URL, REQUIRED for instagram_reel; for tiktok
  //                it makes the post a TikTok VIDEO (else a photo post);
  //   media_urls — extra public image URLs for instagram_carousel, and for a
  //                tiktok photo post (graphic + these → photo carousel).
  publish_target?: Record<string, unknown> | null
  // The event this piece is about (marketing_assets.event_id, the library
  // tag). BlogPublisher links the public post to it and falls back to the
  // event's cover image when there is no graphic_url.
  event_id?: string | null
}

export interface PublishResult {
  ok: boolean
  externalId?: string
  error?: string
  // true when the piece was handed over as a DRAFT that still needs a final
  // approval inside the external tool (Metricool draft mode). The asset route
  // then records it as 'approved' (not 'published') and leaves published_at
  // empty.
  draft?: boolean
  // Echoed back so the caller can persist what was (mock-)published where.
  target?: Record<string, unknown>
}

export interface Publisher {
  readonly name: string
  publish(asset: PublishableAsset): Promise<PublishResult>
}
