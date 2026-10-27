// Google Drive helpers — read-only browse of the media-library folder so the
// CRM can surface images/video for the website, social, emails and brochures.

import type { drive_v3 } from 'googleapis'
import { driveClient } from './client'

export interface DriveMedia {
  id: string
  name: string
  mimeType: string
  kind: 'image' | 'video'
  thumbnailLink?: string
  webViewLink?: string
  sizeBytes?: number
  modifiedTime?: string
}

export interface DriveFolder {
  id: string
  name: string
  isSharedDrive?: boolean
}

const FOLDER_MIME = 'application/vnd.google-apps.folder'

function classify(mimeType: string): 'image' | 'video' | null {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  return null
}

// Browsable listing: returns the subfolders + media in a folder so the CRM
// picker can navigate the Drive. With no folderId it returns the "roots" —
// every Shared Drive plus the top-level My Drive folders — and no media.
// Works across My Drive and Shared Drives.
export async function listChildren(opts?: {
  folderId?: string
  subject?: string
}): Promise<{ folders: DriveFolder[]; media: DriveMedia[] }> {
  const drive = driveClient(opts?.subject)

  // Root view: shared drives + top-level My Drive folders.
  if (!opts?.folderId) {
    const folders: DriveFolder[] = []
    const shared = await drive.drives.list({ pageSize: 100 }).catch(() => null)
    for (const d of shared?.data.drives ?? []) {
      if (d.id && d.name) folders.push({ id: d.id, name: d.name, isSharedDrive: true })
    }
    const root = await drive.files.list({
      q: `mimeType = '${FOLDER_MIME}' and trashed = false and 'root' in parents`,
      fields: 'files(id, name)',
      pageSize: 200,
      orderBy: 'name',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    })
    for (const f of root.data.files ?? []) {
      if (f.id && f.name) folders.push({ id: f.id, name: f.name })
    }
    return { folders, media: [] }
  }

  // Inside a folder: subfolders + images/videos.
  const res = await drive.files.list({
    q: `'${opts.folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, thumbnailLink, webViewLink, size, modifiedTime)',
    pageSize: 300,
    orderBy: 'folder,modifiedTime desc,name',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  })
  const folders: DriveFolder[] = []
  const media: DriveMedia[] = []
  for (const f of res.data.files ?? []) {
    if (!f.id || !f.name) continue
    if (f.mimeType === FOLDER_MIME) {
      folders.push({ id: f.id, name: f.name })
      continue
    }
    const kind = classify(f.mimeType ?? '')
    if (!kind) continue
    media.push({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType!,
      kind,
      thumbnailLink: f.thumbnailLink ?? undefined,
      webViewLink: f.webViewLink ?? undefined,
      sizeBytes: f.size ? Number(f.size) : undefined,
      modifiedTime: f.modifiedTime ?? undefined,
    })
  }
  return { folders, media }
}

// Returns the direct parent folder ids of a Drive file/folder. Used to walk the
// parent chain when checking whether a folder is a descendant of an approved one.
// Works across My Drive and Shared Drives.
export async function getFileParents(fileId: string, subject?: string): Promise<string[]> {
  const drive = driveClient(subject)
  const res = await drive.files.get({
    fileId,
    fields: 'parents',
    supportsAllDrives: true,
  })
  return res.data.parents ?? []
}

export interface DriveFileMeta {
  name: string
  mimeType: string
  /** Bytes, from Drive metadata. Undefined for Google-native docs. */
  sizeBytes?: number
}

// Metadata only (name, type, size) — no bytes are downloaded. Lets callers
// refuse oversize files before starting a download.
export async function getFileMeta(fileId: string, subject?: string): Promise<DriveFileMeta> {
  const drive = driveClient(subject)
  const meta = await drive.files.get({
    fileId,
    fields: 'name, mimeType, size',
    supportsAllDrives: true,
  })
  return {
    name: meta.data.name ?? fileId,
    mimeType: meta.data.mimeType ?? 'application/octet-stream',
    sizeBytes: meta.data.size ? Number(meta.data.size) : undefined,
  }
}

// Opens the raw byte stream of a Drive file (no metadata call).
export async function getFileMediaStream(
  fileId: string,
  subject?: string,
): Promise<NodeJS.ReadableStream> {
  const drive = driveClient(subject)
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' },
  )
  return res.data as unknown as NodeJS.ReadableStream
}

// Streams a private Drive file's bytes (for our proxy route / copy-to-Storage).
export async function getFileStream(
  fileId: string,
  subject?: string,
): Promise<{ stream: NodeJS.ReadableStream; mimeType: string; name: string; sizeBytes?: number }> {
  const meta = await getFileMeta(fileId, subject)
  const stream = await getFileMediaStream(fileId, subject)
  return { stream, ...meta }
}

export type { drive_v3 }
