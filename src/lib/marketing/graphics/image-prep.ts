// Template Graphics — server-side photo preparation (EXIF orientation).
//
// WHY: phone cameras store pixels sideways and add an EXIF "Orientation" tag
// telling viewers how to rotate them. Browsers honour the tag (the photo looks
// upright in the picker) but satori/resvg (next/og ImageResponse) IGNORE it,
// so a portrait phone photo rendered into a template came out rotated 90°.
//
// FIX: before a photo URL reaches ImageResponse we fetch it ourselves, run it
// through sharp — `.rotate()` with no angle = auto-orient from EXIF (and strips
// the tag) — downscale it to just cover the canvas, re-encode as JPEG and hand
// satori a data: URI. Any failure falls back to the original URL (the old
// behaviour), so a fetch/processing problem never breaks a render.
//
// The same helpers back the "use image as-is" path (orientRoute): a raw image
// posted directly gets an upright copy written to storage when its EXIF
// orientation isn't 1 (Instagram usually honours EXIF, but we don't rely on it).
//
// SAFETY (we fetch admin-supplied URLs server-side):
//   * http(s) only; every redirect hop re-checked (max 3 hops);
//   * the hostname must resolve ONLY to public addresses — loopback, private,
//     link-local (incl. cloud metadata 169.254.169.254), CGNAT, ULA, multicast
//     and reserved ranges are refused (SSRF guard);
//   * 10s timeout, 25 MB cap (Content-Length AND streamed byte count);
//   * image/* content types only; sharp then validates the bytes.
//   * Site-relative paths ("/gallery/x.png") and same-origin URLs are read
//     from the app's own public/ folder instead (never via HTTP to ourselves),
//     with a path-traversal check.
//
// Node runtime only (sharp is a native module) — never import from edge or
// client code.

import { lookup } from 'node:dns/promises'
import net from 'node:net'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import { toAbsoluteUrl } from './resolve'
import { SHAPE_DIMS } from './types'
import type { GraphicShape, MarketingTemplate, SlotValues } from './types'

export const IMAGE_FETCH_TIMEOUT_MS = 10_000
export const IMAGE_MAX_BYTES = 25 * 1024 * 1024
const MAX_REDIRECTS = 3

// ── SSRF guard ──────────────────────────────────────────────────────────────

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0
}

function inV4Range(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask)
}

const BLOCKED_V4: [string, number][] = [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (cloud metadata)
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
]

/** True when an IP literal is NOT a public unicast address. */
export function isBlockedIp(ip: string): boolean {
  const kind = net.isIP(ip)
  if (kind === 4) return BLOCKED_V4.some(([b, bits]) => inV4Range(ip, b, bits))
  if (kind === 6) {
    const v6 = ip.toLowerCase().split('%')[0]
    // IPv4-mapped / NAT64-embedded → judge the embedded v4 address.
    const mapped = v6.match(/^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isBlockedIp(mapped[1])
    if (v6 === '::' || v6 === '::1') return true
    const first = parseInt(v6.split(':')[0] || '0', 16)
    if ((first & 0xfe00) === 0xfc00) return true // fc00::/7 unique-local
    if ((first & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00) return true // ff00::/8 multicast
    if (v6.startsWith('::ffff:')) return true // other mapped forms — refuse
    return false
  }
  return true // not an IP at all
}

async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, '')
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw new Error('Image host is not allowed.')
  }
  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new Error('Image host is not allowed.')
    return
  }
  const addrs = await lookup(host, { all: true, verbatim: true })
  if (!addrs.length || addrs.some((a) => isBlockedIp(a.address))) {
    throw new Error('Image host is not allowed.')
  }
}

// ── Fetching ────────────────────────────────────────────────────────────────

const EXT_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
}

