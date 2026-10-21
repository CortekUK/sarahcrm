# @sarahcrm/chat

Realtime member chat **and the Member Feed** for The Club: Express (REST) + Socket.IO on one HTTP
server, backed by Supabase (service-role key; RLS on with no client policies). Contract:
`docs/CHAT-ARCHITECTURE.md` (feed: § Member Feed).

Standalone on purpose: it has its own `package-lock.json` and imports nothing from outside
`services/chat` (Railway's root directory isolates it). `src/contract.ts` is a copy of the
types in `src/lib/chat/contract.ts`, so keep the two in sync.

## Local

```bash
cd services/chat
cp .env.example .env        # fill SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
npm install
node --env-file=.env --import tsx src/index.ts   # or: npm run dev with the env exported
npm test                    # pure policy/cursor tests (no DB)
npm run typecheck && npm run build && npm start
```

Next app: `NEXT_PUBLIC_CHAT_URL=http://localhost:4100`, and add `http://localhost:3000` to
`CHAT_ALLOWED_ORIGINS`. The migrations `supabase/migrations/20261021_member_chat.sql` (+ `_2`) must be
applied first, and `20261022_member_feed.sql` for the feed (until it is, `/feed*` and
`/notifications*` return 500 and the socket logs `feed_connect_init_failed`; chat keeps working).

## Railway

- New service from this repo. **Root Directory** `services/chat`, **Watch Paths** `services/chat/**`.
- `railway.json` sets build `npm run build`, start `npm start`, healthcheck `GET /health`.
- Variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CHAT_ALLOWED_ORIGINS`
  (e.g. `https://theclubgroup.co,https://www.theclubgroup.co`), optional `CHAT_OWNER_PROFILE_ID`.
  `PORT` is injected by Railway.
- Custom domain e.g. `chat.theclubgroup.co`. One replica: rooms are in-memory (add the
  Socket.IO Redis adapter before scaling out).
- SIGTERM closes sockets first (clients auto-reconnect to the new deploy), then HTTP.

## Behaviour notes

- **Unread strategy.** `unread:snapshot { total, byConversation }` is sent on connect and after
  every read (REST or socket). `message:new` / `conversation:updated` carry a *shared*
  ConversationSummary: `unread` is always `0`, `isParticipant` is `true` and `readOnly` only
  reflects conversation-level locks (archived / closed event). Clients increment their own
  badge on `message:new` unless `message.senderId === me` or that thread is open and visible
  (then they call `read`). Merge the summary into the cache keeping your own `unread` and
  `readOnly`. DMs are the exception: each side gets its own `title` / `otherPerson` / `avatarUrl`.
  `conversation:updated` for a DM carries the pair's block state in `readOnly` (sent to both
  people after block/unblock), so composers lock/unlock live.
- Overseers (`scope=all`, non-participants) are never marked read or added as participants.
  Every socket of a `canOversee` viewer joins the `oversee` room (on connect, and live via
  `socketsJoin`/`socketsLeave` when the owner grants/revokes staff access). Fan-outs send one
  overseer-perspective copy (`isParticipant: false`, "A & B" DM title) to `oversee` + the
  `conv:` room, `.except()` participant user rooms, so nobody gets duplicates. Clients patch
  their `scope=all` list from these without touching unread.
- **Event chats follow bookings.** The lazy ensure leaves (`left_at = now()`) the viewer's event
  chats without a confirmed booking and re-joins ones they've re-booked; loading an event chat's
  detail prunes every such member at once (≤ 1/min/chat). Leavers get `conversation:updated`
  (`isParticipant: false`) + a fresh `unread:snapshot`. No SQL changes needed.
- **Mute.** `POST /conversations/:id/mute { muted }`. Summaries carry the recipient's own `muted`
  (broadcasts split muted/unmuted rooms); `unread:snapshot.total` excludes muted conversations and
  `muted: string[]` lists them.
- `GET /people/:id` → `{ person, conversationId }` (404 unless the viewer may DM them).
- `viewer:updated { viewer }` is pushed to a user's room after staff access changes.
- DM `read` receipts also go to the other participant's user room.
- `GET /people?excludeDm=1` skips people the viewer already has a DM with messages with
  (`chat_people(..., p_exclude_dm)` from `20261021_member_chat_2.sql`; until that's applied the
  RPC falls back to the 7-arg signature, logging `chat_people_v1_fallback`).
- `GET /conversations/:id` (ConversationDetail) adds, for DM participants only:
  `otherLastReadAt` (initial "Seen"), `blockedByMe`, `blockedMe`. Overseers get null/false.
- Lazy ensure (main group + event chats for confirmed bookings) runs on the first page of
  `GET /conversations` and on socket connect, at most once per 30 s per person. New main-group
  joiners start with `last_read_at = now()` so they don't inherit the backlog as unread.
- Sends are de-duped on `(sender_id, client_id)` and rate limited to 10 per 5 s per person.
- Tokens are only checked at handshake. A socket stays authenticated until it disconnects, and
  reconnects send the current token.

## Member Feed

- Code: `src/feed.ts` (use-cases + broadcasts), `src/repo/feed.ts` (DB + `feed-media` bucket), pure
  rules in `src/policy.ts` (`canPostFeed`, `canSeeGroupFeed`, `canInteract`, `canModerate`,
  `commentNotificationTargets`, `groupPostRecipients`, `isValidFeedImagePath`), tests in
  `test/feed.test.ts`.
- `feed:open { groupId? }` joins `feed:main` / `feed:{groupId}` after a permission check (one feed room
  per socket); moderators' sockets join `feed-mod` on connect so hidden posts/comments reach only them
  (and the author). `notifications:snapshot { unread }` is sent on connect and after mark-read.
- Group-post notifications are one `insert … select` (`feed_notify_group_post`) over unmuted
  participants, then pushed per recipient as `notification:new`. Main-feed posts don't notify.
- Feed reports reuse `chat_reports` (`post_id` / `comment_id`); `conversation_id` = the group, or the
  main group for Club-feed posts.
- Editing (`PATCH /feed/posts/:id { body?, images? }`) may replace the photo list: kept paths must already be on the post, new ones must be uploads for the same feed folder (`validEditImagePaths`); removed objects are deleted from `feed-media` best-effort after the update.
- @mentions: tokens `@[Name](profileId)` are validated on every create/edit (`canMentionTarget`, `rewriteMentions`); invalid ones become plain text. `GET /feed/mentionable` powers the picker. Needs `20261022_feed_mentions.sql` (`mentions` columns, `'mention'` kind, `feed_notify_group_post(..., p_exclude)` — the service falls back to the 3-arg call until it's applied).
- Rate limits: 5 posts / min, 10 comments / 30 s, 40 likes / 10 s per person.
