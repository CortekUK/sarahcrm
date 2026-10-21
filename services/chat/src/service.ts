// Chat use-cases shared by REST routes and socket handlers: every mutation
// goes through here so permission checks and broadcasts happen exactly once.
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type {
  ChatMessage,
  ChatReport,
  ConversationDetail,
  ConversationPage,
  ConversationSummary,
  MessagePage,
  PeoplePage,
  PersonLookup,
  ReportPage,
  StaffAccessEntry,
  UnreadSnapshot,
  UploadTicket,
} from './contract.js'
import { invalidateViewer, loadViewer, ownerProfileId, publicViewer, type ViewerContext } from './auth.js'
import { badRequest, forbidden, HttpError, notFound } from './errors.js'
import { clampLimit, decodeCursor, decodeTimeCursor, encodeCursor, isUuid } from './cursor.js'
import * as policy from './policy.js'
import { attachmentPaths, chunk, toMessage, toPerson, toPolicyConversation, type ConversationRow, type ParticipantRow, type ProfileRow } from './rows.js'
import * as convRepo from './repo/conversations.js'
import * as msgRepo from './repo/messages.js'
import * as people from './repo/people.js'
import * as adminRepo from './repo/admin.js'
import { createUploadTicket, signUrls } from './repo/storage.js'
import { buildDetail, buildSummaries, oneStats, sharedSummary, titleFor } from './summaries.js'
import { convRoom, feedRoom, getIo, OVERSEE_ROOM, userRoom } from './realtime.js'
import * as feed from './feed.js'
import { supabase, must } from './supabase.js'
import { log } from './log.js'

// ── Schemas ─────────────────────────────────────────────────
export const uuid = z.string().refine(isUuid, 'invalid id')

const attachmentSchema = z.object({
  path: z.string().min(1).max(512),
  name: z.string().min(1).max(200),
  mime: z.enum(policy.ALLOWED_IMAGE_MIME),
  size: z.number().int().positive().max(policy.MAX_ATTACHMENT_BYTES),
  width: z.number().int().positive().max(50_000).optional(),
  height: z.number().int().positive().max(50_000).optional(),
})

export const sendSchema = z.object({
  conversationId: uuid,
  body: z.string().max(policy.MAX_BODY * 2).nullish(),
  attachments: z.array(attachmentSchema).max(policy.MAX_ATTACHMENTS).optional(),
  clientId: z.string().min(1).max(100).optional(),
})

export const uploadSchema = z.object({
  conversationId: uuid,
  name: z.string().min(1).max(200),
  mime: z.enum(policy.ALLOWED_IMAGE_MIME),
  size: z.number().int().positive().max(policy.MAX_ATTACHMENT_BYTES),
})

// ── Helpers ─────────────────────────────────────────────────
const sendLimiter = new policy.RateLimiter(10, 5_000)

async function loadConversation(id: string): Promise<ConversationRow> {
  if (!isUuid(id)) throw notFound('conversation not found')
  const c = await convRepo.getConversation(id)
  if (!c) throw notFound('conversation not found')
  return c
}

async function dmBlocked(v: ViewerContext, c: ConversationRow): Promise<boolean> {
  if (c.kind !== 'dm') return false
  const other = policy.dmOtherId(c.dm_key, v.id)
  return other ? people.isBlockedEither(v.id, other) : false
}

/** Conversation + viewer's participation, or 403/404 if they can't read it. */
export async function readable(v: ViewerContext, id: string): Promise<{ conv: ConversationRow; me: ParticipantRow | null }> {
  const conv = await loadConversation(id)
  const me = await convRepo.getParticipant(conv.id, v.id)
  if (!policy.canRead(v, toPolicyConversation(conv), !!me)) throw forbidden('no access to this conversation')
  return { conv, me }
}

function escapeLike(q: unknown): string | null {
  if (typeof q !== 'string') return null
  const t = q.trim().slice(0, 100)
  return t ? t.replace(/[\\%_]/g, '\\$&') : null
}

function safeName(name: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+/, '')
  return cleaned.slice(-80) || 'image'
}

async function roleFor(profile: ProfileRow): Promise<policy.ParticipantRole> {
  const owner = await ownerProfileId()
  return profile.id === owner ? 'owner' : profile.role === 'admin' ? 'admin' : 'member'
}

// ── Lazy ensure (throttled per profile) ─────────────────────
const ensuredAt = new Map<string, number>()
const ENSURE_EVERY_MS = 30_000

