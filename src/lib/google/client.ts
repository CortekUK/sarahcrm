// Google Workspace client — service account + domain-wide delegation (DWD).
//
// Auth is server-to-server: we hold a service-account key and IMPERSONATE a
// real Workspace user (the "subject") — Gmail/Drive APIs cannot be called as
// the service account itself. This is the same model DocuSign uses (a signed
// JWT, no browser OAuth); here `googleapis`' JWT client does the signing.
//
// The DWD authorisation (which scopes this service account may impersonate for)
// is granted once by a Workspace super admin in the Admin console. See
// scripts/test-google-impersonation.mjs for the proven read-only smoke test.
//
// Env (see .env.local.example):
//   GOOGLE_SA_KEY_BASE64     base64 of the full service-account JSON key
//   GOOGLE_SA_CLIENT_EMAIL   service account email (informational)
//   GOOGLE_SA_CLIENT_ID      21-digit client id (the Admin-console DWD entry)
//   GOOGLE_WORKSPACE_SUBJECT default mailbox to impersonate (e.g. Sarah)
//   GOOGLE_DRIVE_FOLDER_ID   the media-library folder surfaced in the CRM

import { google } from 'googleapis'
import type { gmail_v1, drive_v3 } from 'googleapis'

// Read scope for Gmail history; modify scope so we can WRITE drafts (never send).
export const GMAIL_READONLY = 'https://www.googleapis.com/auth/gmail.readonly'
export const GMAIL_MODIFY = 'https://www.googleapis.com/auth/gmail.modify'
export const DRIVE_READONLY = 'https://www.googleapis.com/auth/drive.readonly'

export interface GoogleConfig {
  clientEmail: string
  privateKey: string
  clientId?: string
  subject: string
  driveFolderId?: string
}

export class GoogleError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'GoogleError'
    this.status = status
  }
}

// Reads + validates env. Returns null (not throws) when unconfigured so callers
// can degrade gracefully with a "Google isn't set up yet" message — mirrors
// getDocuSignConfig()/getXeroConfig().
export function getGoogleConfig(): GoogleConfig | null {
  const b64 = process.env.GOOGLE_SA_KEY_BASE64
  const subject = process.env.GOOGLE_WORKSPACE_SUBJECT
  if (!b64 || !subject) return null

  let parsed: { client_email?: string; private_key?: string; client_id?: string }
  try {
    parsed = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
  } catch {
    return null
  }
  if (!parsed.client_email || !parsed.private_key) return null

  return {
    clientEmail: parsed.client_email,
    privateKey: parsed.private_key,
    clientId: parsed.client_id ?? process.env.GOOGLE_SA_CLIENT_ID,
    subject,
    driveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID || undefined,
  }
}

// Builds a JWT auth client that impersonates `subject` (defaults to the
// configured Workspace subject) with the given scopes.
export function jwtFor(scopes: string[], subject?: string): InstanceType<typeof google.auth.JWT> {
  const cfg = getGoogleConfig()
  if (!cfg) throw new GoogleError('Google Workspace integration is not configured.', 503)
  return new google.auth.JWT({
    email: cfg.clientEmail,
    key: cfg.privateKey,
    scopes,
    subject: subject ?? cfg.subject,
  })
}

// Gmail client. Read-only by default; pass GMAIL_MODIFY when creating drafts.
export function gmailClient(opts?: { subject?: string; write?: boolean }): gmail_v1.Gmail {
  const scopes = opts?.write ? [GMAIL_MODIFY] : [GMAIL_READONLY]
  return google.gmail({ version: 'v1', auth: jwtFor(scopes, opts?.subject) })
}

// Drive client (read-only — the media library is browsed, never modified).
export function driveClient(subject?: string): drive_v3.Drive {
  return google.drive({ version: 'v3', auth: jwtFor([DRIVE_READONLY], subject) })
}
