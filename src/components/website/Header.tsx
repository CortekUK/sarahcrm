'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { DiamondLogo } from './Logo'
import { MenuOverlay } from './MenuOverlay'
import { MagneticButton } from './MagneticButton'
import { useTheme } from './ThemeContext'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const headerRef = useRef<HTMLElement>(null)
  const pathname = usePathname()
  const { mode, toggle } = useTheme()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const header = headerRef.current
    if (!header) return

    const trigger = ScrollTrigger.create({
      start: 'top -50',
      onUpdate: (self) => {
        setScrolled(self.scroll() > 50)
      },
    })

    return () => trigger.kill()
  }, [])

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  const isHome = pathname === '/'
  const lightMode = isHome && mode === 'day' && !scrolled

  const fgColor = lightMode ? '#1A1714' : '#FFFFFF'

  return (
    <>
      <header
        ref={headerRef}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? 'bg-[#1A1714]/95 backdrop-blur-md py-4'
            : 'bg-transparent py-6'
        }`}
      >
        <div className="max-w-[1440px] mx-auto px-6 md:px-12 flex items-center justify-between">
          {/* Logo */}
          <MagneticButton strength={0.2}>
            <Link
              href="/"
              className="flex items-center gap-3 transition-all duration-[400ms] hover:opacity-80"
              style={{ color: fgColor }}
            >
              <DiamondLogo size={36} />
            </Link>
          </MagneticButton>

          <div className="flex items-center gap-6">
            {/* Day/Evening toggle */}
            <button
              onClick={toggle}
              className="w-9 h-9 flex items-center justify-center transition-all duration-[400ms] hover:opacity-70"
              aria-label={`Switch to ${mode === 'evening' ? 'day' : 'evening'} mode`}
            >
              {mode === 'evening' ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 18 18"
                  fill="none"
                  style={{ color: fgColor }}
                >
                  <circle cx="9" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.5" />
                  {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
                    <line
                      key={angle}
                      x1="9"
                      y1="2"
                      x2="9"
                      y2="0.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      transform={`rotate(${angle} 9 9)`}
                    />
                  ))}
                </svg>
              ) : (
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 16 16"
                  fill="none"
                  style={{ color: fgColor }}
                >
                  <path
                    d="M13.5 9.5a5.5 5.5 0 0 1-7-7A5.5 5.5 0 1 0 13.5 9.5Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>

            {/* Hamburger */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="relative w-10 h-10 flex items-center justify-center group"
              aria-label="Toggle menu"
            >
              <div className="flex flex-col gap-1.5">
                <span
                  className="block w-6 h-[1.5px] transition-all duration-300"
                  style={{
                    backgroundColor: fgColor,
                    transform: menuOpen ? 'rotate(45deg) translateY(4.5px)' : 'none',
                  }}
                />
                <span
                  className="block w-6 h-[1.5px] transition-all duration-300"
                  style={{
                    backgroundColor: fgColor,
                    transform: menuOpen ? 'rotate(-45deg) translateY(-4.5px)' : 'none',
                  }}
                />
              </div>
            </button>
          </div>
        </div>
      </header>

      <MenuOverlay open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  )
}
