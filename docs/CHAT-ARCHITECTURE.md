# Member Chat — architecture & contract (v1)

Status: BUILDING (2026-10-21). Scope v1: DMs, groups, event chats, unread badges, photos,
block/report, Sarah oversight. Later: feed, directory. Offline notifications: NONE for now.

## Topology
- **Railway project** with two services from this repo:
  - `services/chat` — Node 22 + TypeScript, Express + Socket.IO. **This build.**
  - `services/voice` — Twilio ConversationRelay voice agent. Later, separate service so chat
    deploys never drop live calls.
  - Railway settings per service: Root Directory `services/chat`, Watch Paths `services/chat/**`,
    healthcheck `GET /health`. Because Root Directory isolates the folder, the service must NOT
    import anything from outside `services/chat` (contract types are duplicated, see below).
- **Supabase** stays DB + auth + storage. The chat server uses the service-role key (server only).
  Browsers never read/write chat tables directly: RLS is ON with **no** client policies.
- **Next.js (Vercel)** talks to the chat server directly from the browser:
  - REST over HTTPS (axios instance `src/lib/http/chat-client.ts`, Bearer token) for paginated reads
    and mutations.
  - Socket.IO for realtime (new messages, unread counts, typing, read receipts).
  - `NEXT_PUBLIC_CHAT_URL` (e.g. `https://chat.theclubgroup.co`, local `http://localhost:4100`).

## Auth
- Client sends the Supabase access token: socket `io(URL, { auth: cb => cb({ token }) })`
  (callback form so reconnects always send the *current* token), REST `Authorization: Bearer <token>`.
- Server verifies with `supabase.auth.getClaims(token)` (JWKS, cached) and falls back to
  `auth.getUser(token)`. Invalid/expired → socket `connect_error` "unauthorized" / HTTP 401.
- Server loads `profiles.role` and computes the **viewer**:
  - `isOwner`  — profile id == `app_settings.media_owner.profileId` (Sarah). Override:
    env `CHAT_OWNER_PROFILE_ID`.
  - `isAdmin`  — `profiles.role = 'admin'`.
  - `canOversee` — isOwner OR row in `chat_staff_access` (Sarah grants team members).
  - members: `profiles.role = 'member'` and a `members` row with `membership_status = 'active'`
    and `deleted_at is null`.
- CORS / socket origins: env `CHAT_ALLOWED_ORIGINS` (comma list).

## Rules
- **TEMPORARY (2026-10-21):** env `CHAT_ADMINS_FULL_ACCESS` (default `true`) makes every admin act as owner
  (create/manage groups, All chats, reports, team access). Set `false` before launch for Sarah-only.
- **Groups:** only the owner (Sarah) creates/edits/archives groups and adds/removes participants.
  Members can join `is_joinable` groups themselves and leave any group except the main one.
- **Main group "The Club":** `is_main = true`, exactly one. Every active member is auto-joined
  (ensured lazily on connect / on conversation list load). Admins too.
- **DMs:** one per pair (`dm_key` = the two profile ids sorted, joined by `:`).
  - admin ↔ anyone: allowed.
  - member ↔ member: only if an `introductions` row links their **members.id**
    (`member_a_id`/`member_b_id`, either order) with status `accepted` or `completed`.
  - Blocked either way → cannot create or send.
- **Event chats:** one per event (`event_id` unique). Participants = profiles behind
  `bookings.member_id → members.profile_id` with `bookings.status = 'confirmed'`, plus admins
  who open it. Created lazily when a participant loads their list (events with status
  published/live/completed). A member whose booking stops being `confirmed` leaves the chat
  (`left_at = now()`): for the viewer during the lazy ensure, and for everyone when anyone loads the
  event chat's detail (≤ 1/min per chat; one update per chat). Re-booking clears `left_at`.
  Read-only once `closes_at` passes
  (`closes_at = coalesce(end_date, start_date) + interval '7 days'`).
- **Oversight:** `canOversee` viewers can list/read ALL conversations (DMs + groups + events) via
  `scope=all`; reading doesn't mark anything read for them and doesn't add them as participants.
  Other admins see only conversations they participate in.
- **Reports:** any participant can report a message or conversation. Owner + overseers review.
- Messages: soft-delete by sender or owner (`deleted_at`), body replaced by null in API output.

