// Photo upload: ask the chat server for a Supabase signed upload URL
// (POST /uploads — images only, ≤ 10 MB), then PUT the file straight to
// storage with progress. Returns the attachment row to send with the message.

import { useCallback } from 'react'
import axios from 'axios'
import { chatClient } from '@/lib/http/chat-client'
import type { UploadTicket } from '../contract'
import type { ChatAttachmentInput } from '../types'

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const MAX_ATTACHMENTS = 6

// Mirrors the server's ALLOWED_IMAGE_MIME (services/chat/src/policy.ts).
export const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic']

export function validateAttachment(file: File): string | null {
  if (!ALLOWED_IMAGE_MIME.includes(file.type)) return `${file.name} isn't a supported photo (JPEG, PNG, WebP, GIF or HEIC).`
  if (file.size > MAX_ATTACHMENT_BYTES) return `${file.name} is over 10 MB.`
  return null
}

export function readImageSize(file: File): Promise<{ width?: number; height?: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      resolve({})
      URL.revokeObjectURL(url)
    }
    img.src = url
  })
}

export function useUploadAttachment() {
  return useCallback(
    async (
      conversationId: string,
      file: File,
      onProgress?: (fraction: number) => void,
    ): Promise<ChatAttachmentInput> => {
      const problem = validateAttachment(file)
      if (problem) throw new Error(problem)
      const [{ data: ticket }, size] = await Promise.all([
        chatClient.post<UploadTicket>('/uploads', {
          conversationId,
          name: file.name,
          mime: file.type,
          size: file.size,
        }),
        readImageSize(file),
      ])
      // Same body shape supabase-js uploadToSignedUrl sends.
      const form = new FormData()
      form.append('cacheControl', '3600')
      form.append('', file)
      await axios.put(ticket.signedUrl, form, {
        headers: { 'x-upsert': 'false' },
        onUploadProgress: (e) => {
          if (e.total) onProgress?.(e.loaded / e.total)
        },
      })
      onProgress?.(1)
      return { path: ticket.path, name: file.name, mime: file.type, size: file.size, ...size }
    },
    [],
  )
}
