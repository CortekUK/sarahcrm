'use client'

import { useReveal } from '../home/useReveal'
import { useTheme, themeColors } from '../ThemeContext'

export function EventsIntro() {
  const { mode } = useTheme()
  const t = themeColors[mode].light
  const reveal = useReveal({ threshold: 0.05, y: 30 })

  return (
    <section
      className="pt-16 md:pt-24 pb-0 transition-colors duration-[400ms]"
      style={{ backgroundColor: t.bg }}
    >
      <div
        ref={reveal.ref}
        className="max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24"
      >
        <div className="max-w-3xl">
          <h2
            className="font-[family-name:var(--font-heading)] text-2xl md:text-3xl font-light leading-[1.3] mb-5 transition-colors duration-[400ms]"
            style={{ color: t.text }}
          >
            Where every evening tells a story
          </h2>
          <p
            className="font-[family-name:var(--font-body)] text-base md:text-lg leading-[1.85] font-light transition-colors duration-[400ms]"
            style={{ color: t.textMuted }}
          >
            From intimate dinners at Michelin-starred restaurants to curated luxury retreats
            across Europe, every event is designed to foster meaningful connections between
            exceptional individuals. Our calendar spans private dining, cultural experiences,
            business masterclasses, and exclusive getaways — each one by invitation only.
          </p>
        </div>
      </div>
    </section>
  )
}
