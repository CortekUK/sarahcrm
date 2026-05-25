import { KenBurnsImage } from './MediaBlocks'

// Single component the interior page heroes can use to render either an
// image (with the KenBurns drift treatment) or a looping muted video.
// Lets the CMS swap a page's hero between media types without each page
// needing its own branching.

interface PageHeroMediaProps {
  mediaType: 'image' | 'video'
  imageUrl: string | null | undefined
  alt: string
  videoUrl?: string | null
  videoPosterUrl?: string | null
  /** 0-1, how much the dark overlay darkens the underlying media. */
  overlay?: number
  /** Seconds the KenBurns pan/zoom takes (image only). */
  duration?: number
  className?: string
  priority?: boolean
}

export function PageHeroMedia({
  mediaType,
  imageUrl,
  alt,
  videoUrl,
  videoPosterUrl,
  overlay = 0.55,
  duration = 32,
  className = 'absolute inset-0',
  priority = false,
}: PageHeroMediaProps) {
  if (mediaType === 'video' && videoUrl) {
    return (
      <div className={className}>
        <video
          src={videoUrl}
          poster={videoPosterUrl ?? imageUrl ?? undefined}
          autoPlay
          muted
          loop
          playsInline
          // `auto` so the hero video starts loading immediately rather
          // than waiting on metadata round-trips. Hero videos are the
          // point of the section — we want them ready, not deferred.
          preload="auto"
          onError={(e) => {
            const v = e.currentTarget
            console.warn('[PageHeroMedia] video failed to load', {
              src: v.currentSrc,
              error: v.error,
            })
          }}
          className="w-full h-full object-cover"
        />
        {/* Match the KenBurnsImage overlay so video heroes have the
           same darkening pass — keeps text legibility consistent
           when an admin swaps media type. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-ink pointer-events-none"
          style={{ opacity: overlay }}
        />
      </div>
    )
  }
  if (!imageUrl) {
    return (
      <div className={className}>
        <div className="absolute inset-0 bg-gradient-to-br from-graphite to-plum/30" />
      </div>
    )
  }
  return (
    <KenBurnsImage
      src={imageUrl}
      alt={alt}
      motion="in"
      duration={duration}
      overlay={overlay}
      priority={priority}
      className={className}
    />
  )
}
