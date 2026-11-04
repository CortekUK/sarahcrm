// POST /api/admin/sponsorship/deck/parse — turn a sponsorship deck into a brief.
//
// Accepts either pasted `text` or an `asset_path` in the `sponsor-assets`
// storage bucket (PDF via pdfjs-dist legacy build, DOCX via mammoth). The
// extracted text is summarised by OpenAI into a short structured brief
// { positioning, target_sectors[], keywords[] } that the client then feeds into
// the /match route as `deck_brief` (+ merged keywords).
//
// Best-effort by design: it NEVER blocks. Bad input / unreadable files return
// ok:false with a 4xx status and a plain message; asset_path must be an
// admin-uploaded deck (decks/…pdf|docx). When OpenAI is unavailable it returns
// the truncated raw text as the brief with empty sectors/keywords. Nothing is
// sent.

import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { z } from 'zod'
import { requireAdmin, getAdmin } from '@/lib/marketing/admin'
import { logOpenAIUsage } from '@/lib/ai/usage-logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_TEXT_CHARS = 12000
const STORAGE_BUCKET = 'sponsor-assets'
// Admin-uploaded decks live under decks/ in the bucket.
const DECK_PATH_RE = /^decks\/[A-Za-z0-9][A-Za-z0-9._\/-]{0,200}\.(pdf|docx)$/i

// Failure → a real 4xx status (ok:false kept for older callers; `error` is
// what the hub's toast reads). Never echoes raw storage errors.
function fail(message: string, status: number) {
  return Response.json({ ok: false, error: message, message }, { status })
}

const briefSchema = z.object({
  positioning: z.string(),
  target_sectors: z.array(z.string()),
  keywords: z.array(z.string()),
})

function briefJsonSchema() {
  return {
    name: 'deck_brief',
    strict: true as const,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        positioning: { type: 'string' },
        target_sectors: { type: 'array', items: { type: 'string' } },
        keywords: { type: 'array', items: { type: 'string' } },
      },
      required: ['positioning', 'target_sectors', 'keywords'],
    },
  }
}

// Extract text from a PDF buffer using the legacy (no-worker) pdfjs build.
async function extractPdfText(data: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  // no worker in Node — run everything on the main thread
  const doc = await pdfjs.getDocument({ data, useWorkerFetch: false }).promise
  const parts: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((it: any) => (typeof it?.str === 'string' ? it.str : ''))
      .join(' ')
    parts.push(pageText)
    if (parts.join(' ').length > MAX_TEXT_CHARS * 2) break // enough — we cap below
  }
  return parts.join('\n')
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

    let body: { asset_path?: string; text?: string }
    try {
      body = (await req.json()) as { asset_path?: string; text?: string }
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    // ── Resolve extracted text ───────────────────────────────────────────
    let extracted = ''
    const text = typeof body.text === 'string' ? body.text : ''
    const assetPath = typeof body.asset_path === 'string' ? body.asset_path.trim() : ''
    if (text.trim()) {
      extracted = text.slice(0, MAX_TEXT_CHARS * 4)
    } else if (assetPath) {
      // Only a deck the admin uploaded (decks/… with a safe name, PDF/DOCX)
      // — never an arbitrary bucket path such as a sponsor's own upload.
      if (!DECK_PATH_RE.test(assetPath) || assetPath.includes('..')) {
        return fail('Unknown deck file — upload the deck again or paste its text.', 400)
      }
      const admin = getAdmin()
      const { data: file, error: dlErr } = await admin.storage.from(STORAGE_BUCKET).download(assetPath)
      if (dlErr || !file) {
        if (dlErr) console.error('[deck/parse] download failed:', dlErr)
        return fail('Deck file not found — upload it again or paste its text.', 404)
      }
      const buffer = Buffer.from(await file.arrayBuffer())
      const ext = assetPath.split('.').pop()?.toLowerCase() ?? ''
      if (ext === 'pdf') {
        try {
          extracted = await extractPdfText(new Uint8Array(buffer))
        } catch (e) {
          console.error('[deck/parse] PDF extraction failed:', e)
          return fail('Could not read this PDF; paste the text instead.', 422)
        }
      } else {
        try {
          const mammoth = await import('mammoth')
          const out = await mammoth.extractRawText({ buffer })
          extracted = out.value ?? ''
        } catch (e) {
          console.error('[deck/parse] DOCX extraction failed:', e)
          return fail('Could not read this document; paste the text instead.', 422)
        }
      }
    } else {
      return fail('Provide either `text` or an `asset_path`.', 400)
    }

    extracted = extracted.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_CHARS)
    if (!extracted) {
      return fail('No readable text found in the deck.', 422)
    }

    // ── Summarise (OpenAI structured; graceful fallback to raw text) ──────
    const apiKey = process.env.OPENAI_API_KEY ?? null
    if (!apiKey) {
      return Response.json({
        ok: true,
        deck_brief: extracted,
        target_sectors: [],
        keywords: [],
      })
    }

    const openai = new OpenAI({ apiKey })
    const model = process.env.OPENAI_MODEL || 'gpt-4o-2024-08-06'
    const startedAt = performance.now()
    try {
      const response = await openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content:
              'You read a company sponsorship deck (or pasted deck text) and distil it into a short, factual brief that helps match the company to an event to sponsor. "positioning" = 2-4 sentences on who they are, what they sell and the audience they want. "target_sectors" = the industries/sectors they most want to reach. "keywords" = concise search terms (brands, categories, themes). Use ONLY what the text supports; do not invent.',
          },
          {
            role: 'user',
            content: `Deck text:\n${extracted}`,
          },
        ],
        response_format: { type: 'json_schema', json_schema: briefJsonSchema() },
        temperature: 0.3,
      })
      await logOpenAIUsage({
        feature: 'sponsorship_deck_parse',
        model,
        usage: response.usage,
        startedAt,
        userId: auth.profile.id,
      })
      const raw = response.choices[0]?.message?.content
      const parsed = raw ? briefSchema.safeParse(JSON.parse(raw)) : null
      if (parsed && parsed.success) {
        return Response.json({
          ok: true,
          deck_brief: parsed.data.positioning,
          target_sectors: parsed.data.target_sectors,
          keywords: parsed.data.keywords,
        })
      }
      // Schema miss — fall through to raw-text fallback below.
      console.error('[deck/parse] summary schema validation failed')
    } catch (e) {
      const message = e instanceof Error ? e.message : 'OpenAI request failed'
      console.error('[deck/parse] OpenAI failed, returning raw text:', e)
      await logOpenAIUsage({
        feature: 'sponsorship_deck_parse',
        model,
        startedAt,
        error: message,
        userId: auth.profile.id,
      })
    }

    // Fallback: raw truncated text as the brief.
    return Response.json({
      ok: true,
      deck_brief: extracted,
      target_sectors: [],
      keywords: [],
    })
  } catch (e) {
    console.error('[deck/parse] unhandled error:', e)
    return Response.json({ ok: false, error: 'Could not read the deck.' }, { status: 500 })
  }
}