export async function ensureForViewer(v: ViewerContext): Promise<void> {
  const last = ensuredAt.get(v.id)
  if (last && Date.now() - last < ENSURE_EVERY_MS) return
  ensuredAt.set(v.id, Date.now())
  if (ensuredAt.size > 20_000) ensuredAt.clear()
  try {
    const [, events] = await Promise.all([
      policy.shouldEnsureMain(v) ? convRepo.ensureMainMembership(v.id, policy.participantRoleFor(v)) : null,
      v.memberIds.length ? convRepo.ensureEventChats(v.id, v.memberIds) : null,
    ])
    // Cancelled bookings → those event chats vanish from this viewer's list.
    if (events?.left.length) void notifyLeft(events.left, [v.id])
  } catch (err) {
    ensuredAt.delete(v.id)
    log.error('ensure_failed', err, { profile: v.id })
  }
}

// ── Broadcasts ──────────────────────────────────────────────

/**
 * Emit `message:new` to every participant's user room, plus ONE overseer-
 * perspective copy (isParticipant false, "A & B" DM title) to the `oversee`
 * room and anyone with the conv room open — excluding participant rooms so no
 * socket gets two copies (socket.io de-dupes across the rooms of one emit).
 */
async function broadcastMessage(c: ConversationRow, message: ChatMessage): Promise<void> {
  const io = getIo()
  if (!io) return
  const { ids: recipients, muted } = await convRepo.recipients(c.id)
  const base = sharedSummary(c, { participantCount: recipients.length, lastMessage: message })
  const participantRooms = recipients.map(userRoom)

  if (c.kind === 'dm') {
    const profiles = await people.getProfiles(c.dm_key?.split(':') ?? [])
    for (const id of recipients) {
      const { title, otherPerson } = titleFor(c, id, profiles)
      io.to(userRoom(id)).emit('message:new', {
        message,
        conversation: { ...base, title, otherPerson, avatarUrl: otherPerson?.avatarUrl ?? null, muted: muted.has(id) },
      })
    }
    const { title } = titleFor(c, null, profiles)
    io.to([convRoom(c.id), OVERSEE_ROOM]).except(participantRooms).emit('message:new', {
      message,
      conversation: { ...base, title, isParticipant: false },
    })
    return
  }
  // Two emits so each recipient's copy carries their own `muted`.
  const mutedRooms = recipients.filter((id) => muted.has(id)).map(userRoom)
  const loudRooms = recipients.filter((id) => !muted.has(id)).map(userRoom)
  if (loudRooms.length) io.to(loudRooms).emit('message:new', { message, conversation: base })
  if (mutedRooms.length) io.to(mutedRooms).emit('message:new', { message, conversation: { ...base, muted: true } })
  io.to([convRoom(c.id), OVERSEE_ROOM]).except(participantRooms).emit('message:new', {
    message,
    conversation: { ...base, isParticipant: false },
  })
}

/**
 * Emit `conversation:updated` to current participants, plus `removed` (with
 * isParticipant false), plus one overseer-perspective copy to the `oversee`
 * room (excluding everyone above). DM copies carry per-pair block state in
 * readOnly so composers lock/unlock live after block/unblock.
 */
export async function broadcastConversation(c: ConversationRow, removed: string[] = []): Promise<void> {
  const io = getIo()
  if (!io) return
  const [{ ids: recipients, muted }, stats] = await Promise.all([convRepo.recipients(c.id), oneStats(c)])
  const base = sharedSummary(c, stats)
  const pair = c.kind === 'dm' ? (c.dm_key?.split(':') ?? []) : []
  const [profiles, blocked] = await Promise.all([
    pair.length ? people.getProfiles(pair) : Promise.resolve(new Map<string, ProfileRow>()),
    pair.length === 2 ? people.isBlockedEither(pair[0]!, pair[1]!) : Promise.resolve(false),
  ])
  const send = (id: string, conversation: ConversationSummary) => io.to(userRoom(id)).emit('conversation:updated', { conversation })

  for (const id of recipients) {
    if (c.kind === 'dm') {
      const { title, otherPerson } = titleFor(c, id, profiles)
      send(id, { ...base, title, otherPerson, avatarUrl: otherPerson?.avatarUrl ?? null, readOnly: base.readOnly || blocked, muted: muted.has(id) })
    } else {
      send(id, { ...base, muted: muted.has(id) })
    }
  }
  for (const id of removed) {
    send(id, { ...base, isParticipant: false, readOnly: true })
    io.in(userRoom(id)).socketsLeave(convRoom(c.id))
    // …and the group's Posts feed room (they can no longer see it).
    if (c.kind === 'group' && !c.is_main) io.in(userRoom(id)).socketsLeave(feedRoom(c.id))
  }
  const overseerTitle = c.kind === 'dm' ? titleFor(c, null, profiles).title : base.title
  io.to(OVERSEE_ROOM)
    .except([...recipients, ...removed].map(userRoom))
    .emit('conversation:updated', { conversation: { ...base, title: overseerTitle, isParticipant: false } })
}

