'use client'

// Read-only participant list for a group / event chat (owner management lives
// in the admin GroupSettingsModal).

import { ChatAvatar } from '@/components/ui/chat'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import type { ConversationDetail } from '@/lib/chat/contract'

export function ParticipantsModal({
  conversation,
  open,
  onClose,
  meId,
}: {
  conversation: ConversationDetail | null
  open: boolean
  onClose: () => void
  meId?: string | null
}) {
  const people = [...(conversation?.participants ?? [])].sort((a, b) => {
    const rank = (r: string) => (r === 'owner' ? 0 : r === 'admin' ? 1 : 2)
    return rank(a.role) - rank(b.role) || a.name.localeCompare(b.name)
  })
  return (
    <Modal open={open} onClose={onClose} title={`Participants · ${people.length}`} size="md">
      <ul className="-mx-2 divide-y divide-border/60">
        {people.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-2 py-2.5">
            <ChatAvatar name={p.name} src={p.avatarUrl} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-text">
                {p.name}
                {p.id === meId && <span className="font-normal text-text-dim"> (you)</span>}
              </span>
              {(p.jobTitle || p.company) && (
                <span className="block truncate text-xs text-text-dim">
                  {[p.jobTitle, p.company].filter(Boolean).join(' · ')}
                </span>
              )}
            </span>
            {p.role === 'owner' && <Badge variant="upcoming">Host</Badge>}
            {p.role === 'admin' && <Badge variant="info">Team</Badge>}
          </li>
        ))}
      </ul>
    </Modal>
  )
}
