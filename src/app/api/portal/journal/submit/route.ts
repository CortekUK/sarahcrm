// POST /api/portal/journal/submit
//
// A member submits an article for the Journal (Members' Editorial) from the
// app. It is saved as a blog_posts row with status 'pending_review',
// visibility 'members', strand 'members', author_type 'member' — nothing is
// public until Sarah approves it in /dashboard/website/journal.
//
// Auth: the session cookie must belong to an active, non-deleted member.
// The write then uses the service role (members have no INSERT on
// blog_posts). The body is plain text from the member; it is stored as
// Markdown and rendered to sanitized HTML here, and the admin re-renders
// on save anyway.
//
// Body: { title, excerpt?, body, hero_image_url?, website? /* honeypot */ }
// Returns: { ok: true, id } or { ok: false, error }

import DOMPurify from 'isomorphic-dompurify'
import { createClient } from '@/lib/supabase/server'
import { getAdmin } from '@/lib/marketing/admin'
import { deriveExcerpt, markdownToHtml, slugify } from '@/lib/marketing/blog-content'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_TITLE = 200
const MAX_EXCERPT = 600
const MAX_BODY = 20000
const MAX_PER_DAY = 5

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['h2', 'h3', 'h4', 'p', 'br', 'strong', 'em', 'code', 'a', 'ul', 'ol', 'li', 'blockquote', 'hr'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOW_DATA_ATTR: false,
  })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ ok: false, error: 'Please sign in.' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return Response.json({ ok: false, error: 'Invalid request.' }, { status: 400 })
  }
  if (str(body.website)) return Response.json({ ok: true, id: null })

  const title = str(body.title)
  const excerptIn = str(body.excerpt)
  const markdown = str(body.body)
  const heroIn = str(body.hero_image_url)

  if (!title || !markdown) {
    return Response.json({ ok: false, error: 'Please add a title and your article.' }, { status: 400 })
  }
  if (title.length > MAX_TITLE || excerptIn.length > MAX_EXCERPT || markdown.length > MAX_BODY) {
    return Response.json({ ok: false, error: 'The article is too long.' }, { status: 400 })
  }
  if (heroIn && !/^https:\/\//i.test(heroIn)) {
    return Response.json({ ok: false, error: 'The image link must start with https://' }, { status: 400 })
  }

  const admin = getAdmin()
  const [{ data: member }, { data: profile }] = await Promise.all([
    admin
      .from('members')
      .select('id, membership_status, deleted_at')
      .eq('profile_id', user.id)
      .maybeSingle(),
    admin.from('profiles').select('first_name, last_name').eq('id', user.id).maybeSingle(),
  ])
  if (!member || member.membership_status !== 'active' || member.deleted_at) {
    return Response.json(
      { ok: false, error: 'Article submissions are open to active The Club Members.' },
      { status: 403 },
    )
  }

  // Light rate limit: a handful of submissions a day per member.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await admin
    .from('blog_posts')
    .select('id', { count: 'exact', head: true })
    .eq('created_by', user.id)
    .eq('author_type', 'member')
    .gte('created_at', since)
  if ((count ?? 0) >= MAX_PER_DAY) {
    return Response.json(
      { ok: false, error: 'You have sent several articles today. Please try again tomorrow.' },
      { status: 429 },
    )
  }

  const authorName =
    `${(profile?.first_name as string | null) ?? ''} ${(profile?.last_name as string | null) ?? ''}`.trim() ||
    'A member of The Club'

  // Unique slug: base, base-2, … (falls back to a timestamp).
  const base = (slugify(title) || 'member-article').slice(0, 80).replace(/-+$/, '')
  const { data: taken } = await admin.from('blog_posts').select('slug').like('slug', `${base}%`)
  const takenSet = new Set(((taken ?? []) as { slug: string }[]).map((r) => r.slug))
  let slug = base
  for (let n = 2; takenSet.has(slug) && n < 1000; n++) slug = `${base}-${n}`
  if (takenSet.has(slug)) slug = `${base}-${Date.now()}`

  const { data: row, error } = await admin
    .from('blog_posts')
    .insert({
      slug,
      title,
      excerpt: excerptIn || deriveExcerpt(markdown) || null,
      body_markdown: markdown,
      body_html: sanitize(markdownToHtml(markdown)),
      hero_image_url: heroIn || null,
      status: 'pending_review',
      strand: 'members',
      visibility: 'members',
      author_type: 'member',
      author_name: authorName,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error || !row) {
    console.error('[portal/journal/submit] insert failed:', error?.message)
    return Response.json(
      { ok: false, error: 'We could not send your article just now. Please try again.' },
      { status: 500 },
    )
  }

  return Response.json({ ok: true, id: row.id })
}
