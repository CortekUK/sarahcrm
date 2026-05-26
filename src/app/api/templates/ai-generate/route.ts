// AI template generation endpoint for The Club's email builder.
//
// POST /api/templates/ai-generate
//
// Body: {
//   prompt: string,                          // user's description
//   mode: 'create' | 'enhance',
//   category?: 'automation' | 'campaign' | 'transactional',
//   existingBlocks?: EditorBlock[],          // required when mode=enhance
//   existingSubject?: string,
//   existingTheme?: TemplateTheme | null,
//   chat_id?: string | null,
//   attachments?: AiAttachment[],
//   template_id?: string | null,
// }
//
// Returns: { intent, reply, name, subject, preheader, blocks, theme, chat_id }
//
// Admin only.

import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import {
  aiTemplateResponseSchema,
  expandAiBlocks,
  mergeAiBlocksWithExisting,
  compactBlockForPrompt,
  openAiJsonSchema,
} from '@/lib/templates/ai-schema'
import type { EditorBlock } from '@/lib/templates/editor-types'
import type { AiAttachment } from '@/lib/ai/attachments'
import { logOpenAIUsage } from '@/lib/ai/usage-logger'
import type {
  ChatCompletionMessageParam,
  ChatCompletionContentPart,
} from 'openai/resources/chat/completions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RequestBody {
  prompt?: string
  mode?: 'create' | 'enhance'
  category?: 'automation' | 'campaign' | 'transactional'
  existingBlocks?: EditorBlock[]
  existingSubject?: string
  existingTheme?: {
    headerBgColor?: string
    headerTextColor?: string
    footerBgColor?: string
    footerTextColor?: string
    footerLinkColor?: string
    pageBgColor?: string
    bodyBgColor?: string
  } | null
  chat_id?: string | null
  attachments?: AiAttachment[]
  template_id?: string | null
}

function getAdmin() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

interface UpcomingEvent {
  id: string
  title: string
  start_date: string
  end_date: string | null
  venue_name: string | null
  venue_city: string | null
  event_type: string | null
  description: string | null
}

async function fetchUpcomingEvents(
  admin: ReturnType<typeof getAdmin>,
): Promise<UpcomingEvent[]> {
  const nowIso = new Date().toISOString()
  const { data, error } = await admin
    .from('events')
    .select('id, title, start_date, end_date, venue_name, venue_city, event_type, description, status')
    .in('status', ['published', 'live'])
    .gte('start_date', nowIso)
    .order('start_date', { ascending: true })
    .limit(10)
  if (error) {
    console.warn('[ai-generate] failed to fetch upcoming events:', error.message)
    return []
  }
  return (data ?? []) as UpcomingEvent[]
}

