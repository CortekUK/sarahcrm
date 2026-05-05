import { createClient } from '@/lib/supabase/server'
import { GalleryContent } from './GalleryContent'

export const revalidate = 60

const fallbackGalleries = [
  {
    id: '1',
    title: 'Butterflies with Cristal',
    slug: 'butterflies-cristal',
    cover_image_url: 'https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?w=600&q=80',
    event_date: '2025-06-20',
    venue_name: 'The Ivy, Manchester',
    location: 'Manchester',
    category: 'Curated Experience',
  },
  {
    id: '2',
    title: 'International Men\'s Day',
    slug: 'international-mens-day',
    cover_image_url: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&q=80',
    event_date: '2025-11-19',
    venue_name: 'Stock Exchange Hotel',
    location: 'Manchester',
    category: 'Members Event',
  },
  {
    id: '3',
    title: 'Private Dining Experience',
    slug: 'private-dining',
    cover_image_url: 'https://images.unsplash.com/photo-1551632436-cbf8dd35adfa?w=600&q=80',
    event_date: '2025-04-22',
    venue_name: 'The Ivy, Leeds',
    location: 'Leeds',
    category: 'Private Dining',
  },
  {
    id: '4',
    title: 'Curated Luxury Christmas Dinner',
    slug: 'christmas-dinner',
    cover_image_url: 'https://images.unsplash.com/photo-1543007630-9710e4a00a20?w=600&q=80',
    event_date: '2024-12-14',
    venue_name: 'The Midland Hotel',
    location: 'Manchester',
    category: 'Curated Experience',
  },
  {
    id: '5',
    title: 'Flannels VIP Showcase',
    slug: 'flannels-vip-showcase',
    cover_image_url: 'https://images.unsplash.com/photo-1574391884720-bbc3740c59d1?w=600&q=80',
    event_date: '2024-11-05',
    venue_name: 'Flannels, Leeds',
    location: 'Leeds',
    category: 'Sponsored Event',
  },
  {
    id: '6',
    title: 'Monthly Members\' Work In',
    slug: 'members-work-in',
    cover_image_url: 'https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=600&q=80',
    event_date: '2025-03-18',
    venue_name: 'ONE London Road',
    location: 'Manchester',
    category: 'Members Event',
  },
  {
    id: '7',
    title: 'Boodles & Berry\'s Tennis',
    slug: 'boodles-berrys-tennis',
    cover_image_url: 'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?w=600&q=80',
    event_date: '2024-06-22',
    venue_name: 'Hurlingham Club',
    location: 'London',
    category: 'Curated Experience',
  },
  {
    id: '8',
    title: 'Business Enrichment Breakfast',
    slug: 'business-enrichment-breakfast',
    cover_image_url: 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=600&q=80',
    event_date: '2025-02-12',
    venue_name: 'The Alchemist',
    location: 'Manchester',
    category: 'Business Enrichment',
  },
  {
    id: '9',
    title: 'Spring Networking Soirée',
    slug: 'spring-networking-soiree',
    cover_image_url: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=600&q=80',
    event_date: '2025-04-10',
    venue_name: 'Harvey Nichols',
    location: 'Leeds',
    category: 'Members Event',
  },
  {
    id: '10',
    title: 'Summer Polo Event',
    slug: 'summer-polo',
    cover_image_url: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=600&q=80',
    event_date: '2024-08-16',
    venue_name: 'Cheshire Polo Club',
    location: 'Manchester',
    category: 'Curated Experience',
  },
  {
    id: '11',
    title: 'Private Dining at The Ned',
    slug: 'private-dining-ned',
    cover_image_url: 'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=600&q=80',
    event_date: '2025-01-24',
    venue_name: 'The Ned',
    location: 'London',
    category: 'Private Dining',
  },
  {
    id: '12',
    title: 'Bespoke Fitted Event',
    slug: 'bespoke-fitted-event',
    cover_image_url: 'https://images.unsplash.com/photo-1552960226-639240203497?w=600&q=80',
    event_date: '2024-10-18',
    venue_name: 'Flannels',
    location: 'Manchester',
    category: 'Sponsored Event',
  },
]

export default async function GalleryPage() {
  const supabase = await createClient()
  const { data: galleries } = await supabase
    .from('galleries')
    .select('*')
    .eq('is_published', true)
    .order('event_date', { ascending: false })

  const displayGalleries =
    galleries && galleries.length > 0
      ? galleries.map((g) => ({
          id: g.id,
          title: g.title,
          slug: g.slug,
          cover_image_url: g.cover_image_url,
          event_date: g.event_date,
          venue_name: g.venue_name,
          location: g.location,
          category: g.category,
        }))
      : fallbackGalleries

  return <GalleryContent galleries={displayGalleries} />
}
