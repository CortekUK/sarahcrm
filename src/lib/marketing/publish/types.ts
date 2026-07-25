// Publishing adapter — shared types.
//
// The Marketing AI Engine NEVER auto-publishes. A human approves an asset in
// the approval queue; only THEN does the asset route hand it to a Publisher.
// This interface is the single seam that a real integration (Metricool) will
// implement later — see ./metricool.ts. Today, social/blog/PR go through the
// MockPublisher (./mock.ts) and email channels are handled by the existing
// Resend pipeline (wired in a later module).

export type MarketingChannel =
  | 'seo_blog'
  | 'recap_blog'
  | 'linkedin'
  | 'instagram_feed'
  | 'instagram_carousel'
  | 'instagram_reel'
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
  publish_target?: Record<string, unknown> | null
}

export interface PublishResult {
  ok: boolean
  externalId?: string
  error?: string
  // Echoed back so the caller can persist what was (mock-)published where.
  target?: Record<string, unknown>
}

export interface Publisher {
  readonly name: string
  publish(asset: PublishableAsset): Promise<PublishResult>
}
