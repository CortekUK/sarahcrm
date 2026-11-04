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
import { ActiveToggle } from '@/components/admin/ActiveToggle'
import { SortableList, DragHandle } from '@/components/admin/SortableList'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { Plus, Pencil, Trash2, Briefcase } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/hooks/use-toast'
import { dbErrorMessage } from '@/lib/form-validation'

// portfolio_case_studies is not in the generated Database types yet
// (20261106_a_website_rebuild_schema.sql) — query it through an untyped view
// of the browser client. RLS: admins (public.is_admin()) manage every row.
const db = supabase as unknown as SupabaseClient

export interface PortfolioRow {
  id: string
  slug: string
  title: string
  partner_names: string | null
  category: string
  date_label: string | null
  event_date: string | null
  hero_image_url: string | null
  display_order: number
  is_featured: boolean
  is_published: boolean
}

export const portfolioCategoryLabels: Record<string, string> = {
  member_event: 'Member Events',
  brand_activation: 'Brand Activations',
  curated_experience: 'Curated Experiences',
  private_corporate: 'Private & Corporate',
  pitch: 'PITCH',
}

const tabs: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  ...Object.entries(portfolioCategoryLabels).map(([key, label]) => ({ key, label })),
]

// Public surfaces fed by this table: the Portfolio index, each case study
// page and the homepage "Recent Nights" strip (featured rows).
export function flushPortfolioCache(slug?: string) {
  const paths = ['/portfolio', '/']
  if (slug) paths.push(`/portfolio/${slug}`)
  void fetch('/api/admin/revalidate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ paths }),
  }).catch(() => {})
}

export function PortfolioPage() {
  const router = useRouter()
  const confirm = useConfirm()
  const [items, setItems] = useState<PortfolioRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')

  useEffect(() => {
    fetchItems()
  }, [])

  async function fetchItems() {
    const { data, error } = await db
      .from('portfolio_case_studies')
      .select(
        'id, slug, title, partner_names, category, date_label, event_date, hero_image_url, display_order, is_featured, is_published',
      )
      .order('display_order', { ascending: true })
    if (error) {
      toast({
        title: 'Could not load the portfolio',
        description: dbErrorMessage(error, 'Failed to load case studies'),
        variant: 'destructive',
      })
    }
    if (data) setItems(data as PortfolioRow[])
    setLoading(false)
  }

  const filtered = useMemo(
    () => (activeTab === 'all' ? items : items.filter((i) => i.category === activeTab)),
    [items, activeTab],
  )

  async function handleToggle(item: PortfolioRow, field: 'is_published' | 'is_featured', next: boolean) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, [field]: next } : i)))
    const { error } = await db
      .from('portfolio_case_studies')
      .update({ [field]: next })
      .eq('id', item.id)
    if (error) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, [field]: !next } : i)))
      throw error
    }
    flushPortfolioCache(item.slug)
  }

  async function handleReorder(next: PortfolioRow[]) {
    // Reordering inside a filtered view: keep the other rows where they are
    // and re-number the whole list so display_order stays unique.
    let merged: PortfolioRow[]
    if (activeTab === 'all') {
      merged = next
    } else {
      const queue = [...next]
      merged = items
        .map((i) => (i.category === activeTab ? queue.shift()! : i))
        .map((i, idx) => ({ ...i, display_order: idx }))
    }
    setItems(merged)
    await Promise.all(
      merged.map((i) =>
        db.from('portfolio_case_studies').update({ display_order: i.display_order }).eq('id', i.id),
      ),
    )
    flushPortfolioCache()
  }

  async function handleDelete(item: PortfolioRow) {
    const ok = await confirm({
      title: 'Delete case study?',
      description: `“${item.title}” will be removed from the Portfolio and the homepage. This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (!ok) return
    const { error } = await db.from('portfolio_case_studies').delete().eq('id', item.id)
    if (error) {
      toast({ title: 'Not deleted', description: dbErrorMessage(error), variant: 'destructive' })
      return
    }
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    flushPortfolioCache(item.slug)
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading portfolio...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <AdminPageHeader
        title="Portfolio"
        description="Case studies shown on the public Portfolio page. Featured case studies also appear on the homepage under Recent Nights. Drag to reorder; drafts stay hidden from the public."
        meta={
          <span className="text-xs text-text-dim">
            {items.length} case stud{items.length !== 1 ? 'ies' : 'y'}
            {' · '}
            {items.filter((i) => i.is_published).length} published
            {' · '}
            {items.filter((i) => i.is_featured).length} on the homepage
          </span>
        }
        actions={
          <Button icon={<Plus size={16} />} onClick={() => router.push('/dashboard/website/portfolio/new')}>
            Add case study
          </Button>
        }
      />

      {/* Category tabs */}
      <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto">
        {tabs.map((tab) => {
          const count = tab.key === 'all' ? items.length : items.filter((i) => i.category === tab.key).length
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-4 py-2.5 text-sm transition-colors relative whitespace-nowrap',
                activeTab === tab.key ? 'text-gold font-medium' : 'text-text-muted hover:text-text',
              )}
            >
              {tab.label}
              <span className="ml-1.5 text-xs text-text-dim">({count})</span>
              {activeTab === tab.key && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-gold rounded-full" />
              )}
            </button>
          )
        })}
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <AdminEmptyState
              icon={Briefcase}
              title={activeTab === 'all' ? 'No case studies yet' : 'No case studies in this category'}
              description="Case studies show partners and prospective members what The Club delivers — the brief, what we delivered and the results."
              action={
                <Button icon={<Plus size={16} />} onClick={() => router.push('/dashboard/website/portfolio/new')}>
                  Add first case study
                </Button>
              }
            />
          ) : (
            <SortableList
              items={filtered}
              onReorder={handleReorder}
              renderItem={(item, dragHandleProps) => (
                <div className="flex items-center gap-4 px-5 py-4 border-b border-border last:border-b-0 group hover:bg-surface-2/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <DragHandle dragHandleProps={dragHandleProps} />
                    <Thumbnail src={item.hero_image_url} alt={item.title} aspect="4 / 3" width={72} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-text truncate">{item.title}</p>
                      <Badge variant={item.is_published ? 'active' : 'draft'} dot>
                        {item.is_published ? 'Published' : 'Draft'}
                      </Badge>
                      {item.is_featured && <Badge variant="upcoming">Homepage</Badge>}
                    </div>
                    <p className="text-[11px] text-text-dim mt-0.5 truncate">
                      {[
                        item.partner_names,
                        portfolioCategoryLabels[item.category] ?? item.category,
                        item.date_label,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <ActiveToggle
                      active={item.is_featured}
                      activeLabel="Homepage"
                      inactiveLabel="Not featured"
                      onChange={(next) => handleToggle(item, 'is_featured', next)}
                    />
                    <ActiveToggle
                      active={item.is_published}
                      activeLabel="Published"
                      inactiveLabel="Draft"
                      onChange={(next) => handleToggle(item, 'is_published', next)}
                    />
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => router.push(`/dashboard/website/portfolio/${item.id}/edit`)}
                        className="p-1.5 text-text-dim hover:text-text rounded hover:bg-surface-2 transition-colors"
                        title="Edit"
                      >
                        <Pencil size={14} strokeWidth={1.5} />
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        className="p-1.5 text-text-dim hover:text-accent-warm rounded hover:bg-surface-2 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={14} strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
