// /api/admin/journal — admin writes for the website Journal (public.blog_posts).
//
//   POST   { ...fields }        create a post
//   PATCH  { id, ...fields }    update a post — any subset of fields, e.g.
//                               { id, status: 'published' } to approve a
//                               member submission or { id, status: 'unpublished' }
//   DELETE ?id=<uuid>           delete a post
//
// Why a server route rather than browser writes: the body is written in
// Markdown and converted to SANITIZED HTML here (markdownToHtml + the same
// DOMPurify allow-list as the marketing BlogPublisher), so nothing a member
// or admin types can inject markup into the public page.
//
// Status rules:
//   * becoming 'published' with no published_at → published_at = now()
//     (the admin may set a custom date, e.g. for press items);
//   * becoming 'unpublished' → unpublished_at = now();
//   * 'pending_review' = submitted by a member from the app, awaiting approval.
//
// Admin-only: requireAdmin() then service-role writes via getAdmin().

import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import DOMPurify from 'isomorphic-dompurify'
import { getAdmin, requireAdmin } from '@/lib/marketing/admin'
import { deriveExcerpt, markdownToHtml, slugify } from '@/lib/marketing/blog-content'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STRANDS = ['press', 'founders_letter', 'stories', 'members'] as const
const VISIBILITIES = ['public', 'members'] as const
const AUTHOR_TYPES = ['sarah', 'member', 'guest'] as const
const STATUSES = ['published', 'unpublished', 'pending_review'] as const

const LIMITS = {
  title: 200,
  slug: 120,
  excerpt: 600,
  body: 100_000,
  authorName: 120,
  outlet: 120,
  url: 1000,
  tags: 20,
  tag: 40,
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const MISSING_SCHEMA_HINT =
  'The Journal columns are not set up yet (apply migration 20261106_a_website_rebuild_schema.sql).'

// Same allow-list as sanitizeBlogHtml in src/lib/marketing/publish/blog.ts.
function sanitizeBlogHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['h2', 'h3', 'h4', 'p', 'br', 'strong', 'em', 'code', 'a', 'ul', 'ol', 'li', 'blockquote', 'hr'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOW_DATA_ATTR: false,
  })
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname
  } catch {
    return false
  }
}

function dbError(err: { code?: string; message?: string } | null, fallback: string): string {
  if (!err) return fallback
  const msg = err.message ?? ''
  if (err.code === '42703' || err.code === 'PGRST204' || /column .* does not exist|schema cache/i.test(msg)) {
    return MISSING_SCHEMA_HINT
  }
  if (err.code === '23514') return `The post was rejected by the database (${msg}). ${MISSING_SCHEMA_HINT}`
  return msg || fallback
}

function revalidateJournal(...slugs: (string | null | undefined)[]) {
  try {
    revalidatePath('/journal')
    for (const s of new Set(slugs.filter(Boolean) as string[])) revalidatePath(`/journal/${s}`)
  } catch (e) {
    console.warn('[admin/journal] revalidate skipped:', e)
  }
}

type Admin = ReturnType<typeof getAdmin>

// base, base-2, base-3 … — the first slug no OTHER post uses.
async function uniqueSlug(admin: Admin, base: string, ownId?: string): Promise<string> {
  let q = admin.from('blog_posts').select('slug').like('slug', `${base}%`)
  if (ownId) q = q.neq('id', ownId)
  const { data } = await q
  const taken = new Set(((data ?? []) as { slug: string }[]).map((r) => r.slug))
  if (!taken.has(base)) return base
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base}-${Date.now()}`
}

interface ExistingPost {
  id: string
  slug: string
  title: string
  excerpt: string | null
  body_markdown: string | null
  body_html: string
  hero_image_url: string | null
  event_id: string | null
  status: string
  published_at: string | null
  unpublished_at: string | null
  strand: string
  visibility: string
  author_name: string | null
  author_type: string
  outlet: string | null
  original_url: string | null
  tags: string[] | null
}

type Input = Record<string, unknown>

function has(input: Input, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key)
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function oneOf<T extends readonly string[]>(v: unknown, allowed: T, label: string): T[number] {
  const s = str(v)
  if (!(allowed as readonly string[]).includes(s)) {
    throw new ValidationError(`${label} must be one of: ${allowed.join(', ')}.`)
  }
  return s as T[number]
}

function maxLen(v: string, max: number, label: string): string {
  if (v.length > max) throw new ValidationError(`${label} must be at most ${max.toLocaleString('en-GB')} characters.`)
  return v
}

function optUrl(v: unknown, label: string): string | null {
  const s = str(v)
  if (!s) return null
  maxLen(s, LIMITS.url, label)
  if (!isHttpUrl(s)) throw new ValidationError(`${label} must be a full link starting with http:// or https://.`)
  return s
}

