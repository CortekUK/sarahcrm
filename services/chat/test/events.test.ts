// Pure checks for event-chat pruning and muted-aware unread totals (no DB).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { eventPruneTargets, staleEventChats, unreadTotal } from '../src/policy.js'

test('cancelled bookings leave event chats; admins/owner untouched', () => {
  const parts = [
    { profileId: 'booked', role: 'member' as const },
    { profileId: 'cancelled', role: 'member' as const },
    { profileId: 'team', role: 'admin' as const },
    { profileId: 'sarah', role: 'owner' as const },
    { profileId: 'admin-with-member-role', role: 'member' as const },
  ]
  const confirmed = new Set(['booked'])
  assert.deepEqual(eventPruneTargets(parts, confirmed), ['cancelled', 'admin-with-member-role'])
  assert.deepEqual(eventPruneTargets(parts, confirmed, new Set(['admin-with-member-role'])), ['cancelled'])
  assert.deepEqual(eventPruneTargets(parts, new Set(['booked', 'cancelled', 'admin-with-member-role'])), [])
})

test('viewer leaves only event chats without a confirmed booking', () => {
  const mine = [
    { conversationId: 'c1', eventId: 'e1' },
    { conversationId: 'c2', eventId: 'e2' },
    { conversationId: 'c3', eventId: null },
  ]
  assert.deepEqual(staleEventChats(mine, new Set(['e1'])), ['c2', 'c3'])
  assert.deepEqual(staleEventChats(mine, new Set(['e1', 'e2'])), ['c3'])
  assert.deepEqual(staleEventChats([], new Set()), [])
})

test('badge total excludes muted conversations', () => {
  const by = { a: 3, b: 2, c: 0, d: 5 }
  assert.equal(unreadTotal(by, new Set()), 10)
  assert.equal(unreadTotal(by, new Set(['d'])), 5)
  assert.equal(unreadTotal(by, new Set(['a', 'b', 'd'])), 0)
})
