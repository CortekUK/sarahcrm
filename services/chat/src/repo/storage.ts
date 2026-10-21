// Private bucket access: signed upload tickets in, signed read URLs out.
import { ATTACHMENT_BUCKET, supabase } from '../supabase.js'
import { log } from '../log.js'

const READ_TTL_S = 60 * 60

export async function signUrls(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!paths.length) return out
  const { data, error } = await supabase.storage.from(ATTACHMENT_BUCKET).createSignedUrls(paths, READ_TTL_S)
  if (error) {
    log.warn('sign_urls_failed', { count: paths.length })
    return out
  }
  for (const d of data ?? []) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl)
  return out
}

export async function createUploadTicket(path: string) {
  const { data, error } = await supabase.storage.from(ATTACHMENT_BUCKET).createSignedUploadUrl(path)
  if (error || !data) throw new Error(`signed upload: ${error?.message ?? 'no data'}`)
  return { path: data.path, signedUrl: data.signedUrl, token: data.token }
}
