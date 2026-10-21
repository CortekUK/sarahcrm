// Pure-input checks for the permission rules and keyset cursors (no DB).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as p from '../src/policy.js'
import { clampLimit, decodeCursor, decodeTimeCursor, encodeCursor } from '../src/cursor.js'

const id = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`
const owner: p.PolicyViewer = { id: id(1), isOwner: true, isAdmin: true, canOversee: true, isActiveMember: false }
const admin: p.PolicyViewer = { id: id(2), isOwner: false, isAdmin: true, canOversee: false, isActiveMember: false }
const staff: p.PolicyViewer = { id: id(3), isOwner: false, isAdmin: false, canOversee: true, isActiveMember: false }
const member: p.PolicyViewer = { id: id(4), isOwner: false, isAdmin: false, canOversee: false, isActiveMember: true }
const lapsed: p.PolicyViewer = { id: id(5), isOwner: false, isAdmin: false, canOversee: false, isActiveMember: false }

const conv = (o: Partial<p.PolicyConversation> = {}): p.PolicyConversation => ({
  kind: 'group', isMain: false, isJoinable: false, archivedAt: null, closesAt: null, ...o,
})

test('dm rules', () => {
  const tMember = { id: id(9), isAdmin: false, isActiveMember: true }
  const tAdmin = { id: id(8), isAdmin: true, isActiveMember: false }
  assert.equal(p.canDm(member, tMember, { introduced: false, blocked: false }), false)
  assert.equal(p.canDm(member, tMember, { introduced: true, blocked: false }), true)
  assert.equal(p.canDm(member, tMember, { introduced: true, blocked: true }), false)
  assert.equal(p.canDm(member, tAdmin, { introduced: false, blocked: false }), true)
  assert.equal(p.canDm(admin, tMember, { introduced: false, blocked: false }), true)
  assert.equal(p.canDm(admin, { ...tMember, isActiveMember: false }, { introduced: false, blocked: false }), false)
  assert.equal(p.canDm(lapsed, tAdmin, { introduced: false, blocked: false }), false)
  assert.equal(p.canDm(member, { ...tMember, id: member.id }, { introduced: true, blocked: false }), false)
  assert.equal(p.dmKey(id(9), id(4)), `${id(4)}:${id(9)}`)
  assert.equal(p.dmOtherId(p.dmKey(id(9), id(4)), id(4)), id(9))
  assert.equal(p.dmOtherId(p.dmKey(id(9), id(4)), id(1)), null)
})

test('read / post / read-only', () => {
  const dm = conv({ kind: 'dm' })
  assert.equal(p.canRead(member, dm, false), false)
  assert.equal(p.canRead(staff, dm, false), true)
  assert.equal(p.canPost(staff, dm, { isParticipant: false }), false)
  assert.equal(p.canPost(member, dm, { isParticipant: true, blocked: true }), false)
  assert.equal(p.canPost(member, dm, { isParticipant: true }), true)
  assert.equal(p.canPost(lapsed, dm, { isParticipant: true }), false)

  const g = conv()
  assert.equal(p.canPost(owner, g, { isParticipant: false }), true)
  assert.equal(p.canPost(admin, g, { isParticipant: false }), false)
  assert.equal(p.canPost(owner, conv({ archivedAt: '2026-01-01T00:00:00Z' }), { isParticipant: true }), false)

  const now = new Date('2026-10-21T12:00:00Z')
  const closed = conv({ kind: 'event', closesAt: '2026-10-20T00:00:00Z' })
  const open = conv({ kind: 'event', closesAt: '2026-10-30T00:00:00Z' })
  assert.equal(p.isReadOnly(member, closed, { isParticipant: true, now }), true)
  assert.equal(p.isReadOnly(member, open, { isParticipant: true, now }), false)
  assert.equal(p.canPost(admin, open, { isParticipant: false, now }), true)
  assert.equal(p.canRead(admin, open, false), true)
  assert.equal(p.canRead(member, open, false), false)
})

test('group management + membership', () => {
  const main = conv({ isMain: true })
  assert.equal(p.canCreateGroup(owner), true)
  assert.equal(p.canCreateGroup(admin), false)
  assert.equal(p.canArchive(owner, main), false)
  assert.equal(p.canArchive(owner, conv()), true)
  assert.equal(p.canLeave(main, true), false)
  assert.equal(p.canLeave(conv(), true), true)
  assert.equal(p.canLeave(conv({ kind: 'dm' }), true), false)
  assert.equal(p.canRemoveParticipant(member, conv(), member.id, true), true)
  assert.equal(p.canRemoveParticipant(member, conv(), id(9), true), false)
  assert.equal(p.canRemoveParticipant(owner, conv(), id(9), true), true)
  assert.equal(p.canJoin(member, conv({ isJoinable: true })), true)
  assert.equal(p.canJoin(lapsed, conv({ isJoinable: true })), false)
  assert.equal(p.canRead(member, conv({ isJoinable: true }), false), true)
  assert.equal(p.canDeleteMessage(member, member.id), true)
  assert.equal(p.canDeleteMessage(member, id(9)), false)
  assert.equal(p.canDeleteMessage(owner, id(9)), true)
  assert.equal(p.canReviewReports(staff), true)
  assert.equal(p.canManageStaff(staff), false)
  assert.equal(p.participantRoleFor(owner), 'owner')
  assert.equal(p.shouldEnsureMain(lapsed), false)
})

test('attachment paths', () => {
  const c = id(7)
  assert.equal(p.isValidAttachmentPath(c, `${c}/abc-photo.jpg`), true)
  assert.equal(p.isValidAttachmentPath(c, `${id(6)}/abc-photo.jpg`), false)
  assert.equal(p.isValidAttachmentPath(c, `${c}/../x.jpg`), false)
  assert.equal(p.isValidAttachmentPath(c, `${c}/a/b.jpg`), false)
  assert.equal(p.isValidAttachmentPath(c, `${c}/`), false)
})

test('rate limiter', () => {
  const rl = new p.RateLimiter(3, 1000)
  assert.equal(rl.take('a', 0), true)
  assert.equal(rl.take('a', 10), true)
  assert.equal(rl.take('a', 20), true)
  assert.equal(rl.take('a', 30), false)
  assert.equal(rl.take('b', 30), true)
  assert.equal(rl.take('a', 1001), true)
})

test('cursor round-trip + validation', () => {
  const at = '2026-10-21T10:00:00.123456+00:00'
  const c = encodeCursor(at, id(1))
  assert.deepEqual(decodeTimeCursor(c), { key: at, id: id(1) })
  assert.deepEqual(decodeCursor(encodeCursor(null, id(2))), { key: null, id: id(2) })
  assert.deepEqual(decodeCursor(encodeCursor('a|b name', id(3))), { key: 'a|b name', id: id(3) })
  assert.equal(decodeCursor(undefined), null)
  assert.throws(() => decodeCursor('garbage'))
  assert.throws(() => decodeTimeCursor(encodeCursor('not-a-date', id(1))))
  assert.equal(clampLimit('100', 30, 50), 50)
  assert.equal(clampLimit(undefined, 30, 50), 30)
  assert.equal(clampLimit('-4', 30, 50), 30)
  assert.equal(clampLimit('7', 30, 50), 7)
})
