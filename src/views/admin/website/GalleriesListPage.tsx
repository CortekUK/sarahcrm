'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table'
import { formatDate, cn } from '@/lib/utils'
import { Plus } from 'lucide-react'

interface GalleryRow {
  id: string
  title: string
  slug: string
  event_date: string | null
  venue_name: string | null
  category: string | null
  is_published: boolean
  cover_image_url: string | null
  gallery_photos: { count: number }[]
}

const categoryLabels: Record<string, string> = {
  private_dining: 'Private Dining',
  members_event: 'Members Event',
  curated_experience: 'Curated Experience',
  sponsored_event: 'Sponsored Event',
  business_enrichment: 'Business Enrichment',
}

const tabs: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'private_dining', label: 'Private Dining' },
  { key: 'members_event', label: 'Members Event' },
  { key: 'curated_experience', label: 'Curated Experience' },
  { key: 'sponsored_event', label: 'Sponsored Event' },
  { key: 'business_enrichment', label: 'Business Enrichment' },
]

export function GalleriesListPage() {
  const router = useRouter()
  const [galleries, setGalleries] = useState<GalleryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')

  useEffect(() => {
    fetchGalleries()
  }, [])

  async function fetchGalleries() {
    const { data } = await supabase
      .from('galleries')
      .select('id, title, slug, event_date, venue_name, category, is_published, cover_image_url, gallery_photos(count)')
      .order('event_date', { ascending: false })

    if (data) setGalleries(data as unknown as GalleryRow[])
    setLoading(false)
  }

  const filtered = useMemo(() => {
    if (activeTab === 'all') return galleries
    return galleries.filter((g) => g.category === activeTab)
  }, [galleries, activeTab])

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading galleries...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-text">
            Galleries
          </h1>
          <p className="text-sm text-text-muted mt-1">
            {galleries.length} galler{galleries.length !== 1 ? 'ies' : 'y'} total
          </p>
        </div>
        <Button
          icon={<Plus size={16} />}
          onClick={() => router.push('/dashboard/website/galleries/new')}
        >
          Create Gallery
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {tabs.map((tab) => {
          const count = tab.key === 'all'
            ? galleries.length
            : galleries.filter((g) => g.category === tab.key).length
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-4 py-2.5 text-sm transition-colors relative',
                activeTab === tab.key
                  ? 'text-gold font-medium'
                  : 'text-text-muted hover:text-text'
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

      {/* Table */}
      <div className="bg-surface border border-border rounded-[var(--radius-lg)] shadow-[var(--shadow-card)]">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-text-dim">No galleries found</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Title</TableHead>
                <TableHead>Event Date</TableHead>
                <TableHead>Venue</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Photos</TableHead>
                <TableHead>Published</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((gallery) => {
                const photoCount = gallery.gallery_photos?.[0]?.count ?? 0
                return (
                  <TableRow
                    key={gallery.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/dashboard/website/galleries/${gallery.id}`)}
                  >
                    <TableCell className="font-medium">{gallery.title}</TableCell>
                    <TableCell className="text-text-muted">
                      {gallery.event_date ? formatDate(gallery.event_date) : '—'}
                    </TableCell>
                    <TableCell className="text-text-muted">
                      {gallery.venue_name || '—'}
                    </TableCell>
                    <TableCell>
                      {gallery.category ? (
                        <Badge variant="info">
                          {categoryLabels[gallery.category] ?? gallery.category}
                        </Badge>
                      ) : '—'}
                    </TableCell>
                    <TableCell>{photoCount}</TableCell>
                    <TableCell>
                      <Badge variant={gallery.is_published ? 'active' : 'draft'} dot>
                        {gallery.is_published ? 'Published' : 'Draft'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
