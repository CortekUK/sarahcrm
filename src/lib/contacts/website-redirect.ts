// Server-only: where does a company's email domain's website actually live?
// Many firms email from one domain and run their site on another
// (globe.fund → fundglobe.co.uk), and Clay indexes the site domain — so when a
// domain isn't on Clay we follow its homepage redirects (free, no Clay quota)
// and try the domain it lands on.
//
// Safe by construction: only http(s), only public-looking hostnames (no IP
// literals, no localhost / internal names), manual redirects capped at
// MAX_HOPS, a short timeout, and the body is never read. Never throws.

import { normalizeDomain } from '@/lib/enrichment/clay-query'

const MAX_HOPS = 4
const TIMEOUT_MS = 6_000

function publicHost(host: string): boolean {
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) return false // IPv4 / IPv6 literal
  return normalizeDomain(host) !== null
}

const bare = (host: string) => host.toLowerCase().replace(/^www\./, '')

// Redirect targets that are NOT the company's own site: parked / for-sale
// pages, site builders, link pages, social networks, mail providers.
const NOT_A_COMPANY_SITE =
  /(^|\.)(sedo|sedoparking|hugedomains|dan|afternic|godaddy|parkingcrew|bodis|above|undeveloped|namecheap|ionos|123-reg|wix|wixsite|squarespace|weebly|wordpress|shopify|myshopify|linktr|carrd|facebook|instagram|linkedin|twitter|x|youtube|tiktok|google|gmail|outlook|live|microsoft|office|yahoo|icloud|apple|amazon|godaddysites)\./

/** The domain the site redirects to, or null if it doesn't move (or can't be reached). */
export async function redirectedDomain(domain: string): Promise<string | null> {
  let url = `https://${domain}/`
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    let res: Response
    try {
      res = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TheClubCRM/1.0)', Accept: 'text/html' },
      })
    } catch {
      // https refused/failed on the first hop → try plain http once.
      if (hop === 0 && url.startsWith('https://')) {
        url = `http://${domain}/`
        continue
      }
      return null
    }
    // Drain nothing — we only care about the Location header.
    res.body?.cancel().catch(() => {})
    const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null
    if (!location) break
    let next: URL
    try {
      next = new URL(location, url)
    } catch {
      return null
    }
    if (!/^https?:$/.test(next.protocol) || !publicHost(next.hostname)) return null
    url = next.toString()
  }
  const finalHost = bare(new URL(url).hostname)
  const target = normalizeDomain(finalHost)
  return target && target !== bare(domain) && !NOT_A_COMPANY_SITE.test(target) ? target : null
}
