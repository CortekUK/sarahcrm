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

// Streams a private Drive file's bytes (for our proxy route / copy-to-Storage).
export async function getFileStream(
  fileId: string,
  subject?: string,
): Promise<{ stream: NodeJS.ReadableStream; mimeType: string; name: string }> {
  const drive = driveClient(subject)
  const meta = await drive.files.get({
    fileId,
    fields: 'name, mimeType',
    supportsAllDrives: true,
  })
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' },
  )
  return {
    stream: res.data as unknown as NodeJS.ReadableStream,
    mimeType: meta.data.mimeType ?? 'application/octet-stream',
    name: meta.data.name ?? fileId,
  }
}

export type { drive_v3 }
