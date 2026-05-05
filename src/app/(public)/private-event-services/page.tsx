import { createClient } from '@/lib/supabase/server'
import { PrivateEventsContent } from './PrivateEventsContent'

export const revalidate = 60

const fallbackExperiences = [
  {
    id: '1',
    title: 'Monaco Grand Prix',
    description: 'Experience the pinnacle of motorsport and luxury with four extraordinary days of curated indulgence in Cannes and Monaco, celebrating trackside thrills, glamour and the excitement of the Monaco Grand Prix. The ultimate blend of sophistication and speed.',
    image_url: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=600&q=80',
    link_url: null,
  },
  {
    id: '2',
    title: 'Great British Polo — St Tropez',
    description: 'Experience quintessential British polo in the heart of Saint-Tropez, held exclusively at the prestigious Polo Club Saint-Tropez. Enjoy world-class matches with international teams, fine dining and an elite gathering of distinguished guests and luxury brands.',
    image_url: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=600&q=80',
    link_url: null,
  },
  {
    id: '3',
    title: 'Gleneagles Golf & Tennis Experience',
    description: 'Embark on a two-day escape to the iconic Gleneagles Estate, where championship golf meets world-class tennis amid the stunning Perthshire landscape. Helicopter arrivals and matches with legends define this luxurious sporting experience.',
    image_url: 'https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=600&q=80',
    link_url: null,
  },
  {
    id: '4',
    title: 'Ibiza Retreat',
    description: 'Elevate your leadership during five immersive days at the luxurious Fincadelica estate in Ibiza. This transformative retreat blends neuroscience, nature and performance to renew energy, deepen presence and sharpen your vision.',
    image_url: 'https://images.unsplash.com/photo-1540541338287-41700207dee6?w=600&q=80',
    link_url: null,
  },
  {
    id: '5',
    title: 'Estelle Manor',
    description: 'Indulge in a two-day escape at Estelle Manor, where country elegance meets alpine charm. Enjoy luxurious arrivals, après-ski themed shopping in Fallow House, gourmet dining and world-class entertainment in a celebration of seasonal sophistication.',
    image_url: 'https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=600&q=80',
    link_url: null,
  },
  {
    id: '6',
    title: 'Padel for Purpose',
    description: 'Join us for an exclusive afternoon of padel, networking and purposeful giving. Connect with business leaders over dynamic matches, world-class entertainment, cocktails and gourmet street food. A vibrant celebration of sport, impact and opportunity.',
    image_url: 'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?w=600&q=80',
    link_url: null,
  },
]

const fallbackVideos = [
  {
    id: '1',
    title: 'Curated Luxury Event: Lamborghini Christmas Party',
    youtube_url: 'https://www.youtube.com/watch?v=qIn7RdZYlWU',
  },
  {
    id: '2',
    title: 'Curated Luxury Experience: Boxing Gala',
    youtube_url: 'https://www.youtube.com/watch?v=q9sSM1Oy-1Y',
  },
  {
    id: '3',
    title: 'Experience Gleneagles',
    youtube_url: 'https://www.youtube.com/watch?v=D8tPEyzZtjs',
  },
]

export default async function PrivateEventServicesPage() {
  const supabase = await createClient()

  const [{ data: experiences }, { data: videos }] = await Promise.all([
    supabase
      .from('curated_experiences')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    supabase
      .from('video_gallery')
      .select('*')
      .eq('is_active', true)
      .eq('page_slug', 'private-event-services')
      .order('display_order', { ascending: true }),
  ])

  const displayExperiences = experiences && experiences.length > 0
    ? experiences.map(e => ({
        id: e.id,
        title: e.title,
        description: e.description,
        image_url: e.image_url,
        link_url: e.link_url,
      }))
    : fallbackExperiences

  const displayVideos = videos && videos.length > 0
    ? videos.map(v => ({
        id: v.id,
        title: v.title,
        youtube_url: v.youtube_url,
      }))
    : fallbackVideos

  return (
    <PrivateEventsContent
      experiences={displayExperiences}
      videos={displayVideos}
    />
  )
}