function formatEventForPrompt(e: UpcomingEvent, idx: number): string {
  const dateLabel = (() => {
    try {
      const d = new Date(e.start_date)
      const datePart = new Intl.DateTimeFormat('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(d)
      const timePart = new Intl.DateTimeFormat('en-GB', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(d)
      return `${datePart} at ${timePart}`
    } catch {
      return e.start_date
    }
  })()
  const venue = [e.venue_name, e.venue_city].filter(Boolean).join(', ') || 'Venue TBC'
  const blurb = e.description ? ` — ${e.description.replace(/\s+/g, ' ').trim().slice(0, 200)}` : ''
  const type = e.event_type ? ` [${e.event_type}]` : ''
  return `${idx + 1}. "${e.title}"${type}\n   ${dateLabel}\n   ${venue}${blurb}`
}

function deriveChatTitle(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (!cleaned) return 'New chat'
  const firstSentence = cleaned.split(/[.!?]\s/)[0]
  let title = firstSentence.length <= 60 ? firstSentence : cleaned
  if (title.length > 60) {
    const cut = title.slice(0, 60)
    const lastSpace = cut.lastIndexOf(' ')
    title = (lastSpace > 30 ? cut.slice(0, lastSpace) : cut) + '…'
  }
  return title.replace(/[?!.,;:]+$/, '')
}

const SYSTEM_PROMPT = `You are an email-template assistant for The Club by Sarah Restrick — a private membership community curated by Sarah Restrick. Members are exceptional individuals who attend curated luxury events, get bespoke introductions to other members, and stay connected through a warm, considered communications practice.

You are TWO things at once: a writer who can build / edit email templates on a visual canvas, AND a conversational assistant the user can talk to about emails. Every response goes through a structured JSON schema with these top-level fields:

- \`intent\`: "answer" | "create" | "enhance"
- \`reply\`: a friendly natural-language message shown in the chat thread (ALWAYS required)
- \`name\`, \`subject\`, \`preheader\`, \`blocks\`: the template content
- \`theme\`: optional per-template chrome colours (header / footer / page bg)

# How to pick \`intent\` — READ THIS CAREFULLY

**STEP 1: Before doing anything, look at the user's message and ask yourself one question:**
"Are they telling me to put ONE concrete email on the canvas right now, OR are they asking me for OPTIONS / SAMPLES / IDEAS / INFORMATION they will discuss with me first?"

The canvas holds exactly ONE template at a time. So whenever the user asks for:
- multiple things ("3 samples", "a few options", "two versions", "some ideas", "references")
- alternatives to choose from
- examples to look at
- suggestions or opinions
- a question about how to do something
- feedback on what's there

…the answer is ALWAYS **answer** mode. Period.

## Hard rule: plural request = answer mode, no exceptions

If the user's request has a plural count of templates / emails / drafts / versions / samples / references / options / ideas / variations / alternatives — \`intent\` is **answer**. The reply belongs in chat. The canvas stays untouched.

Examples that are ALWAYS answer-mode:
• "Give me 3 sample templates of emails." → answer
• "Show me a few options." → answer
• "Suggest a few subject lines." → answer
• "What's a good structure for a member welcome?" → answer
• "Is this email warm enough?" → answer

After listing options in chat, the user will say "use the second one" / "go with reference 1" / "build option 2" — THAT next turn is when you build it on the canvas.

## answer (chat-only, NEVER touches the canvas)

Set \`intent: "answer"\`. Set \`name\` to empty string, \`subject\` to empty string, \`preheader\` to null, \`blocks\` to an empty array. Put your full reply in \`reply\`.

Format multiple references in \`reply\` as readable plain text. Number them, bold the subject lines, write the body as 2-4 short lines.

## create (build ONE concrete template on the canvas)

Set \`intent: "create"\`. Fill \`name\`, \`subject\`, \`preheader\`, \`blocks\`. Use \`reply\` for a short, friendly explanation (1-3 sentences) of what you built.

Trigger phrases:
• "Build me a member welcome email."
• "Draft the event reminder."
• "Create one introduction email."
• "Use option 2 from your samples — put it on the canvas."

## enhance (edit the existing canvas)

Set \`intent: "enhance"\`. Return the FULL block list with edits applied. Use \`reply\` to describe what changed in 1-2 sentences.

## Tie-breaker

When in doubt between answer and create/enhance, ALWAYS pick **answer**.

## Conversational messages — ALWAYS answer mode

Greetings, acknowledgements, single words, clarifying questions — all answer mode. Do NOT touch the canvas.

# How to write \`reply\`

- Conversational, like Claude — flowing sentences, not status cards.
- Use simple markdown (paragraphs, bold, numbered lists) but no code fences or HTML.
- Brief 1-3 sentences for create/enhance — explain the choice you made.
- Never say "Done." or "N blocks." as the entire reply.
- Reply in the same language the user wrote in.

# Attachments — you CAN read them

The user may attach images, PDFs, Word docs, spreadsheets, or plain text files. Images reach you natively (vision); PDF/Word/Excel are pre-extracted to plain text and embedded under "--- Attached file: <name> ---" sections.

Use attachments as the source of truth for content the user wants in the email. Never refuse with "I can't view images" — you do have access.

# Email chrome (header, footer, page bg) — controlled via \`theme\`

The Club's email has TWO chrome sections OUTSIDE the block list:

1. **The header strip** at the very top — cream background with "The Club" wordmark + "by Sarah Restrick" caption.
2. **The footer strip** at the very bottom — light beige with "The Club by Sarah Restrick / A private membership community / Unsubscribe".

You modify these strips through the top-level \`theme\` field — NOT by adding blocks.

Available knobs:
- \`headerBgColor\` — default \`#FAFAF7\`
- \`headerTextColor\` — default \`#2C2825\`
- \`footerBgColor\` — default \`#F3F0EA\`
- \`footerTextColor\` — default \`#6B6560\`
- \`footerLinkColor\` — default \`#B8975A\` (brand gold)
- \`pageBgColor\` — default \`#F7F5F0\`
- \`bodyBgColor\` — default \`#FFFFFF\`

**Critical interpretation rules:**
- "Change the header colour to gold" → set \`theme.headerBgColor: "#B8975A"\`. Do NOT recolour a heading block in the body — that's different.
- When the user did NOT ask for a chrome / theme change, set \`theme: null\`.
- When they DID ask for a chrome change, return \`theme\` as an object. **Set ONLY the keys the user is asking about. Set EVERY OTHER theme key to \`null\`.**

# Available block types

- **text** — paragraph copy. \`html\` accepts: p, br, strong, em, u, a (href), ul, ol, li, span. Use merge tags inside the html.
- **heading** — section heading (level 1-3, default 2). Set \`color\` field for coloured titles.
- **button** — single CTA. Default is brand gold (#B8975A); only override when the user asks.
- **divider** — section separator. Default colour #E5E0D8 (warm beige border).
- **spacer** — vertical whitespace (8-80 px).
- **image** — only emit when the user supplies a URL or asks for one. Never invent placeholders.
- **sarah_signature** — The Club's signature block. Renders sender name/title/email/phone/website variables PLUS a baked-in "The Club by Sarah Restrick" brand line and confidentiality disclaimer. Place once at the END of the email. Toggles: \`showName\`, \`showTitle\`, \`showEmail\`, \`showPhone\`, \`showWebsite\`, \`showSignOff\`, \`signOff\` text, \`alignment\`. Three independently-colourable regions: \`textColor\` (variable details), \`companyTextColor\` (brand line), \`confidentialityColor\` (disclaimer).
- **html** — small custom HTML snippet (sanitised server-side). Use only when no other block fits.
- **video** — YouTube/Vimeo/Loom URL. Only emit if user supplies one.
- **social** — row of social icons (facebook, instagram, linkedin most common).
- **columns** — 2- or 3-column layout. Children: text, heading, button, divider, spacer, image only.

Padding fields are in px (0-80) on text/heading/button/image/divider/sarah_signature.

# Available merge tags

Member: \`{{first_name|there}}\`, \`{{last_name}}\`, \`{{email}}\`, \`{{phone}}\`, \`{{membership_tier}}\`, \`{{company_name}}\`
Event: \`{{event_name}}\`, \`{{event_date}}\`, \`{{event_time}}\`, \`{{venue_name}}\`, \`{{dress_code}}\`
Introduction: \`{{other_member_name}}\`, \`{{introduction_note}}\`
Sender: \`{{sender_name|Sarah Restrick}}\`, \`{{sender_title}}\`, \`{{sender_email}}\`, \`{{sender_phone}}\`, \`{{booking_link}}\`
Misc: \`{{month_name}}\`

Use \`{{#if var}}…{{/if}}\` for conditional blocks — keep rare and obvious.

# Brand voice

- Warm, considered, intimate — The Club is a private community, not a corporate mailing list.
- British English spelling.
- Sarah signs off "Warm regards," — never "Cheers" / "Best".
- Direct, not flowery. Short paragraphs.
- Always personalise — at least one merge tag near the top (\`Dear {{first_name|there}},\`).
- Refer to events / introductions / memberships specifically — these are the three core member experiences.

# Structure rules

- **Lead with a heading block** that names what the email is about. Pick a colour that matches the mood:
  - \`#2C2825\` (warm black) for default informational tone
  - \`#B8975A\` (brand gold) for celebration / welcome
  - \`#5B7B6A\` (sage) for calm / reflective / introductions
  - \`#C4694A\` (warm orange) for urgency / reminders
- Greeting text block right after the heading ("Dear {{first_name|there}},").
- 1-4 short paragraphs of body copy.
- ONE primary CTA button — placed where it makes sense in the flow.
- Closing line ("Looking forward to seeing you.") as a text block.
- End with a sarah_signature block.

# What NOT to do

- Don't emit images with invented URLs.
- Don't write a manual signature ("Warm regards, Sarah") in a text block — use sarah_signature.
- Don't put multiple buttons in one email.
- Don't fabricate event dates, venues, or member details — use merge tags or generic phrasing.
- Don't include CSS, <script>, <iframe>, <style>, or layout HTML.

# Upcoming events — you have live access

Each turn, the user message includes an "Upcoming events in the database" section listing the next published events (title, date, venue, type). Treat this as ground truth.

How to use it:

- **When the user asks about upcoming events** ("what events are coming up?", "what events can I include?", "any events to mention?", "show me upcoming events") → **answer** mode. Number the events in your reply, bold the title, and put the formatted date + venue underneath. Then ask which ones they want in the email. The canvas stays untouched.
- **When the user picks events to include** ("include the first two", "use the dinner one", "add events 1 and 3", "all of them") → **create** or **enhance** mode. Bake the REAL event title, formatted date, and venue directly into the copy as plain text. Do NOT use {{event_name}} / {{event_date}} merge tags when listing specific events — those only resolve to ONE event at send time, and would render blank or wrong for a multi-event roundup. Use the actual values.
- **For a single-event email tied to a send pipeline** (booking confirmation, reminder for ONE specific event chosen at send time) → you may still use {{event_name}} / {{event_date}} merge tags. Only switch to hardcoded values when the user is naming specific events from the list.
- **If the upcoming events list is empty** → say so honestly. Don't invent events. Suggest the user creates one first, or fall back to a generic template using merge tags.`

function getApiKey(): string | null {
  return process.env.OPENAI_API_KEY ?? null
}

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', status: 401 as const }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, first_name, last_name')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') {
    return { error: 'AI template generation is restricted to admin users.', status: 403 as const }
  }
  return { profile }
}