/** After a block change, push the DM's new read-only state to both people. */
async function broadcastDmFor(a: string, b: string): Promise<void> {
  const conv = await convRepo.getConversationByDmKey(policy.dmKey(a, b))
  if (conv) await broadcastConversation(conv)
}

/** Push a viewer's fresh flags (owner / oversight) so their UI updates without reload. */
export async function emitViewer(profileId: string): Promise<void> {
  try {
    invalidateViewer(profileId)
    const v = await loadViewer(profileId)
    getIo()?.to(userRoom(profileId)).emit('viewer:updated', { viewer: publicViewer(v) })
  } catch (err) {
    log.error('emit_viewer_failed', err, { profile: profileId })
  }
}

export async function emitUnread(profileId: string): Promise<UnreadSnapshot> {
  const snap = await msgRepo.unreadCounts(profileId)
  getIo()?.to(userRoom(profileId)).emit('unread:snapshot', snap)
  return snap
}

// ── Conversations ───────────────────────────────────────────

export async function listConversations(v: ViewerContext, query: Record<string, unknown>): Promise<ConversationPage> {
  const scope = query.scope === 'all' ? 'all' : 'mine'
  if (scope === 'all' && !policy.canListAll(v)) throw forbidden('oversight access required')
  const kind = typeof query.kind === 'string' && ['dm', 'group', 'event'].includes(query.kind) ? query.kind : null
  const limit = clampLimit(query.limit, 20, 50)
  const cursor = decodeTimeCursor(typeof query.cursor === 'string' ? query.cursor : null)
  if (!cursor) await ensureForViewer(v)

  const rows = await convRepo.listConversations({
    viewerId: v.id,
    all: scope === 'all',
    kind,
    q: escapeLike(query.q),
    includeArchived: v.canOversee,
    after: cursor ? { at: cursor.key, id: cursor.id } : null,
    limit: limit + 1,
  })
  const page = rows.slice(0, limit)
  const last = page[page.length - 1]
  return {
    conversations: await buildSummaries(v, page, { allParticipant: scope === 'mine' }),
    nextCursor: rows.length > limit && last ? encodeCursor(last.last_message_at, last.id) : null,
  }
}

// Event-chat pruning on detail load, at most once a minute per conversation.
const prunedAt = new Map<string, number>()
const PRUNE_EVERY_MS = 60_000

async function maybePruneEvent(conv: ConversationRow): Promise<void> {
  if (conv.kind !== 'event') return
  const last = prunedAt.get(conv.id)
  if (last && Date.now() - last < PRUNE_EVERY_MS) return
  prunedAt.set(conv.id, Date.now())
  if (prunedAt.size > 5000) prunedAt.clear()
  const removed = await convRepo.pruneEventParticipants(conv)
  if (removed.length) {
    log.info('event_chat_pruned', { conversation: conv.id, removed: removed.length })
    void notifyLeft([conv.id], removed)
  }
}

/** Tell people who just left conversations (cancelled bookings) so lists + badges update. */
async function notifyLeft(conversationIds: string[], profileIds: string[]): Promise<void> {
  try {
    for (const id of conversationIds) {
      const conv = await convRepo.getConversation(id)
      if (conv) await broadcastConversation(conv, profileIds)
    }
    for (const pid of profileIds) await emitUnread(pid)
  } catch (err) {
    log.error('notify_left_failed', err)
  }
}

export async function getConversationDetail(v: ViewerContext, id: string): Promise<ConversationDetail> {
  let { conv, me } = await readable(v, id)
  await maybePruneEvent(conv).catch((e) => log.error('prune_failed', e, { conversation: conv.id }))
  if (me && conv.kind === 'event') me = await convRepo.getParticipant(conv.id, v.id)
  if (!me && conv.kind === 'event' && !policy.canRead(v, toPolicyConversation(conv), false)) {
    throw forbidden('no access to this conversation')
  }
  // "Admins who open it" become event-chat participants; overseers stay invisible.
  if (!me && conv.kind === 'event' && v.isAdmin && !v.canOversee) {
    await convRepo.upsertParticipants(conv.id, [{ profileId: v.id, role: policy.participantRoleFor(v) }], { rejoin: true })
    me = await convRepo.getParticipant(conv.id, v.id)
  }
  return buildDetail(v, conv, me)
}

