'use client'

// House Avatar with an image-error fallback: chat avatars are user-supplied
// URLs that can 404 / expire, and a broken <img> with alt text looks wrong in
// a list. On error (or no src) it renders the house initials avatar.

import { useEffect, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'

type Size = 'sm' | 'md' | 'lg' | 'xl'

const sizeStyles: Record<Size, string> = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
  xl: 'w-16 h-16',
}

export function ChatAvatar({
  src,
  name,
  size = 'md',
  className,
}: {
  src?: string | null
  name: string
  size?: Size
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  if (!src || failed) return <Avatar name={name} size={size} className={className} />
  return (
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary remote avatar URLs
    <img
      src={src}
      alt=""
      aria-label={name}
      onError={() => setFailed(true)}
      className={cn('rounded-full object-cover shrink-0', sizeStyles[size], className)}
    />
  )
}
