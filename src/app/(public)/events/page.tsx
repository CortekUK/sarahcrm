import { createClient } from '@/lib/supabase/server'
import { EventsHero } from '@/components/website/events/EventsHero'
import { EventsIntro } from '@/components/website/events/EventsIntro'
import { UpcomingEventsGrid } from '@/components/website/events/UpcomingEventsGrid'
import { PastEventsGrid } from '@/components/website/events/PastEventsGrid'
import { EventsCTA } from '@/components/website/events/EventsCTA'

export const revalidate = 60

export default async function EventsPage() {
  const supabase = await createClient()

  const { data: events } = await supabase
    .from('events')
    .select('*')
    .eq('status', 'published')
    .order('start_date', { ascending: true })

  const now = new Date()
  const upcoming = events?.filter(e => new Date(e.start_date) >= now) ?? []
  const past = events?.filter(e => new Date(e.start_date) < now).reverse() ?? []

  return (
    <>
      <EventsHero />
      <EventsIntro />
      <UpcomingEventsGrid events={upcoming} />
      <PastEventsGrid events={past} />
      <EventsCTA />
    </>
  )
}
