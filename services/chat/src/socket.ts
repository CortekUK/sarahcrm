// Socket.IO handlers. Auth once at handshake (callback-form auth means
// reconnects carry the current token); every event re-reads the cached
// viewer so staff/role changes apply within ~60s.
import type { Socket } from 'socket.io'
import { z } from 'zod'
import { loadViewer, verifyToken } from './auth.js'
import { toPublicError } from './errors.js'
import { canModerate, canPost, canUseChat, dmOtherId, RateLimiter } from './policy.js'
import { toPolicyConversation } from './rows.js'
import { log } from './log.js'
import { convRoom, FEED_MOD_ROOM, OVERSEE_ROOM, userRoom, type ChatIo } from './realtime.js'
import * as svc from './service.js'
import * as feed from './feed.js'
import { unreadCounts } from './repo/messages.js'
import { isBlockedEither } from './repo/people.js'

type AckFn = (res: { ok: true } & Record<string, unknown> | { ok: false; error: string }) => void

interface SocketData {
  profileId: string
  /** conversations this socket opened and may type in */
  typable: Set<string>
  /** the feed room this socket has open (feed:main / feed:{groupId}) */
  feedRoom: string | null
}

const convOnly = z.object({ conversationId: z.string() })
const feedOpen = z.object({ groupId: z.string().nullish() })
const typingSchema = z.object({ conversationId: z.string(), isTyping: z.boolean() })
const typingLimiter = new RateLimiter(20, 5_000)

function wrap(socket: Socket, event: string, handler: (payload: unknown) => Promise<Record<string, unknown> | void>) {
  socket.on(event, async (payload: unknown, ack?: unknown) => {
    const reply: AckFn = typeof ack === 'function' ? (ack as AckFn) : () => {}
    try {
      const out = await handler(payload)
      reply({ ok: true, ...(out ?? {}) })
    } catch (err) {
      const pub = toPublicError(err)
      if (pub.status >= 500) log.error('socket_error', err, { event })
      reply({ ok: false, error: pub.error })
    }
  })
}

export function setupSocket(io: ChatIo) {
  io.use(async (socket, next) => {
    try {
      const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token
      const { profileId } = await verifyToken(typeof token === 'string' ? token : null)
      const viewer = await loadViewer(profileId)
      if (!canUseChat(viewer)) return next(new Error('unauthorized'))
      const data: SocketData = { profileId, typable: new Set(), feedRoom: null }
      socket.data = data
      next()
    } catch {
      next(new Error('unauthorized'))
    }
  })

  io.on('connection', (socket) => {
    const data = socket.data as SocketData
    const me = () => loadViewer(data.profileId)
    void socket.join(userRoom(data.profileId))
    log.info('socket_connected', { profile: data.profileId, sid: socket.id })

    // Ensure main/event participation, then push the badge state.
    void (async () => {
      try {
        const v = await me()
        // Overseers get overseer-perspective copies of every fan-out (scope=all lists).
        if (v.canOversee) await socket.join(OVERSEE_ROOM)
        await svc.ensureForViewer(v)
        socket.emit('unread:snapshot', await unreadCounts(data.profileId))
      } catch (err) {
        log.error('connect_init_failed', err, { profile: data.profileId })
      }
    })()

    // Feed: moderators get hidden posts/comments; everyone gets their notification badge.
    void (async () => {
      try {
        const v = await me()
        if (canModerate(v)) await socket.join(FEED_MOD_ROOM)
        socket.emit('notifications:snapshot', await feed.notificationSnapshot(v))
      } catch (err) {
        log.warn('feed_connect_init_failed', { profile: data.profileId })
        void err
      }
    })()

    wrap(socket, 'feed:open', async (payload) => {
      const { groupId } = feedOpen.parse(payload ?? {})
      const room = await feed.feedRoomFor(await me(), groupId ?? null)
      if (data.feedRoom && data.feedRoom !== room) await socket.leave(data.feedRoom)
      data.feedRoom = room
      await socket.join(room)
      return { room }
    })

    wrap(socket, 'feed:close', async () => {
      if (data.feedRoom) await socket.leave(data.feedRoom)
      data.feedRoom = null
    })

    wrap(socket, 'conversation:open', async (payload) => {
      const { conversationId } = convOnly.parse(payload)
      const v = await me()
      const { conv, me: part } = await svc.readable(v, conversationId)
      await socket.join(convRoom(conv.id))
      const blocked = conv.kind === 'dm' && !!part ? await isBlockedEither(v.id, dmOtherId(conv.dm_key, v.id) ?? v.id) : false
      if (part && canPost(v, toPolicyConversation(conv), { isParticipant: true, blocked })) data.typable.add(conv.id)
      else data.typable.delete(conv.id)
    })

    wrap(socket, 'conversation:close', async (payload) => {
      const { conversationId } = convOnly.parse(payload)
      data.typable.delete(conversationId)
      await socket.leave(convRoom(conversationId))
    })

    wrap(socket, 'message:send', async (payload) => {
      const message = await svc.sendMessage(await me(), payload)
      return { message }
    })

    wrap(socket, 'typing', async (payload) => {
      const { conversationId, isTyping } = typingSchema.parse(payload)
      // Silently drop when not allowed / too chatty — typing is best-effort.
      if (!data.typable.has(conversationId) || !socket.rooms.has(convRoom(conversationId))) return
      if (!typingLimiter.take(socket.id)) return
      const v = await me()
      socket.to(convRoom(conversationId)).emit('typing', { conversationId, profileId: v.id, name: v.person.name, isTyping })
    })

    wrap(socket, 'read', async (payload) => {
      const { conversationId } = convOnly.parse(payload)
      const res = await svc.markRead(await me(), conversationId, {})
      return { at: res.at }
    })

    socket.on('disconnect', (reason) => {
      log.info('socket_disconnected', { profile: data.profileId, sid: socket.id, reason })
    })
  })
}
