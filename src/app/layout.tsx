import type { Metadata } from 'next'
import './globals.css'
import { SmoothScrolling } from '@/components/website/SmoothScrolling'
import { ThemeProvider, THEME_BOOT_SCRIPT } from '@/providers/ThemeProvider'

export const metadata: Metadata = {
  title: 'The Club by Sarah Restrick',
  description: 'Luxury Private Members Networking',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // suppressHydrationWarning: the boot script mutates <html> classList +
    // dataset BEFORE React hydrates so the user never sees a flash of the
    // wrong palette. The mismatch between the server-rendered markup
    // (no theme class) and the post-script DOM is intentional and
    // confined to this attribute.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs synchronously in the document head — reads localStorage
            or prefers-color-scheme and applies the right `theme-*` class
            to <html> before any styled content paints. Belt-and-braces
            against the dreaded "flash of wrong theme". */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>
          <SmoothScrolling>{children}</SmoothScrolling>
        </ThemeProvider>
      </body>
    </html>
  )
}
