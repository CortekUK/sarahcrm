'use client'

import Image from 'next/image'
import { ImageOff } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ThumbnailProps {
  src: string | null | undefined
  alt: string
  /** CSS aspect ratio. Defaults to "1 / 1" (square). */
  aspect?: string
  /** Width in pixels — height derives from aspect. */
  width?: number
  /** Object-fit mode. "contain" suits logos; "cover" suits photos. */
  fit?: 'cover' | 'contain'
  className?: string
}

// Compact image thumbnail for admin list tables. Renders a graceful
// placeholder when the URL is missing instead of a broken-image icon —
// rows with missing images still scan readably.
export function Thumbnail({
  src,
  alt,
  aspect = '1 / 1',
  width = 56,
  fit = 'cover',
  className,
}: ThumbnailProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md bg-surface-2 border border-border/60 flex-shrink-0',
        className,
      )}
      style={{ width, aspectRatio: aspect }}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={`${width}px`}
          className={fit === 'contain' ? 'object-contain p-1' : 'object-cover'}
          unoptimized
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-text-dim">
          <ImageOff size={16} strokeWidth={1.5} />
        </div>
      )}
    </div>
  )
}
