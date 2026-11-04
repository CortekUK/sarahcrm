'use client'

import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'

// Shared visual primitives for the member portal — night palette,
// editorial vocabulary matching the public site. Used by every page
// inside (portal)/portal/* so each view doesn't have to redeclare
// its eyebrow/heading/card/badge styles.

// ─── Page header ─────────────────────────────────────────────────────
//
// Editorial header that sits at the top of each portal page. Eyebrow
// in small bronze meta, display headline in serif, italic subtitle
// in ivory-soft. Optional right-aligned `actions` slot for filters
// or CTAs.

interface PortalPageHeaderProps {
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
}

export function PortalPageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
}: PortalPageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10 lg:mb-12',
        className,
      )}
    >
      <div>
        {eyebrow && (
          <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-4">
            {eyebrow}
          </p>
        )}
        <h1 className="font-[family-name:var(--font-display)] text-[clamp(1.875rem,3vw,2.75rem)] leading-[1.1] tracking-[-0.01em] text-ivory">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-3 font-[family-name:var(--font-editorial)] italic text-[15.5px] text-ivory-soft leading-[1.6] max-w-xl">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </header>
  )
}

// ─── Card ────────────────────────────────────────────────────────────
//
// Editorial card: graphite background, hairline bronze-tinted border,
// soft hover lift. The chrome that wraps almost everything in the
// portal — stat tiles, lists, forms, the lot.

interface PortalCardProps {
  children: ReactNode
  className?: string
  as?: 'div' | 'article' | 'section'
  interactive?: boolean
  onClick?: () => void
}

export function PortalCard({
  children,
  className,
  as: Component = 'div',
  interactive,
  onClick,
}: PortalCardProps) {
  return (
    <Component
      onClick={onClick}
      className={cn(
        'relative border border-graphite-line/45 bg-graphite/30 backdrop-blur-sm overflow-hidden',
        interactive &&
          'cursor-pointer hover:border-bronze/55 hover:bg-graphite/45 transition-all duration-500',
        className,
      )}
    >
      {children}
    </Component>
  )
}

// ─── Section block — bronze-rule heading inside a card ──────────────

interface PortalSectionTitleProps {
  children: ReactNode
  eyebrow?: ReactNode
  className?: string
}

export function PortalSectionTitle({
  children,
  eyebrow,
  className,
}: PortalSectionTitleProps) {
  return (
    <div className={cn('mb-6', className)}>
      {eyebrow && (
        <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-bronze-light mb-2">
          {eyebrow}
        </p>
      )}
      <h2 className="font-[family-name:var(--font-display)] text-[clamp(1.125rem,1.5vw,1.4375rem)] text-ivory leading-tight">
        {children}
      </h2>
    </div>
  )
}

// ─── Badge ───────────────────────────────────────────────────────────
//
// Status pill with night-palette variants matching the legacy Badge
// component's API (so call-sites can swap with minimal change).

export type PortalBadgeVariant =
  | 'active'
  | 'upcoming'
  | 'draft'
  | 'urgent'
  | 'info'
  | 'neutral'

interface PortalBadgeProps {
  children: ReactNode
  variant?: PortalBadgeVariant
  dot?: boolean
  className?: string
}

// Night palette is the default; `day:` variants swap to muted-warm
// equivalents that read on cream surfaces. The night tones (e.g.
// emerald-900/25 + emerald-300) read as a soft glow on graphite but
// turn into a faint smudge on cream — day mode needs a lighter bg with
// darker text to keep the same legibility budget.
const badgeStyles: Record<PortalBadgeVariant, { bg: string; text: string; border: string; dot: string }> = {
  active: {
    bg: 'bg-emerald-900/25 day:bg-emerald-50',
    text: 'text-emerald-300 day:text-emerald-800',
    border: 'border-emerald-700/45 day:border-emerald-200',
    dot: 'bg-emerald-400 day:bg-emerald-600',
  },
  upcoming: {
    bg: 'bg-bronze/15 day:bg-bronze/12',
    text: 'text-bronze-light day:text-bronze-dark',
    border: 'border-bronze/45 day:border-bronze/40',
    dot: 'bg-bronze day:bg-bronze-dark',
  },
  draft: {
    bg: 'bg-graphite/60 day:bg-stone-100',
    text: 'text-ivory-soft day:text-stone-700',
    border: 'border-graphite-line/60 day:border-stone-300',
    dot: 'bg-slate-haze day:bg-stone-500',
  },
  urgent: {
    bg: 'bg-rose-900/25 day:bg-rose-50',
    text: 'text-rose-300 day:text-rose-800',
    border: 'border-rose-700/45 day:border-rose-200',
    dot: 'bg-rose-400 day:bg-rose-600',
  },
  info: {
    bg: 'bg-sky-900/25 day:bg-sky-50',
    text: 'text-sky-300 day:text-sky-800',
    border: 'border-sky-700/45 day:border-sky-200',
    dot: 'bg-sky-400 day:bg-sky-600',
  },
  neutral: {
    bg: 'bg-graphite/50 day:bg-stone-100',
    text: 'text-ivory-soft day:text-stone-700',
    border: 'border-graphite-line/50 day:border-stone-300',
    dot: 'bg-ivory-soft day:bg-stone-500',
  },
}

