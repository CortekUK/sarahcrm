import { NightHeader } from '@/components/website/night/NightHeader'
import { NightFooter } from '@/components/website/night/NightFooter'
import { SmoothScrolling } from '@/components/website/SmoothScrolling'
import { ThemeProvider } from '@/components/website/ThemeContext'

// Public marketing site wrapper. The `.theme-night` class cascades the
// midnight + ivory + bronze palette and the Playfair / Sora typography
// across every page under (public)/. The admin and member portal
// layouts don't apply this class, so they keep the legacy cream + gold
// palette without any retouching.
//
// ThemeProvider stays mounted as a compatibility shim while legacy
// pages still depend on useTheme() — it defaults to 'evening' which
// matches the new night direction closely enough that un-rebuilt
// pages still look acceptable. Once every public page is rebuilt
// against the new editorial primitives, ThemeContext + the entire
// `src/components/website/*.tsx` legacy layer get deleted.

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ThemeProvider>
      <SmoothScrolling>
        {/* `overflow-x-clip` instead of `overflow-x-hidden`: both block
            horizontal overflow, but `clip` doesn't create a scroll
            container so it doesn't trap `position: sticky` descendants
            (IntroChapter's 3-image swap, MembershipsPage tier reveal). */}
        <div className="theme-night min-h-screen w-full overflow-x-clip bg-ink text-ivory antialiased">
          <NightHeader />
          <main>{children}</main>
          <NightFooter />
        </div>
      </SmoothScrolling>
    </ThemeProvider>
  )
}
