// Tiny helper for normalising Cloudinary media URLs before saving them
// into hero_slides (or any other CMS field).
//
// The motivating bug: an admin pasted a raw Cloudinary video URL like
//   https://res.cloudinary.com/<cloud>/video/upload/v1779573614/hero-video.mp4
// which delivers the 99-MB original file because there's no transformation
// segment after /upload/. Without f_auto,q_auto the browser has to stream
// tens of megabytes before it can autoplay — most users see a static
// poster while the page sits idle.
//
// Normalisation inserts `f_auto,q_auto/` right after `/upload/` for any
// Cloudinary URL that doesn't already have a transformation segment.
// Existing transformations (e.g. `c_scale,w_800`) are left untouched —
// the admin's explicit choice wins.

const CLOUDINARY_HOST = 'res.cloudinary.com'

/**
 * Add `f_auto,q_auto` after `/upload/` for Cloudinary video URLs that
 * don't already have a transformation segment. Returns the URL
 * unchanged if it's not a Cloudinary video, already has a transform,
 * or doesn't match the expected shape.
 */
export function normalizeCloudinaryVideoUrl(url: string | null | undefined): string {
  if (!url) return url ?? ''
  if (!url.includes(CLOUDINARY_HOST)) return url
  if (!url.includes('/video/upload/')) return url
  // Capture: protocol + cloud-name + /video/upload/  +  the rest
  const match = url.match(
    /^(https?:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(.*)$/,
  )
  if (!match) return url
  const [, prefix, rest] = match
  // If `rest` starts with `v<digits>/` it means the URL goes
  // /upload/v123456/file.mp4 — no transformation segment present.
  if (/^v\d+\//.test(rest)) {
    return `${prefix}f_auto,q_auto/${rest}`
  }
  // Otherwise a transformation segment is already there (anything
  // before the version token). Don't touch admin's intentional choices.
  return url
}

/**
 * Same idea but for Cloudinary image URLs. Less critical — images are
 * usually small enough that omitting q_auto still works — but applying
 * the optimisation is free, so we do it.
 */
export function normalizeCloudinaryImageUrl(url: string | null | undefined): string {
  if (!url) return url ?? ''
  if (!url.includes(CLOUDINARY_HOST)) return url
  if (!url.includes('/image/upload/')) return url
  const match = url.match(
    /^(https?:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)$/,
  )
  if (!match) return url
  const [, prefix, rest] = match
  if (/^v\d+\//.test(rest)) {
    return `${prefix}f_auto,q_auto/${rest}`
  }
  return url
}
