import { NightHero } from '@/components/website/night/home/NightHero'
import { HeroPartnersMarquee } from '@/components/website/night/home/HeroPartnersMarquee'
import { IntroChapter } from '@/components/website/night/home/IntroChapter'
import { ApproachChapter } from '@/components/website/night/home/ApproachChapter'
import { LocationsChapter } from '@/components/website/night/home/LocationsChapter'
import { VoicesChapter } from '@/components/website/night/home/VoicesChapter'
import { GalleryBento } from '@/components/website/night/home/GalleryBento'
import { EventsTeaser } from '@/components/website/night/home/EventsTeaser'
import { ApplyClose } from '@/components/website/night/home/ApplyClose'
import { getPageHero } from '@/lib/cms/heroes'

export const revalidate = 60

// Public homepage. All voice copy comes from the live site at
// theclubbysarahrestrick.com — used verbatim, no fabrication. Sections
// stay visible even when DB-driven content is empty (testimonials)
// so the page rhythm is preserved.
//
// Chapter order:
//   00 — Hero               (NightHero)
//   —— Partner marquee      (HeroPartnersMarquee — single instance, sits under hero)
//   01 — The Club           (IntroChapter — "Connecting leaders…")
//   02 — The Approach       (ApproachChapter — "Engaging on a one-to-one…")
//   03 — Locations          (LocationsChapter — Manchester / Leeds / London)
//   —— In Their Own Words   (VoicesChapter — DB testimonials or placeholders)
//   04 — Recent Nights      (GalleryBento — DB gallery photos)
//   —— Forthcoming          (EventsTeaser — DB events)
//   —— Membership           (ApplyClose — apply CTA)

// Fallback if the hero_slides row is missing — keeps the old behaviour
// so the homepage never blanks even with a freshly-bootstrapped DB.
const FALLBACK_VIDEO =
  'https://res.cloudinary.com/dyxt44zjj/video/upload/f_auto,q_auto/v1779573614/hero-video_nxcbkk.mp4'
const FALLBACK_POSTER =
  'https://res.cloudinary.com/dyxt44zjj/video/upload/so_32,f_jpg,w_1920,q_80/v1779573614/hero-video_nxcbkk.jpg'

export default async function HomePage() {
  const hero = await getPageHero('home', {
    page_slug: 'home',
    media_type: 'video',
    video_url: FALLBACK_VIDEO,
    video_poster_url: FALLBACK_POSTER,
    image_url: FALLBACK_POSTER,
    alt_text: 'The Club',
    eyebrow: 'Est. by Sarah Restrick',
    headline: 'The Club',
    lede: 'Connecting leaders in business through luxury experience.',
    cta_primary_label: 'Apply for Membership',
    cta_primary_href: '/membership-application',
    cta_secondary_label: 'Discover The Club',
    cta_secondary_href: '/about',
  })

  return (
    <>
      <NightHero
        video={hero.media_type === 'video' ? hero.video_url ?? undefined : undefined}
        image={
          hero.media_type === 'video'
            ? hero.video_poster_url ?? hero.image_url ?? undefined
            : hero.image_url ?? undefined
        }
        alt={hero.alt_text || 'The Club'}
        eyebrow={hero.eyebrow ?? undefined}
        headline={hero.headline ?? undefined}
        lede={hero.lede ?? undefined}
        ctaPrimaryLabel={hero.cta_primary_label}
        ctaPrimaryHref={hero.cta_primary_href}
        ctaSecondaryLabel={hero.cta_secondary_label}
        ctaSecondaryHref={hero.cta_secondary_href}
      />
      <HeroPartnersMarquee />
      <IntroChapter />
      <ApproachChapter />
      <LocationsChapter />
      <VoicesChapter />
      <GalleryBento />
      <EventsTeaser />
      <ApplyClose />
    </>
  )
}
