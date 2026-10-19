// BlogPublisher — publishes an approved blog asset to the public website.
//
// Selected by ./index.ts for the blog channels (seo_blog, recap_blog). The
// client's order is: generate the draft (SEO-optimised, internal links, CTA —
// see the generate route's CHANNEL_BRIEFS) → a human reviews and clicks
// Approve → publish to the website → notify the marketing team. So this runs
// only from the asset route's approve action (the human gate is unchanged).
//
// publish(asset):
//   1. Markdown body → HTML (../blog-content.ts), sanitized with DOMPurify.
//   2. SEO meta description = the first paragraph, ~155 chars.
//   3. Hero image = the asset's graphic_url, else the linked event's cover.
//   4. Upsert public.blog_posts on marketing_asset_id (one post per asset):
//      a re-approve after an unpublish re-uses the same row AND slug, and
//      keeps the original published_at. New posts get a unique slug.
//   5. Revalidate /blog + /blog/<slug> so the post appears straight away.
//   6. Notify the marketing team IN-APP (an unassigned task + an
//      admin_notifications row — ../notify.ts). No email.
//
// unpublishBlogPost(assetId) takes a post down (status='unpublished'); the
// asset route's 'unpublish' action calls it.
//
// Writes use the service role (getAdmin) — the asset route has already run
// requireAdmin(). Never throws: failures resolve as { ok: false, error }.

import DOMPurify from 'isomorphic-dompurify'
import { revalidatePath } from 'next/cache'
import { getAdmin } from '@/lib/marketing/admin'
import { isBlogChannel } from '@/lib/marketing/channels'
import { deriveExcerpt, markdownToHtml, slugify } from '@/lib/marketing/blog-content'
import { notifyMarketingTeamInApp } from '@/lib/marketing/notify'
import type { Publisher, PublishableAsset, PublishResult } from './types'

const MISSING_TABLE_HINT =
  'The website blog table is not set up yet (apply migration 20261016_marketing_facebook_blog_posts.sql).'

// Tags the body may keep on the public page.
function sanitizeBlogHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['h2', 'h3', 'h4', 'p', 'br', 'strong', 'em', 'code', 'a', 'ul', 'ol', 'li', 'blockquote', 'hr'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOW_DATA_ATTR: false,
  })
}

// Postgres "relation does not exist" — the migration hasn't been applied.
function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  const msg = err.message ?? ''
  return err.code === '42P01' || err.code === 'PGRST205' || (/blog_posts/.test(msg) && /does not exist|schema cache/i.test(msg))
}

function revalidateBlog(slug: string) {
  try {
    revalidatePath('/blog')
    revalidatePath(`/blog/${slug}`)
  } catch (e) {
    // Outside a request context (e.g. a script) there is nothing to revalidate.
    console.warn('[marketing/publish] blog revalidate skipped:', e)
  }
}

// base, base-2, base-3 … — the first slug no other post uses.
async function uniqueSlug(admin: ReturnType<typeof getAdmin>, base: string): Promise<string> {
  const { data } = await admin.from('blog_posts').select('slug').like('slug', `${base}%`)
  const taken = new Set(((data ?? []) as { slug: string }[]).map((r) => r.slug))
  if (!taken.has(base)) return base
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base}-${Date.now()}`
}

export class BlogPublisher implements Publisher {
  readonly name = 'website_blog'

  async publish(asset: PublishableAsset): Promise<PublishResult> {
    if (!isBlogChannel(asset.channel)) {
      return { ok: false, error: `Channel "${asset.channel}" is not published to the website blog.` }
    }
    const title = (asset.title ?? '').trim()
    const markdown = (asset.body ?? '').trim()
    if (!title) return { ok: false, error: 'This blog post has no title — add one before approving.' }
    if (!markdown) return { ok: false, error: 'This blog post has no body — add the article before approving.' }

    try {
      const admin = getAdmin()

      const { data: existing, error: exErr } = await admin
        .from('blog_posts')
        .select('id, slug, published_at')
        .eq('marketing_asset_id', asset.id)
        .maybeSingle()
      if (exErr) {
        return { ok: false, error: isMissingTable(exErr) ? MISSING_TABLE_HINT : exErr.message }
      }

      // Hero: the asset's own image, else the linked event's cover.
      let hero = (asset.graphic_url ?? '').trim() || null
      if (!hero && asset.event_id) {
        const { data: ev } = await admin
          .from('events')
          .select('cover_image_url')
          .eq('id', asset.event_id)
          .maybeSingle()
        hero = (ev?.cover_image_url as string | null) ?? null
      }

      const slug = (existing?.slug as string | undefined) ?? (await uniqueSlug(admin, slugify(title)))
      const now = new Date().toISOString()
      const publishedAt = (existing?.published_at as string | null | undefined) ?? now

      const { data: post, error: upErr } = await admin
        .from('blog_posts')
        .upsert(
          {
            marketing_asset_id: asset.id,
            slug,
            title,
            excerpt: deriveExcerpt(markdown) || null,
            body_html: sanitizeBlogHtml(markdownToHtml(markdown)),
            body_markdown: markdown,
            hero_image_url: hero,
            event_id: asset.event_id ?? null,
            source_channel: asset.channel,
            status: 'published',
            published_at: publishedAt,
            unpublished_at: null,
          },
          { onConflict: 'marketing_asset_id' },
        )
        .select('id, slug, published_at')
        .single()
      if (upErr || !post) {
        return {
          ok: false,
          error: isMissingTable(upErr) ? MISSING_TABLE_HINT : (upErr?.message ?? 'Could not save the blog post.'),
        }
      }

      revalidateBlog(slug)

      const path = `/blog/${slug}`
      const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
      await notifyMarketingTeamInApp(admin, {
        kind: 'marketing_blog_published',
        link: path,
        title: `Blog post live on the website: ${title}`,
        description: `“${title}” was approved and is now published on the website at ${siteUrl}${path}. Please review it there. To take it down, open the campaign under Dashboard → Marketing and click “Unpublish” on the blog card.`,
        eventId: asset.event_id ?? null,
      })

      console.log('[marketing/publish] blog post published', {
        assetId: asset.id,
        blogPostId: post.id,
        slug,
      })
      return {
        ok: true,
        externalId: post.id as string,
        target: {
          platform: 'website',
          blog_post_id: post.id,
          slug,
          url: path,
          hero_image_url: hero,
          published_at: post.published_at,
        },
      }
    } catch (e) {
      console.error('[marketing/publish] blog publish failed:', e)
      return { ok: false, error: e instanceof Error ? e.message : 'Blog publish failed' }
    }
  }
}

// Take an asset's public post down. The row is kept (status='unpublished') so
// approving the asset again re-publishes it at the same URL.
export async function unpublishBlogPost(
  assetId: string,
): Promise<{ ok: true; slug: string; unpublishedAt: string } | { ok: false; error: string }> {
  try {
    const admin = getAdmin()
    const unpublishedAt = new Date().toISOString()
    const { data, error } = await admin
      .from('blog_posts')
      .update({ status: 'unpublished', unpublished_at: unpublishedAt })
      .eq('marketing_asset_id', assetId)
      .select('slug')
      .maybeSingle()
    if (error) return { ok: false, error: isMissingTable(error) ? MISSING_TABLE_HINT : error.message }
    if (!data) return { ok: false, error: 'No website blog post exists for this asset.' }
    revalidateBlog(data.slug as string)
    return { ok: true, slug: data.slug as string, unpublishedAt }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unpublish failed' }
  }
}
