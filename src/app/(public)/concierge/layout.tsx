import type { Metadata } from 'next'

const DESCRIPTION =
  'Private Concierge from The Club: event services, access, travel and retail and hospitality bookings, handled end to end.'

export const metadata: Metadata = {
  title: 'Private Concierge | The Club by Sarah Restrick',
  description: DESCRIPTION,
  alternates: { canonical: '/concierge' },
  openGraph: {
    title: 'Private Concierge | The Club by Sarah Restrick',
    description: DESCRIPTION,
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