export async function listMessages(v: ViewerContext, id: string, query: Record<string, unknown>): Promise<MessagePage> {
  const { conv } = await readable(v, id)
  const limit = clampLimit(query.limit, 30, 50)
  const cursor = decodeTimeCursor(typeof query.cursor === 'string' ? query.cursor : null)
  const rows = await msgRepo.listMessages(conv.id, cursor, limit)
  const page = rows.slice(0, limit)
  const urls = await signUrls(attachmentPaths(page))
  const last = page[page.length - 1]
  return {
    messages: page.map((m) => toMessage(m, urls)),
    nextCursor: rows.length > limit && last ? encodeCursor(last.created_at, last.id) : null,
  }
}

export async function openDm(v: ViewerContext, input: unknown): Promise<ConversationDetail> {
  const { profileId } = z.object({ profileId: uuid }).parse(input)
  if (profileId === v.id) throw badRequest('cannot message yourself')
  const target = await people.getProfile(profileId)
  if (!target) throw notFound('person not found')
  const key = policy.dmKey(v.id, profileId)

  const existing = await convRepo.getConversationByDmKey(key)
  if (existing) {
    const me = await convRepo.getParticipant(existing.id, v.id)
    if (me) return buildDetail(v, existing, me)
  }

  const [targetMemberships, blocked] = await Promise.all([people.getMemberships(profileId), people.isBlockedEither(v.id, profileId)])
  const targetActive = target.role === 'member' && targetMemberships.active
  const needsIntro = !v.isAdmin && target.role !== 'admin'
  const introduced = needsIntro ? await people.areIntroduced(v.memberIds, targetMemberships.memberIds) : false
  const allowed = policy.canDm(
    v,
    { id: profileId, isAdmin: target.role === 'admin', isActiveMember: targetActive },
    { introduced, blocked },
  )
  if (!allowed) throw forbidden(blocked ? 'messaging is blocked' : 'you can only message people you have been introduced to')

  const { conv, created } = await convRepo.ensureDm(key, v.id)
  await convRepo.upsertParticipants(
    conv.id,
    [
      { profileId: v.id, role: policy.participantRoleFor(v) },
      { profileId, role: await roleFor(target) },
    ],
    { rejoin: true },
  )
  if (created) {
    log.info('dm_created', { conversation: conv.id })
    void broadcastConversation(conv).catch((e) => log.error('broadcast_failed', e))
  }
  return buildDetail(v, conv, await convRepo.getParticipant(conv.id, v.id))
}

/** Existing profiles eligible to be added to a group (admins + members). */
async function eligibleProfiles(ids: string[]): Promise<ProfileRow[]> {
  const profiles = await people.getProfiles(ids)
  return [...profiles.values()].filter((p) => p.role === 'admin' || p.role === 'member')
}

export async function createGroup(v: ViewerContext, input: unknown): Promise<ConversationDetail> {
  if (!policy.canCreateGroup(v)) throw forbidden('only the owner can create groups')
  const body = z
    .object({
      title: z.string().trim().min(1).max(120),
      description: z.string().trim().max(1000).nullish(),
      participantIds: z.array(uuid).max(2000).default([]),
      isJoinable: z.boolean().optional(),
    })
    .parse(input)

  const now = new Date().toISOString()
  const conv = await convRepo.insertConversation({
    kind: 'group',
    title: body.title,
    description: body.description || null,
    is_joinable: body.isJoinable ?? false,
    created_by: v.id,
    last_message_at: now,
  })
  const others = (await eligibleProfiles(body.participantIds.filter((id) => id !== v.id))).map((p) => ({
    profileId: p.id,
    role: (p.role === 'admin' ? 'admin' : 'member') as policy.ParticipantRole,
  }))
  await convRepo.upsertParticipants(conv.id, [{ profileId: v.id, role: 'owner', lastReadAt: now }, ...others], { rejoin: true })
  log.info('group_created', { conversation: conv.id, participants: others.length + 1 })
  void broadcastConversation(conv).catch((e) => log.error('broadcast_failed', e))
  return buildDetail(v, conv, await convRepo.getParticipant(conv.id, v.id))
}

export async function patchConversation(v: ViewerContext, id: string, input: unknown): Promise<ConversationDetail> {
  const conv = await loadConversation(id)
  const pc = toPolicyConversation(conv)
  if (!policy.canManageGroup(v, pc)) throw forbidden('only the owner can edit groups')
  const body = z
    .object({
      title: z.string().trim().min(1).max(120).optional(),
      description: z.string().trim().max(1000).nullish(),
      isJoinable: z.boolean().optional(),
      archived: z.boolean().optional(),
    })
    .parse(input)
  if (body.archived !== undefined && !policy.canArchive(v, pc)) throw forbidden('the main group cannot be archived')

  const patch: Partial<ConversationRow> = {}
  if (body.title !== undefined) patch.title = body.title
  if (body.description !== undefined) patch.description = body.description || null
  if (body.isJoinable !== undefined) patch.is_joinable = body.isJoinable
  if (body.archived !== undefined) patch.archived_at = body.archived ? (conv.archived_at ?? new Date().toISOString()) : null
  const updated = Object.keys(patch).length ? await convRepo.updateConversation(conv.id, patch) : conv
  void broadcastConversation(updated).catch((e) => log.error('broadcast_failed', e))
  return buildDetail(v, updated, await convRepo.getParticipant(conv.id, v.id))
}

