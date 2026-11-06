'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { cn } from '@/lib/utils'
import { Users, ListChecks, Send, Filter } from 'lucide-react'
import { SubscribersTab } from './SubscribersTab'
import { ListsTab } from './ListsTab'
import { CampaignsTab } from './CampaignsTab'
import { SegmentsPage } from '@/views/admin/marketing/SegmentsPage'

type Tab = 'subscribers' | 'lists' | 'segments' | 'campaigns'
const TABS: readonly Tab[] = ['subscribers', 'lists', 'segments', 'campaigns']

// Single hub for everything newsletter-related: who's subscribed, the
// reusable audiences (which can mix subscribers + approved members),
// and the campaigns sent to those audiences. Kept as one route with
// internal tabs because the three views share enough state that
// jumping between them via tabs feels more natural than via the
// sidebar.
export function NewsletterPage() {
  // ?tab=segments deep-links a tab (the old /dashboard/marketing/segments
  // URL redirects here).
  const initial = useSearchParams().get('tab') as Tab | null
  const [tab, setTab] = useState<Tab>(initial && TABS.includes(initial) ? initial : 'subscribers')

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
          icon={<Filter size={14} />}
          label="Segments"
          active={tab === 'segments'}
          onClick={() => setTab('segments')}
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
      {tab === 'segments' && <SegmentsPage embedded />}
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