## Schema — migration `supabase/migrations/20261021_member_chat.sql` (idempotent)
```
chat_conversations(
  id uuid pk default gen_random_uuid(),
  kind text check in ('dm','group','event'),
  title text, description text, avatar_url text,
  dm_key text unique,              -- dm only
  event_id uuid unique references events(id) on delete cascade,  -- event only
  is_main boolean default false,   -- partial unique index where is_main
  is_joinable boolean default false,
  created_by uuid references profiles(id),
  closes_at timestamptz,
  archived_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now())
chat_participants(
  conversation_id uuid references chat_conversations on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  role text check in ('owner','admin','member') default 'member',
  joined_at timestamptz default now(),
  last_read_at timestamptz,
  muted boolean default false,
  left_at timestamptz,
  primary key (conversation_id, profile_id))
chat_messages(
  id uuid pk default gen_random_uuid(),
  conversation_id uuid references chat_conversations on delete cascade,
  sender_id uuid references profiles(id),
  kind text check in ('text','system') default 'text',
  body text,
  attachments jsonb not null default '[]',   -- [{path,name,mime,size,width?,height?}]
  client_id text,                            -- optimistic de-dupe; unique (sender_id, client_id)
  created_at timestamptz default now(),
  edited_at timestamptz, deleted_at timestamptz, deleted_by uuid)
  index (conversation_id, created_at desc, id desc)
chat_blocks(blocker_id, blocked_id, created_at, pk(blocker_id, blocked_id))
chat_reports(id, conversation_id, message_id null, reporter_id, reason text,
  status text check in ('open','reviewed','dismissed') default 'open',
  reviewed_by, reviewed_at, created_at)
chat_staff_access(profile_id pk references profiles, granted_by, created_at)
function chat_unread_counts(p_profile uuid) returns table(conversation_id uuid, unread int)
  -- messages after participant.last_read_at, not sent by p_profile, not deleted, left_at null
storage bucket 'chat-attachments' (private)
```
RLS enabled on all chat tables, no policies (service role only). Trigger keeps
`chat_conversations.last_message_at` in sync on insert into `chat_messages`.

## Contract types
Defined twice, keep identical: `services/chat/src/contract.ts` and `src/lib/chat/contract.ts`.
```ts
type ConversationKind = 'dm' | 'group' | 'event'
interface ChatPerson { id: string; name: string; avatarUrl: string | null; company: string | null; jobTitle: string | null; isAdmin: boolean }
interface ChatAttachment { path: string; url: string; name: string; mime: string; size: number; width?: number; height?: number }
interface ChatMessage { id: string; conversationId: string; senderId: string | null; kind: 'text' | 'system';
  body: string | null; attachments: ChatAttachment[]; clientId: string | null; createdAt: string; editedAt: string | null; deletedAt: string | null }
interface ConversationSummary { id: string; kind: ConversationKind; title: string; avatarUrl: string | null;
  isMain: boolean; isJoinable: boolean; eventId: string | null; closesAt: string | null; archivedAt: string | null; readOnly: boolean;
  lastMessage: ChatMessage | null; lastMessageAt: string | null; unread: number; participantCount: number;
  otherPerson: ChatPerson | null;  /* dm only */  isParticipant: boolean;
  muted: boolean }   /* viewer muted it: per-conversation unread still shown, excluded from badge totals */
interface ConversationDetail extends ConversationSummary { description: string | null; participants: (ChatPerson & { role: 'owner'|'admin'|'member' })[]; myLastReadAt: string | null;
  otherLastReadAt: string | null  /* dm only: other participant's last_read_at — initial "Seen"; null for overseers */
  blockedByMe: boolean            /* dm only: viewer blocked the other person */
  blockedMe: boolean }            /* dm only: the other person blocked the viewer */
interface MessagePage { messages: ChatMessage[]; nextCursor: string | null }   // messages NEWEST FIRST
interface ConversationPage { conversations: ConversationSummary[]; nextCursor: string | null }
interface Viewer { id: string; isOwner: boolean; isAdmin: boolean; canOversee: boolean }
```
The shared contract file also declares the response shapes the doc leaves implicit:
`PeoplePage`, `ChatReport`, `ReportPage`, `StaffAccessEntry` (`GET /staff-access` → `{ staff }`),
`UploadTicket`, `UnreadSnapshot` and the socket payload interfaces + `Ack`.
Cursor = opaque base64 of `${createdAt}|${id}` (keyset pagination, never OFFSET).

