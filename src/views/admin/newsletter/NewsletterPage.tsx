'use client'

import { useState } from 'react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { cn } from '@/lib/utils'
import { Users, ListChecks, Send } from 'lucide-react'
import { SubscribersTab } from './SubscribersTab'
import { ListsTab } from './ListsTab'
import { CampaignsTab } from './CampaignsTab'

type Tab = 'subscribers' | 'lists' | 'campaigns'

// Single hub for everything newsletter-related: who's subscribed, the
// reusable audiences (which can mix subscribers + approved members),
// and the campaigns sent to those audiences. Kept as one route with
// internal tabs because the three views share enough state that
// jumping between them via tabs feels more natural than via the
// sidebar.
export function NewsletterPage() {
  const [tab, setTab] = useState<Tab>('subscribers')

  return (
    <div className="p-4 md:p-8">
      <AdminPageHeader
        title="Newsletter"
        description="Subscribers, custom audience lists, and campaigns. Build a list of newsletter subscribers and approved members together, then send any campaign-type template from /communications to that list."
      />

      <div className="mb-6 flex flex-wrap items-center gap-1.5 border-b border-border">
        <TabButton
          icon={<Users size={14} />}
          label="Subscribers"
          active={tab === 'subscribers'}
          onClick={() => setTab('subscribers')}
        />
        <TabButton
          icon={<ListChecks size={14} />}
          label="Lists"
          active={tab === 'lists'}
          onClick={() => setTab('lists')}
        />
        <TabButton
          icon={<Send size={14} />}
          label="Campaigns"
          active={tab === 'campaigns'}
          onClick={() => setTab('campaigns')}
        />
      </div>

      {tab === 'subscribers' && <SubscribersTab />}
      {tab === 'lists' && <ListsTab />}
      {tab === 'campaigns' && <CampaignsTab />}
    </div>
  )
}

function TabButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 px-4 py-2.5 -mb-px border-b-2 text-sm transition-colors',
        active
          ? 'border-gold text-gold'
          : 'border-transparent text-text-muted hover:text-text',
      )}
    >
      {icon}
      {label}
    </button>
  )
}
