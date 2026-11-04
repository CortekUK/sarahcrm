import { permanentRedirect } from 'next/navigation'

// /blog is now The Journal.
export default function BlogRedirect() {
  permanentRedirect('/journal')
}
