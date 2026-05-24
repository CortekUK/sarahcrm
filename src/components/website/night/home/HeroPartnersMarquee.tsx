import type { ReactNode } from 'react'
import { Marquee } from '../effects/Marquee'

// Hero partner marquee — quiet logo strip directly under the video hero.
// No borders, no eyebrow text. Just a clean band of scrolling marks.
//
// Contents are PLACEHOLDER SVG logos (inline, monochrome ivory) — each
// designed to read as a distinct brand mark but obviously a stand-in.
// Replace each `svg` entry with the real partner's SVG/PNG when assets
// are available, or refactor this component to read from
// public.partner_logos for CMS-driven content.

interface LogoEntry {
  key: string
  alt: string
  svg: ReactNode
}

const LOGOS: LogoEntry[] = [
  {
    key: 'aureum',
    alt: 'Aureum',
    svg: (
      <svg viewBox="0 0 220 64" xmlns="http://www.w3.org/2000/svg" className="h-10 lg:h-12 w-auto">
        <text x="110" y="40" textAnchor="middle" fontFamily="Playfair Display, serif" fontSize="24" letterSpacing="6" fill="currentColor">AUREUM</text>
        <line x1="60" y1="50" x2="160" y2="50" stroke="currentColor" strokeWidth="0.6" />
      </svg>
    ),
  },
  {
    key: 'mn-monogram',
    alt: 'Maison Noir',
    svg: (
      <svg viewBox="0 0 120 64" xmlns="http://www.w3.org/2000/svg" className="h-10 lg:h-12 w-auto">
        <circle cx="60" cy="32" r="28" stroke="currentColor" strokeWidth="0.7" fill="none" />
        <text x="60" y="42" textAnchor="middle" fontFamily="Playfair Display, serif" fontStyle="italic" fontSize="26" fill="currentColor">MN</text>
      </svg>
    ),
  },
  {
    key: 'atelier-vert',
    alt: 'Atelier Vert',
    svg: (
      <svg viewBox="0 0 240 64" xmlns="http://www.w3.org/2000/svg" className="h-10 lg:h-12 w-auto">
        <text x="120" y="42" textAnchor="middle" fontFamily="Cormorant Garamond, Georgia, serif" fontStyle="italic" fontSize="32" fill="currentColor">Atelier Vert</text>
      </svg>
    ),
  },
  {
    key: 'l-s',
    alt: 'La Société',
    svg: (
      <svg viewBox="0 0 200 64" xmlns="http://www.w3.org/2000/svg" className="h-10 lg:h-12 w-auto">
        <text x="100" y="40" textAnchor="middle" fontFamily="Playfair Display, serif" fontSize="26" letterSpacing="10" fill="currentColor">L · S</text>
        <text x="100" y="56" textAnchor="middle" fontFamily="Sora, sans-serif" fontSize="7" letterSpacing="4" fill="currentColor" opacity="0.7">LA SOCIÉTÉ</text>
      </svg>
    ),
  },
  {
    key: 'north-house',
    alt: 'North House',
    svg: (
      <svg viewBox="0 0 220 64" xmlns="http://www.w3.org/2000/svg" className="h-10 lg:h-12 w-auto">
        <text x="110" y="26" textAnchor="middle" fontFamily="Sora, sans-serif" fontWeight="600" fontSize="14" letterSpacing="6" fill="currentColor">NORTH</text>
        <line x1="80" y1="32" x2="140" y2="32" stroke="currentColor" strokeWidth="0.6" />
        <text x="110" y="48" textAnchor="middle" fontFamily="Sora, sans-serif" fontWeight="300" fontSize="14" letterSpacing="6" fill="currentColor">HOUSE</text>
      </svg>
    ),
  },
  {
    key: 'le-grand',
    alt: 'Le Grand',
    svg: (
      <svg viewBox="0 0 200 64" xmlns="http://www.w3.org/2000/svg" className="h-10 lg:h-12 w-auto">
        <text x="100" y="42" textAnchor="middle" fontFamily="Playfair Display, serif" fontStyle="italic" fontSize="30" fill="currentColor">Le Grand.</text>
      </svg>
    ),
  },
  {
    key: 'studio-saint',
    alt: 'Studio Saint',
    svg: (
      <svg viewBox="0 0 260 64" xmlns="http://www.w3.org/2000/svg" className="h-10 lg:h-12 w-auto">
        <text x="130" y="40" textAnchor="middle" fontFamily="Sora, sans-serif" fontSize="14" letterSpacing="5" fill="currentColor">STUDIO · SAINT</text>
        <line x1="60" y1="48" x2="200" y2="48" stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
      </svg>
    ),
  },
  {
    key: 'e-and-h',
    alt: 'Estate & Heir',
    svg: (
      <svg viewBox="0 0 200 64" xmlns="http://www.w3.org/2000/svg" className="h-10 lg:h-12 w-auto">
        <text x="100" y="36" textAnchor="middle" fontFamily="Playfair Display, serif" fontSize="32" fill="currentColor">
          E<tspan fontStyle="italic" dx="2">&amp;</tspan>H
        </text>
        <text x="100" y="54" textAnchor="middle" fontFamily="Sora, sans-serif" fontSize="7" letterSpacing="3" fill="currentColor" opacity="0.7">ESTATE & HEIR</text>
      </svg>
    ),
  },
]

export function HeroPartnersMarquee() {
  return (
    <section className="bg-ink pt-10 pb-3 lg:pt-12 lg:pb-4">
      {/* Editorial label: bronze hairline + italic serif phrase.
          Single-line treatment, centred, minimal vertical real estate. */}
      <div className="max-w-[1600px] mx-auto px-6 lg:px-10 mb-7 flex items-center justify-center gap-5">
        <span className="block h-px w-12 bg-bronze/50" />
        <p className="font-[family-name:var(--font-editorial)] italic text-[clamp(1rem,1.2vw,1.25rem)] text-ivory-soft tracking-wide">
          Esteemed Brand Partners
        </p>
        <span className="block h-px w-12 bg-bronze/50" />
      </div>

      <Marquee variant="logos" duration={50}>
        {LOGOS.map((logo) => (
          <div
            key={logo.key}
            aria-label={logo.alt}
            className="flex items-center justify-center min-w-[180px] h-12 text-ivory-soft/55 hover:text-ivory transition-colors duration-500"
          >
            {logo.svg}
          </div>
        ))}
      </Marquee>
    </section>
  )
}
