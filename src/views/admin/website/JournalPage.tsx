'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Thumbnail } from '@/components/admin/Thumbnail'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { Plus, Pencil, Trash2, Newspaper, Check, EyeOff, Sparkles } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import { toast } from '@/lib/hooks/use-toast'
import { dbErrorMessage } from '@/lib/form-validation'

// blog_posts (and its Journal columns) is not in the generated Database
// types yet — read through an untyped view of the browser client (admin
// RLS). Writes go through /api/admin/journal, which renders + sanitises
// the Markdown body server-side.
const db = supabase as unknown as SupabaseClient

export const journalStrandLabels: Record<string, string> = {
  press: 'Press',
  founders_letter: "Founder's Letters",
  stories: 'Stories',
  members: "Members' Editorial",
}

export const journalAuthorTypeLabels: Record<string, string> = {
  sarah: 'Sarah',
  member: 'Member',
  guest: 'Guest',
}

export const journalStatusLabels: Record<string, string> = {
  published: 'Published',
  unpublished: 'Unpublished',
  pending_review: 'Awaiting approval',
}

interface JournalRow {
  id: string
  slug: string
  title: string
  hero_image_url: string | null
  strand: string | null
  visibility: string | null
  author_name: string | null
  author_type: string | null
  status: string
  published_at: string | null
  created_at: string
  marketing_asset_id: string | null
}

type StatusTab = 'pending_review' | 'published' | 'unpublished' | 'all'

const statusTabs: { key: StatusTab; label: string }[] = [
  { key: 'pending_review', label: 'Awaiting approval' },
  { key: 'published', label: 'Published' },
  { key: 'unpublished', label: 'Unpublished' },
  { key: 'all', label: 'All' },
]

const strandChips: { key: string; label: string }[] = [
  { key: 'all', label: 'All strands' },
  ...Object.entries(journalStrandLabels).map(([key, label]) => ({ key, label })),
]

async function callJournalApi(method: 'PATCH' | 'DELETE', body: Record<string, unknown>) {
  const res = await fetch(
    method === 'DELETE' ? `/api/admin/journal?id=${encodeURIComponent(String(body.id))}` : '/api/admin/journal',
    {
      method,
      headers: { 'content-type': 'application/json' },
      body: method === 'DELETE' ? undefined : JSON.stringify(body),
    },
  )
  const json = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(json.error ?? 'Request failed')
  return json
}

