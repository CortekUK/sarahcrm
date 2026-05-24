import { NightHero } from '@/components/website/night/home/NightHero'
import { HeroPartnersMarquee } from '@/components/website/night/home/HeroPartnersMarquee'
import { IntroChapter } from '@/components/website/night/home/IntroChapter'
import { ApproachChapter } from '@/components/website/night/home/ApproachChapter'
import { LocationsChapter } from '@/components/website/night/home/LocationsChapter'
import { VoicesChapter } from '@/components/website/night/home/VoicesChapter'
import { GalleryBento } from '@/components/website/night/home/GalleryBento'
import { EventsTeaser } from '@/components/website/night/home/EventsTeaser'
import { ApplyClose } from '@/components/website/night/home/ApplyClose'

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

const HERO_VIDEO =
  'https://res.cloudinary.com/dyxt44zjj/video/upload/f_auto,q_auto/v1779573614/hero-video_nxcbkk.mp4'
const HERO_POSTER =
  'https://res.cloudinary.com/dyxt44zjj/video/upload/so_32,f_jpg,w_1920,q_80/v1779573614/hero-video_nxcbkk.jpg'

export default function HomePage() {
  return (
    <>
      <NightHero video={HERO_VIDEO} image={HERO_POSTER} alt="The Club" />
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
