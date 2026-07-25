// Audio transcription for the Marketing AI Engine (source type "audio").
//
// POST /api/admin/marketing/transcribe   (multipart/form-data, field "file")
// Returns: { transcript: string }
//
// Uploaded recording → OpenAI Whisper → transcript text, later used as the
// source material a campaign is generated from. Admin only.

import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { requireAdmin } from '@/lib/marketing/admin'
import { logOpenAIUsage } from '@/lib/ai/usage-logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_AUDIO_BYTES = 25 * 1024 * 1024 // OpenAI Whisper hard limit

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin()
    if ('error' in auth) {
      return Response.json({ error: auth.error }, { status: auth.status })
    }

    const apiKey = process.env.OPENAI_API_KEY ?? null
    if (!apiKey) {
      return Response.json({ error: 'OPENAI_API_KEY not configured.' }, { status: 500 })
    }

    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return Response.json({ error: 'Expected multipart/form-data.' }, { status: 400 })
    }

    const file = form.get('file')
    if (!(file instanceof File)) {
      return Response.json({ error: 'No audio file provided (field "file").' }, { status: 400 })
    }
    if (file.size === 0) {
      return Response.json({ error: 'Audio file is empty.' }, { status: 400 })
    }
    if (file.size > MAX_AUDIO_BYTES) {
      return Response.json(
        { error: 'Audio file is over 25 MB (OpenAI Whisper limit).' },
        { status: 400 },
      )
    }

    const openai = new OpenAI({ apiKey })
    const startedAt = performance.now()
    try {
      const result = await openai.audio.transcriptions.create({
        model: 'whisper-1',
        file,
      })
      await logOpenAIUsage({
        feature: 'marketing-transcribe',
        model: 'whisper-1',
        startedAt,
        userId: auth.profile.id,
      })
      return Response.json({ transcript: result.text ?? '' })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Transcription failed'
      console.error('[marketing/transcribe] OpenAI failed:', e)
      await logOpenAIUsage({
        feature: 'marketing-transcribe',
        model: 'whisper-1',
        startedAt,
        error: message,
        userId: auth.profile.id,
      })
      return Response.json({ error: `Transcription failed: ${message}` }, { status: 502 })
    }
  } catch (e) {
    console.error('[marketing/transcribe] unhandled error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return Response.json({ error: `Unhandled server error: ${message}` }, { status: 500 })
  }
}
