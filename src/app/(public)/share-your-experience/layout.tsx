import type { Metadata } from 'next'

// Metadata lives here because the page itself is a client component.
export const metadata: Metadata = {
  title: 'Share Your Experience | The Club by Sarah Restrick',
  description: 'Tell us about your evening with The Club — every review is read by the team.',
  openGraph: {
    title: 'Share Your Experience | The Club by Sarah Restrick',
    description: 'Tell us about your evening with The Club — every review is read by the team.',
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
