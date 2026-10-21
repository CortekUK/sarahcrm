'use client'

// Header / sidebar entry to Messages: a MessageCircle with the live red unread
// badge (1 … 9+). Hidden entirely when chat isn't configured
// (NEXT_PUBLIC_CHAT_URL unset) or nobody is signed in.

import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import { useChat } from '@/lib/chat/ChatProvider'
import { cn } from '@/lib/utils'
import { UnreadBadge } from './UnreadBadge'

export function ChatNavIcon({
  href,
  className,
  iconClassName,
  size = 18,
  label = 'Messages',
  showLabel,
  onClick,
}: {
  href: string
  className?: string
  iconClassName?: string
  size?: number
  label?: string
  showLabel?: boolean
  onClick?: () => void
}) {
  const { enabled, totalUnread } = useChat()
  if (!enabled) return null
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-label={totalUnread > 0 ? `${label}, ${totalUnread} unread` : label}
      className={cn('relative inline-flex items-center gap-2', className)}
    >
      <span className="relative inline-flex">
        <MessageCircle size={size} strokeWidth={1.6} className={iconClassName} />
        <UnreadBadge
          count={totalUnread}
          className="absolute -right-2 -top-2 h-4 min-w-4 px-1 text-[9px]"
        />
      </span>
      {showLabel && <span>{label}</span>}
    </Link>
  )
}