export function PortalBadge({
  children,
  variant = 'neutral',
  dot,
  className,
}: PortalBadgeProps) {
  const s = badgeStyles[variant]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-[family-name:var(--font-meta)] text-[9.5px] font-medium uppercase tracking-[0.18em] whitespace-nowrap',
        s.bg,
        s.text,
        s.border,
        className,
      )}
    >
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full', s.dot)} />}
      {children}
    </span>
  )
}

// ─── Empty state ─────────────────────────────────────────────────────

interface PortalEmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function PortalEmptyState({
  icon,
  title,
  description,
  action,
  className,
}: PortalEmptyStateProps) {
  return (
    <div
      className={cn(
        'border border-graphite-line/40 bg-graphite/20 px-8 py-16 lg:py-20 text-center',
        className,
      )}
    >
      {icon && (
        <div className="w-12 h-12 mx-auto mb-5 rounded-full border border-bronze/30 bg-bronze/10 day:border-bronze/55 day:bg-bronze/18 flex items-center justify-center text-bronze-light day:text-bronze-dark">
          {icon}
        </div>
      )}
      <p className="font-[family-name:var(--font-display)] text-[18px] text-ivory leading-tight">
        {title}
      </p>
      {description && (
        <p className="mt-3 font-[family-name:var(--font-editorial)] italic text-[14px] text-ivory-soft/85 max-w-md mx-auto leading-[1.65]">
          {description}
        </p>
      )}
      {action && <div className="mt-7 flex justify-center">{action}</div>}
    </div>
  )
}

// ─── Loading ─────────────────────────────────────────────────────────

export function PortalLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-16 px-2">
      <span className="w-1.5 h-1.5 bg-bronze rounded-full animate-pulse" />
      <span className="font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.28em] text-ivory-soft">
        {label}
      </span>
    </div>
  )
}

// ─── Stat tile ───────────────────────────────────────────────────────

interface PortalStatTileProps {
  label: string
  value: ReactNode
  caption?: ReactNode
  icon?: ReactNode
}

export function PortalStatTile({ label, value, caption, icon }: PortalStatTileProps) {
  return (
    <PortalCard className="p-6 lg:p-7">
      <div className="flex items-start gap-5">
        {icon && (
          <div className="w-11 h-11 rounded-full border border-bronze/30 bg-bronze/10 day:border-bronze/55 day:bg-bronze/18 flex items-center justify-center text-bronze-light day:text-bronze-dark shrink-0">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-bronze-light/85 mb-2">
            {label}
          </p>
          <p className="font-[family-name:var(--font-display)] text-[clamp(1.5rem,2vw,2rem)] text-ivory leading-none tabular-nums">
            {value}
          </p>
          {caption && (
            <p className="mt-2 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.22em] text-slate-haze">
              {caption}
            </p>
          )}
        </div>
      </div>
    </PortalCard>
  )
}

// ─── Pill button — bronze primary, ghost secondary, outline tertiary ─

interface PortalButtonProps {
  children: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md'
  loading?: boolean
  disabled?: boolean
  icon?: ReactNode
  className?: string
}

export function PortalButton({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  icon,
  className,
}: PortalButtonProps) {
  const isDisabled = disabled || loading
  const variantClass = {
    primary:
      'border-bronze bg-bronze/15 text-bronze-light hover:bg-bronze hover:text-ink',
    secondary:
      'border-graphite-line/70 text-ivory/85 hover:border-bronze/55 hover:text-bronze-light hover:bg-bronze/[0.05]',
    ghost:
      'border-transparent text-ivory-soft hover:text-bronze-light',
  }[variant]
  const sizeClass = {
    sm: 'px-4 py-2 text-[10px] tracking-[0.28em]',
    md: 'px-6 py-3 text-[10.5px] tracking-[0.32em]',
  }[size]
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      className={cn(
        'inline-flex items-center gap-2.5 rounded-full border font-[family-name:var(--font-meta)] font-medium uppercase transition-all duration-300',
        variantClass,
        sizeClass,
        isDisabled && 'opacity-60 cursor-not-allowed',
        className,
      )}
    >
      {loading ? (
        <span className="w-1.5 h-1.5 bg-current rounded-full animate-pulse" />
      ) : (
        icon
      )}
      {children}
    </button>
  )
}

// ─── Editorial input / textarea — underline style ───────────────────

const fieldBase =
  'w-full px-0 py-3 bg-transparent border-b border-graphite-line/80 focus:border-bronze focus:outline-none text-[14.5px] text-ivory placeholder:text-slate-dim transition-colors'

interface PortalFieldProps {
  label: string
  hint?: string
  error?: string
  /** id of the control the label is for. Defaults to the child's own id,
   *  or a generated one that is passed down to a single child control. */
  htmlFor?: string
  children: ReactNode
}

export function PortalField({ label, hint, error, htmlFor, children }: PortalFieldProps) {
  const autoId = useId()
  // Link the <label> to its control (and the hint/error to it via
  // aria-describedby) so screen readers announce them and clicking the
  // label focuses the input.
  const child = isValidElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>(children)
    ? children
    : null
  const controlId = htmlFor ?? child?.props.id ?? `field-${autoId}`
  const noteId = `${controlId}-note`
  const hasNote = !!error || !!hint
  const control = child
    ? cloneElement(child, {
        id: controlId,
        ...(hasNote ? { 'aria-describedby': child.props['aria-describedby'] ?? noteId } : {}),
        ...(error ? { 'aria-invalid': true } : {}),
      })
    : children
  return (
    <div>
      <label
        htmlFor={controlId}
        className="block font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.28em] text-slate-haze mb-3"
      >
        {label}
      </label>
      {control}
      {hint && !error && (
        <p id={noteId} className="mt-2 text-[11.5px] text-slate-dim italic">{hint}</p>
      )}
      {error && (
        <p id={noteId} role="alert" className="mt-2 text-[11.5px] text-bronze-light italic">{error}</p>
      )}
    </div>
  )
}

export function PortalInput(
  props: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className'> & {
    className?: string
  },
) {
  const { className, ...rest } = props
  return <input {...rest} className={cn(fieldBase, className)} />
}

