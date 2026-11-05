import { redirect } from 'next/navigation'

// "Website" is a menu group with no page of its own — open its first screen.
export default function Page() {
  redirect('/dashboard/website/memberships')
}
