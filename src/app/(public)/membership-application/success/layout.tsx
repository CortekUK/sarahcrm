import type { Metadata } from 'next'

// Metadata lives here because the page itself is a client component.
export const metadata: Metadata = {
  title: 'Application Received | The Club by Sarah Restrick',
  description: 'Your membership application to The Club has been received.',
  robots: { index: false, follow: false },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