// Site-relative or same-origin image → read from public/ (never HTTP to self,
// which the SSRF guard would refuse anyway on localhost). null = not local.
async function readLocalPublic(url: string, origin?: string): Promise<Buffer | null> {
  let pathname: string | null = null
  if (url.startsWith('/') && !url.startsWith('//')) pathname = url.split(/[?#]/)[0]
  else if (origin) {
    try {
      const u = new URL(url)
      if (u.origin === new URL(origin).origin) pathname = u.pathname
    } catch {
      /* not a URL */
    }
  }
  if (!pathname) return null
  const publicDir = path.join(process.cwd(), 'public')
  const file = path.resolve(publicDir, '.' + decodeURIComponent(pathname))
  if (!file.startsWith(publicDir + path.sep)) throw new Error('Invalid image path.')
  if (!EXT_MIME[path.extname(file).toLowerCase()]) throw new Error('Not an image file.')
  const buf = await readFile(file)
  if (buf.length > IMAGE_MAX_BYTES) throw new Error('Image is too large.')
  return buf
}

async function readCapped(res: Response): Promise<Buffer> {
  const declared = Number(res.headers.get('content-length') ?? '0')
  if (declared > IMAGE_MAX_BYTES) throw new Error('Image is too large (max 25 MB).')
  if (!res.body) return Buffer.alloc(0)
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > IMAGE_MAX_BYTES) {
      await reader.cancel().catch(() => {})
      throw new Error('Image is too large (max 25 MB).')
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

/**
 * Fetch an image safely (see header). Throws a user-safe Error on refusal.
 * Accepts absolute http(s) URLs, site-relative paths and same-origin URLs.
 */
export async function fetchImageSafely(rawUrl: string, origin?: string): Promise<Buffer> {
  const local = await readLocalPublic(rawUrl.trim(), origin)
  if (local) return local

  let current = toAbsoluteUrl(rawUrl, origin) ?? ''
  const deadline = AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let u: URL
    try {
      u = new URL(current)
    } catch {
      throw new Error('Invalid image URL.')
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Only http(s) image URLs are allowed.')
    if (u.username || u.password) throw new Error('Image URLs with credentials are not allowed.')
    await assertPublicHost(u.hostname)

    const res = await fetch(u, { redirect: 'manual', signal: deadline, headers: { Accept: 'image/*' } })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      await res.body?.cancel().catch(() => {})
      if (!loc) throw new Error('Image redirect without a location.')
      current = new URL(loc, u).toString()
      continue
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {})
      throw new Error(`Image fetch failed (HTTP ${res.status}).`)
    }
    const type = (res.headers.get('content-type') ?? '').toLowerCase()
    if (!type.startsWith('image/')) {
      await res.body?.cancel().catch(() => {})
      throw new Error('That URL is not an image.')
    }
    return readCapped(res)
  }
  throw new Error('Too many redirects fetching the image.')
}

// ── Processing ──────────────────────────────────────────────────────────────

const SHARP_INPUT = { failOn: 'none' as const, limitInputPixels: 120_000_000 }

/**
 * Auto-orient (EXIF) + downscale so the image just COVERS width×height (aspect
 * kept, never enlarged — the renderer's objectFit:cover does the crop) and
 * re-encode as JPEG q85. Returns the JPEG bytes.
 */
export async function orientAndFit(input: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(input, SHARP_INPUT)
    .rotate()
    .resize({ width, height, fit: 'outside', withoutEnlargement: true })
    .flatten({ background: '#211D19' })
    .jpeg({ quality: 85 })
    .toBuffer()
}

/** EXIF orientation of an image (1 = upright / no tag). */
export async function exifOrientation(input: Buffer): Promise<number> {
  const meta = await sharp(input, SHARP_INPUT).metadata()
  return meta.orientation ?? 1
}

/**
 * A photo URL → data: URI of an upright, canvas-sized JPEG. null on any
 * failure (caller keeps the original URL).
 */
export async function prepareImageForRender(
  url: string | null | undefined,
  dims: { w: number; h: number },
  origin?: string,
): Promise<string | null> {
  if (!url || !url.trim() || url.startsWith('data:')) return null
  try {
    const src = await fetchImageSafely(url, origin)
    const out = await orientAndFit(src, dims.w, dims.h)
    return `data:image/jpeg;base64,${out.toString('base64')}`
  } catch (e) {
    console.warn('[marketing/graphics] photo prep failed, using original URL:', e instanceof Error ? e.message : e)
    return null
  }
}

/**
 * Replace every photo the template will draw (background photo, the
 * template's own default background photo, photo slots) with an upright,
 * pre-sized data: URI. Unprocessable photos keep their original URL.
 */
export async function prepareRenderInputs(args: {
  template: MarketingTemplate
  values: SlotValues
  shape: GraphicShape
  origin?: string
}): Promise<{ template: MarketingTemplate; values: SlotValues }> {
  const { origin } = args
  const dims = SHAPE_DIMS[args.shape] ?? SHAPE_DIMS.square
  const cache = new Map<string, Promise<string | null>>()
  const prep = (u: string | null | undefined): Promise<string | null> => {
    if (!u || !u.trim()) return Promise.resolve(null)
    let p = cache.get(u)
    if (!p) {
      p = prepareImageForRender(u, dims, origin)
      cache.set(u, p)
    }
    return p
  }

  const values: SlotValues = { ...args.values, slots: { ...(args.values.slots ?? {}) } }
  let template = args.template

  const jobs: Promise<void>[] = []
  if (values.background_photo_url) {
    const orig = values.background_photo_url
    jobs.push(prep(orig).then((d) => void (values.background_photo_url = d ?? orig)))
  } else if (template.background.type === 'photo' && template.background.value?.trim()) {
    const orig = template.background.value
    jobs.push(
      prep(orig).then((d) => {
        if (d) template = { ...template, background: { type: 'photo', value: d } }
      }),
    )
  }
  for (const [id, v] of Object.entries(values.slots ?? {})) {
    if (!v?.photo_url) continue
    const orig = v.photo_url
    jobs.push(prep(orig).then((d) => void (values.slots![id] = { ...v, photo_url: d ?? orig })))
  }
  await Promise.all(jobs)
  return { template, values }
}
