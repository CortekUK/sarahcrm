import { Reveal } from '@/components/website/night/effects/Reveal'

// "Who you meet in the room" — the brochure's guests & talent mosaic
// (Section V, Previous Events). The Club's own photography only.

const PHOTOS = [
  { src: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/room/guests-01.jpg', alt: 'Guests in conversation at an evening with The Club' },
  { src: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/room/guests-02.jpg', alt: 'Guests at a sporting day with The Club' },
  { src: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/room/guests-03.jpg', alt: 'Guests on the course at a curated experience with The Club' },
  { src: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/room/guests-04.jpg', alt: 'Guests and talent at a black-tie evening with The Club' },
  { src: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/room/guests-05.jpg', alt: 'An in-conversation at Harvey Nichols Manchester' },
  { src: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/room/guests-06.jpg', alt: 'The Club Members at a private dinner' },
  { src: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/room/guests-07.jpg', alt: 'Guests at a daytime event with The Club' },
  { src: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/room/guests-08.jpg', alt: 'Guests at an outdoor experience with The Club' },
  { src: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/room/guests-09.jpg', alt: 'An in-conversation at an evening with The Club' },
  { src: 'https://owjnsljovmaaxgxpxxtw.supabase.co/storage/v1/object/public/site-images/portfolio/room/guests-10.jpg', alt: 'An in-conversation at an evening with The Club' },
]

export function RoomMosaic() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
      {PHOTOS.map((p, i) => (
        <Reveal
          key={p.src}
          type="up"
          delay={Math.min(i, 6) * 60}
        >
          <div className="relative overflow-hidden bg-graphite aspect-[8/7]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.src}
              alt={p.alt}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1400ms] ease-out hover:scale-105"
            />
          </div>
        </Reveal>
      ))}
    </div>
  )
}
