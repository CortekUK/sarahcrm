import type { Metadata } from 'next'

// Metadata lives here because the page itself is a client component.
export const metadata: Metadata = {
  title: 'Apply for Membership | The Club by Sarah Restrick',
  description: "Apply to join The Club by Sarah Restrick — a private members' business community in Manchester, Leeds and London.",
  openGraph: {
    title: 'Apply for Membership | The Club by Sarah Restrick',
    description: "Apply to join The Club by Sarah Restrick — a private members' business community in Manchester, Leeds and London.",
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
