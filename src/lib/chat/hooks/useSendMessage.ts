// Optimistic send. The message appears instantly (keyed by a clientId), photo
// uploads report progress into it, then it goes out over the socket
// (`message:send` with ack) or the REST fallback when the socket is down. The
// server echo — ack or `message:new`, whichever lands first — replaces the
// optimistic row by clientId. Failures stay in the thread with a Retry that
// re-sends with the SAME clientId, so the server de-dupes double sends.

import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { chatClient, getApiErrorMessage } from '@/lib/http/chat-client'
import { useChat } from '../ChatProvider'
import type { Ack, ChatMessage } from '../contract'
import { patchMessage, removeMessage, upsertMessage } from '../cache'
import type { ChatAttachmentInput, LocalChatMessage, MessageSendPayload } from '../types'
import { useUploadAttachment } from './useUploadAttachment'

const SEND_TIMEOUT_MS = 12_000

function newClientId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export interface SendInput {
  body?: string
  files?: File[]
}

export function useSendMessage(conversationId: string | null) {
  const qc = useQueryClient()
  const { socket, viewer } = useChat()
  const upload = useUploadAttachment()

  const run = useCallback(
    async (conversationId: string | null, input: SendInput, existingClientId?: string) => {
      if (!conversationId || !viewer) return
      const body = input.body?.trim() ?? ''
      const files = input.files ?? []
      if (!body && files.length === 0) return
      const clientId = existingClientId ?? newClientId()
      const isMatch = (m: LocalChatMessage) => m.clientId === clientId

      const optimistic: LocalChatMessage = {
        id: `local:${clientId}`,
        conversationId,
        senderId: viewer.id,
        kind: 'text',
        body: body || null,
        attachments: files.map((f) => ({
          path: '',
          url: URL.createObjectURL(f),
          name: f.name,
          mime: f.type,
          size: f.size,
        })),
        clientId,
        createdAt: new Date().toISOString(),
        editedAt: null,
        deletedAt: null,
        _status: 'sending',
        _progress: files.map(() => 0),
        _files: files,
      }
      upsertMessage(qc, optimistic)
      const previews = optimistic.attachments.map((a) => a.url)

      try {
        const progress = files.map(() => 0)
        const attachments: ChatAttachmentInput[] = await Promise.all(
          files.map((file, i) =>
            upload(conversationId, file, (f) => {
              progress[i] = f
              patchMessage(qc, conversationId, isMatch, { _progress: progress.slice() })
            }),
          ),
        )

        const payload: MessageSendPayload = {
          conversationId,
          clientId,
          ...(body ? { body } : {}),
          ...(attachments.length ? { attachments } : {}),
        }

        let saved: ChatMessage
        if (socket?.connected) {
          const res = (await socket
            .timeout(SEND_TIMEOUT_MS)
            .emitWithAck('message:send', payload)) as Ack<{ message: ChatMessage }>
          if (!res.ok) throw new Error(res.error || 'Message not sent.')
          saved = res.message
        } else {
          const { data } = await chatClient.post<ChatMessage | { message: ChatMessage }>('/messages', payload)
          saved = 'message' in data ? data.message : data
        }
        upsertMessage(qc, saved)
        // Let the signed image swap in before dropping the local previews.
        setTimeout(() => previews.forEach((u) => URL.revokeObjectURL(u)), 4000)
      } catch (err) {
        const msg =
          err instanceof Error && err.message === 'operation has timed out'
            ? 'Timed out — check your connection.'
            : getApiErrorMessage(err, 'Message not sent.')
        patchMessage(qc, conversationId, isMatch, { _status: 'failed', _error: msg })
      }
    },
    [viewer, socket, qc, upload],
  )

  const send = useCallback((input: SendInput) => run(conversationId, input), [run, conversationId])
  /** Send into a conversation other than the bound one (draft DM → just created). */
  const sendTo = useCallback((id: string, input: SendInput) => run(id, input), [run])

  const retry = useCallback(
    (m: LocalChatMessage) => {
      if (!m.clientId) return
      m.attachments.forEach((a) => a.url.startsWith('blob:') && URL.revokeObjectURL(a.url))
      return run(m.conversationId, { body: m.body ?? undefined, files: m._files }, m.clientId)
    },
    [run],
  )

  const discard = useCallback(
    (m: LocalChatMessage) => {
      if (!conversationId) return
      m.attachments.forEach((a) => a.url.startsWith('blob:') && URL.revokeObjectURL(a.url))
      removeMessage(qc, conversationId, (x) => x.id === m.id)
    },
    [conversationId, qc],
  )

  return { send, sendTo, retry, discard }
}
