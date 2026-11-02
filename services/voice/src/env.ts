// Validated process env. Unlike services/chat this service deliberately BOOTS
// with Twilio / OpenAI / Supabase missing (so it can be deployed and health-
// checked before the credentials exist): `missing` lists what is absent,
// /health reports it, and each request that needs a value answers 503 with a
// clear message. Malformed values (a bad URL, a non-number limit) still crash
// at boot — a typo should never be silent.
import { z } from 'zod'

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined))

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(4200),
  VOICE_PUBLIC_URL: optionalString.pipe(z.string().url().optional()),

  TWILIO_ACCOUNT_SID: optionalString,
  TWILIO_AUTH_TOKEN: optionalString,
  TWILIO_PHONE_NUMBER: optionalString,
  VOICE_VALIDATE_SIGNATURE: z
    .string()
    .optional()
    .transform((v) => (v ?? 'true').trim().toLowerCase() !== 'false'),

  OPENAI_API_KEY: optionalString,
  VOICE_OPENAI_MODEL: optionalString.transform((v) => v ?? 'gpt-4.1-mini'),
  VOICE_SUMMARY_MODEL: optionalString,

  SUPABASE_URL: optionalString.pipe(z.string().url().optional()),
  SUPABASE_SERVICE_ROLE_KEY: optionalString,

  VOICE_TTS_PROVIDER: optionalString.transform((v) => v ?? 'ElevenLabs'),
  // Twilio's documented en-GB default ElevenLabs voice.
  VOICE_TTS_VOICE: optionalString.transform((v) => v ?? 'Fahco4VZzobUeiPqni1S'),
  VOICE_LANGUAGE: optionalString.transform((v) => v ?? 'en-GB'),
  VOICE_TRANSCRIPTION_PROVIDER: optionalString.transform((v) => v ?? 'Deepgram'),
  VOICE_SPEECH_MODEL: optionalString,

  VOICE_MAX_CALL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
  VOICE_MAX_TURNS: z.coerce.number().int().min(4).max(200).default(40),
  VOICE_MAX_REPLY_TOKENS: z.coerce.number().int().min(50).max(1000).default(200),
})

export type VoiceEnv = z.infer<typeof schema> & {
  publicUrl: string | null // https base, no trailing slash
  relayUrl: string | null // wss://…/relay
  summaryModel: string
  missing: string[]
}

export function loadEnv(source: NodeJS.ProcessEnv): VoiceEnv {
  // Treat empty strings as unset everywhere (".env.example" leaves keys blank).
  const cleaned: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(source)) cleaned[k] = v === '' ? undefined : v
  const parsed = schema.safeParse(cleaned)
  if (!parsed.success) {
    // Names only — never echo values (they're secrets).
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ')
    throw new Error(`invalid environment: ${fields}`)
  }
  const d = parsed.data
  // On Render the service's own https URL arrives as RENDER_EXTERNAL_URL, so
  // VOICE_PUBLIC_URL only needs setting for a custom domain or a tunnel.
  const renderUrl = cleaned.RENDER_EXTERNAL_URL?.trim()
  const base = d.VOICE_PUBLIC_URL ?? (renderUrl && /^https:\/\//i.test(renderUrl) ? renderUrl : undefined)
  const publicUrl = base ? base.replace(/\/+$/, '') : null
  const relayUrl = publicUrl ? `${publicUrl.replace(/^http/i, 'ws')}/relay` : null
  const missing: string[] = []
  if (!publicUrl) missing.push('VOICE_PUBLIC_URL')
  if (!d.TWILIO_AUTH_TOKEN) missing.push('TWILIO_AUTH_TOKEN')
  if (!d.OPENAI_API_KEY) missing.push('OPENAI_API_KEY')
  if (!d.SUPABASE_URL) missing.push('SUPABASE_URL')
  if (!d.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  return {
    ...d,
    publicUrl,
    relayUrl,
    summaryModel: d.VOICE_SUMMARY_MODEL ?? d.VOICE_OPENAI_MODEL,
    missing,
  }
}
