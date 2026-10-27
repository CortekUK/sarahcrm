// Server-side Instagram Reel video check — used by the asset route on save
// and approve. Only BLOCKING problems (no link / not https / not MP4-MOV);
// a link without a .mp4/.mov extension is accepted when the host's HEAD
// Content-Type says it is an MP4 / MOV. Length / size / shape stay warnings
// (shown in the editor) — never a block.

import { headFacts } from './graphics/carousel-server'
import { reelVideoProblems } from './reel'
import { hasCarouselVideoExtension } from './graphics/carousel'

export async function reelVideoServerProblems(url: string | null): Promise<string[]> {
  if (!url) return reelVideoProblems({ url: null })
  const quick = reelVideoProblems({ url })
  if (!quick.length) return []
  // Only the type check can be rescued by a HEAD (the link check can't).
  if (!/^https?:\/\//i.test(url) || hasCarouselVideoExtension(url)) return quick
  const head = await headFacts(url)
  return reelVideoProblems({ url, mime: head.mime })
}
