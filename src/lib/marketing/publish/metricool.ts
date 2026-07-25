// MetricoolPublisher — documented STUB.
//
// This is the drop-in slot for real social publishing once the client connects
// a Metricool account. When that lands:
//   1. Implement publish() against the Metricool API (schedule/publish post,
//      map channel -> Metricool "brand"/network, return the real post id).
//   2. Flip the relevant channels in ./index.ts from MockPublisher to this.
// Nothing else in the codebase should need to change — the asset route already
// treats every publisher through the Publisher interface.
//
// Until then it throws so it can never silently no-op or fake a success.

import type { Publisher, PublishableAsset, PublishResult } from './types'

export class MetricoolPublisher implements Publisher {
  readonly name = 'metricool'

  async publish(_asset: PublishableAsset): Promise<PublishResult> {
    throw new Error(
      'NotImplemented: Metricool publishing is not wired yet. ' +
        'Connect a Metricool account and implement MetricoolPublisher.publish, ' +
        'then switch the channel over in src/lib/marketing/publish/index.ts.',
    )
  }
}