function buildSystemPrompt(firstName: string, isFirstTurn: boolean): string {
  if (!firstName) return SYSTEM_PROMPT
  const greetingRule = `# Greeting

The current user's first name is **${firstName}**. Use it naturally in your replies — like a friendly co-worker would. Don't overdo it, but personalisation lands well at:
- The very first turn: open the \`reply\` with a warm greeting that uses their name. e.g. "Hi ${firstName} — happy to help."
- Pivot moments where it reads naturally.

${isFirstTurn ? `**THIS IS THE FIRST TURN of the conversation.** Open your \`reply\` with a friendly greeting that uses "${firstName}" by name.` : `(This is NOT the first turn. Don't open with a greeting again; just continue.)`}

`
  return greetingRule + SYSTEM_PROMPT
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) {
      return Response.json({ error: auth.error }, { status: auth.status })
    }

    const apiKey = getApiKey()
    if (!apiKey) {
      return Response.json({ error: 'OPENAI_API_KEY not configured.' }, { status: 500 })
    }

    let body: RequestBody
    try {
      body = (await req.json()) as RequestBody
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const prompt = body.prompt?.trim() ?? ''
    const mode: 'create' | 'enhance' = body.mode === 'enhance' ? 'enhance' : 'create'
    const attachments = Array.isArray(body.attachments) ? body.attachments : []
    if (!prompt && attachments.length === 0) {
      return Response.json({ error: 'prompt or attachment is required' }, { status: 400 })
    }

    const existingCompact: ReturnType<typeof compactBlockForPrompt>[] = []
    if (mode === 'enhance' && Array.isArray(body.existingBlocks)) {
      for (const b of body.existingBlocks) {
        const compact = compactBlockForPrompt(b)
        if (compact) existingCompact.push(compact)
      }
    }

    const admin = getAdmin()
    const priorMessages: { role: 'user' | 'assistant'; content: string }[] = []
    if (body.chat_id) {
      const { data: msgs } = await admin
        .from('template_ai_messages')
        .select('role, content, created_at')
        .eq('chat_id', body.chat_id)
        .order('created_at', { ascending: true })
        .limit(20)
      if (Array.isArray(msgs)) {
        for (const m of msgs) {
          if (m && (m.role === 'user' || m.role === 'assistant') && m.content) {
            priorMessages.push({ role: m.role, content: String(m.content) })
          }
        }
      }
    }

    const imageAttachments = attachments.filter((a) => a.kind === 'image')
    const textAttachments = attachments.filter((a) => a.kind === 'text')

    const upcomingEvents = await fetchUpcomingEvents(admin)

    const userMessage = (() => {
      const parts: string[] = []
      if (body.category) parts.push(`Template category: ${body.category}.`)

      if (upcomingEvents.length > 0) {
        parts.push(
          [
            'Upcoming events in the database (next 10, soonest first):',
            ...upcomingEvents.map((e, i) => formatEventForPrompt(e, i)),
          ].join('\n'),
        )
      } else {
        parts.push('Upcoming events in the database: NONE. If the user asks about events, say there are no upcoming events scheduled yet.')
      }

      if (Array.isArray(body.existingBlocks) && body.existingBlocks.length > 0) {
        parts.push(`Current canvas has ${body.existingBlocks.length} blocks. Subject: "${body.existingSubject ?? ''}".`)
      } else {
        parts.push('Current canvas is empty.')
      }

      const existingTheme = body.existingTheme && typeof body.existingTheme === 'object' ? body.existingTheme : null
      if (existingTheme && Object.keys(existingTheme).some((k) => existingTheme[k as keyof typeof existingTheme])) {
        parts.push(
          [
            'Current theme overrides (these are ALREADY APPLIED — preserve them unless the user explicitly asks to change a specific key):',
            JSON.stringify(existingTheme, null, 2),
            'When you respond, set ONLY the theme keys the user is asking about THIS turn. Set every OTHER theme key to null.',
          ].join('\n'),
        )
      } else {
        parts.push(
          'Current theme: defaults (no per-template overrides). When you change one chrome colour, set ONLY that key on the theme; leave the others null.',
        )
      }
      if (mode === 'enhance') {
        parts.push(
          [
            `You are editing an existing template. Apply ONLY the change the user explicitly asks for.`,
            `STRICT PRESERVATION RULES:`,
            `1. Return EVERY existing block unless the user asked to remove one. Order must match unless they asked to reorder.`,
            `2. For any block the user did not mention, copy its fields VERBATIM. Do NOT rephrase untouched copy.`,
            `3. Only modify the specific field(s) the user named.`,
            `4. If the user asks for an addition, insert the new block in the most natural position.`,
            `5. Keep the subject unchanged unless the user explicitly asks to change the subject.`,
          ].join('\n'),
        )
        if (body.existingSubject) parts.push(`Current subject (keep unless asked otherwise): ${body.existingSubject}`)
        parts.push(`Current blocks (JSON):\n${JSON.stringify(existingCompact, null, 2)}`)
        parts.push(`User instruction:\n${prompt || '(no message — see attachments)'}`)
      } else {
        parts.push(`Generate a new template. User description:\n${prompt || '(no message — see attachments)'}`)
      }
      for (const a of textAttachments) {
        parts.push(`--- Attached file: ${a.name} ---\n${a.content}`)
      }
      return parts.join('\n\n')
    })()

    const openai = new OpenAI({ apiKey })
    const model =
      process.env.OPENAI_MODEL_TEMPLATE_AI ||
      process.env.OPENAI_MODEL ||
      'gpt-4o-2024-08-06'

    const userContent: string | ChatCompletionContentPart[] =
      imageAttachments.length === 0
        ? userMessage
        : [
            { type: 'text', text: userMessage },
            ...imageAttachments.map(
              (a) =>
                ({ type: 'image_url', image_url: { url: a.dataUrl } }) as ChatCompletionContentPart,
            ),
          ]

    const firstName = auth.profile.first_name ?? ''
    const isFirstTurn = priorMessages.length === 0
    const systemPrompt = buildSystemPrompt(firstName, isFirstTurn)

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...priorMessages,
      { role: 'user', content: userContent },
    ]

    let response
    const aiStartedAt = performance.now()
    try {
      response = await openai.chat.completions.create({
        model,
        messages,
        response_format: { type: 'json_schema', json_schema: openAiJsonSchema },
        temperature: 0.5,
      })
    } catch (e) {
      console.error('[ai-generate] OpenAI request failed:', e)
      const message = e instanceof Error ? e.message : 'OpenAI request failed'
      await logOpenAIUsage({
        feature: 'template-ai-generate',
        model,
        startedAt: aiStartedAt,
        error: message,
        userId: auth.profile.id,
      })
      return Response.json({ error: `OpenAI: ${message}` }, { status: 502 })
    }
    await logOpenAIUsage({
      feature: 'template-ai-generate',
      model,
      usage: response.usage,
      startedAt: aiStartedAt,
      userId: auth.profile.id,
    })

    const choice = response.choices[0]
    const refusal = choice?.message?.refusal
    if (refusal) {
      return Response.json({ error: `AI refused: ${refusal}` }, { status: 422 })
    }

    const raw = choice?.message?.content
    if (!raw) {
      return Response.json({ error: 'OpenAI returned an empty response.' }, { status: 502 })
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return Response.json({ error: 'OpenAI returned invalid JSON.' }, { status: 502 })
    }

    const validation = aiTemplateResponseSchema.safeParse(parsed)
    if (!validation.success) {
      console.error('[ai-generate] schema validation failed:', validation.error)
      return Response.json(
        {
          error: 'AI returned a template that did not match the expected schema.',
          issues: validation.error.issues,
        },
        { status: 502 },
      )
    }

    const aiIntent = validation.data.intent
    const reply = validation.data.reply

    let blocks: ReturnType<typeof expandAiBlocks> = []
    let subject = ''
    let preheader = ''
    let name = ''
    type ThemeOverrides = {
      headerBgColor?: string
      headerTextColor?: string
      footerBgColor?: string
      footerTextColor?: string
      footerLinkColor?: string
      pageBgColor?: string
      bodyBgColor?: string
    }
    let theme: ThemeOverrides | null = null

    if (aiIntent !== 'answer') {
      blocks =
        aiIntent === 'enhance' && Array.isArray(body.existingBlocks)
          ? mergeAiBlocksWithExisting(validation.data.blocks, body.existingBlocks)
          : expandAiBlocks(validation.data.blocks)
      subject = validation.data.subject
      preheader = validation.data.preheader ?? ''
      name = validation.data.name
      const t = validation.data.theme
      if (t) {
        const onlySet: ThemeOverrides = {}
        if (t.headerBgColor) onlySet.headerBgColor = t.headerBgColor
        if (t.headerTextColor) onlySet.headerTextColor = t.headerTextColor
        if (t.footerBgColor) onlySet.footerBgColor = t.footerBgColor
        if (t.footerTextColor) onlySet.footerTextColor = t.footerTextColor
        if (t.footerLinkColor) onlySet.footerLinkColor = t.footerLinkColor
        if (t.pageBgColor) onlySet.pageBgColor = t.pageBgColor
        if (t.bodyBgColor) onlySet.bodyBgColor = t.bodyBgColor
        if (Object.keys(onlySet).length > 0) theme = onlySet
      }
    }

    let chatId = body.chat_id ?? null
    if (!chatId) {
      const { data: created, error: createErr } = await admin
        .from('template_ai_chats')
        .insert({
          user_id: auth.profile.id,
          title: deriveChatTitle(prompt || 'Attachment'),
          template_id: body.template_id ?? null,
        })
        .select('id')
        .single()
      if (createErr) {
        console.error('[ai-generate] failed to create chat:', createErr)
      } else {
        chatId = created.id
      }
    }

    if (chatId) {
      const inserts = [
        {
          chat_id: chatId,
          role: 'user' as const,
          content: prompt,
          blocks_snapshot: null,
          subject_snapshot: null,
          preheader_snapshot: null,
        },
        {
          chat_id: chatId,
          role: 'assistant' as const,
          content: reply,
          blocks_snapshot: aiIntent === 'answer' ? null : blocks,
          subject_snapshot: aiIntent === 'answer' ? null : subject,
          preheader_snapshot: aiIntent === 'answer' ? null : preheader,
        },
      ]
      const { error: msgErr } = await admin.from('template_ai_messages').insert(inserts)
      if (msgErr) console.error('[ai-generate] failed to log messages:', msgErr)
    }

    return Response.json({
      intent: aiIntent,
      reply,
      name,
      subject,
      preheader,
      blocks,
      theme,
      chat_id: chatId,
    })
  } catch (e) {
    console.error('[ai-generate] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    const stack = e instanceof Error ? e.stack : undefined
    return Response.json(
      {
        error: `Unhandled server error: ${message}`,
        stack: process.env.NODE_ENV === 'development' ? stack : undefined,
      },
      { status: 500 },
    )
  }
}
