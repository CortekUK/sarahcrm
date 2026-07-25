// Publisher selection — the ONE place to change when a real integration lands.
//
// getPublisher(channel) returns the publisher responsible for a channel:
//   * social / blog / PR  → MockPublisher (marks published, fake id) for now;
//     swap individual channels to MetricoolPublisher here once it's built.
//   * email (newsletter)  → NOT handled here. Email sends through the existing
//     Resend pipeline behind its own approval step (wired in a later module);
//     getPublisher throws for email so callers must route it deliberately.

import type { MarketingChannel, Publisher } from './types'
import { MockPublisher } from './mock'

export * from './types'
export { MockPublisher } from './mock'
export { MetricoolPublisher } from './metricool'

const mock = new MockPublisher()

// Channels that publish through the social/blog/PR adapter (mock today).
const ADAPTER_CHANNELS: ReadonlySet<MarketingChannel> = new Set([
  'seo_blog',
  'recap_blog',
  'linkedin',
  'instagram_feed',
  'instagram_carousel',
  'instagram_reel',
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
    // TODO(metricool): return new MetricoolPublisher() for live channels here.
    return mock
  }
  throw new Error(`No publisher configured for channel "${channel}".`)
}
