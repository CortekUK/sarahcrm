// Tiny in-memory sliding-window limiter for PUBLIC form endpoints (enquiry
// intake, newsletter subscribe). Per serverless instance, so it is a
// best-effort first line only — each route pairs it with a DB-backed check
// (per-email / global burst) that holds across instances.

const buckets = new Map<string, number[]>()

// First hop of x-forwarded-for, else x-real-ip (same as the concierge chat).
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  const first = fwd?.split(',')[0]?.trim()
  return first || req.headers.get('x-real-ip')?.trim() || 'unknown'
}

// Records a hit for `key` and returns true when it is over `max` hits within
// `windowMs`. Unknown IPs are never limited here (the DB checks still apply).
export function overLimit(key: string, max: number, windowMs: number): boolean {
  if (!key || key.endsWith(':unknown')) return false
  const now = Date.now()
  const windowStart = now - windowMs
  const hits = (buckets.get(key) ?? []).filter((t) => t > windowStart)
  hits.push(now)
  buckets.set(key, hits)
  if (buckets.size > 5000) {
    // Keep the map bounded on a long-lived instance.
    for (const [k, v] of buckets) if (!v.some((t) => t > windowStart)) buckets.delete(k)
  }
  return hits.length > max
}
