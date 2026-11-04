import type { Metadata } from 'next'
import { NightHero } from '@/components/website/night/home/NightHero'
import { HeroPartnersMarquee } from '@/components/website/night/home/HeroPartnersMarquee'
import { IntroChapter } from '@/components/website/night/home/IntroChapter'
import { ApproachChapter } from '@/components/website/night/home/ApproachChapter'
import { VoicesChapter } from '@/components/website/night/home/VoicesChapter'
import { RecentNights } from '@/components/website/night/home/RecentNights'
import { EventsTeaser } from '@/components/website/night/home/EventsTeaser'
import { WhatWeDo } from '@/components/website/night/home/WhatWeDo'
import { FiveProgrammes } from '@/components/website/night/home/FiveProgrammes'
import { ProgrammeBanners } from '@/components/website/night/home/ProgrammeBanners'
import { ApplyClose } from '@/components/website/night/home/ApplyClose'
import { ClubNumbers } from '@/components/website/night/about/ClubNumbers'
import { getPageHero } from '@/lib/cms/heroes'
import { getClubStats } from '@/lib/cms/club-stats'

const DESCRIPTION =
  "A private members' club connecting founders, business owners and C-suite decision makers across luxury, corporate and hospitality through luxury events at five-star venues across the UK and beyond."

export const metadata: Metadata = {
  title: "The Club by Sarah Restrick | Private Members' Club",
  description: DESCRIPTION,
  openGraph: {
    title: "The Club by Sarah Restrick | Private Members' Club",
    description: DESCRIPTION,
  },
}

export const revalidate = 60

// Public homepage (Sarah's brief, 28 Oct 2026 — structure + existing body
// copy kept; media, data and section order changed). DB-driven sections
// hide themselves when they have nothing real to show.
//
// Chapter order:
//   00 — Hero               (NightHero — video slot; Sarah supplies the new loop)
//   —— Partner strip        (HeroPartnersMarquee — public.partner_logos, CMS-managed)
//   01 — The Club           (IntroChapter — existing copy)
//   02 — The Approach       (ApproachChapter — existing copy)
//   03 — The Club in numbers(ClubNumbers — app_settings 'club_stats')
//   —— What we do           (WhatWeDo — nine service tiles)
//   —— Five programmes      (FiveProgrammes — filtered Events / own pages)
//   —— Members' Voices      (VoicesChapter — active testimonials carousel)
//   04 — Recent Nights      (RecentNights — featured portfolio case studies)
//   05 — On the calendar    (EventsTeaser — next three public events)
//   —— PITCH / London Series banners (ProgrammeBanners)
//   —— Apply / Receive our notes     (ApplyClose)

// Fallback if the hero_slides row is missing — keeps the old behaviour
// so the homepage never blanks even with a freshly-bootstrapped DB.
const FALLBACK_VIDEO =
  'https://res.cloudinary.com/dyxt44zjj/video/upload/f_auto,q_auto/v1779573614/hero-video_nxcbkk.mp4'
const FALLBACK_POSTER =
  'https://res.cloudinary.com/dyxt44zjj/video/upload/so_32,f_jpg,w_1920,q_80/v1779573614/hero-video_nxcbkk.jpg'

export default async function HomePage() {
  const statsPromise = getClubStats()
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

  const stats = await statsPromise

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
      <ClubNumbers tiles={stats.numbers} number="03" />
      <WhatWeDo />
      <FiveProgrammes />
      <VoicesChapter />
      <RecentNights />
      <EventsTeaser />
      <ProgrammeBanners />
      <ApplyClose />
    </>
  )
}