export async function addParticipants(v: ViewerContext, id: string, input: unknown): Promise<ConversationDetail> {
  const conv = await loadConversation(id)
  if (!policy.canManageGroup(v, toPolicyConversation(conv)) || conv.archived_at) throw forbidden('only the owner can add people')
  const { profileIds } = z.object({ profileIds: z.array(uuid).min(1).max(2000) }).parse(input)
  const rows = (await eligibleProfiles(profileIds)).map((p) => ({
    profileId: p.id,
    role: (p.role === 'admin' ? 'admin' : 'member') as policy.ParticipantRole,
  }))
  await convRepo.upsertParticipants(conv.id, rows, { rejoin: true })
  void broadcastConversation(conv).catch((e) => log.error('broadcast_failed', e))
  return buildDetail(v, conv, await convRepo.getParticipant(conv.id, v.id))
}

export async function removeParticipant(v: ViewerContext, id: string, profileId: string): Promise<{ ok: true }> {
  if (!isUuid(profileId)) throw notFound('participant not found')
  const conv = await loadConversation(id)
  const target = await convRepo.getParticipant(conv.id, profileId)
  if (!policy.canRemoveParticipant(v, toPolicyConversation(conv), profileId, !!target)) {
    throw forbidden(profileId === v.id ? 'you cannot leave this conversation' : 'only the owner can remove people')
  }
  await convRepo.markLeft(conv.id, profileId)
  void broadcastConversation(conv, [profileId]).catch((e) => log.error('broadcast_failed', e))
  void emitUnread(profileId).catch(() => {})
  return { ok: true }
}

export async function joinConversation(v: ViewerContext, id: string): Promise<ConversationDetail> {
  const conv = await loadConversation(id)
  if (!policy.canJoin(v, toPolicyConversation(conv))) throw forbidden('this group is not open to join')
  await convRepo.upsertParticipants(
    conv.id,
    [{ profileId: v.id, role: policy.participantRoleFor(v), lastReadAt: new Date().toISOString() }],
    { rejoin: true },
  )
  void broadcastConversation(conv).catch((e) => log.error('broadcast_failed', e))
  return buildDetail(v, conv, await convRepo.getParticipant(conv.id, v.id))
}

// ── Messages ────────────────────────────────────────────────

export async function sendMessage(v: ViewerContext, input: unknown): Promise<ChatMessage> {
  const parsed = sendSchema.parse(input)
  const body = parsed.body?.trim() ? parsed.body.trim() : null
  const attachments = parsed.attachments ?? []
  if (body && body.length > policy.MAX_BODY) throw badRequest(`message is longer than ${policy.MAX_BODY} characters`)
  if (!body && !attachments.length) throw badRequest('message is empty')
  if (!sendLimiter.take(v.id)) throw new HttpError(429, 'slow down')

  const conv = await loadConversation(parsed.conversationId)
  const me = await convRepo.getParticipant(conv.id, v.id)
  const blocked = await dmBlocked(v, conv)
  if (!policy.canPost(v, toPolicyConversation(conv), { isParticipant: !!me, blocked })) {
    throw forbidden(blocked ? 'messaging is blocked' : 'this conversation is read-only')
  }
  for (const a of attachments) {
    if (!policy.isValidAttachmentPath(conv.id, a.path)) throw badRequest('invalid attachment path')
  }
  if (!me && conv.kind === 'event' && v.isAdmin) {
    await convRepo.upsertParticipants(conv.id, [{ profileId: v.id, role: policy.participantRoleFor(v) }], { rejoin: true })
  }

  const { message: row, created } = await msgRepo.insertMessage({
    conversationId: conv.id,
    senderId: v.id,
    body,
    attachments: attachments.map((a) => ({
      path: a.path,
      name: a.name,
      mime: a.mime,
      size: a.size,
      ...(a.width ? { width: a.width } : {}),
      ...(a.height ? { height: a.height } : {}),
    })),
    clientId: parsed.clientId ?? randomUUID(),
  })
  if (row.conversation_id !== conv.id) throw badRequest('clientId already used')
  const urls = await signUrls(attachmentPaths([row]))
  const message = toMessage(row, urls)

  if (created) {
    // Sender has, by definition, read up to their own message.
    void msgRepo.markRead(conv.id, v.id, row.created_at).catch(() => {})
    void broadcastMessage(conv, message).catch((e) => log.error('broadcast_failed', e, { conversation: conv.id }))
  }
  return message
}

