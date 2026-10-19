// Publisher selection — the ONE place to change when a real integration lands.
//
// getPublisher(channel) returns the publisher responsible for a channel:
//   * social (linkedin, instagram_*, facebook, tiktok) → MetricoolPublisher when
//     Metricool is configured (token + userId + blogId all set), else
//     MockPublisher. Draft vs live is decided inside MetricoolPublisher by
//     METRICOOL_MODE.
//   * blog (seo_blog, recap_blog)    → BlogPublisher: a real public post on
//     the website's /blog (no external service — our own blog_posts table).
//   * PR / sponsor_recap             → MockPublisher (marks published, fake id).
//   * email (newsletter)  → NOT handled here. Email sends through the existing
//     Resend pipeline behind its own approval step (wired in a later module);
//     getPublisher throws for email so callers must route it deliberately.

import type { MarketingChannel, Publisher } from './types'
import { MockPublisher } from './mock'
import { MetricoolPublisher, METRICOOL_CHANNELS } from './metricool'
import { isMetricoolConfigured } from './metricool-client'
import { BlogPublisher } from './blog'
import { isBlogChannel } from '@/lib/marketing/channels'

export * from './types'
export { MockPublisher } from './mock'
export { MetricoolPublisher } from './metricool'
export { BlogPublisher, unpublishBlogPost } from './blog'

const mock = new MockPublisher()
const metricool = new MetricoolPublisher()
const blog = new BlogPublisher()

// Channels that publish through the social/blog/PR adapter.
const ADAPTER_CHANNELS: ReadonlySet<MarketingChannel> = new Set([
  'seo_blog',
  'recap_blog',
  'linkedin',
  'instagram_feed',
  'instagram_carousel',
  'instagram_reel',
  'facebook',
  'tiktok',
  'press_release',
  'sponsor_recap',
])

export function getPublisher(channel: MarketingChannel): Publisher {
  if (channel === 'newsletter') {
    throw new Error(
      'Email channels publish via the Resend pipeline, not the publishing adapter.',
    )
  }
  if (ADAPTER_CHANNELS.has(channel)) {
    // Blog channels always publish to the website's own blog.
    if (isBlogChannel(channel)) return blog
    // Social channels go to Metricool only when all three credentials are set
    // (checked per request, so adding/removing env vars needs no code change);
    // otherwise — and always for PR/sponsor_recap — the mock, as before.
    if (METRICOOL_CHANNELS[channel] && isMetricoolConfigured()) return metricool
    return mock
  }
  throw new Error(`No publisher configured for channel "${channel}".`)
}