export function JournalPage() {
  const router = useRouter()
  const confirm = useConfirm()
  const [items, setItems] = useState<JournalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusTab, setStatusTab] = useState<StatusTab | null>(null)
  const [strand, setStrand] = useState('all')
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    fetchItems()
  }, [])

  async function fetchItems() {
    const { data, error } = await db
      .from('blog_posts')
      .select(
        'id, slug, title, hero_image_url, strand, visibility, author_name, author_type, status, published_at, created_at, marketing_asset_id',
      )
      .order('created_at', { ascending: false })
    if (error) {
      toast({
        title: 'Could not load the Journal',
        description: dbErrorMessage(error, 'Failed to load posts'),
        variant: 'destructive',
      })
    }
    const rows = (data ?? []) as JournalRow[]
    setItems(rows)
    // Open on the approval queue when something is waiting, else on All.
    setStatusTab((prev) => prev ?? (rows.some((r) => r.status === 'pending_review') ? 'pending_review' : 'all'))
    setLoading(false)
  }

  const activeTab = statusTab ?? 'all'
  const pendingCount = items.filter((i) => i.status === 'pending_review').length

  const filtered = useMemo(() => {
    return items
      .filter((i) => activeTab === 'all' || i.status === activeTab)
      .filter((i) => strand === 'all' || (i.strand ?? 'stories') === strand)
      .sort((a, b) => {
        const da = a.published_at ?? a.created_at
        const db_ = b.published_at ?? b.created_at
        return db_.localeCompare(da)
      })
  }, [items, activeTab, strand])

  async function setStatus(item: JournalRow, status: 'published' | 'unpublished') {
    setBusyId(item.id)
    try {
      await callJournalApi('PATCH', { id: item.id, status })
      toast({
        title: status === 'published' ? 'Published to the Journal' : 'Unpublished',
        description: item.title,
      })
      await fetchItems()
    } catch (e) {
      toast({
        title: 'Not saved',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      })
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(item: JournalRow) {
    const ok = await confirm({
      title: 'Delete post?',
      description: `“${item.title}” will be removed from the Journal. This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    setBusyId(item.id)
    try {
      await callJournalApi('DELETE', { id: item.id })
      setItems((prev) => prev.filter((i) => i.id !== item.id))
    } catch (e) {
      toast({
        title: 'Not deleted',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      })
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading the Journal...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <AdminPageHeader
        title="Journal"
        description="Press coverage, Founder's Letters, Stories and Members' Editorial for the public Journal. Posts submitted by The Club Members from the app land in Awaiting approval — nothing goes live until you approve it. Members-only posts are never shown to signed-out visitors."
        meta={
          <span className="text-xs text-text-dim">
            {items.length} post{items.length !== 1 ? 's' : ''}
            {' · '}
            {items.filter((i) => i.status === 'published').length} published
            {pendingCount > 0 && (
              <>
                {' · '}
                <span className="text-gold font-medium">{pendingCount} awaiting approval</span>
              </>
            )}
          </span>
        }
        actions={
          <Button icon={<Plus size={16} />} onClick={() => router.push('/dashboard/website/journal/new')}>
            Write post
          </Button>
        }
      />

      {/* Status tabs */}
      <div className="flex gap-1 mb-4 border-b border-border overflow-x-auto">
        {statusTabs.map((tab) => {
          const count = tab.key === 'all' ? items.length : items.filter((i) => i.status === tab.key).length
          return (
            <button
              key={tab.key}
              onClick={() => setStatusTab(tab.key)}
              className={cn(
                'px-4 py-2.5 text-sm transition-colors relative whitespace-nowrap inline-flex items-center',
                activeTab === tab.key ? 'text-gold font-medium' : 'text-text-muted hover:text-text',
              )}
            >
              {tab.label}
              {tab.key === 'pending_review' && count > 0 ? (
                <Badge variant="upcoming" className="ml-2">
                  {count}
                </Badge>
              ) : (
                <span className="ml-1.5 text-xs text-text-dim">({count})</span>
              )}
              {activeTab === tab.key && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-gold rounded-full" />
              )}
            </button>
          )
        })}
      </div>

      {/* Strand chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        {strandChips.map((chip) => (
          <button
            key={chip.key}
            onClick={() => setStrand(chip.key)}
            className={cn(
              'px-3 py-1 text-xs rounded-full border transition-colors',
              strand === chip.key
                ? 'border-gold bg-gold-muted text-gold-dark font-medium'
                : 'border-border text-text-muted hover:border-border-hover hover:text-text',
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <AdminEmptyState
              icon={Newspaper}
              title={activeTab === 'pending_review' ? 'Nothing awaiting approval' : 'No posts here yet'}
              description={
                activeTab === 'pending_review'
                  ? 'When The Club Members submit a story from the app it will appear here for you to review.'
                  : 'Write a Founder’s Letter, add a press mention or share a story from The Club.'
              }
              action={
                <Button icon={<Plus size={16} />} onClick={() => router.push('/dashboard/website/journal/new')}>
                  Write post
                </Button>
              }
            />
          ) : (
            filtered.map((item) => {
              const busy = busyId === item.id
              const strandKey = item.strand ?? 'stories'
              const authorType = item.author_type ?? 'sarah'
              const author =
                item.author_name ||
                (authorType === 'sarah' ? 'Sarah Restrick' : journalAuthorTypeLabels[authorType])
              const date = item.published_at ?? item.created_at
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-4 px-5 py-4 border-b border-border last:border-b-0 group hover:bg-surface-2/50 transition-colors"
                >
                  <Thumbnail src={item.hero_image_url} alt={item.title} aspect="4 / 3" width={72} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-text truncate">{item.title}</p>
                      <Badge
                        variant={
                          item.status === 'published'
                            ? 'active'
                            : item.status === 'pending_review'
                              ? 'upcoming'
                              : 'draft'
                        }
                        dot
                      >
                        {journalStatusLabels[item.status] ?? item.status}
                      </Badge>
                      <Badge variant={item.visibility === 'members' ? 'info' : 'draft'}>
                        {item.visibility === 'members' ? 'Members only' : 'Public'}
                      </Badge>
                      {item.marketing_asset_id && (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] text-text-dim"
                          title="Created by the Marketing AI Engine"
                        >
                          <Sparkles size={10} /> AI Engine
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-text-dim mt-0.5 truncate">
                      {[
                        journalStrandLabels[strandKey] ?? strandKey,
                        `${author} (${journalAuthorTypeLabels[authorType] ?? authorType})`,
                        formatDate(date),
                      ].join(' · ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {item.status !== 'published' && (
                      <Button
                        size="sm"
                        variant={item.status === 'pending_review' ? 'primary' : 'secondary'}
                        icon={<Check size={14} />}
                        loading={busy}
                        onClick={() => setStatus(item, 'published')}
                      >
                        {item.status === 'pending_review' ? 'Approve & publish' : 'Publish'}
                      </Button>
                    )}
                    {item.status === 'published' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<EyeOff size={14} />}
                        loading={busy}
                        onClick={() => setStatus(item, 'unpublished')}
                      >
                        Unpublish
                      </Button>
                    )}
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => router.push(`/dashboard/website/journal/${item.id}/edit`)}
                        className="p-1.5 text-text-dim hover:text-text rounded hover:bg-surface-2 transition-colors"
                        title="Edit"
                      >
                        <Pencil size={14} strokeWidth={1.5} />
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        disabled={busy}
                        className="p-1.5 text-text-dim hover:text-accent-warm rounded hover:bg-surface-2 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={14} strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}
