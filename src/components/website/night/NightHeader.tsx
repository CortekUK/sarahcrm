'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useTheme } from '@/providers/ThemeProvider'
import { cn } from '@/lib/utils'

// Public site navigation, night palette.
// Behaviour:
//   - Transparent at the top of the page, becomes graphite + hairline
//     border once you scroll past 24px so it doesn't fight hero video.
//   - Desktop nav is centred minimal links with a small wordmark left
//     and a single bronze "Apply" pill right.
//   - Mobile collapses to a fullscreen overlay with the same links
//     and the wordmark animating from the corner. No magnetic buttons,
//     no custom cursor — restraint is the brief.

const LINKS = [
  { href: '/about', label: 'The Club' },
  { href: '/memberships', label: 'Memberships' },
  { href: '/events', label: 'Events' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/private-event-services', label: 'Private Events' },
]

export function NightHeader() {
  const pathname = usePathname()
  const { theme } = useTheme()
  const [scrolled, setScrolled] = useState(false)
  const [overDarkHero, setOverDarkHero] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  // Day mode → bronze/gold mark on cream; Night mode → white mark on
  // the dark hero / graphite header. Header swaps via JS rather than
  // CSS-only because the file is different per theme.
  // Exception: when we're sitting over a dark hero, the logo needs to
  // be white regardless of the active theme — otherwise the bronze
  // monogram disappears against the dark image in day mode.
  const logoSrc = theme === 'day' && !overDarkHero ? '/logo-gold.png' : '/logo-white.png'

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 24)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Detect whether a `.always-night` element (i.e. a dark hero) is
  // currently sitting underneath the header. Without this we used to
  // assume `scrolled === false` meant "over dark hero" and pin
  // .always-night on the header — which broke pages without a dark
  // hero in day mode (cream-on-cream invisible text). Now we look at
  // the actual DOM: if any always-night element overlaps the top
  // 72px of the viewport, we treat that as "over dark hero".
  useEffect(() => {
    function check() {
      const candidates = document.querySelectorAll<HTMLElement>('main .always-night')
      let isOver = false
      for (const el of candidates) {
        const rect = el.getBoundingClientRect()
        if (rect.top <= 0 && rect.bottom > 0) {
          isOver = true
          break
        }
      }
      setOverDarkHero(isOver)
    }
    // Allow the page to paint first so getBoundingClientRect is
    // accurate (especially right after a route change).
    const id = requestAnimationFrame(check)
    window.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check)
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
    }
  }, [pathname])

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  // Body scroll lock while overlay is open
  useEffect(() => {
    if (!menuOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [menuOpen])

  return (
    <>
      <header
        className={cn(
          'fixed top-0 left-0 right-0 z-50 transition-[background,backdrop-filter,border-color] duration-500',
          // The header has three distinct visual modes:
          //   1. Scrolled past the hero — solid graphite/cream backdrop
          //      with a hairline border, text uses theme tokens so it
          //      flips correctly in both day and night.
          //   2. Sitting over a dark hero — transparent backdrop, pin
          //      `.always-night` so text stays light against the dark
          //      image (this is what we need in day mode too).
          //   3. Sitting over a light page (no dark hero at the top, eg.
          //      success states, club rules, privacy policy) —
          //      transparent backdrop but NO always-night, so text
          //      resolves to dark via the day-mode token map.
          scrolled
            ? 'bg-graphite/85 backdrop-blur-md border-b border-graphite-line/60'
            : overDarkHero
              ? 'always-night bg-transparent border-b border-transparent'
              : 'bg-transparent border-b border-transparent',
        )}
      >
        <div className="max-w-[1600px] mx-auto px-6 lg:px-10 h-[72px] flex items-center justify-between">
          {/* Wordmark — diamond C monogram + serif text. White logo
              variant since the header sits over dark / the video hero. */}
          <Link
            href="/"
            className="group flex items-center gap-3 leading-none"
            aria-label="The Club by Sarah Restrick — Home"
          >
            <Image
              src={logoSrc}
              alt=""
              width={40}
              height={40}
              priority
              className="h-10 w-10 opacity-90 group-hover:opacity-100 transition-opacity"
            />
            <span className="flex flex-col leading-none">
              <span className="font-[family-name:var(--font-display)] text-[20px] tracking-[0.02em] text-ivory transition-colors duration-500 group-hover:text-bronze-light">
                The Club
              </span>
              {/* "by Sarah Restrick" gently warms to bronze-light as the
                  header gains a background on scroll, and cools back to
                  slate-haze when you return to the hero. 600ms ease. */}
              <span
                className={cn(
                  'font-[family-name:var(--font-meta)] text-[9px] font-medium uppercase tracking-[0.32em] mt-[3px] transition-colors duration-600 ease-out',
                  scrolled ? 'text-bronze-light' : 'text-slate-haze',
                )}
              >
                by Sarah Restrick
              </span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-9">
            {LINKS.map((l) => {
              const active = pathname === l.href || (l.href !== '/' && pathname.startsWith(l.href))
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cn(
                    'group relative font-[family-name:var(--font-meta)] text-[11px] font-medium uppercase tracking-[0.22em] transition-colors',
                    active ? 'text-bronze-light' : 'text-ivory/75 hover:text-ivory',
                  )}
                >
                  {l.label}
                  {/* Dot indicator — always rendered, fades in for active
                      links and on hover for inactive ones. */}
                  <span
                    aria-hidden
                    className={cn(
                      'absolute -bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-bronze transition-opacity duration-300',
                      active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                    )}
                  />
                </Link>
              )
            })}
          </nav>

          {/* Right side — theme toggle + secondary Member Login pill +
              primary bronze Apply pill (desktop) + hamburger (mobile).
              The toggle sits as a quiet icon button left of the pair
              so it doesn't compete with the two CTAs for attention. */}
          <div className="flex items-center gap-3">
            <ThemeToggle variant="icon" className="hidden lg:inline-flex" />
            <Link
              href="/login"
              className="hidden lg:inline-flex items-center px-5 py-2.5 border border-graphite-line/70 hover:border-bronze/60 rounded-full font-[family-name:var(--font-meta)] text-[10.5px] font-medium uppercase tracking-[0.28em] text-ivory/85 hover:text-bronze-light hover:bg-bronze/[0.06] transition-all duration-300"
            >
              Member Login
            </Link>
            <Link
              href="/membership-application"
              className="hidden lg:inline-flex items-center gap-2 px-5 py-2.5 border border-bronze/60 hover:border-bronze rounded-full font-[family-name:var(--font-meta)] text-[10.5px] font-medium uppercase tracking-[0.28em] text-bronze-light hover:text-ivory hover:bg-bronze/20 transition-all duration-300"
            >
              Apply
            </Link>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="lg:hidden p-2 -mr-2 text-ivory hover:text-bronze-light transition-colors"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            >
              {menuOpen ? <X size={20} strokeWidth={1.5} /> : <Menu size={20} strokeWidth={1.5} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile fullscreen overlay */}
      <div
        className={cn(
          'fixed inset-0 z-40 lg:hidden bg-ink transition-all duration-500',
          menuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
      >
        <div className="h-full flex flex-col items-center justify-center gap-7 px-6">
          {LINKS.map((l, i) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                'font-[family-name:var(--font-display)] text-3xl text-ivory/90 hover:text-bronze-light transition-all duration-500',
                menuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4',
              )}
              style={{ transitionDelay: menuOpen ? `${i * 70 + 120}ms` : '0ms' }}
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/membership-application"
            className={cn(
              'mt-8 inline-flex items-center gap-2 px-8 py-3.5 border border-bronze/60 rounded-full font-[family-name:var(--font-meta)] text-[11px] font-medium uppercase tracking-[0.32em] text-bronze-light transition-all duration-500',
              menuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4',
            )}
            style={{ transitionDelay: menuOpen ? `${LINKS.length * 70 + 160}ms` : '0ms' }}
          >
            Apply
          </Link>
          <Link
            href="/login"
            className={cn(
              'mt-3 inline-flex items-center px-8 py-3.5 border border-graphite-line/70 rounded-full font-[family-name:var(--font-meta)] text-[11px] font-medium uppercase tracking-[0.32em] text-ivory/85 transition-all duration-500',
              menuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4',
            )}
            style={{ transitionDelay: menuOpen ? `${LINKS.length * 70 + 240}ms` : '0ms' }}
          >
            Member Login
          </Link>
          <div
            className={cn(
              'mt-4 transition-all duration-500',
              menuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4',
            )}
            style={{ transitionDelay: menuOpen ? `${LINKS.length * 70 + 320}ms` : '0ms' }}
          >
            <ThemeToggle variant="icon" />
          </div>
        </div>
      </div>
    </>
  )
}
