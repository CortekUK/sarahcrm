// /api/portal/profile/avatar — a member sets or removes their own profile photo.
//
// POST (multipart, field "file"): JPG / PNG / WebP up to 5 MB. Stored in the
// public `content` bucket under avatars/<profile id>/<timestamp>.<ext> (a new
// name each time so browsers never show a cached old photo), then
// profiles.avatar_url is pointed at it and the member's previous photos are
// removed. DELETE clears the photo.
//
// Only ever touches the signed-in user's own profile. Writes use the service
// role (members have no storage write policy).

import { createClient } from '@/lib/supabase/server'
import { getAdmin } from '@/lib/marketing/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = 'content'
const MAX_BYTES = 5 * 1024 * 1024
const TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

async function signedInUserId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

// Remove every stored photo for this user except `keep`.
async function removeOld(admin: ReturnType<typeof getAdmin>, userId: string, keep?: string) {
  const prefix = `avatars/${userId}`
  const { data } = await admin.storage.from(BUCKET).list(prefix)
  const stale = (data ?? []).map((f) => `${prefix}/${f.name}`).filter((p) => p !== keep)
  if (stale.length) await admin.storage.from(BUCKET).remove(stale)
}

export async function POST(request: Request) {
  const userId = await signedInUserId()
  if (!userId) return Response.json({ error: 'Not authenticated' }, { status: 401 })

  let file: File | null = null
  try {
    const form = await request.formData()
    const f = form.get('file')
    file = f instanceof File ? f : null
  } catch {
    return Response.json({ error: 'Invalid upload.' }, { status: 400 })
  }
  if (!file) return Response.json({ error: 'Choose a photo to upload.' }, { status: 400 })
  const ext = TYPES[file.type]
  if (!ext) return Response.json({ error: 'Please use a JPG, PNG or WebP image.' }, { status: 400 })
  if (file.size > MAX_BYTES) return Response.json({ error: 'Photo must be 5 MB or smaller.' }, { status: 400 })

  const admin = getAdmin()
  const path = `avatars/${userId}/${Date.now()}.${ext}`
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: true })
  if (upErr) {
    console.error('[profile/avatar] upload failed:', upErr)
    return Response.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
  }
  const url = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl

  const { error: dbErr } = await admin.from('profiles').update({ avatar_url: url }).eq('id', userId)
  if (dbErr) {
    console.error('[profile/avatar] profile update failed:', dbErr)
    await admin.storage.from(BUCKET).remove([path])
    return Response.json({ error: 'Could not save your photo. Please try again.' }, { status: 500 })
  }
  await removeOld(admin, userId, path).catch((e) => console.warn('[profile/avatar] cleanup failed:', e))
  return Response.json({ ok: true, avatar_url: url })
}

export async function DELETE() {
  const userId = await signedInUserId()
  if (!userId) return Response.json({ error: 'Not authenticated' }, { status: 401 })
  const admin = getAdmin()
  const { error } = await admin.from('profiles').update({ avatar_url: null }).eq('id', userId)
  if (error) return Response.json({ error: 'Could not remove your photo.' }, { status: 500 })
  await removeOld(admin, userId).catch((e) => console.warn('[profile/avatar] cleanup failed:', e))
  return Response.json({ ok: true })
}
