import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { EventDetailHero } from '@/components/website/events/EventDetailHero'
import { EventDetailContent } from '@/components/website/events/EventDetailContent'

export const revalidate = 60

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .single()

  if (!event) notFound()

  const isPast = new Date(event.start_date) < new Date()

  return (
    <>
      <EventDetailHero event={event} />
      <EventDetailContent event={event} isPast={isPast} />
    </>
  )
}
