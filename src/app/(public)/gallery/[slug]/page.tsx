import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { GalleryDetailContent } from './GalleryDetailContent'

export const revalidate = 60

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: gallery } = await supabase
    .from('galleries')
    .select('title, venue_name, location')
    .eq('slug', slug)
    .eq('is_published', true)
    .single()
  if (!gallery) return { title: 'Gallery' }
  return {
    title: `${gallery.title} — The Club`,
    description: [gallery.venue_name, gallery.location].filter(Boolean).join(' · '),
  }
}

export default async function GalleryDetailPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: gallery } = await supabase
    .from('galleries')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .single()
  if (!gallery) notFound()

  const { data: photos } = await supabase
    .from('gallery_photos')
    .select('id, image_url, caption, display_order')
    .eq('gallery_id', gallery.id)
    .order('display_order', { ascending: true })

  return <GalleryDetailContent gallery={gallery} photos={photos ?? []} />
}
