// Small helpers shared by the Messages view panes.

import type { ChatMessage, ConversationDetail, ConversationSummary } from '@/lib/chat/contract'
import { relativeTime } from '@/components/ui/chat'

export function messagePreview(m: ChatMessage | null, meId: string | null | undefined): string {
  if (!m) return 'No messages yet'
  if (m.deletedAt) return 'Message deleted'
  const you = m.senderId && m.senderId === meId && m.kind !== 'system' ? 'You: ' : ''
  if (m.body) return `${you}${m.body.replace(/\s+/g, ' ')}`
  const photos = m.attachments.filter((a) => a.mime.startsWith('image/')).length
  if (photos) return `${you}${photos === 1 ? 'Photo' : `${photos} photos`}`
  if (m.attachments.length) return `${you}Attachment`
  return ''
}

export function conversationSubtitle(c: ConversationSummary): string {
  if (c.kind === 'dm') {
    const p = c.otherPerson
    if (!p) return 'Direct message'
    if (p.isAdmin) return 'The Club team'
    return [p.jobTitle, p.company].filter(Boolean).join(' · ') || 'Member'
  }
  const people = `${c.participantCount} ${c.participantCount === 1 ? 'member' : 'members'}`
  if (c.kind === 'event') {
    if (c.readOnly || (c.closesAt && new Date(c.closesAt) < new Date())) return `Event chat · closed · ${people}`
    return c.closesAt ? `Event chat · open until ${relativeDate(c.closesAt)} · ${people}` : `Event chat · ${people}`
  }
  return c.isMain ? `The whole club · ${people}` : people
}

function relativeDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function displayTitle(c: ConversationSummary): string {
  return c.kind === 'dm' ? c.otherPerson?.name || c.title || 'Direct message' : c.title || 'Untitled chat'
}

/** Why the composer is locked, or null when the viewer can write. */
export function lockedReason(
  c: ConversationSummary & Partial<Pick<ConversationDetail, 'blockedByMe' | 'blockedMe'>>,
  opts: { overseer?: boolean } = {},
): string | null {
  if (!c.isParticipant) {
    if (opts.overseer) return 'Viewing as overseer — read only. Opening this chat doesn’t mark anything read.'
    return c.isJoinable ? 'Join this group to take part.' : 'You’re not a member of this conversation.'
  }
  if (c.archivedAt) return 'This conversation has been archived.'
  if (c.kind === 'dm' && c.blockedByMe) return `You blocked ${c.otherPerson?.name ?? 'this person'}.`
  if (c.kind === 'dm' && c.blockedMe) return 'You can’t reply to this conversation.'
  if (c.readOnly) {
    if (c.kind === 'event') return 'This event chat has closed — it stays here to read.'
    if (c.kind === 'dm') return 'You can’t message this person.'
    return 'This conversation is read only.'
  }
  return null
}

export { relativeTime }
