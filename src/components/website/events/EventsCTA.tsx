'use client'

import Link from 'next/link'
import { useReveal } from '../home/useReveal'
import { useTheme, themeColors } from '../ThemeContext'
import { MagneticButton } from '../MagneticButton'

export function EventsCTA() {
  const { mode } = useTheme()
  const t = themeColors[mode].warm
  const reveal = useReveal(0.2)

  return (
    <section
      className="py-20 md:py-28 transition-colors duration-[400ms]"
      style={{ backgroundColor: t.bg }}
    >
      <div
        ref={reveal.ref}
        className="max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24 text-center"
      >
        <h2
          className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl lg:text-5xl font-light leading-[1.1] transition-colors duration-[400ms]"
          style={{ color: t.text }}
        >
          Want to attend?
        </h2>
        <p
          className="font-[family-name:var(--font-body)] text-base md:text-lg mt-5 max-w-md mx-auto leading-relaxed transition-colors duration-[400ms]"
          style={{ color: t.textMuted }}
        >
          Membership is by invitation &amp; application
        </p>
        <div className="mt-10 flex justify-center">
          <MagneticButton strength={0.3}>
            <Link
              href="/membership-application"
              className="group inline-flex items-center gap-3 px-10 py-4 bg-[#B8975A] text-white text-[0.8rem] font-medium tracking-[0.1em] uppercase transition-all duration-500 hover:bg-[#D4B978] hover:tracking-[0.15em]"
            >
              Apply
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="transition-transform duration-500 group-hover:translate-x-1">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          </MagneticButton>
        </div>
      </div>
    </section>
  )
}
