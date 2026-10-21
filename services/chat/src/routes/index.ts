// REST surface (see docs/CHAT-ARCHITECTURE.md § REST). Thin: parse params,
// call service.ts, return JSON. Express 5 forwards async throws to onError.
import { Router, type NextFunction, type Request, type Response } from 'express'
import { bearer, loadViewer, publicViewer, verifyToken, type ViewerContext } from '../auth.js'
import { toPublicError } from '../errors.js'
import { canUseChat } from '../policy.js'
import { log } from '../log.js'
import * as svc from '../service.js'
import * as feed from '../feed.js'

type Locals = { viewer: ViewerContext }
const viewerOf = (res: Response) => (res.locals as Locals).viewer
const param = (req: Request, name: string) => String(req.params[name] ?? '')

async function requireViewer(req: Request, res: Response, next: NextFunction) {
  const { profileId } = await verifyToken(bearer(req.headers.authorization))
  const viewer = await loadViewer(profileId)
  if (!canUseChat(viewer)) {
    res.status(403).json({ error: 'chat is not available for this account' })
    return
  }
  ;(res.locals as Locals).viewer = viewer
  next()
}

export function buildRouter(): Router {
  const r = Router()

  r.get('/health', (_req, res) => {
    res.json({ ok: true })
  })

  r.use(requireViewer)

  r.get('/me', (_req, res) => {
    const v = viewerOf(res)
    res.json({ viewer: publicViewer(v), people: { [v.id]: v.person } })
  })

  // Conversations
  r.get('/conversations', async (req, res) => {
    res.json(await svc.listConversations(viewerOf(res), req.query as Record<string, unknown>))
  })
  r.post('/conversations/dm', async (req, res) => {
    res.json(await svc.openDm(viewerOf(res), req.body))
  })
  r.post('/conversations/group', async (req, res) => {
    res.status(201).json(await svc.createGroup(viewerOf(res), req.body))
  })
  r.get('/conversations/:id', async (req, res) => {
    res.json(await svc.getConversationDetail(viewerOf(res), param(req, 'id')))
  })
  r.patch('/conversations/:id', async (req, res) => {
    res.json(await svc.patchConversation(viewerOf(res), param(req, 'id'), req.body))
  })
  r.get('/conversations/:id/messages', async (req, res) => {
    res.json(await svc.listMessages(viewerOf(res), param(req, 'id'), req.query as Record<string, unknown>))
  })
  r.post('/conversations/:id/participants', async (req, res) => {
    res.json(await svc.addParticipants(viewerOf(res), param(req, 'id'), req.body))
  })
  r.delete('/conversations/:id/participants/:profileId', async (req, res) => {
    res.json(await svc.removeParticipant(viewerOf(res), param(req, 'id'), param(req, 'profileId')))
  })
  r.post('/conversations/:id/mute', async (req, res) => {
    res.json(await svc.muteConversation(viewerOf(res), param(req, 'id'), req.body))
  })
  r.post('/conversations/:id/join', async (req, res) => {
    res.json(await svc.joinConversation(viewerOf(res), param(req, 'id')))
  })
  r.post('/conversations/:id/read', async (req, res) => {
    res.json(await svc.markRead(viewerOf(res), param(req, 'id'), req.body))
  })

  // Messages + uploads
  r.post('/messages', async (req, res) => {
    res.status(201).json({ message: await svc.sendMessage(viewerOf(res), req.body) })
  })
  r.delete('/messages/:id', async (req, res) => {
    res.json(await svc.deleteMessage(viewerOf(res), param(req, 'id')))
  })
  r.post('/uploads', async (req, res) => {
    res.json(await svc.createUpload(viewerOf(res), req.body))
  })

  // People, blocks, reports
  r.get('/people', async (req, res) => {
    res.json(await svc.listPeople(viewerOf(res), req.query as Record<string, unknown>))
  })
  r.get('/people/:id', async (req, res) => {
    res.json(await svc.getPerson(viewerOf(res), param(req, 'id')))
  })
  r.post('/blocks', async (req, res) => {
    res.json(await svc.block(viewerOf(res), req.body))
  })
  r.delete('/blocks/:profileId', async (req, res) => {
    res.json(await svc.unblock(viewerOf(res), param(req, 'profileId')))
  })
  r.post('/reports', async (req, res) => {
    res.status(201).json(await svc.createReport(viewerOf(res), req.body))
  })
  r.get('/reports', async (req, res) => {
    res.json(await svc.listReports(viewerOf(res), req.query as Record<string, unknown>))
  })
  r.patch('/reports/:id', async (req, res) => {
    res.json(await svc.patchReport(viewerOf(res), param(req, 'id'), req.body))
  })

  // Member Feed (main feed + group feeds). ?group=<conversationId> scopes to a group.
  r.get('/feed', async (req, res) => {
    res.json(await feed.listFeed(viewerOf(res), req.query as Record<string, unknown>))
  })
  r.post('/feed/posts', async (req, res) => {
    res.status(201).json(await feed.createPost(viewerOf(res), req.body))
  })
  r.get('/feed/posts/:id', async (req, res) => {
    res.json(await feed.getPost(viewerOf(res), param(req, 'id')))
  })
  r.patch('/feed/posts/:id', async (req, res) => {
    res.json(await feed.editPost(viewerOf(res), param(req, 'id'), req.body))
  })
  r.delete('/feed/posts/:id', async (req, res) => {
    res.json(await feed.deletePost(viewerOf(res), param(req, 'id')))
  })
  r.post('/feed/posts/:id/moderate', async (req, res) => {
    res.json(await feed.moderatePost(viewerOf(res), param(req, 'id'), req.body))
  })
  r.post('/feed/posts/:id/like', async (req, res) => {
    res.json(await feed.likePost(viewerOf(res), param(req, 'id'), req.body))
  })
  r.get('/feed/posts/:id/comments', async (req, res) => {
    res.json(await feed.listComments(viewerOf(res), param(req, 'id'), req.query as Record<string, unknown>))
  })
  r.post('/feed/posts/:id/comments', async (req, res) => {
    res.status(201).json(await feed.addComment(viewerOf(res), param(req, 'id'), req.body))
  })
  r.get('/feed/comments/:id/replies', async (req, res) => {
    res.json(await feed.listReplies(viewerOf(res), param(req, 'id'), req.query as Record<string, unknown>))
  })
  r.delete('/feed/comments/:id', async (req, res) => {
    res.json(await feed.deleteComment(viewerOf(res), param(req, 'id')))
  })
  r.post('/feed/comments/:id/moderate', async (req, res) => {
    res.json(await feed.moderateComment(viewerOf(res), param(req, 'id'), req.body))
  })
  r.get('/feed/mentionable', async (req, res) => {
    res.json(await feed.mentionable(viewerOf(res), req.query as Record<string, unknown>))
  })
  r.post('/feed/uploads', async (req, res) => {
    res.json(await feed.createFeedUpload(viewerOf(res), req.body))
  })

  // In-app notifications (feed). Chat unread stays on unread:snapshot.
  r.get('/notifications', async (req, res) => {
    res.json(await feed.listNotifications(viewerOf(res), req.query as Record<string, unknown>))
  })
  r.get('/notifications/unread', async (_req, res) => {
    res.json(await feed.notificationSnapshot(viewerOf(res)))
  })
  r.post('/notifications/read', async (req, res) => {
    res.json(await feed.markNotificationsRead(viewerOf(res), req.body))
  })

  // Staff oversight (owner only). DELETE accepts the id in the path or body.
  r.get('/staff-access', async (_req, res) => {
    res.json(await svc.listStaff(viewerOf(res)))
  })
  r.post('/staff-access', async (req, res) => {
    res.json(await svc.grantStaff(viewerOf(res), req.body))
  })
  r.delete('/staff-access/:profileId', async (req, res) => {
    res.json(await svc.revokeStaff(viewerOf(res), param(req, 'profileId')))
  })
  r.delete('/staff-access', async (req, res) => {
    res.json(await svc.revokeStaff(viewerOf(res), String((req.body as { profileId?: unknown })?.profileId ?? '')))
  })

  return r
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: 'not found' })
}

export function onError(err: unknown, req: Request, res: Response, _next: NextFunction) {
  // express.json parse errors carry a status
  const status = (err as { status?: number; type?: string })?.type === 'entity.parse.failed' ? 400 : undefined
  const pub = status ? { status, error: 'invalid JSON' } : toPublicError(err)
  if (pub.status >= 500) log.error('http_error', err, { method: req.method, path: req.path })
  res.status(pub.status).json({ error: pub.error })
}
