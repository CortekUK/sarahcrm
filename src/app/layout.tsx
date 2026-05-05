import type { Metadata } from 'next'
import './globals.css'
import { SmoothScrolling } from '@/components/website/SmoothScrolling'

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
    <html lang="en">
      <body>
        <SmoothScrolling>{children}</SmoothScrolling>
      </body>
    </html>
  )
}
