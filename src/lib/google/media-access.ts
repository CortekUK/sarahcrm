// Media (Drive) access control — owner + allow-list helpers.
//
// The model: one "media owner" (Sarah) sees & manages everything; every other
// admin is restricted to the Drive folders the owner has approved. Both live in
// the existing `app_settings` key/value table (no migration):
//   - `media_owner`            → { profileId }
//   - `drive_allowed_folders`  → { id, name }[]
//
// Opt-in + safe: until the owner approves any folders the allow-list is empty,
// and callers keep today's browse-all behavior so nobody is locked out.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export interface AllowedFolder {
  id: string
  name: string
}

const OWNER_KEY = 'media_owner'
const FOLDERS_KEY = 'drive_allowed_folders'

type Db = SupabaseClient<Database>
type SettingsValue = Database['public']['Tables']['app_settings']['Insert']['value']

// Read the configured media owner's profile id, or null if none is set yet.
export async function getMediaOwnerId(db: Db): Promise<string | null> {
  const { data } = await db
    .from('app_settings')
    .select('value')
    .eq('key', OWNER_KEY)
    .maybeSingle()

  const stored = data?.value
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return null
  const profileId = (stored as Record<string, unknown>).profileId
  return typeof profileId === 'string' && profileId ? profileId : null
}

// Upsert the media owner.
export async function setMediaOwner(db: Db, profileId: string): Promise<void> {
  await db.from('app_settings').upsert(
    {
      key: OWNER_KEY,
      value: { profileId } as unknown as SettingsValue,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  )
}

// Read the owner-approved folder allow-list (default []).
export async function getAllowedFolders(db: Db): Promise<AllowedFolder[]> {
  const { data } = await db
    .from('app_settings')
    .select('value')
    .eq('key', FOLDERS_KEY)
    .maybeSingle()

  const stored = data?.value
  if (!Array.isArray(stored)) return []
  const out: AllowedFolder[] = []
  for (const raw of stored) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const r = raw as Record<string, unknown>
    if (typeof r.id === 'string' && r.id && typeof r.name === 'string') {
      out.push({ id: r.id, name: r.name })
    }
  }
  return out
}

// Upsert the folder allow-list.
export async function setAllowedFolders(db: Db, folders: AllowedFolder[]): Promise<void> {
  await db.from('app_settings').upsert(
    {
      key: FOLDERS_KEY,
      value: folders as unknown as SettingsValue,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  )
}

// True only when a media owner IS set and it matches the given user id.
export async function isMediaOwner(db: Db, userId: string): Promise<boolean> {
  const ownerId = await getMediaOwnerId(db)
  return !!ownerId && ownerId === userId
}
