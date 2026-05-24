'use client'

import { useState, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { cn } from '@/lib/utils'

// Editorial-magazine bento grid for showcasing gallery moments, event
// recaps, or "what we offer". 12-column desktop, stacks gracefully on
// mobile. Each child is a BentoTile placed via the `span` prop.
//
// Use:
//   <BentoGrid>
//     <BentoTile span="col-span-12 md:col-span-7 row-span-2" image={...} />
//     <BentoTile span="col-span-12 md:col-span-5" image={...} />
//   </BentoGrid>

export function BentoGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'grid grid-cols-12 auto-rows-[clamp(180px,22vw,320px)] gap-3 md:gap-4',
        className,
      )}
    >
      {children}
    </div>
  )
}

interface BentoTileProps {
  span: string
  image?: string | null
  videoPoster?: string
  title?: string
  eyebrow?: string
  caption?: string
  href?: string
  /** Render any custom content inside the tile (overrides image). */
  children?: ReactNode
  /** Hover effect — "spotlight" (default), "zoom", or "none". */
  hover?: 'spotlight' | 'zoom' | 'none'
  className?: string
}

export function BentoTile({
  span,
  image,
  title,
  eyebrow,
  caption,
  href,
  children,
  hover = 'spotlight',
  className,
}: BentoTileProps) {
  const [spot, setSpot] = useState<{ x: number; y: number } | null>(null)

  const tile = (
    <div
      onMouseMove={(e) => {
        if (hover !== 'spotlight') return
        const r = e.currentTarget.getBoundingClientRect()
        setSpot({ x: e.clientX - r.left, y: e.clientY - r.top })
      }}
      onMouseLeave={() => setSpot(null)}
      className={cn(
        'group relative overflow-hidden bg-graphite-2',
        'border border-graphite-line/60 hover:border-bronze/50 transition-colors duration-500',
        hover === 'zoom' && '[&_img]:transition-transform [&_img]:duration-[1200ms] [&_img]:ease-out hover:[&_img]:scale-[1.06]',
        span,
        className,
      )}
    >
      {children ? (
        children
      ) : image ? (
        <>
          <Image
            src={image}
            alt={title ?? ''}
            fill
            className="object-cover"
            sizes="(min-width: 1024px) 50vw, 100vw"
          />
          {/* Soft bottom gradient for caption legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/30 to-transparent" />
          {/* Grain */}
          <div className="film-grain-night" />
          {/* Spotlight on hover */}
          {hover === 'spotlight' && spot && (
            <div
              className="absolute pointer-events-none transition-opacity duration-300"
              style={{
                left: spot.x - 200,
                top: spot.y - 200,
                width: 400,
                height: 400,
                background:
                  'radial-gradient(circle, rgba(192,152,112,0.25), transparent 70%)',
              }}
            />
          )}
        </>
      ) : null}

      {/* Caption overlay — bottom-left */}
      {(title || eyebrow || caption) && (
        <div className="absolute inset-x-0 bottom-0 p-5 md:p-6 flex flex-col">
          {eyebrow && (
            <span className="eyebrow-quiet mb-2 opacity-90">{eyebrow}</span>
          )}
          {title && (
            <h3 className="font-[family-name:var(--font-display)] text-[clamp(1.125rem,1.6vw,1.625rem)] leading-tight text-ivory">
              {title}
            </h3>
          )}
          {caption && (
            <p className="mt-1 text-[13px] text-ivory-soft/80 line-clamp-2">{caption}</p>
          )}
        </div>
      )}

      {/* Hairline corner accent on hover */}
      <div className="absolute top-3 right-3 w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
        <span className="absolute top-0 right-0 w-full h-px bg-bronze-light" />
        <span className="absolute top-0 right-0 w-px h-full bg-bronze-light" />
      </div>
    </div>
  )

  return href ? <Link href={href}>{tile}</Link> : tile
}
