import { cn } from '../../lib/utils'

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl'

interface AvatarProps {
  src?: string | null
  alt?: string
  name?: string
  size?: AvatarSize
  className?: string
}

const sizeStyles: Record<AvatarSize, string> = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-lg',
}

// Warm, muted palette that fits the design system
const bgColours = [
  'bg-[#D4B978]', // gold-light
  'bg-[#5B7B6A]', // sage green
  'bg-[#5A7B96]', // blue
  'bg-[#C4694A]', // terracotta
  'bg-[#96793F]', // gold-dark
  'bg-[#8B7B6B]', // warm taupe
  'bg-[#7B6B5B]', // bronze
  'bg-[#6B8B7A]', // muted green
]

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
}

function getColourIndex(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return Math.abs(hash) % bgColours.length
}

export function Avatar({ src, alt, name, size = 'md', className }: AvatarProps) {
  const initials = name ? getInitials(name) : '?'
  const colourClass = name ? bgColours[getColourIndex(name)] : bgColours[0]

  if (src) {
    return (
      <img
        src={src}
        alt={alt || name || 'Avatar'}
        className={cn(
          'rounded-full object-cover shrink-0',
          sizeStyles[size],
          className
        )}
      />
    )
  }

  return (
    <div
      className={cn(
        'rounded-full shrink-0 flex items-center justify-center font-medium text-white',
        sizeStyles[size],
        colourClass,
        className
      )}
      aria-label={alt || name || 'Avatar'}
    >
      {initials}
    </div>
  )
}
