// Outgoing typing signal: emits `typing:true` at most every 3 s while the user
// keeps typing, and `typing:false` after 4 s idle, on send, or on leaving the
// thread. Incoming typers are read with useTypingNames() from ../stores.

import { useCallback, useEffect, useRef } from 'react'
import { useChat } from '../ChatProvider'

const REPEAT_MS = 3000
const IDLE_MS = 4000

export function useTyping(conversationId: string | null, opts: { enabled?: boolean } = {}) {
  const { socket } = useChat()
  const enabled = (opts.enabled ?? true) && !!conversationId
  const lastEmit = useRef(0)
  const typing = useRef(false)
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stop = useCallback(() => {
    if (idle.current) clearTimeout(idle.current)
    idle.current = null
    if (typing.current && conversationId && socket?.connected) {
      socket.emit('typing', { conversationId, isTyping: false })
    }
    typing.current = false
    lastEmit.current = 0
  }, [conversationId, socket])

  const onInput = useCallback(() => {
    if (!enabled || !socket?.connected) return
    const now = Date.now()
    if (!typing.current || now - lastEmit.current > REPEAT_MS) {
      socket.emit('typing', { conversationId, isTyping: true })
      typing.current = true
      lastEmit.current = now
    }
    if (idle.current) clearTimeout(idle.current)
    idle.current = setTimeout(stop, IDLE_MS)
  }, [enabled, socket, conversationId, stop])

  // Leaving the thread (or unmount) ends any typing state.
  useEffect(() => stop, [stop])

  return { onInput, stop }
}
