// Blog content helpers for website publishing (BlogPublisher).
//
// Pure functions, no server-only imports: the generated seo_blog / recap_blog
// bodies are Markdown (see the CHANNEL_BRIEFS in the generate route), so on
// approval we turn them into HTML for the public /blog page, derive the SEO
// meta description and build a URL slug.
//
// The Markdown converter deliberately supports only the subset the generator
// writes — headings, paragraphs, bold/italic, inline code, links, bullet and
// numbered lists, blockquotes and rules. Raw HTML in the source is ESCAPED,
// never passed through. The output is still run through DOMPurify by the
// publisher before it is stored (defence in depth).

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Only site-relative, http(s), mailto and in-page links survive.
function safeHref(raw: string): string | null {
  const url = raw.trim()
  if (/^(\/(?!\/)|#|https?:\/\/|mailto:)/i.test(url)) return url
  return null
}

// Inline Markdown on ONE escaped line of text.
function renderInline(text: string): string {
  let out = escapeHtml(text)
  // Inline code first so its contents aren't formatted.
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
  // [label](url) — external links open in a new tab.
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => {
    const safe = safeHref(href.replace(/&amp;/g, '&'))
    if (!safe) return label
    const external = /^https?:\/\//i.test(safe)
    return `<a href="${escapeHtml(safe)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`
  })
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>')
  out = out.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
  out = out.replace(/(^|[^\w_])_([^_\s][^_]*)_(?!\w)/g, '$1<em>$2</em>')
  return out
}

// Markdown → HTML (subset, see header). Headings are shifted so the post
// title stays the page's only <h1>: "#"/"##" → h2, "###" → h3, deeper → h4.
export function markdownToHtml(markdown: string | null | undefined): string {
  const lines = (markdown ?? '').replace(/\r\n?/g, '\n').split('\n')
  const html: string[] = []
  let paragraph: string[] = []
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null
  let quote: string[] = []

  const flushParagraph = () => {
    if (paragraph.length) html.push(`<p>${renderInline(paragraph.join(' '))}</p>`)
    paragraph = []
  }
  const flushList = () => {
    if (list) {
      html.push(`<${list.type}>${list.items.map((i) => `<li>${renderInline(i)}</li>`).join('')}</${list.type}>`)
    }
    list = null
  }
  const flushQuote = () => {
    if (quote.length) html.push(`<blockquote><p>${renderInline(quote.join(' '))}</p></blockquote>`)
    quote = []
  }
  const flushAll = () => {
    flushParagraph()
    flushList()
    flushQuote()
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      flushAll()
      continue
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      flushAll()
      const level = heading[1].length <= 2 ? 2 : heading[1].length === 3 ? 3 : 4
      html.push(`<h${level}>${renderInline(heading[2].replace(/\s+#+\s*$/, ''))}</h${level}>`)
      continue
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flushAll()
      html.push('<hr>')
      continue
    }
    const quoteLine = /^>\s?(.*)$/.exec(line)
    if (quoteLine) {
      flushParagraph()
      flushList()
      quote.push(quoteLine[1])
      continue
    }
    const bullet = /^[-*+]\s+(.*)$/.exec(line)
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line)
    if (bullet || numbered) {
      flushParagraph()
      flushQuote()
      const type = bullet ? 'ul' : 'ol'
      if (list && list.type !== type) flushList()
      if (!list) list = { type, items: [] }
      list.items.push((bullet ?? numbered)![1])
      continue
    }
    // Plain text: continues an open quote, else closes any list and
    // starts/extends a paragraph.
    if (quote.length) {
      quote.push(line)
      continue
    }
    flushList()
    paragraph.push(line)
  }
  flushAll()
  return html.join('\n')
}

// Markdown → plain text (for meta descriptions / teasers).
export function markdownToPlainText(markdown: string | null | undefined): string {
  return (markdown ?? '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
    .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

// SEO meta description: the first real paragraph (not a heading/list/quote),
// cut at a word boundary to ~155 characters.
export function deriveExcerpt(markdown: string | null | undefined, max = 155): string {
  const blocks = (markdown ?? '').replace(/\r\n?/g, '\n').split(/\n{2,}/)
  const first =
    blocks.find((b) => {
      const t = b.trim()
      return t && !/^(#{1,6}\s|>|[-*+]\s|\d+[.)]\s|-{3,}|\*{3,})/.test(t)
    }) ?? blocks.find((b) => b.trim()) ?? ''
  const text = markdownToPlainText(first)
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.–—-]+$/, '')}…`
}

// URL slug from a title: ASCII, lowercase, hyphenated, max 80 chars.
export function slugify(title: string | null | undefined): string {
  const slug = (title ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
  return slug || 'post'
}
