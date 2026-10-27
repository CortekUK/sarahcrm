// Browser-only: read a video's duration / dimensions (and, when the host
// allows it, its byte size + content type) from a URL — used by the Instagram
// carousel editor to check a video slide the moment it's picked.
//
// Duration + dimensions come from a detached <video preload="metadata">
// element; reading metadata needs no CORS. Size + type come from a HEAD
// request, which DOES need CORS (Supabase Storage allows it; arbitrary
// external hosts may not) — failures there just leave those facts null.

export interface VideoMeta {
  duration_s: number | null
  width: number | null
  height: number | null
  size_bytes: number | null
  mime: string | null
}

const METADATA_TIMEOUT_MS = 20_000

function readElementMetadata(url: string): Promise<Pick<VideoMeta, 'duration_s' | 'width' | 'height'>> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    let settled = false
    const done = (v: Pick<VideoMeta, 'duration_s' | 'width' | 'height'>) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      video.removeAttribute('src')
      video.load()
      resolve(v)
    }
    const timer = setTimeout(() => done({ duration_s: null, width: null, height: null }), METADATA_TIMEOUT_MS)
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.onloadedmetadata = () =>
      done({
        duration_s: Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null,
        width: video.videoWidth || null,
        height: video.videoHeight || null,
      })
    video.onerror = () => done({ duration_s: null, width: null, height: null })
    video.src = url
  })
}

async function readHead(url: string): Promise<Pick<VideoMeta, 'size_bytes' | 'mime'>> {
  try {
    const res = await fetch(url, { method: 'HEAD' })
    if (!res.ok) return { size_bytes: null, mime: null }
    const len = Number(res.headers.get('content-length'))
    return {
      size_bytes: Number.isFinite(len) && len > 0 ? len : null,
      mime: res.headers.get('content-type'),
    }
  } catch {
    return { size_bytes: null, mime: null }
  }
}

export async function readVideoMeta(url: string): Promise<VideoMeta> {
  const [el, head] = await Promise.all([readElementMetadata(url), readHead(url)])
  return { ...el, ...head }
}