// "yyyy-MM-dd" or a full ISO timestamp → ISO string; '' / null → null.
function optDate(v: unknown, label: string): string | null {
  const s = str(v)
  if (!s) return null
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T09:00:00Z` : s)
  if (isNaN(d.getTime())) throw new ValidationError(`${label} is not a valid date.`)
  return d.toISOString()
}

function parseTags(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []
  const tags: string[] = []
  for (const t of raw) {
    const s = str(t)
    if (!s) continue
    maxLen(s, LIMITS.tag, 'Each tag')
    if (!tags.some((x) => x.toLowerCase() === s.toLowerCase())) tags.push(s)
  }
  if (tags.length > LIMITS.tags) throw new ValidationError(`Use at most ${LIMITS.tags} tags.`)
  return tags
}

class ValidationError extends Error {}

// Merge the request's fields over the existing row (if any), validate, and
// build the full column set to write.
async function buildRow(admin: Admin, input: Input, existing: ExistingPost | null) {
  const pick = <K extends keyof ExistingPost>(key: K, fallback: unknown): unknown =>
    has(input, key) ? input[key] : existing ? existing[key] : fallback

  const title = maxLen(str(pick('title', '')), LIMITS.title, 'Title')
  if (!title) throw new ValidationError('Title is required.')

  const strand = oneOf(pick('strand', 'stories'), STRANDS, 'Strand')
  let visibility = oneOf(pick('visibility', 'public'), VISIBILITIES, 'Visibility')
  if (strand === 'members') visibility = 'members' // Members' Editorial is never public.
  const author_type = oneOf(pick('author_type', 'sarah'), AUTHOR_TYPES, 'Author type')
  const status = oneOf(pick('status', 'unpublished'), STATUSES, 'Status')

  const author_name = maxLen(str(pick('author_name', '')), LIMITS.authorName, 'Author name') || null
  const outlet = maxLen(str(pick('outlet', '')), LIMITS.outlet, 'Outlet') || null
  const original_url = optUrl(pick('original_url', null), 'Link to the original')
  const hero_image_url = optUrl(pick('hero_image_url', null), 'Hero image')
  const tags = parseTags(pick('tags', []))

  const eventRaw = str(pick('event_id', ''))
  if (eventRaw && !UUID_RE.test(eventRaw)) throw new ValidationError('Related event is not valid.')
  const event_id = eventRaw || null

  // Body: re-render only when the Markdown is supplied; otherwise keep the
  // stored HTML (e.g. a status-only approve / unpublish).
  let body_markdown: string | null
  let body_html: string
  if (has(input, 'body_markdown') || !existing) {
    const md = maxLen(
      typeof input.body_markdown === 'string' ? input.body_markdown.replace(/\r\n?/g, '\n').trim() : '',
      LIMITS.body,
      'Body',
    )
    body_markdown = md || null
    body_html = md ? sanitizeBlogHtml(markdownToHtml(md)) : ''
  } else {
    body_markdown = existing.body_markdown
    body_html = existing.body_html ?? ''
  }

  let excerpt = maxLen(str(pick('excerpt', '')), LIMITS.excerpt, 'Excerpt')
  if (!excerpt && body_markdown) excerpt = deriveExcerpt(body_markdown)

  if (status === 'published' && !body_markdown && !excerpt) {
    throw new ValidationError('Add a body or an excerpt before publishing.')
  }

  // Slug: a hand-typed slug must be well-formed; otherwise derived from the title.
  const slugInput = str(pick('slug', ''))
  if (slugInput) {
    maxLen(slugInput, LIMITS.slug, 'Slug')
    if (!SLUG_RE.test(slugInput)) {
      throw new ValidationError('Slug: lowercase letters, numbers and single hyphens only.')
    }
  }
  const base = slugInput || slugify(title)
  const slug = existing && existing.slug === base ? base : await uniqueSlug(admin, base, existing?.id)

  // Dates.
  const now = new Date().toISOString()
  let published_at = optDate(pick('published_at', null), 'Published date')
  let unpublished_at = existing?.unpublished_at ?? null
  if (status === 'published') {
    if (!published_at) published_at = now
    unpublished_at = null
  } else if (status === 'unpublished' && existing?.status !== 'unpublished') {
    unpublished_at = now
  }

  return {
    slug,
    title,
    excerpt: excerpt || null,
    body_markdown,
    body_html,
    hero_image_url,
    event_id,
    status,
    published_at,
    unpublished_at,
    strand,
    visibility,
    author_name,
    author_type,
    outlet,
    original_url,
    tags,
  }
}

async function readJson(req: NextRequest): Promise<Input | null> {
  try {
    const body = await req.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Input) : null
  } catch {
    return null
  }
}

function fail(e: unknown) {
  if (e instanceof ValidationError) return Response.json({ error: e.message }, { status: 400 })
  console.error('[admin/journal] unhandled error:', e)
  return Response.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const input = await readJson(req)
  if (!input) return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  try {
    const admin = getAdmin()
    const row = await buildRow(admin, input, null)
    const { data, error } = await admin
      .from('blog_posts')
      .insert({ ...row, created_by: auth.profile.id })
      .select('id, slug, status')
      .single()
    if (error || !data) {
      return Response.json({ error: dbError(error, 'Could not save the post.') }, { status: 500 })
    }
    revalidateJournal(data.slug as string)
    return Response.json({ ok: true, post: data })
  } catch (e) {
    return fail(e)
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const input = await readJson(req)
  if (!input) return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  const id = str(input.id)
  if (!UUID_RE.test(id)) return Response.json({ error: 'id required' }, { status: 400 })
  try {
    const admin = getAdmin()
    const { data: existing, error: exErr } = await admin
      .from('blog_posts')
      .select(
        'id, slug, title, excerpt, body_markdown, body_html, hero_image_url, event_id, status, published_at, unpublished_at, strand, visibility, author_name, author_type, outlet, original_url, tags',
      )
      .eq('id', id)
      .maybeSingle()
    if (exErr) return Response.json({ error: dbError(exErr, 'Could not load the post.') }, { status: 500 })
    if (!existing) return Response.json({ error: 'Post not found.' }, { status: 404 })

    const row = await buildRow(admin, input, existing as ExistingPost)
    const { data, error } = await admin
      .from('blog_posts')
      .update(row)
      .eq('id', id)
      .select('id, slug, status')
      .single()
    if (error || !data) {
      return Response.json({ error: dbError(error, 'Could not save the post.') }, { status: 500 })
    }
    revalidateJournal(data.slug as string, (existing as ExistingPost).slug)
    return Response.json({ ok: true, post: data })
  } catch (e) {
    return fail(e)
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!UUID_RE.test(id)) return Response.json({ error: 'id required' }, { status: 400 })
  try {
    const admin = getAdmin()
    const { data, error } = await admin.from('blog_posts').delete().eq('id', id).select('slug').maybeSingle()
    if (error) return Response.json({ error: dbError(error, 'Could not delete the post.') }, { status: 500 })
    revalidateJournal((data?.slug as string | undefined) ?? null)
    return Response.json({ ok: true })
  } catch (e) {
    return fail(e)
  }
}
