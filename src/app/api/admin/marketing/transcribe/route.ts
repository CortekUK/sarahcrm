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
// Multipart framing overhead allowed on top of the file itself.
const FORM_OVERHEAD_BYTES = 64 * 1024
// File types Whisper accepts.
const AUDIO_EXTENSIONS = ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm']
const TOO_LARGE = 'File too large (max 25 MB).'
// What Whisper tends to "hear" in a silent recording.
const SILENCE_ARTIFACTS = ['', 'you', 'thank you', 'thanks for watching', 'bye']

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

    // Refuse an oversized upload before parsing it, with the real reason.
    const declared = Number(req.headers.get('content-length') ?? 0)
    if (declared > MAX_AUDIO_BYTES + FORM_OVERHEAD_BYTES) {
      return Response.json({ error: TOO_LARGE }, { status: 413 })
    }

    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return Response.json(
        { error: 'Could not read the upload — send the recording as multipart/form-data (max 25 MB).' },
        { status: 400 },
      )
    }

    const file = form.get('file')
    if (!(file instanceof File)) {
      return Response.json({ error: 'No audio file provided (field "file").' }, { status: 400 })
    }
    if (file.size === 0) {
      return Response.json({ error: 'Audio file is empty.' }, { status: 400 })
    }
    if (file.size > MAX_AUDIO_BYTES) {
      return Response.json({ error: TOO_LARGE }, { status: 413 })
    }
    const ext = (file.name.split('.').pop() ?? '').toLowerCase()
    const mime = (file.type || '').toLowerCase()
    const mimeOk = !mime || mime.startsWith('audio/') || mime === 'video/mp4' || mime === 'video/webm'
    if (!AUDIO_EXTENSIONS.includes(ext) || !mimeOk) {
      return Response.json(
        { error: `Not an audio file. Upload one of: ${AUDIO_EXTENSIONS.join(', ')}.` },
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
      const text = (result.text ?? '').trim()
      const normalised = text.toLowerCase().replace(/[^a-z ]/g, '').trim()
      if (SILENCE_ARTIFACTS.includes(normalised)) {
        return Response.json(
          { error: 'No speech was detected in this recording.' },
          { status: 422 },
        )
      }
      return Response.json({ transcript: text })
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
