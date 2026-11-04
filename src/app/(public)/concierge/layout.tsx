import type { Metadata } from 'next'

// Metadata lives here because the page itself is a client component.
export const metadata: Metadata = {
  title: 'Concierge | The Club by Sarah Restrick',
  description: "The Club's concierge service — tell us what you need and the team will arrange it personally.",
  openGraph: {
    title: 'Concierge | The Club by Sarah Restrick',
    description: "The Club's concierge service — tell us what you need and the team will arrange it personally.",
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