export async function deleteMessage(v: ViewerContext, id: string): Promise<{ ok: true }> {
  if (!isUuid(id)) throw notFound('message not found')
  const msg = await msgRepo.getMessage(id)
  if (!msg) throw notFound('message not found')
  if (!policy.canDeleteMessage(v, msg.sender_id)) throw forbidden('you can only delete your own messages')
  if (!msg.deleted_at) {
    await msgRepo.softDelete(id, v.id)
    const io = getIo()
    if (io) {
      const recipients = await convRepo.participantIds(msg.conversation_id)
      io.to([...recipients.map(userRoom), convRoom(msg.conversation_id)]).emit('message:deleted', {
        conversationId: msg.conversation_id,
        messageId: id,
      })
    }
  }
  return { ok: true }
}

/** Advance the read pointer; overseers who aren't participants are a no-op. */
export async function markRead(v: ViewerContext, id: string, input: unknown): Promise<{ ok: true; at: string | null }> {
  const { at: requested } = z.object({ at: z.string().max(64).optional() }).parse(input ?? {})
  const { conv, me } = await readable(v, id)
  if (!me) return { ok: true, at: null }

  let at: string
  if (requested) {
    if (Number.isNaN(Date.parse(requested))) throw badRequest('invalid at')
    at = requested
  } else {
    // Use the newest message's exact DB timestamp when it's ahead of our clock
    // (µs precision / clock skew) so "read now" really covers everything.
    const stats = await convRepo.conversationStats([conv.id])
    const lastAt = stats.get(conv.id)?.lastMessage?.created_at
    const nowIso = new Date().toISOString()
    at = lastAt && Date.parse(lastAt) >= Date.parse(nowIso) ? lastAt : nowIso
  }
  const moved = await msgRepo.markRead(conv.id, v.id, at)
  if (moved) {
    // DMs: the other person gets it in their user room too, so "Seen" updates
    // even when their thread isn't open (one emit → no duplicate per socket).
    const other = conv.kind === 'dm' ? policy.dmOtherId(conv.dm_key, v.id) : null
    const rooms = other ? [convRoom(conv.id), userRoom(other)] : [convRoom(conv.id)]
    getIo()?.to(rooms).emit('read', { conversationId: conv.id, profileId: v.id, at })
  }
  await emitUnread(v.id)
  return { ok: true, at }
}

export async function createUpload(v: ViewerContext, input: unknown): Promise<UploadTicket> {
  const body = uploadSchema.parse(input)
  const conv = await loadConversation(body.conversationId)
  const me = await convRepo.getParticipant(conv.id, v.id)
  const blocked = await dmBlocked(v, conv)
  if (!policy.canPost(v, toPolicyConversation(conv), { isParticipant: !!me, blocked })) {
    throw forbidden('you cannot post in this conversation')
  }
  return createUploadTicket(`${conv.id}/${randomUUID()}-${safeName(body.name)}`)
}

// ── People / blocks ─────────────────────────────────────────

export async function listPeople(v: ViewerContext, query: Record<string, unknown>): Promise<PeoplePage> {
  if (!(v.isAdmin || v.isActiveMember)) return { people: [], nextCursor: null }
  const limit = clampLimit(query.limit, 30, 50)
  const c = decodeCursor(typeof query.cursor === 'string' ? query.cursor : null)
  const rows = await people.searchPeople({
    viewerId: v.id,
    all: v.isAdmin,
    q: escapeLike(query.q),
    after: c ? { name: c.key ?? '', id: c.id } : null,
    limit: limit + 1,
    excludeDm: query.excludeDm === '1' || query.excludeDm === 'true',
  })
  const page = rows.slice(0, limit)
  const last = page[page.length - 1]
  return {
    people: page.map(toPerson),
    nextCursor: rows.length > limit && last ? encodeCursor(last.sort_name || null, last.id) : null,
  }
}

export async function block(v: ViewerContext, input: unknown): Promise<{ ok: true }> {
  const { profileId } = z.object({ profileId: uuid }).parse(input)
  if (profileId === v.id) throw badRequest('cannot block yourself')
  if (!(await people.getProfile(profileId))) throw notFound('person not found')
  await adminRepo.addBlock(v.id, profileId)
  void broadcastDmFor(v.id, profileId).catch((e) => log.error('broadcast_failed', e))
  return { ok: true }
}

