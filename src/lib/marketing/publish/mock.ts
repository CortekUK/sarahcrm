// MockPublisher — the default publisher for social / blog / PR channels while
// live integrations are not connected (Metricool is blocked on the client
// linking their account).
//
// It does NOT hit any external service. It logs the intended publish, returns
// ok:true with a fake externalId, and reflects the intended target back so the
// asset route can persist it in publish_target and stamp published_at. From
// the UI's perspective the approval -> published transition behaves exactly as
// it will once a real publisher is dropped in — only ./index.ts changes then.

import type { Publisher, PublishableAsset, PublishResult } from './types'

export class MockPublisher implements Publisher {
  readonly name = 'mock'

  async publish(asset: PublishableAsset): Promise<PublishResult> {
    const target = {
      platform: asset.channel,
      mock: true,
      // Carry the rendered graphic through so a real publisher can attach it.
      ...(asset.graphic_url ? { image: asset.graphic_url } : {}),
      ...(asset.publish_target ?? {}),
    }
    const externalId = `mock_${asset.channel}_${asset.id.slice(0, 8)}_${Date.now()}`
    console.log('[marketing/publish] MOCK publish', {
      assetId: asset.id,
      channel: asset.channel,
      title: asset.title,
      externalId,
    })
    return { ok: true, externalId, target }
  }
}
