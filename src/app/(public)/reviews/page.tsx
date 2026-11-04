import { permanentRedirect } from 'next/navigation'

// /reviews was the old Testimonials page. It is now Success Stories.
export default function ReviewsRedirect() {
  permanentRedirect('/success-stories')
}