export async function unblock(v: ViewerContext, profileId: string): Promise<{ ok: true }> {
  if (!isUuid(profileId)) throw notFound('person not found')
  await adminRepo.removeBlock(v.id, profileId)
  void broadcastDmFor(v.id, profileId).catch((e) => log.error('broadcast_failed', e))
  return { ok: true }
}

// ── Reports ─────────────────────────────────────────────────

export async function createReport(v: ViewerContext, input: unknown): Promise<{ ok: true; id: string }> {
  const body = z
    .object({
      conversationId: uuid.nullish(),
      messageId: uuid.nullish(),
      // Member Feed: report a post or a comment (files under its group / the main group).
      postId: uuid.nullish(),
      commentId: uuid.nullish(),
      reason: z.string().trim().min(1).max(1000),
    })
    .parse(input)
  if (body.postId || body.commentId) {
    const t = await feed.reportTarget(v, { postId: body.postId, commentId: body.commentId })
    const row = await adminRepo.createReport({
      conversationId: t.conversationId,
      messageId: null,
      reporterId: v.id,
      reason: body.reason,
      postId: t.postId,
      commentId: t.commentId,
    })
    log.info('feed_report_created', { report: row.id, post: t.postId })
    return { ok: true, id: row.id }
  }
  if (!body.conversationId) throw badRequest('conversationId is required')
  const { conv, me } = await readable(v, body.conversationId)
  if (!me && !v.canOversee) throw forbidden('only participants can report')
  if (body.messageId) {
    const msg = await msgRepo.getMessage(body.messageId)
    if (!msg || msg.conversation_id !== conv.id) throw badRequest('message is not in this conversation')
  }
  const row = await adminRepo.createReport({
    conversationId: conv.id,
    messageId: body.messageId ?? null,
    reporterId: v.id,
    reason: body.reason,
  })
  log.info('report_created', { report: row.id, conversation: conv.id })
  return { ok: true, id: row.id }
}

async function toReports(rows: adminRepo.ReportRow[]): Promise<ChatReport[]> {
  const convIds = [...new Set(rows.map((r) => r.conversation_id))]
  const convs = new Map<string, ConversationRow>()
  for (const part of chunk(convIds, 150)) {
    const list = must(await supabase.from('chat_conversations').select('*').in('id', part), 'report conversations') as ConversationRow[]
    for (const c of list) convs.set(c.id, c)
  }
  const msgs = await msgRepo.getMessages(rows.flatMap((r) => (r.message_id ? [r.message_id] : [])))
  const profiles = await people.getProfiles([
    ...rows.flatMap((r) => (r.reporter_id ? [r.reporter_id] : [])),
    ...[...convs.values()].flatMap((c) => c.dm_key?.split(':') ?? []),
  ])
  const urls = await signUrls(attachmentPaths([...msgs.values()]))
  const feedCtx = await feed.reportContext(rows)
  return rows.map((r) => {
    const fc = r.comment_id ? feedCtx.get(`c:${r.comment_id}`) : r.post_id ? feedCtx.get(`p:${r.post_id}`) : undefined
    const c = convs.get(r.conversation_id)
    const m = r.message_id ? msgs.get(r.message_id) : undefined
    const reporter = r.reporter_id ? profiles.get(r.reporter_id) : undefined
    return {
      id: r.id,
      conversationId: r.conversation_id,
      conversationTitle: c ? titleFor(c, null, profiles).title : 'Conversation',
      messageId: r.message_id,
      // Reviewers see the original content even if the sender deleted it.
      message: m ? { ...toMessage({ ...m, deleted_at: null }, urls), deletedAt: m.deleted_at } : null,
      reporterId: r.reporter_id,
      reporter: reporter ? toPerson(reporter) : null,
      reason: r.reason,
      status: r.status,
      reviewedBy: r.reviewed_by,
      reviewedAt: r.reviewed_at,
      createdAt: r.created_at,
      postId: r.post_id ?? null,
      commentId: r.comment_id ?? null,
      feedGroupId: fc?.groupId ?? null,
      feedBody: fc?.body ?? null,
    }
  })
}

export async function listReports(v: ViewerContext, query: Record<string, unknown>): Promise<ReportPage> {
  if (!policy.canReviewReports(v)) throw forbidden('oversight access required')
  const status = typeof query.status === 'string' && ['open', 'reviewed', 'dismissed'].includes(query.status) ? query.status : null
  const limit = clampLimit(query.limit, 30, 50)
  const cursor = decodeTimeCursor(typeof query.cursor === 'string' ? query.cursor : null)
  const rows = await adminRepo.listReports(status, cursor, limit)
  const page = rows.slice(0, limit)
  const last = page[page.length - 1]
  return {
    reports: await toReports(page),
    nextCursor: rows.length > limit && last ? encodeCursor(last.created_at, last.id) : null,
  }
}

