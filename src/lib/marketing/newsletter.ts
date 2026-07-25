// Newsletter channel → branded email designer bridge (Module 2).
//
// Unlike the text channels, the newsletter isn't stored as plain copy. It is
// generated as REAL email blocks (reusing the email builder's ai-schema), then
// materialised into an `email_templates` row (category='campaign', is_draft)
// so the admin can finish, approve and send it in the EXISTING branded email
// designer. Nothing sends here — the human finishes in the designer (Module 4
// wires the segmented send). This module only produces the draft template.

import type OpenAI from 'openai'
import {
  aiTemplateResponseSchema,
  expandAiBlocks,
  openAiJsonSchema,
  AI_FONT_OPTIONS,
  resolveAiFont,
} from '@/lib/templates/ai-schema'
import { renderBlocksToHTML } from '@/lib/templates/render-html'
import type { TemplateTheme } from '@/lib/templates/editor-types'

export interface NewsletterDraft {
  name: string
  subject: string
  preheader: string
  bodyHtml: string
  // The editor's block tree (EditorBlock[]) — stored as email_templates.body_json.
  bodyJson: unknown
  theme: TemplateTheme | null
  // Short readable plain-text digest for the approval-queue preview.
  textSummary: string
}

const NEWSLETTER_SYSTEM_PROMPT = `You are the newsletter writer for The Club by Sarah Restrick — a private membership community curated by Sarah Restrick. Members are exceptional individuals who attend curated luxury events, receive bespoke introductions, and stay connected through a warm, considered communications practice.

You turn the supplied source material into ONE polished, on-brand HTML newsletter, expressed as a structured block tree that renders in The Club's branded email designer.

Every response MUST use the JSON schema. For a newsletter you ALWAYS build a template, so:
- \`intent\`: "create" (always).
- \`reply\`: one short friendly sentence describing what you built.
- \`name\`: a short internal label for the template.
- \`subject\`: a warm, specific email subject line (no clickbait, no emoji spam).
- \`preheader\`: a one-line preview (<= 120 chars).
- \`blocks\`: the newsletter body as an ordered array of blocks.
- \`theme\`: null (use the brand defaults — do NOT recolour the chrome).
- \`event_picks\`: null.

# Brand voice
- Warm, considered, intimate — a private community, not a corporate mailing list.
- British English spelling. Short, elegant paragraphs. Specific over flowery.
- Sarah signs off "Warm regards," — never "Cheers" / "Best".
- Personalise near the top: open with a greeting text block "Dear {{first_name|there}},".
- Refer naturally to the three core member experiences where relevant: curated luxury events, bespoke member introductions, and a warm communications practice.
- NEVER invent facts, dates, names, statistics or quotes not present in the source — write around missing detail gracefully.

# Available block types (fill only the semantic fields; styling defaults are applied server-side)
- **heading** — section heading (level 1-3, default 2). Lead with one that names the newsletter's subject. Suggested colours: "#2C2825" default, "#B8975A" gold for celebration/welcome, "#5B7B6A" sage for reflective/introductions, "#C4694A" for reminders.
- **text** — paragraph copy. \`html\` accepts p, br, strong, em, u, a (href), ul, ol, li, span. Use merge tags like {{first_name|there}} freely.
- **button** — a single primary CTA. Only include one if there's a natural action.
- **divider** / **spacer** — section separators / whitespace.
- **image** — ONLY emit when the source provides a real image URL (e.g. an event cover image given to you). NEVER invent an image URL or use a placeholder.
- **sarah_signature** — The Club's signature block. Place it ONCE at the very END. It bakes in the brand line + confidentiality; do not write a manual "Warm regards, Sarah" text block.

# Structure
heading (subject) → greeting text ("Dear {{first_name|there}},") → 2-5 short body paragraphs (weave the source material in) → optional single button → optional closing line → sarah_signature at the end.

# Fonts
If you set any font, use ONLY one of these named email-safe fonts (exact name): ${AI_FONT_OPTIONS}. Otherwise leave font null to inherit the brand default.`

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>(?=)/gi, '\n')
    .replace(/<\/(p|div|li|h[1-3])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// A short readable plain-text digest of the newsletter for the queue preview.
function buildTextSummary(
  subject: string,
  preheader: string,
  blocks: ReturnType<typeof expandAiBlocks>,
): string {
  const lines: string[] = []
  lines.push(`Subject: ${subject}`)
  if (preheader) lines.push(`Preheader: ${preheader}`)
  lines.push('')
  for (const block of blocks) {
    const c = block.content as Record<string, unknown>
    // Headings are expanded into text blocks (with a bold span), so both land here.
    if (block.type === 'text' && typeof c.html === 'string') {
      const t = stripHtml(c.html)
      if (t) lines.push(t)
    } else if (block.type === 'button' && typeof c.text === 'string') {
      lines.push(`[Button: ${c.text}]`)
    }
    if (lines.join('\n').length > 900) break
  }
  const out = lines.join('\n').trim()
  return out.length > 1000 ? out.slice(0, 1000) + '…' : out
}

// Generate a newsletter draft from the campaign source material. Throws on any
// hard failure (empty response, refusal, invalid JSON/schema) — the caller
// (the generate route) turns those into HTTP responses.
export async function generateNewsletterDraft(args: {
  openai: OpenAI
  model: string
  campaignTitle: string
  sourceContext: string
}): Promise<NewsletterDraft> {
  const { openai, model, campaignTitle, sourceContext } = args

  const userMessage = `Campaign: "${campaignTitle}"

${sourceContext}

Build ONE branded newsletter for The Club from this source material.`

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: NEWSLETTER_SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    response_format: { type: 'json_schema', json_schema: openAiJsonSchema },
    temperature: 0.5,
  })

  const choice = response.choices[0]
  if (choice?.message?.refusal) {
    throw new Error(`AI refused: ${choice.message.refusal}`)
  }
  const raw = choice?.message?.content
  if (!raw) throw new Error('OpenAI returned an empty newsletter response.')

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('OpenAI returned invalid JSON for the newsletter.')
  }
  const validation = aiTemplateResponseSchema.safeParse(parsed)
  if (!validation.success) {
    throw new Error('AI returned a newsletter that did not match the expected schema.')
  }

  const data = validation.data
  const blocks = expandAiBlocks(data.blocks)

  // Map the AI theme (friendly font names → real stacks); default to brand chrome.
  let theme: TemplateTheme | null = null
  if (data.theme) {
    const t: TemplateTheme = {}
    if (data.theme.headerBgColor) t.headerBgColor = data.theme.headerBgColor
    if (data.theme.headerTextColor) t.headerTextColor = data.theme.headerTextColor
    if (data.theme.footerBgColor) t.footerBgColor = data.theme.footerBgColor
    if (data.theme.footerTextColor) t.footerTextColor = data.theme.footerTextColor
    if (data.theme.footerLinkColor) t.footerLinkColor = data.theme.footerLinkColor
    if (data.theme.pageBgColor) t.pageBgColor = data.theme.pageBgColor
    if (data.theme.bodyBgColor) t.bodyBgColor = data.theme.bodyBgColor
    if (data.theme.fontFamily) {
      const f = resolveAiFont(data.theme.fontFamily)
      if (f) t.fontFamily = f
    }
    if (Object.keys(t).length > 0) theme = t
  }

  const bodyHtml = renderBlocksToHTML(blocks, theme)
  const preheader = data.preheader ?? ''

  return {
    name: data.name || campaignTitle,
    subject: data.subject,
    preheader,
    bodyHtml,
    bodyJson: blocks,
    theme,
    textSummary: buildTextSummary(data.subject, preheader, blocks),
  }
}
