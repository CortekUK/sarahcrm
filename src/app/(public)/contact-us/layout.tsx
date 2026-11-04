import type { Metadata } from 'next'

// Metadata lives here because the page itself is a client component.
export const metadata: Metadata = {
  title: 'Contact Us | The Club by Sarah Restrick',
  description: 'Contact The Club by Sarah Restrick: membership@theclubgroup.co, events@theclubgroup.co, sarah@theclubgroup.co or +44 (0)7921 507 442. Membership, events, sponsorship and press enquiries.',
  openGraph: {
    title: 'Contact Us | The Club by Sarah Restrick',
    description: 'Contact The Club by Sarah Restrick: membership@theclubgroup.co, events@theclubgroup.co, sarah@theclubgroup.co or +44 (0)7921 507 442. Membership, events, sponsorship and press enquiries.',
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