export async function patchReport(v: ViewerContext, id: string, input: unknown): Promise<ChatReport> {
  if (!policy.canReviewReports(v)) throw forbidden('oversight access required')
  if (!isUuid(id)) throw notFound('report not found')
  const { status } = z.object({ status: z.enum(['open', 'reviewed', 'dismissed']) }).parse(input)
  const row = await adminRepo.updateReport(id, status, v.id)
  if (!row) throw notFound('report not found')
  const [report] = await toReports([row])
  return report!
}

// ── Staff oversight (owner only) ────────────────────────────

export async function listStaff(v: ViewerContext): Promise<{ staff: StaffAccessEntry[] }> {
  if (!policy.canManageStaff(v)) throw forbidden('owner only')
  const rows = await adminRepo.listStaff()
  const profiles = await people.getProfiles(rows.map((r) => r.profile_id))
  return {
    staff: rows.map((r) => {
      const p = profiles.get(r.profile_id)
      return { profileId: r.profile_id, grantedBy: r.granted_by, createdAt: r.created_at, person: p ? toPerson(p) : null }
    }),
  }
}

export async function grantStaff(v: ViewerContext, input: unknown): Promise<{ staff: StaffAccessEntry[] }> {
  if (!policy.canManageStaff(v)) throw forbidden('owner only')
  const { profileId } = z.object({ profileId: uuid }).parse(input)
  const target = await people.getProfile(profileId)
  if (!target) throw notFound('person not found')
  if (target.role === 'member') throw badRequest('oversight is for team members, not club members')
  await adminRepo.grantStaff(profileId, v.id)
  invalidateViewer(profileId)
  getIo()?.in(userRoom(profileId)).socketsJoin(OVERSEE_ROOM)
  void emitViewer(profileId)
  log.info('staff_granted', { profile: profileId })
  return listStaff(v)
}

export async function revokeStaff(v: ViewerContext, profileId: string): Promise<{ staff: StaffAccessEntry[] }> {
  if (!policy.canManageStaff(v)) throw forbidden('owner only')
  if (!isUuid(profileId)) throw notFound('person not found')
  await adminRepo.revokeStaff(profileId)
  invalidateViewer(profileId)
  // The owner always oversees; anyone else stops receiving overseer copies now.
  const fresh = await loadViewer(profileId).catch(() => null)
  if (!fresh?.canOversee) getIo()?.in(userRoom(profileId)).socketsLeave(OVERSEE_ROOM)
  void emitViewer(profileId)
  return listStaff(v)
}

// ── Mute / person lookup ────────────────────────────────────

export async function muteConversation(v: ViewerContext, id: string, input: unknown): Promise<ConversationDetail> {
  const { muted } = z.object({ muted: z.boolean() }).parse(input)
  const { conv, me } = await readable(v, id)
  if (!me) throw forbidden('only participants can mute')
  await convRepo.setMuted(conv.id, v.id, muted)
  const detail = await buildDetail(v, conv, await convRepo.getParticipant(conv.id, v.id))
  // The viewer's other tabs: their own summary + a badge total without (or with) this chat.
  const { participants: _p, description: _d, myLastReadAt: _r, otherLastReadAt: _o, blockedByMe: _b, blockedMe: _m, ...summary } = detail
  getIo()?.to(userRoom(v.id)).emit('conversation:updated', { conversation: summary })
  await emitUnread(v.id)
  return detail
}

/** A single person the viewer may DM (404 otherwise) + their DM if it already has messages. */
export async function getPerson(v: ViewerContext, profileId: string): Promise<PersonLookup> {
  if (!isUuid(profileId) || profileId === v.id) throw notFound('person not found')
  const target = await people.getProfile(profileId)
  if (!target) throw notFound('person not found')
  const [targetMemberships, blocked] = await Promise.all([people.getMemberships(profileId), people.isBlockedEither(v.id, profileId)])
  const needsIntro = !v.isAdmin && target.role !== 'admin'
  const introduced = needsIntro ? await people.areIntroduced(v.memberIds, targetMemberships.memberIds) : false
  const allowed = policy.canDm(
    v,
    { id: profileId, isAdmin: target.role === 'admin', isActiveMember: target.role === 'member' && targetMemberships.active },
    { introduced, blocked },
  )
  if (!allowed) throw notFound('person not found')

  let conversationId: string | null = null
  const dm = await convRepo.getConversationByDmKey(policy.dmKey(v.id, profileId))
  if (dm && (await convRepo.getParticipant(dm.id, v.id))) {
    const stats = await convRepo.conversationStats([dm.id])
    if (stats.get(dm.id)?.lastMessage) conversationId = dm.id
  }
  return { person: toPerson(target), conversationId }
}
