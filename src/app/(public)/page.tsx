import { HeroSection } from '@/components/website/home/HeroSection'
import { IntroSection } from '@/components/website/home/IntroSection'
import { LocationsSection } from '@/components/website/home/LocationsSection'
import { EventsPreview } from '@/components/website/home/EventsPreview'
import { TestimonialsSection } from '@/components/website/home/TestimonialsSection'
import { GalleryStrip } from '@/components/website/home/GalleryStrip'
import { CTASection } from '@/components/website/home/CTASection'

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <IntroSection />
      <LocationsSection />
      <EventsPreview />
      <TestimonialsSection />
      <GalleryStrip />
      <CTASection />
    </>
  )
}