export function PortalTextarea(
  props: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> & {
    className?: string
  },
) {
  const { className, rows = 4, ...rest } = props
  return (
    <textarea
      {...rest}
      rows={rows}
      className={cn(fieldBase, 'resize-none', className)}
    />
  )
}

// ─── Modal ───────────────────────────────────────────────────────────
//
// Night-palette dialog: ink panel with bronze hairline border, blurred
// ink scrim, close button, scroll-locked body. Same API as the admin
// Modal — drop-in replacement for portal pages.

interface PortalModalProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  title?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const modalSize: Record<NonNullable<PortalModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

export function PortalModal({
  open,
  onClose,
  children,
  title,
  size = 'md',
  className,
}: PortalModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Move keyboard focus into the dialog when it opens (and back to whatever
  // opened it when it closes), so keyboard / screen-reader users land in the
  // pop-up instead of behind it.
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const t = setTimeout(() => dialogRef.current?.focus(), 0)
    return () => {
      clearTimeout(t)
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      // Keep Tab inside the dialog.
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        const active = document.activeElement
        if (e.shiftKey && (active === first || active === dialogRef.current)) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', handleKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/75 backdrop-blur-sm animate-[modal-enter_0.25s_ease-out]"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose()
      }}
    >
      <div
        className={cn(
          'relative w-full bg-graphite border border-bronze/35 shadow-[0_30px_60px_-12px_rgba(0,0,0,0.7)] flex flex-col max-h-[calc(100vh-2rem)] focus:outline-none',
          modalSize[size],
          className,
        )}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Bronze corner brackets — same motif as the editorial cards
            on the public site. */}
        <span aria-hidden className="absolute top-3 left-3 w-5 h-px bg-bronze/55 pointer-events-none" />
        <span aria-hidden className="absolute top-3 left-3 w-px h-5 bg-bronze/55 pointer-events-none" />
        <span aria-hidden className="absolute bottom-3 right-3 w-5 h-px bg-bronze/55 pointer-events-none" />
        <span aria-hidden className="absolute bottom-3 right-3 w-px h-5 bg-bronze/55 pointer-events-none" />

        {title && (
          <div className="shrink-0 flex items-center justify-between px-7 py-5 border-b border-graphite-line/50">
            <h2 className="font-[family-name:var(--font-display)] text-[clamp(1.125rem,1.5vw,1.375rem)] text-ivory leading-tight">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 text-ivory/65 hover:text-bronze-light hover:bg-bronze/[0.08] rounded-full transition-colors"
              aria-label="Close"
            >
              <X size={17} strokeWidth={1.5} />
            </button>
          </div>
        )}

        {!title && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 p-1.5 text-ivory/65 hover:text-bronze-light hover:bg-bronze/[0.08] rounded-full transition-colors"
            aria-label="Close"
          >
            <X size={17} strokeWidth={1.5} />
          </button>
        )}

        <div className="px-7 py-6 overflow-y-auto flex-1 min-h-0">{children}</div>
      </div>
    </div>
  )
}

// ─── Avatar with a broken-image fallback ────────────────────────────
//
// The house Avatar shows initials only when there's no src. Members' photo
// URLs can go stale (deleted upload, expired link), which left an empty
// broken-image circle — this checks the image loads and falls back to the
// initials when it doesn't.

export function PortalAvatar(props: ComponentProps<typeof Avatar>) {
  const { src, ...rest } = props
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  useEffect(() => {
    if (!src) return
    const img = new window.Image()
    img.onerror = () => setFailedSrc(src)
    img.src = src
    return () => {
      img.onerror = null
    }
  }, [src])
  return <Avatar {...rest} src={src && failedSrc !== src ? src : null} />
}
