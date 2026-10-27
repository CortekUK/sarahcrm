// Shared media size limits — used by both the browser (MediaPicker, Drive
// picker) and the server (Drive → Storage import route) so they agree.
//
// The Supabase project's global per-file upload limit is 500 MB; the
// `gallery` / `heroes` buckets have no bucket-level limit of their own.

export const MEDIA_IMPORT_MAX_MB = 500
export const MEDIA_IMPORT_MAX_BYTES = MEDIA_IMPORT_MAX_MB * 1024 * 1024

/** Supabase TUS requires exactly 6 MB chunks (except the last one). */
export const TUS_CHUNK_BYTES = 6 * 1024 * 1024

export const MEDIA_TOO_LARGE_MESSAGE = `Too large — max ${MEDIA_IMPORT_MAX_MB} MB. Compress the video or pick a smaller file.`

/** Human file size: "820 KB", "48 MB", "1.2 GB". */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.round(kb)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}
