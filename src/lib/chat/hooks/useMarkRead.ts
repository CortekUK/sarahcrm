// Marks the open thread read — on open, and again whenever new messages from
// others arrive while the tab is visible. Throttled so a burst of messages
// produces one `read`. Overseers browsing a chat they're not in never mark
// anything (the server ignores it anyway; we skip the round trip).

import { useEffect, useRef } from 'react'
import { chatClient } from '@/lib/http/chat-client'
import { useChat } from '../ChatProvider'

const THROTTLE_MS = 1500

export function useMarkRead(
  conversationId: string | null,
  latestMessageId: string | null | undefined,
  opts: { enabled?: boolean } = {},
) {
  const { socket, clearUnread, ready } = useChat()
  const enabled = (opts.enabled ?? true) && ready && !!conversationId
  const lastSent = useRef<{ id: string | null; at: number }>({ id: null, at: 0 })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled || !conversationId) return

    function send() {
      if (document.visibilityState !== 'visible') return
      const key = `${conversationId}:${latestMessageId ?? ''}`
      if (lastSent.current.id === key) return
      lastSent.current = { id: key, at: Date.now() }
      clearUnread(conversationId!)
      if (socket?.connected) socket.emit('read', { conversationId }, () => {})
      else chatClient.post(`/conversations/${conversationId}/read`, {}).catch(() => {})
    }

    function schedule() {
      if (timer.current) return
      const wait = Math.max(0, THROTTLE_MS - (Date.now() - lastSent.current.at))
      timer.current = setTimeout(() => {
        timer.current = null
        send()
      }, wait)
    }

    schedule()
    const onVis = () => document.visibilityState === 'visible' && schedule()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
      }
    }
  }, [enabled, conversationId, latestMessageId, socket, clearUnread])
}
