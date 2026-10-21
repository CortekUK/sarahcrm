// Frontend-only chat types: list params, optimistic message state, and the
// request payloads the shared contract file doesn't declare. Response shapes
// for /people, /reports and /staff-access come from ./contract.

import type { ChatAttachment, ChatMessage, ChatPerson, ConversationKind, Viewer } from './contract'

export type ConversationScope = 'mine' | 'all'

export interface ConversationListParams {
  scope?: ConversationScope
  q?: string
  kind?: ConversationKind | ''
}

/** A message as held in the cache — server rows plus optimistic sends. */
export interface LocalChatMessage extends ChatMessage {
  _status?: 'sending' | 'failed'
  /** upload progress 0..1 per attachment index while sending */
  _progress?: number[]
  /** files kept so a failed send can be retried */
  _files?: File[]
  _error?: string
}

export interface LocalMessagePage {
  messages: LocalChatMessage[]
  nextCursor: string | null
}

export type { PeoplePage, ChatReport, ReportPage, StaffAccessEntry } from './contract'
import type { ChatReport, StaffAccessEntry } from './contract'

export type ReportStatus = ChatReport['status']
export type StaffAccessRow = StaffAccessEntry

// ── Client-side payloads not in the shared contract file ─────────────

export interface MeResponse {
  viewer: Viewer
  people: Record<string, ChatPerson>
}

/** What a client sends for an uploaded file — the server signs `url` on read. */
export type ChatAttachmentInput = Omit<ChatAttachment, 'url'>

export interface MessageSendPayload {
  conversationId: string
  body?: string
  attachments?: ChatAttachmentInput[]
  clientId: string
}
