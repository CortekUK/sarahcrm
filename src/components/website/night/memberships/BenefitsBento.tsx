'use client'

import Image from 'next/image'
import {
  Award,
  Calendar,
  Coffee,
  Crown,
  KeyRound,
  Megaphone,
  Ticket,
  Users,
  Wine,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────
// BenefitsBento — Aceternity-style glowing-border bento for the 9
// membership benefits.
//
// 12-col asymmetric grid (4 rows) so the layout reads as an editorial
// bento rather than a 3×3 catalogue:
//   Row 1: [4 ][8       ]
//   Row 2: [6     ][6     ]
//   Row 3: [4 ][4 ][4    ]
//   Row 4: [8       ][4 ]
//
// Each tile:
//   - bronze lucide icon, top-left in a small bordered square
//   - Roman numeral in the top-right corner
//   - serif title + italic body anchored to the bottom
//   - wide tiles (col-span >= 6) get a faded image background
//   - hover: bronze conic-gradient border spins around the card
//     (see `.glow-border` in globals.css)
// ─────────────────────────────────────────────────────────────────────

export interface BenefitItem {
  n: string
  title: string
  body: string
  image: string
}

// Icons matched thematically to each benefit (verbatim source order).
const ICONS: LucideIcon[] = [
  Users, // Access to The Club Network
  KeyRound, // Choose Your Membership
  Megaphone, // Advertise Your Business
  Calendar, // Access to The Club Events
  Coffee, // Monthly Members "Work In"
  Wine, // Private Dining Experiences
  Ticket, // Bespoke & Ticketed Events
  Award, // Curated Sponsored Events
  Crown, // Corporate Luxury Concierge
]

// 12-col bento spans, one per benefit (index = item position).
// Mobile collapses everything to a single column.
const SPANS = [
  'col-span-12 md:col-span-4',
  'col-span-12 md:col-span-8',
  'col-span-12 md:col-span-6',
  'col-span-12 md:col-span-6',
  'col-span-12 md:col-span-4',
  'col-span-12 md:col-span-4',
  'col-span-12 md:col-span-4',
  'col-span-12 md:col-span-8',
  'col-span-12 md:col-span-4',
]

// Indices that get an image background (the wider tiles).
const WIDE_TILES = new Set([1, 2, 3, 7])

export function BenefitsBento({ items }: { items: readonly BenefitItem[] }) {
  return (
    <div className="grid grid-cols-12 gap-5 lg:gap-6 max-w-6xl mx-auto">
      {items.map((item, i) => (
        <BenefitTile
          key={item.n}
          item={item}
          Icon={ICONS[i] ?? Users}
          span={SPANS[i] ?? 'col-span-12 md:col-span-4'}
          wide={WIDE_TILES.has(i)}
        />
      ))}
    </div>
  )
}

function BenefitTile({
  item,
  Icon,
  span,
  wide,
}: {
  item: BenefitItem
  Icon: LucideIcon
  span: string
  wide: boolean
}) {
  return (
    <article
      className={cn(
        // glow-border (globals.css) wraps every tile in a bronze
        // conic-gradient ring that spins on hover.
        'glow-border group relative rounded-2xl overflow-hidden backdrop-blur-sm',
        // Wide tiles have a dark photo background — pin to night so
        // the image + dark gradient + ivory text stay legible. Narrow
        // tiles get a clean white card in day mode with a graphite
        // hairline border, and the original graphite/45 wash in night
        // mode.
        wide
          ? 'always-night bg-graphite/45'
          : 'bg-graphite/45 day:bg-white day:border day:border-graphite-line/55 day:shadow-sm',
        'min-h-[260px] lg:min-h-[300px] flex flex-col p-7 lg:p-9',
        span,
      )}
    >
      {/* Background image — wide tiles only. Image is now rendered
         at full opacity (the previous opacity-50 plus heavy gradient
         was killing it completely). Instead, the gradient runs
         BOTTOM-UP — fully dark behind the title/body text where
         readability matters, and transparent at the top so the
         photograph shows through clearly. Slow inside-scale on
         hover gives the still frame a touch of life. */}
      {wide && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <Image
            src={item.image}
            alt=""
            fill
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover group-hover:scale-[1.06] transition-transform duration-[900ms] ease-out"
          />
          {/* Bottom-up dark fade: image visible at the top, text
             readable over the dark band at the bottom. */}
          <div className="absolute inset-0 bg-gradient-to-t from-graphite via-graphite/70 to-graphite/15" />
          <div className="film-grain-night pointer-events-none" />
        </div>
      )}

      {/* Icon — small bronze glyph in a bordered square top-left */}
      <div className="relative z-10 flex items-center justify-center w-11 h-11 rounded-md bg-graphite-2/80 border border-graphite-line/70 group-hover:border-bronze/55 transition-colors duration-500">
        <Icon size={18} strokeWidth={1.4} className="text-bronze-light" />
      </div>

      {/* Roman numeral, top-right corner */}
      <span
        aria-hidden
        className="absolute top-7 right-7 lg:top-8 lg:right-8 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.4em] tabular-nums text-bronze/85 z-10"
      >
        {item.n}.
      </span>

      {/* Title + body anchored to the bottom of the card */}
      <div className="relative z-10 mt-auto pt-12">
        <h3
          className={cn(
            'font-[family-name:var(--font-display)] leading-[1.2] text-ivory transition-colors duration-500 group-hover:text-bronze-light',
            wide
              ? 'text-[clamp(1.5rem,2vw,1.875rem)]'
              : 'text-[clamp(1.25rem,1.6vw,1.5rem)]',
          )}
        >
          {item.title}
        </h3>
        <p
          className={cn(
            // Bumped from 13/14.5 to 15/16px and removed the /85
            // opacity — italic editorial body at 13px reads as fine
            // print over a bronze background, which is the opposite
            // of premium. Full ivory-soft + 1.7 leading sits in a
            // readable register without losing the magazine feel.
            'font-[family-name:var(--font-editorial)] italic leading-[1.7] text-ivory-soft mt-4',
            wide ? 'text-[16px]' : 'text-[15px]',
          )}
        >
          {item.body}
        </p>
      </div>
    </article>
  )
}
