// Gmail helpers built on the impersonating client in ./client.
// Read helpers for sync + a single write helper that creates a DRAFT reply
// (never sends — the human sends from Gmail).

import type { gmail_v1 } from 'googleapis'
import { gmailClient } from './client'

export interface ParsedMessage {
  id: string
  threadId: string
  from: string // raw "Name <email>" header
  fromEmail: string // lowercased address only
  to: string[] // lowercased addresses
  subject: string
  snippet: string
  bodyText: string
  internalDate: string // ISO
  headerMessageId?: string
  references?: string
}

// Pulls the email address out of a "Name <email@x>" header value.
export function extractEmail(headerValue: string | undefined): string {
  if (!headerValue) return ''
  const m = headerValue.match(/<([^>]+)>/)
  const raw = (m ? m[1] : headerValue).trim().toLowerCase()
  return raw.replace(/^"|"$/g, '')
}

function header(payload: gmail_v1.Schema$MessagePart | undefined, name: string): string | undefined {
  return payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? undefined
}

// Decodes Gmail's base64url body and walks multipart trees for text/plain
// (falling back to stripped text/html).
function decodeBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return ''
  const fromData = (data?: string | null) =>
    data ? Buffer.from(data, 'base64').toString('utf8') : ''

  if (payload.mimeType === 'text/plain' && payload.body?.data) return fromData(payload.body.data)

  if (payload.parts?.length) {
    const plain = payload.parts.find((p) => p.mimeType === 'text/plain')
    if (plain?.body?.data) return fromData(plain.body.data)
    const html = payload.parts.find((p) => p.mimeType === 'text/html')
    if (html?.body?.data) return fromData(html.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    for (const part of payload.parts) {
      const nested = decodeBody(part)
      if (nested) return nested
    }
  }
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return fromData(payload.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }
  return ''
}

export function parseMessage(msg: gmail_v1.Schema$Message): ParsedMessage {
  const p = msg.payload
  const from = header(p, 'From') ?? ''
  const toRaw = header(p, 'To') ?? ''
  const to = toRaw
    .split(',')
    .map((s) => extractEmail(s))
    .filter(Boolean)
  const internalMs = msg.internalDate ? Number(msg.internalDate) : Date.now()
  return {
    id: msg.id!,
    threadId: msg.threadId!,
    from,
    fromEmail: extractEmail(from),
    to,
    subject: header(p, 'Subject') ?? '(no subject)',
    snippet: msg.snippet ?? '',
    bodyText: decodeBody(p),
    internalDate: new Date(internalMs).toISOString(),
    headerMessageId: header(p, 'Message-ID'),
    references: header(p, 'References'),
  }
}

// Current mailbox history id — the cursor we persist for incremental sync.
export async function getStartHistoryId(gmail: gmail_v1.Gmail): Promise<string | undefined> {
  const res = await gmail.users.getProfile({ userId: 'me' })
  return res.data.historyId ?? undefined
}

// Initial seed: the most recent N message ids in the mailbox.
export async function listRecentMessageIds(
  gmail: gmail_v1.Gmail,
  maxResults = 100,
): Promise<string[]> {
  const res = await gmail.users.messages.list({ userId: 'me', maxResults })
  return (res.data.messages ?? []).map((m) => m.id!).filter(Boolean)
}

// Incremental: message ids added since `startHistoryId`. Returns the new set of
// ids plus the latest historyId to persist. On a 404 (history too old) the
// caller should re-seed with listRecentMessageIds.
export async function listAddedSince(
  gmail: gmail_v1.Gmail,
  startHistoryId: string,
): Promise<{ ids: string[]; historyId?: string; expired: boolean }> {
  const ids = new Set<string>()
  let pageToken: string | undefined
  let latest: string | undefined
  try {
    do {
      const res: { data: gmail_v1.Schema$ListHistoryResponse } = await gmail.users.history.list({
        userId: 'me',
        startHistoryId,
        historyTypes: ['messageAdded'],
        pageToken,
      })
      latest = res.data.historyId ?? latest
      for (const h of res.data.history ?? []) {
        for (const added of h.messagesAdded ?? []) {
          if (added.message?.id) ids.add(added.message.id)
        }
      }
      pageToken = res.data.nextPageToken ?? undefined
    } while (pageToken)
  } catch (e) {
    const status = (e as { code?: number }).code
    if (status === 404) return { ids: [], expired: true }
    throw e
  }
  return { ids: [...ids], historyId: latest, expired: false }
}

export async function getMessage(gmail: gmail_v1.Gmail, id: string): Promise<ParsedMessage> {
  const res = await gmail.users.messages.get({ userId: 'me', id, format: 'full' })
  return parseMessage(res.data)
}

// Loads every message in a thread (used to build reply context + the UI feed).
export async function listThreadMessages(
  gmail: gmail_v1.Gmail,
  threadId: string,
): Promise<ParsedMessage[]> {
  const res = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' })
  return (res.data.messages ?? []).map(parseMessage)
}

// Builds an RFC-2822 MIME message and saves it as a DRAFT in the thread.
// Nothing is sent. `subject` should already carry the "Re: " prefix if wanted.
export async function createDraftReply(args: {
  threadId: string
  to: string
  subject: string
  bodyHtml: string
  inReplyTo?: string
  references?: string
  subjectMailbox?: string // impersonated mailbox; defaults to config subject
}): Promise<{ draftId: string }> {
  const gmail = gmailClient({ subject: args.subjectMailbox, write: true })
  const headers = [
    `To: ${args.to}`,
    `Subject: ${args.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
  ]
  if (args.inReplyTo) headers.push(`In-Reply-To: ${args.inReplyTo}`)
  if (args.references) headers.push(`References: ${args.references}`)
  const mime = `${headers.join('\r\n')}\r\n\r\n${args.bodyHtml}`
  const raw = Buffer.from(mime, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const res = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: { message: { threadId: args.threadId, raw } },
  })
  return { draftId: res.data.id! }
}
