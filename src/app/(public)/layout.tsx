import { NightHeader } from '@/components/website/night/NightHeader'
import { NightFooter } from '@/components/website/night/NightFooter'
import { JoinBadge } from '@/components/website/night/JoinBadge'
import { SmoothScrolling } from '@/components/website/SmoothScrolling'
import { ThemeProvider } from '@/components/website/ThemeContext'
import { Toaster } from '@/components/ui-shadcn/toaster'

// Public marketing site wrapper. The active theme class
// ('theme-day' / 'theme-night') is set on <html> by the root layout's
// boot script + ThemeProvider, so the palette tokens cascade from the
// document root. We deliberately do NOT hardcode `theme-night` here
// any more — that would pin the public site to dark mode regardless
// of the user's choice. `bg-ink` / `text-ivory` still work because
// the day theme remaps those tokens to cream + ink.
//
// The legacy `ThemeProvider` from components/website/ThemeContext is
// kept mounted as a compat shim — older pages still call its
// `useTheme()` hook. It's independent of the new <ThemeProvider> in
// the root layout (different React context) and will be deleted once
// every public page is rebuilt against the editorial primitives.

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
        <div className="min-h-screen w-full overflow-x-clip bg-ink text-ivory antialiased">
          <NightHeader />
          <main>{children}</main>
          <JoinBadge />
          <NightFooter />
          {/* Toaster surface — used by the public forms (member-email
              check on /membership-application, etc). The toast itself
              uses theme-aware tokens (bg-graphite remaps in day mode)
              so it reads in both palettes. */}
          <Toaster />
        </div>
      </SmoothScrolling>
    </ThemeProvider>
  )
}
