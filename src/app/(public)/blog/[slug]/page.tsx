import { permanentRedirect } from 'next/navigation'

// /blog/<slug> is now /journal/<slug>.
export default async function BlogPostRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  permanentRedirect(`/journal/${encodeURIComponent(slug)}`)
}
