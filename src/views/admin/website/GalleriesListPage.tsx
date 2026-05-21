'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Thumbnail } from '@/components/admin/Thumbnail'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { formatDate, cn } from '@/lib/utils'
import { Plus, ImagePlus, Image as ImageIcon, MapPin } from 'lucide-react'

interface GalleryRow {
  id: string
  title: string
  slug: string
  event_date: string | null
  venue_name: string | null
  location: string | null
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
      .select(
        'id, title, slug, event_date, venue_name, location, category, is_published, cover_image_url, gallery_photos(count)',
      )
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
    <div className="p-8 max-w-7xl">
      <AdminPageHeader
        title="Galleries"
        description="Curated event galleries shown on the public Gallery page and homepage strip. Each gallery has a cover image and any number of photos."
        meta={
          <span className="text-xs text-text-dim">
            {galleries.length} galler{galleries.length !== 1 ? 'ies' : 'y'} total
            {' · '}
            {galleries.filter((g) => g.is_published).length} published
          </span>
        }
        actions={
          <Button
            icon={<Plus size={16} />}
            onClick={() => router.push('/dashboard/website/galleries/new')}
          >
            Create gallery
          </Button>
        }
      />

      {/* Category tabs */}
      <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto">
        {tabs.map((tab) => {
          const count =
            tab.key === 'all'
              ? galleries.length
              : galleries.filter((g) => g.category === tab.key).length
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-4 py-2.5 text-sm transition-colors relative whitespace-nowrap',
                activeTab === tab.key
                  ? 'text-gold font-medium'
                  : 'text-text-muted hover:text-text',
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

      {/* Card grid */}
      {filtered.length === 0 ? (
        <div className="bg-surface border border-border rounded-[var(--radius-lg)] shadow-[var(--shadow-card)]">
          <AdminEmptyState
            icon={ImageIcon}
            title={activeTab === 'all' ? 'No galleries yet' : 'No galleries in this category'}
            description="Create a gallery to showcase event photos publicly."
            action={
              <Button
                icon={<Plus size={16} />}
                onClick={() => router.push('/dashboard/website/galleries/new')}
              >
                Create first gallery
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((gallery) => {
            const photoCount = gallery.gallery_photos?.[0]?.count ?? 0
            return (
              <button
                key={gallery.id}
                type="button"
                onClick={() => router.push(`/dashboard/website/galleries/${gallery.id}`)}
                className="group text-left bg-surface border border-border rounded-[var(--radius-lg)] overflow-hidden shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] hover:border-gold/40 transition-all"
              >
                <div className="relative">
                  <Thumbnail
                    src={gallery.cover_image_url}
                    alt={gallery.title}
                    aspect="4 / 3"
                    width={400}
                    className="w-full h-auto rounded-none border-none"
                  />
                  {!gallery.is_published && (
                    <div className="absolute top-3 right-3">
                      <Badge variant="draft" dot>
                        Draft
                      </Badge>
                    </div>
                  )}
                  {gallery.category && (
                    <div className="absolute bottom-3 left-3">
                      <span className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider rounded-full bg-black/50 backdrop-blur text-white">
                        {categoryLabels[gallery.category] ?? gallery.category}
                      </span>
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-[family-name:var(--font-heading)] text-base font-semibold text-text group-hover:text-gold-dark transition-colors">
                    {gallery.title}
                  </h3>
                  <div className="flex items-center gap-3 text-[11px] text-text-dim mt-1.5">
                    {gallery.venue_name && (
                      <span className="inline-flex items-center gap-1 truncate max-w-[150px]">
                        <MapPin size={10} />
                        {gallery.venue_name}
                      </span>
                    )}
                    {gallery.event_date && (
                      <span>{formatDate(gallery.event_date)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-text-muted mt-3 pt-3 border-t border-border">
                    <ImagePlus size={11} />
                    {photoCount} photo{photoCount === 1 ? '' : 's'}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