## REST (all JSON, Bearer auth, errors `{ error: string }`)
| Method | Path | Notes |
|---|---|---|
| GET | `/health` | no auth |
| GET | `/me` | `{ viewer: Viewer, people: Record<id, ChatPerson> }` (people = just me) |
| GET | `/conversations?scope=mine\|all&kind=&q=&cursor=&limit=20` | ConversationPage, ordered last_message_at desc nulls last; `all` requires canOversee |
| GET | `/conversations/:id` | ConversationDetail (participant or overseer) |
| GET | `/conversations/:id/messages?cursor=&limit=30` | MessagePage, newest first, max limit 50 |
| POST | `/conversations/dm` `{ profileId }` | find-or-create DM (rules above) → ConversationDetail |
| POST | `/conversations/group` `{ title, description?, participantIds[], isJoinable? }` | owner only |
| PATCH | `/conversations/:id` `{ title?, description?, isJoinable?, archived? }` | owner only |
| POST | `/conversations/:id/participants` `{ profileIds[] }` / DELETE `/conversations/:id/participants/:profileId` | owner only (or self-leave) |
| POST | `/conversations/:id/join` | joinable groups |
| POST | `/conversations/:id/mute` `{ muted }` | participants only; sets `chat_participants.muted` → ConversationDetail; re-emits `unread:snapshot` |
| POST | `/conversations/:id/read` `{ at? }` | sets last_read_at; emits unread update |
| POST | `/messages` `{ conversationId, body?, attachments?, clientId }` | REST fallback of `message:send` |
| DELETE | `/messages/:id` | sender or owner |
| POST | `/uploads` `{ conversationId, name, mime, size }` | → `{ path, signedUrl, token }` Supabase signed upload URL; images only, ≤ 10 MB |
| GET | `/people?q=&cursor=&excludeDm=1` | who the viewer can start a DM with (admins: all active members + admins; members: introduced members + admins). `excludeDm=1` leaves out people the viewer already has a DM **with messages** with (needs migration `20261021_member_chat_2.sql`; before it's applied the server falls back to no exclusion and the client filters known DMs) |
| GET | `/people/:id` | `PersonLookup { person, conversationId }` — only someone the viewer may DM (else 404); `conversationId` = their existing DM if it has messages (restores a `?to=` draft after reload) |
| POST | `/blocks` `{ profileId }` / DELETE `/blocks/:profileId` | |
| POST | `/reports` `{ conversationId, messageId?, reason }` | |
| GET | `/reports?status=open` / PATCH `/reports/:id` `{ status }` | owner/overseers |
| GET/POST/DELETE | `/staff-access` (`{ profileId }`) | owner only — grant/revoke team oversight |

## Socket.IO events
Rooms: `user:{profileId}` (all of a user's sockets), `conv:{conversationId}` (joined on demand),
`oversee` (every socket of a `canOversee` viewer — joined on connect; the server adds/removes a
user's sockets live with `io.in(user:{id}).socketsJoin/socketsLeave('oversee')` when the owner
grants/revokes staff access, and invalidates that viewer's cache).
Client → server (all with ack `(res: { ok: true, ... } | { ok: false, error })`):
- `conversation:open { conversationId }` → join room (participant or overseer)
- `conversation:close { conversationId }`
- `message:send { conversationId, body?, attachments?, clientId }` → ack `{ ok, message }`
- `typing { conversationId, isTyping }`
- `read { conversationId }` → same as REST read
Server → client:
- `unread:snapshot { total, byConversation: Record<id, number>, muted: string[] }` — on connect, after
  reads, after mute changes. `total` (badge) EXCLUDES muted conversations; `byConversation` includes them.
- `message:new { message, conversation: ConversationSummary }` — to `user:{id}` of every participant
  (so list + badge update even when the thread isn't open). Senders get it too (dedupe by clientId).
  The summary is shared (`unread` 0 — clients keep their own count; DMs get per-recipient title).
  Plus ONE overseer-perspective copy (`isParticipant: false`, DM title "A & B") to `oversee` +
  `conv:{id}`, `.except()` the participant user rooms — no socket gets two copies. Clients patch
  their `scope=all` list from it and never touch unread.
- `message:deleted { conversationId, messageId }`
- `conversation:updated { conversation: ConversationSummary }` (created/renamed/participants changed,
  block/unblock) — to participants (DM copies carry the pair's block state in `readOnly`, sent to
  both people after block/unblock so composers lock/unlock live; clients refetch the open detail
  for `blockedByMe`/`blockedMe`), removed users (`isParticipant: false`), and an overseer copy to
  `oversee` excluding all of those.
- `typing { conversationId, profileId, name, isTyping }` — to `conv:` room except sender
- `read { conversationId, profileId, at }` — to the `conv:` room; for DMs also to the other
  participant's `user:` room in the same emit (no duplicates), so "Seen" updates with the thread closed.
- `viewer:updated { viewer: Viewer }` — to `user:{id}` when that viewer's flags change (staff access
  granted/revoked); clients replace the cached `/me` viewer (tabs appear/disappear live).

## Frontend
- `src/lib/chat/` — contract, `chat-client` axios, `ChatProvider` (one socket per signed-in user, mounted
  in portal + admin layouts; exposes viewer, socket, unread totals), hooks:
  `useConversations` (useInfiniteQuery), `useMessages(conversationId)` (**useInfiniteQuery**, 30/page,
  load older on scroll-to-top, preserve scroll position), `useSendMessage` (optimistic with clientId),
  `useUnread`, `useTyping`, `useMarkRead`. Socket events patch the TanStack cache — never refetch everything.
- UI kit `src/components/ui/chat/` — shadcn June-2026 primitives re-styled to the light gold/ivory
  brand: MessageScroller, Message, Bubble, Attachment, Marker, Composer (Input Group), ConversationList,
  UnreadBadge (red dot / 1..9 / 9+), TypingIndicator. Existing exports used by WhatsApp + Concierge stay
  backward compatible.
- Messages UI is WhatsApp-Web style: the list shows conversations, then "Start a conversation"
  (`/people?excludeDm=1`) — no "New" button. Picking a person opens a draft (`?to=<profileId>`);
  the DM is created (`POST /conversations/dm`) only on first send, then the URL becomes `?c=<id>`.
  Empty DMs are hidden from the list. Colours follow the active theme (`.chat-theme`).
- Portal: `/portal/messages` (+ `?c=<id>`), header chat icon with badge, "Message" button on
  introductions. Admin: `/dashboard/messages` with Mine / All (overseers) tabs, group management
  (owner), reports, staff access (owner).

## Member Feed (v1 — 2026-10-22)

One Club-wide feed plus a **Posts** feed per group conversation, served by the same `services/chat`
process (same auth/viewer, same Socket.IO connection, same deploy). Migration
`supabase/migrations/20261022_member_feed.sql` (idempotent; RLS on, no client policies; helper
functions EXECUTE service_role only).

### Rules
- **Feeds:** `group_id NULL` = the main Club feed. The main group "The Club" has no separate feed —
  its Posts tab *is* the main feed (the server maps the main group's id to `null`). Every other
  `kind='group'` conversation has its own feed, visible to its active participants
  (`chat_participants.left_at is null`), admins/owner and overseers.
- **Posting:** active members + admins on the main feed; group feeds need participation (owner posts
  anywhere). Archived groups are read only. Overseers who aren't admins read only.
- **Likes / comments:** anyone active who can see the feed (admins everywhere). Comments have ONE level
  of replies (a reply to a reply attaches to its parent).
- **Moderation** = `isAdmin || isOwner` (with `CHAT_ADMINS_FULL_ACCESS` every admin is owner anyway):
  pin/unpin (max 5 pinned shown, first page only, above the rest), hide/unhide, remove posts;
  hide/unhide/delete comments. Hidden items are visible only to moderators + their author
  (greyed, "Hidden"). Authors edit (text and photos) / delete their own posts and delete their comments.
- **Counts:** `like_count` / `comment_count` / `reply_count` are trigger-maintained; comment counts
  include only *visible* comments (not deleted, not hidden). Hiding or deleting a top-level comment
  cascades to its replies.
- **Notifications (in-app only):** `comment` (someone commented on my post), `reply` (someone replied
  to my comment), `group_post` (new post in a non-main group I'm in and haven't muted). Never for your
  own action; never twice per person per comment. Main-feed posts notify nobody (everyone is in the
  main group). Group fan-out is ONE `insert … select` over participants (`feed_notify_group_post`).
  Removing a post deletes its notifications and refreshes the affected badges.
- **Reports:** `POST /reports { postId | commentId, reason }` files into the existing `chat_reports`
  queue (`post_id` / `comment_id` columns; `conversation_id` = the post's group, or the main group for
  Club-feed posts) and shows in admin → Messages → Reports with the reported text.
- **Photos:** private bucket `feed-media` (10 MB, jpeg/png/webp/gif/heic), paths `main/<uuid>-name` or
  `<groupId>/<uuid>-name`, ≤ 4 per post, signed read URLs (12 h). Separate from `chat-attachments`
  because feed media is scoped to a feed, not a thread, and has its own lifecycle.

### Schema
```
feed_posts(id, author_id → profiles, group_id → chat_conversations (null = main), body ≤ 5000,
  images jsonb [{path,mime,size,width?,height?}] ≤ 4, client_id (unique per author),
  pinned_at/by, hidden_at/by, deleted_at/by, edited_at, like_count, comment_count, created_at)
  index (group_id, created_at desc, id desc) where deleted_at is null; pinned index
feed_comments(id, post_id, author_id, parent_id (one level, trigger-checked), body ≤ 2000,
  client_id, reply_count, hidden_at/by, deleted_at/by, created_at)
feed_likes(post_id, profile_id, created_at, pk)
member_notifications(id, recipient_id, kind in ('comment','reply','group_post'), actor_id,
  post_id, comment_id, group_id, read_at, created_at)
  index (recipient_id, created_at desc, id desc) + partial unread index
chat_reports + post_id, comment_id
functions feed_list_posts / feed_list_comments / feed_list_replies (keyset), feed_notify_group_post
```

### Contract additions (`contract.ts`, both copies identical)
`FeedImage`, `FeedPost` (`likedByMe` per viewer — socket copies always `false`, clients keep their own),
`FeedComment`, `FeedPage { pinned, posts, nextCursor }`, `FeedCommentPage`, `FeedLikeResult`,
`NotificationKind`, `MemberNotification` (`available` false when the post was removed/hidden),
`NotificationPage { notifications, nextCursor, unread }`, `NotificationSnapshot { unread }`, socket
payloads `FeedPostEvent`, `FeedPostDeletedEvent`, `FeedCommentEvent`, `FeedCommentDeletedEvent`,
`FeedLikeEvent`, `NotificationNewEvent`. `ChatReport` gains `postId`, `commentId`, `feedGroupId`,
`feedBody`.

### REST (Bearer auth, keyset cursors everywhere)
| Method | Path | Notes |
|---|---|---|
| GET | `/feed?group=&cursor=&limit=15` | FeedPage, newest first; `pinned` only on the first page (no cursor). `group` omitted (or the main group id) = Club feed |
| POST | `/feed/posts` `{ groupId?, body?, images?, clientId }` | 201 FeedPost; de-duped on `(author, clientId)`; 5/min |
| GET | `/feed/posts/:id` | FeedPost (detail / deep link); 404 if removed or hidden from you |
| PATCH | `/feed/posts/:id` `{ body?, images? }` | author only → FeedPost (`editedAt`). `images` = the full new list (≤ 4, in order): each path must already be on the post or be a fresh `/feed/uploads` path for the post's feed folder. Still needs text or a photo. Dropped photos are deleted from `feed-media` (best effort) after the update succeeds |
| DELETE | `/feed/posts/:id` | author or moderator |
| POST | `/feed/posts/:id/moderate` `{ pinned?, hidden? }` | moderators → FeedPost |
| POST | `/feed/posts/:id/like` `{ liked }` | idempotent → `{ liked, likeCount }` |
| GET | `/feed/posts/:id/comments?cursor=&limit=20` | top-level, NEWEST first (older pages = "View older comments") |
| POST | `/feed/posts/:id/comments` `{ body, parentId?, clientId }` | 201 FeedComment; 10 / 30 s |
| GET | `/feed/comments/:id/replies?cursor=&limit=10` | replies, OLDEST first |
| DELETE | `/feed/comments/:id` | author or moderator (top-level: replies go too) |
| POST | `/feed/comments/:id/moderate` `{ hidden }` | moderators → FeedComment |
| POST | `/feed/uploads` `{ groupId?, name, mime, size }` | UploadTicket for `feed-media` |
| GET | `/feed/mentionable?postId=&groupId=&q=&limit=8` | `MentionablePage { people }` — ≤ 8 people the viewer may @mention, ranked thread (post author + commenters) → introduced → group participants → Club team. Empty `q` returns only the thread (needs `postId`) |
| GET | `/notifications?cursor=&limit=20` | NotificationPage (newest first, + `unread`) |
| GET | `/notifications/unread` | NotificationSnapshot |
| POST | `/notifications/read` `{ ids? }` | none = all → NotificationSnapshot (also pushed as `notifications:snapshot`) |

### Socket.IO
Rooms: `feed:main`, `feed:{groupId}` (joined with `feed:open { groupId? }` — permission-checked; one
feed room per socket; `feed:close` leaves), `feed-mod` (every moderator socket, joined on connect).
Removed group participants are dropped from `feed:{groupId}` live.
Server → client:
- `feed:post:new|updated { post }` — to the feed room; hidden posts only to `feed-mod` + the author.
  Hide → `feed:post:updated` to moderators/author and `feed:post:deleted` to everyone else; unhide →
  `feed:post:new` to everyone else.
- `feed:post:deleted { postId, groupId }`
- `feed:comment:new|updated { comment, commentCount, replyCount }` and
  `feed:comment:deleted { postId, commentId, parentId, commentCount, replyCount }` — counts are
  absolute (idempotent). Comments on hidden posts / hidden comments follow the same private routing.
- `feed:like { postId, groupId, likeCount }` to the room (who liked is never broadcast); the liker's
  own sockets get a copy with `liked` so other tabs flip the heart.
- `notification:new { notification }` to `user:{recipient}`; `notifications:snapshot { unread }` on
  connect and after mark-read. Chat unread (`unread:snapshot`) is unchanged.

### Frontend
- `src/lib/feed/` — `FeedRealtimeProvider` (mounted inside ChatProvider in both layouts: notification
  badge + cache patching from feed events + room re-join/back-fill on reconnect), hooks
  (`useFeed` / `useComments` / `useReplies` / `useNotifications` — all `useInfiniteQuery`;
  `useCreatePost` optimistic with upload progress + Retry; `useLikePost` optimistic; `useAddComment`
  optimistic), keys under `['feed']`, cache patchers.
- `src/views/feed/` — `FeedView` (centred ≤ 680px column, sticky composer, pinned + infinite list,
  `?post=` detail modal), `PostCard`, `PostComposer`, `PostImages` (1–4 grid + lightbox), `Comments`,
  `FeedModals` (edit / report), `NotificationsBell`.
- Routes: portal `/portal/feed` (first item under Community), admin `/dashboard/feed` (Engage → Feed,
  with group pills `?group=`). Group threads in Messages have **Chat | Posts** (`?tab=posts` in the
  portal, `?view=posts` in admin). Bell: portal header (all widths), admin sidebar header (desktop) +
  mobile top bar. Notification links: Club feed `…/feed?post=<id>`; group posts
  `/portal/messages?c=<groupId>&tab=posts&post=<id>` (members) or
  `/dashboard/feed?group=<groupId>&post=<id>` (admins).

### @mentions (migration `20261022_feed_mentions.sql`)
- Stored in post/comment bodies as `@[Display Name](profile-uuid)`; validated ids persist in
  `feed_posts.mentions` / `feed_comments.mentions` (`uuid[]`, max 10 distinct per item). On create
  and edit the server re-validates every token; invalid ones are rewritten to plain `@Display Name`
  (no link, no notification). API items carry `mentions: ChatPerson[]` (resolved for rendering).
- **Who can be tagged** (`canMentionTarget`): members → introduced members (accepted/completed), the
  Club team, the post's author + visible commenters, and for group posts the group's participants;
  admins/owner → anyone active. Never self, never across a block (either way), never inactive people.
  A mention grants nothing else (no DM unlock, no extra profile fields).
- **Notifications:** kind `'mention'` per newly tagged person (edits notify only ids that weren't
  mentioned before), never the actor. One notification per person per event — `'mention'` beats
  comment/reply, and people mentioned in a new group post are excluded from that post's
  `group_post` fan-out (`feed_notify_group_post(..., p_exclude)`). Links work like comment links.
- **Client:** typing `@` in the composer, edit dialog, comment or reply input opens a picker
  (debounced `/feed/mentionable`; ↑/↓, Enter/Tab, Esc; caret-anchored on sm+, full-width above the
  input on phones). Inputs show `@Name` and convert to tokens on submit (`src/lib/feed/mentions.ts`);
  editing loads tokens back losslessly. Rendering: gold `@Name`; in admin a member's mention opens
  their member record; the portal has no member deep link yet, so it's a highlight only.
