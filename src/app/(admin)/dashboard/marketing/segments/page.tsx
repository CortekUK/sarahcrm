import { redirect } from 'next/navigation'

// Segments now live as a tab on the Newsletter page (they're the recipient
// groups for newsletter campaigns).
export default function Page() {
  redirect('/dashboard/newsletter?tab=segments')
}
