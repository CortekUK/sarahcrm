// Pure checks for the Member Feed rules, notification targets and feed
// cursors (no DB).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as p from '../src/policy.js'
import { decodeTimeCursor, encodeCursor } from '../src/cursor.js'

const id = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`
const owner: p.PolicyViewer = { id: id(1), isOwner: true, isAdmin: true, canOversee: true, isActiveMember: false }
const admin: p.PolicyViewer = { id: id(2), isOwner: false, isAdmin: true, canOversee: false, isActiveMember: false }
const staff: p.PolicyViewer = { id: id(3), isOwner: false, isAdmin: false, canOversee: true, isActiveMember: false }
const member: p.PolicyViewer = { id: id(4), isOwner: false, isAdmin: false, canOversee: false, isActiveMember: true }
const lapsed: p.PolicyViewer = { id: id(5), isOwner: false, isAdmin: false, canOversee: false, isActiveMember: false }

const main: p.FeedScope = { groupId: null, isParticipant: true, archived: false }
const group = (o: Partial<p.FeedScope> = {}): p.FeedScope => ({ groupId: id(50), isParticipant: false, archived: false, ...o })

test('canModerate: admins + owner only', () => {
  assert.equal(p.canModerate(owner), true)
  assert.equal(p.canModerate(admin), true)
  assert.equal(p.canModerate(staff), false)
  assert.equal(p.canModerate(member), false)
})

test('canPostFeed', () => {
  assert.equal(p.canPostFeed(member, main), true)
  assert.equal(p.canPostFeed(admin, main), true)
  assert.equal(p.canPostFeed(lapsed, main), false)
  assert.equal(p.canPostFeed(staff, main), false) // oversight alone is read-only
  assert.equal(p.canPostFeed(member, group()), false)
  assert.equal(p.canPostFeed(member, group({ isParticipant: true })), true)
  assert.equal(p.canPostFeed(member, group({ isParticipant: true, archived: true })), false)
  assert.equal(p.canPostFeed(owner, group()), true)
  assert.equal(p.canPostFeed(admin, group()), false)
})

test('canSeeGroupFeed / canSeeFeed', () => {
  assert.equal(p.canSeeGroupFeed(member, false), false)
  assert.equal(p.canSeeGroupFeed(member, true), true)
  assert.equal(p.canSeeGroupFeed(admin, false), true)
  assert.equal(p.canSeeGroupFeed(staff, false), true)
  assert.equal(p.canSeeFeed(member, main), true)
  assert.equal(p.canSeeFeed(lapsed, main), false)
  assert.equal(p.canSeeFeed(staff, main), true)
  assert.equal(p.canSeeFeed(member, group()), false)
})

test('canInteract: like/comment', () => {
  const visible = { hiddenAt: null, authorId: id(9) }
  const hidden = { hiddenAt: '2026-10-22T00:00:00Z', authorId: id(9) }
  assert.equal(p.canInteract(member, main, visible), true)
  assert.equal(p.canInteract(member, main, hidden), false)
  assert.equal(p.canInteract({ ...member, id: id(9) }, main, hidden), true) // author
  assert.equal(p.canInteract(admin, main, hidden), true)
  assert.equal(p.canInteract(staff, main, visible), false)
  assert.equal(p.canInteract(member, group({ isParticipant: true }), visible), true)
  assert.equal(p.canInteract(member, group(), visible), false)
  assert.equal(p.canInteract(admin, group(), visible), true)
  assert.equal(p.canInteract(member, group({ isParticipant: true, archived: true }), visible), false)
})

test('post visibility, edit + delete', () => {
  const post = { hiddenAt: '2026-10-22T00:00:00Z', authorId: id(9), deletedAt: null }
  assert.equal(p.canSeePost(member, post), false)
  assert.equal(p.canSeePost({ ...member, id: id(9) }, post), true)
  assert.equal(p.canSeePost(admin, post), true)
  assert.equal(p.canSeePost(admin, { ...post, deletedAt: '2026-10-22T01:00:00Z' }), false)
  assert.equal(p.canEditFeedItem(member, member.id), true)
  assert.equal(p.canEditFeedItem(admin, member.id), false)
  assert.equal(p.canEditFeedItem(member, null), false)
  assert.equal(p.canDeleteFeedItem(admin, member.id), true)
  assert.equal(p.canDeleteFeedItem(member, id(9)), false)
})

test('comment notification targets', () => {
  const [a, b, c] = [id(10), id(11), id(12)]
  // top-level comment on someone else's post → post author
  assert.deepEqual(p.commentNotificationTargets({ actorId: a, postAuthorId: b, parentAuthorId: null }), [
    { recipientId: b, kind: 'comment' },
  ])
  // commenting on my own post → nobody
  assert.deepEqual(p.commentNotificationTargets({ actorId: a, postAuthorId: a, parentAuthorId: null }), [])
  // reply → parent author ('reply') + post author ('comment')
  assert.deepEqual(p.commentNotificationTargets({ actorId: a, postAuthorId: b, parentAuthorId: c }), [
    { recipientId: c, kind: 'reply' },
    { recipientId: b, kind: 'comment' },
  ])
  // replying to the post author's own comment → one 'reply', not two
  assert.deepEqual(p.commentNotificationTargets({ actorId: a, postAuthorId: b, parentAuthorId: b }), [
    { recipientId: b, kind: 'reply' },
  ])
  // replying to my own comment on someone else's post → post author only
  assert.deepEqual(p.commentNotificationTargets({ actorId: a, postAuthorId: b, parentAuthorId: a }), [
    { recipientId: b, kind: 'comment' },
  ])
  // deleted author (null) → skipped
  assert.deepEqual(p.commentNotificationTargets({ actorId: a, postAuthorId: null, parentAuthorId: null }), [])
})

test('group post recipients', () => {
  const parts = [
    { profileId: id(20), muted: false },
    { profileId: id(21), muted: true },
    { profileId: id(22), muted: false },
  ]
  assert.deepEqual(p.groupPostRecipients(id(50), parts, id(20)), [id(22)])
  assert.deepEqual(p.groupPostRecipients(null, parts, id(20)), [])
})

test('feed image paths', () => {
  assert.equal(p.feedFolder(null), 'main')
  assert.equal(p.isValidFeedImagePath(null, 'main/abc.jpg'), true)
  assert.equal(p.isValidFeedImagePath(null, `${id(50)}/abc.jpg`), false)
  assert.equal(p.isValidFeedImagePath(id(50), `${id(50)}/abc.jpg`), true)
  assert.equal(p.isValidFeedImagePath(id(50), `${id(50)}/x/abc.jpg`), false)
  assert.equal(p.isValidFeedImagePath(null, 'main/..'), false)
  assert.equal(p.isValidFeedImagePath(null, 'main/'), false)
})

test('excerpt', () => {
  assert.equal(p.excerpt(null), null)
  assert.equal(p.excerpt('   \n '), null)
  assert.equal(p.excerpt('Hello\n\nworld'), 'Hello world')
  const long = 'x'.repeat(200)
  const out = p.excerpt(long, 50)!
  assert.equal(out.length, 50)
  assert.ok(out.endsWith('…'))
})

test('feed keyset cursors round-trip', () => {
  const at = '2026-10-22T09:15:30.123456+00:00'
  const c = decodeTimeCursor(encodeCursor(at, id(77)))
  assert.deepEqual(c, { key: at, id: id(77) })
  assert.equal(decodeTimeCursor(null), null)
  assert.throws(() => decodeTimeCursor(encodeCursor('not-a-date', id(77))))
  assert.throws(() => decodeTimeCursor(Buffer.from(`${at}|nope`).toString('base64url')))
  assert.equal(p.FEED_PAGE_SIZE, 15)
  assert.equal(p.COMMENT_PAGE_SIZE, 20)
  assert.equal(p.REPLY_PAGE_SIZE, 10)
  assert.equal(p.NOTIFICATION_PAGE_SIZE, 20)
})

test('edit image paths: keep existing, add uploads for this feed only', () => {
  const g = id(50)
  const existing = [`${g}/a.jpg`, `${g}/b.jpg`]
  assert.equal(p.validEditImagePaths(g, existing, [`${g}/b.jpg`]), true) // remove one
  assert.equal(p.validEditImagePaths(g, existing, [`${g}/b.jpg`, `${g}/a.jpg`]), true) // reorder
  assert.equal(p.validEditImagePaths(g, existing, [...existing, `${g}/new.jpg`]), true) // add an upload
  assert.equal(p.validEditImagePaths(g, existing, [...existing, 'main/new.jpg']), false) // other feed's folder
  assert.equal(p.validEditImagePaths(g, existing, [`${g}/x/../a.jpg`]), false) // traversal
  assert.equal(p.validEditImagePaths(g, existing, [`${g}/a.jpg`, `${g}/a.jpg`]), false) // duplicate
  assert.equal(p.validEditImagePaths(g, [], [`${g}/1.jpg`, `${g}/2.jpg`, `${g}/3.jpg`, `${g}/4.jpg`, `${g}/5.jpg`]), false) // > 4
  assert.equal(p.validEditImagePaths(null, ['legacy/odd-path.jpg'], ['legacy/odd-path.jpg']), true) // already on the post
  assert.equal(p.validEditImagePaths(g, existing, []), true) // remove all (body rule checked separately)
  assert.deepEqual(p.removedImagePaths(existing, [`${g}/b.jpg`, `${g}/new.jpg`]), [`${g}/a.jpg`])
  assert.deepEqual(p.removedImagePaths(existing, existing), [])
})

test('mention tokens: parse, rewrite invalid to plain text, cap, plain view', () => {
  const [a, b, c] = [id(30), id(31), id(32)]
  const body = `Hi @[Ann Lee](${a}) and @[Bob](${b.toUpperCase()}), cc @[Ann Lee](${a}) — not @[Eve](nope) or @plain`
  assert.deepEqual(p.mentionIds(body), [a, b])
  const tokens = p.parseMentions(body)
  assert.equal(tokens.length, 3)
  assert.equal(tokens[0]!.name, 'Ann Lee')
  assert.equal(body.slice(tokens[0]!.start, tokens[0]!.end), `@[Ann Lee](${a})`)

  const r = p.rewriteMentions(body, new Set([a]))
  assert.deepEqual(r.ids, [a])
  assert.equal(r.body, `Hi @[Ann Lee](${a}) and @Bob, cc @[Ann Lee](${a}) — not @[Eve](nope) or @plain`)

  assert.equal(p.plainMentions(`x @[Ann Lee](${a}) y`), 'x @Ann Lee y')
  assert.equal(p.excerpt(`Thanks @[Ann Lee](${a})!`), 'Thanks @Ann Lee!')

  // max distinct ids: the 3rd distinct one is rewritten
  const capped = p.rewriteMentions(`@[A](${a}) @[B](${b}) @[C](${c}) @[A](${a})`, new Set([a, b, c]), 2)
  assert.deepEqual(capped.ids, [a, b])
  assert.equal(capped.body, `@[A](${a}) @[B](${b}) @C @[A](${a})`)
  assert.equal(p.rewriteMentions('no tokens here', new Set()).body, 'no tokens here')
})

test('canMentionTarget', () => {
  const t = (o: Partial<p.MentionTarget> = {}): p.MentionTarget => ({ id: id(40), isAdmin: false, isActiveMember: true, ...o })
  const none: p.MentionContext = { blocked: false, introduced: false, inThread: false, inGroup: false }
  // members
  assert.equal(p.canMentionTarget(member, t(), none), false)
  assert.equal(p.canMentionTarget(member, t(), { ...none, introduced: true }), true)
  assert.equal(p.canMentionTarget(member, t(), { ...none, inThread: true }), true)
  assert.equal(p.canMentionTarget(member, t(), { ...none, inGroup: true }), true)
  assert.equal(p.canMentionTarget(member, t({ isAdmin: true, isActiveMember: false }), none), true) // Club team
  assert.equal(p.canMentionTarget(member, t(), { ...none, introduced: true, blocked: true }), false)
  assert.equal(p.canMentionTarget(member, t({ isActiveMember: false }), { ...none, introduced: true }), false) // lapsed
  assert.equal(p.canMentionTarget(member, t({ id: member.id }), { ...none, introduced: true }), false) // self
  // admins: anyone active, still not blocked/self/inactive
  assert.equal(p.canMentionTarget(admin, t(), none), true)
  assert.equal(p.canMentionTarget(admin, t(), { ...none, blocked: true }), false)
  assert.equal(p.canMentionTarget(admin, t({ isActiveMember: false }), none), false)
  // overseer-only staff and lapsed viewers can't tag
  assert.equal(p.canMentionTarget(staff, t(), { ...none, introduced: true }), false)
  assert.equal(p.canMentionTarget(lapsed, t(), { ...none, introduced: true }), false)
})

test('mention notifications: edits notify only new ids; one notification per person, mention wins', () => {
  const [a, b, c] = [id(60), id(61), id(62)]
  assert.deepEqual(p.newMentions([a], [a, b]), [b])
  assert.deepEqual(p.newMentions([a, b], [b]), [])
  const merged = p.mergeMentionTargets(
    [
      { recipientId: a, kind: 'comment' },
      { recipientId: b, kind: 'reply' },
    ],
    [a, c, id(99)],
    id(99),
  )
  assert.deepEqual(merged, [
    { recipientId: a, kind: 'mention' },
    { recipientId: c, kind: 'mention' },
    { recipientId: b, kind: 'reply' },
  ])
})
