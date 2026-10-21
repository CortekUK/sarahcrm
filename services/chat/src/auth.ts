// Supabase access-token verification + Viewer construction. Tokens are
// cached by SHA-256 (never stored raw) until min(exp, 5 min); viewer flags
// (role, owner, staff access) are cached ~60s per profile.
import { createHash } from 'node:crypto'
import { supabase } from './supabase.js'
import { env } from './env.js'
import { HttpError } from './errors.js'
import { getMemberships, getProfile } from './repo/people.js'
import { hasStaffAccess, ownerFromSettings } from './repo/admin.js'
import { toPerson } from './rows.js'
import type { ChatPerson, Viewer } from './contract.js'
import type { PolicyViewer } from './policy.js'
import { isUuid } from './cursor.js'

export interface ViewerContext extends PolicyViewer {
  role: string
  memberIds: string[]
  person: ChatPerson
}

export const unauthorized = () => new HttpError(401, 'unauthorized')

// ── Token → profile id ──────────────────────────────────────
const tokenCache = new Map<string, { profileId: string; expMs: number }>()
const TOKEN_CACHE_MAX_MS = 5 * 60_000

function decodeExp(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'))
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch {
    return null
  }
}

export async function verifyToken(token: string | undefined | null): Promise<{ profileId: string; expMs: number }> {
  if (!token || typeof token !== 'string' || token.length > 8192) throw unauthorized()
  const key = createHash('sha256').update(token).digest('hex')
  const now = Date.now()
  const hit = tokenCache.get(key)
  if (hit && hit.expMs > now) return hit

  let sub: string | null = null
  let exp: number | null = null
  try {
    const { data, error } = await supabase.auth.getClaims(token)
    if (!error && data?.claims?.sub) {
      sub = data.claims.sub
      exp = typeof data.claims.exp === 'number' ? data.claims.exp : null
    }
  } catch {
    // fall through to getUser
  }
  if (!sub) {
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data?.user) throw unauthorized()
    sub = data.user.id
    exp = decodeExp(token)
  }
  if (!isUuid(sub)) throw unauthorized()

  const tokenExpMs = exp ? exp * 1000 : now + 60_000
  if (tokenExpMs <= now) throw unauthorized()
  const entry = { profileId: sub, expMs: Math.min(tokenExpMs, now + TOKEN_CACHE_MAX_MS) }
  if (tokenCache.size > 5000) {
    for (const [k, v] of tokenCache) if (v.expMs <= now) tokenCache.delete(k)
    if (tokenCache.size > 5000) tokenCache.clear()
  }
  tokenCache.set(key, entry)
  return { profileId: sub, expMs: tokenExpMs }
}

// ── Owner id ────────────────────────────────────────────────
let ownerCache: { id: string | null; at: number } | null = null

export async function ownerProfileId(): Promise<string | null> {
  if (env.CHAT_OWNER_PROFILE_ID) return env.CHAT_OWNER_PROFILE_ID
  if (ownerCache && Date.now() - ownerCache.at < 60_000) return ownerCache.id
  const id = await ownerFromSettings()
  ownerCache = { id, at: Date.now() }
  return id
}

// ── Profile id → ViewerContext ──────────────────────────────
const viewerCache = new Map<string, { v: ViewerContext; at: number }>()
const VIEWER_TTL_MS = 60_000

export async function loadViewer(profileId: string): Promise<ViewerContext> {
  const hit = viewerCache.get(profileId)
  if (hit && Date.now() - hit.at < VIEWER_TTL_MS) return hit.v

  const [profile, memberships, ownerId, staff] = await Promise.all([
    getProfile(profileId),
    getMemberships(profileId),
    ownerProfileId(),
    hasStaffAccess(profileId),
  ])
  if (!profile) throw new HttpError(403, 'no profile')

  const isOwner =
    (!!ownerId && ownerId === profileId) || (env.CHAT_ADMINS_FULL_ACCESS && profile.role === 'admin')
  const v: ViewerContext = {
    id: profileId,
    role: profile.role,
    isOwner,
    isAdmin: profile.role === 'admin',
    canOversee: isOwner || staff,
    isActiveMember: profile.role === 'member' && memberships.active,
    memberIds: memberships.memberIds,
    person: toPerson(profile),
  }
  viewerCache.set(profileId, { v, at: Date.now() })
  if (viewerCache.size > 5000) viewerCache.clear()
  return v
}

export function invalidateViewer(profileId: string) {
  viewerCache.delete(profileId)
}

export function publicViewer(v: ViewerContext): Viewer {
  return { id: v.id, isOwner: v.isOwner, isAdmin: v.isAdmin, canOversee: v.canOversee }
}

export function bearer(header: string | undefined): string | null {
  if (!header) return null
  const m = /^Bearer\s+(.+)$/i.exec(header.trim())
  return m ? m[1]!.trim() : null
}
