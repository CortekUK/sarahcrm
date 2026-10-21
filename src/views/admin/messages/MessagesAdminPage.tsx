'use client'

// Admin → Messages — a full-height app surface filling the admin main area
// (WhatsApp-Web style), with compact tabs at the top of the list column:
//   Mine        — conversations this admin is in (same shared view as the portal)
//   All chats   — every conversation, read-only unless a participant
//                 (owner + team granted oversight; scope=all)
//   Reports     — member reports to review (overseers)
//   Team access — owner grants/revokes oversight to admins/team members
// The owner also gets "New group" and per-group settings. Tab + open
// conversation live in the URL (?tab=…&c=…).

import { useCallback, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Eye, Settings2, UsersRound } from 'lucide-react'
import { UnreadBadge } from '@/components/ui/chat'
import { useChat } from '@/lib/chat/ChatProvider'
import type { ConversationDetail } from '@/lib/chat/contract'
import { useReports } from '@/lib/chat/hooks'
import { cn } from '@/lib/utils'
import { MessagesView } from '@/views/chat/MessagesView'
import type { MenuItem } from '@/views/chat/PopoverMenu'
import { GroupModal } from './GroupModal'
import { ReportsPanel } from './ReportsPanel'
import { TeamAccessPanel } from './TeamAccessPanel'

type Tab = 'mine' | 'all' | 'reports' | 'team'

export function MessagesAdminPage() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const { viewer, totalUnread } = useChat()
  const canOversee = !!viewer?.canOversee
  const isOwner = !!viewer?.isOwner
  const openReports = useReports('open')

  const tabs = useMemo(
    () =>
      [
        { value: 'mine' as Tab, label: 'Mine', show: true },
        { value: 'all' as Tab, label: 'All chats', show: canOversee },
        { value: 'reports' as Tab, label: 'Reports', show: canOversee },
        { value: 'team' as Tab, label: 'Team access', show: isOwner },
      ].filter((t) => t.show),
    [canOversee, isOwner],
  )
  const requested = (params.get('tab') as Tab) || 'mine'
  const tab: Tab = tabs.some((t) => t.value === requested) ? requested : 'mine'

  const go = useCallback(
    (next: { tab?: Tab; c?: string | null }) => {
      const q = new URLSearchParams(params.toString())
      if (next.tab) {
        if (next.tab === 'mine') q.delete('tab')
        else q.set('tab', next.tab)
        if (next.c === undefined) {
          q.delete('c')
          q.delete('to')
          q.delete('view')
          q.delete('post')
        }
      }
      if (next.c !== undefined) {
        if (next.c) q.set('c', next.c)
        else q.delete('c')
      }
      const qs = q.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [params, pathname, router],
  )

  const [groupModal, setGroupModal] = useState<{ mode: 'create' | 'edit'; conversation?: ConversationDetail } | null>(null)

  const extraMenuItems = useCallback(
    (c: ConversationDetail): MenuItem[] =>
      isOwner && c.kind === 'group'
        ? [{ key: 'settings', label: 'Group settings', icon: Settings2, onSelect: () => setGroupModal({ mode: 'edit', conversation: c }) }]
        : [],
    [isOwner],
  )

  const openCount = (openReports.data ?? []).length

  const tabBar =
    tabs.length > 1 ? (
      <div role="tablist" className="-mx-1 mb-2 flex items-center gap-0.5 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={tab === t.value}
            type="button"
            onClick={() => go({ tab: t.value })}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              tab === t.value ? 'bg-gold-muted text-text ring-1 ring-gold/25' : 'text-text-muted hover:bg-surface-2 hover:text-text',
            )}
          >
            {t.label}
            {t.value === 'mine' && <UnreadBadge count={totalUnread} />}
            {t.value === 'reports' && <UnreadBadge count={openCount} />}
          </button>
        ))}
      </div>
    ) : null

  const newGroup = isOwner ? (
    <button
      type="button"
      onClick={() => setGroupModal({ mode: 'create' })}
      aria-label="New group"
      title="New group"
      className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-2 hover:text-gold"
    >
      <UsersRound size={17} />
    </button>
  ) : null

  // Fills the viewport: below lg the admin shell adds a 56px top bar.
  return (
    <div className="chat-theme flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden lg:h-dvh">
      {tab === 'mine' && (
        <MessagesView
          key="mine"
          scope="mine"
          className="h-full"
          listTop={tabBar}
          listHeaderActions={newGroup}
          extraMenuItems={extraMenuItems}
          threadTabParam="view"
        />
      )}
      {tab === 'all' && (
        <MessagesView
          key="all"
          scope="all"
          className="h-full"
          listTitle="All chats"
          allowContacts={false}
          listTop={tabBar}
          listHeaderActions={newGroup}
          extraMenuItems={extraMenuItems}
          threadTabParam="view"
          listBanner={
            <div className="flex shrink-0 items-center gap-2 border-b border-border bg-accent-blue/[0.08] px-4 py-2 text-xs text-text-muted">
              <Eye size={13} className="text-accent-blue" />
              Viewing as overseer — read only unless you’re in the chat.
            </div>
          }
        />
      )}
      {(tab === 'reports' || tab === 'team') && (
        <>
          <div className="shrink-0 border-b border-border bg-[var(--chat-list-bg)] px-4 pt-3">
            {tabBar}
            <p className="pb-3 font-[family-name:var(--font-heading)] text-lg font-semibold text-text">
              {tab === 'reports' ? 'Reports' : 'Team access'}
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === 'reports' ? (
              <ReportsPanel onOpenConversation={(id) => go({ tab: 'all', c: id })} />
            ) : (
              <TeamAccessPanel />
            )}
          </div>
        </>
      )}

      <GroupModal
        open={!!groupModal}
        mode={groupModal?.mode ?? 'create'}
        conversation={groupModal?.conversation}
        onClose={() => setGroupModal(null)}
        onCreated={(id) => go({ tab: 'mine', c: id })}
      />
    </div>
  )
}
