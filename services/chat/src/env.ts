// Validated process env. Fails fast at boot so a misconfigured Railway
// deploy crashes loudly instead of serving 500s.
import { z } from 'zod'

const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  CHAT_ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  CHAT_OWNER_PROFILE_ID: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : undefined)),
  // Temporary: every admin gets the owner's chat powers (create/manage groups,
  // read all chats, reports, team access). Set to "false" for Sarah-only.
  CHAT_ADMINS_FULL_ACCESS: z
    .string()
    .optional()
    .transform((v) => (v ?? 'true').trim().toLowerCase() !== 'false'),
  PORT: z.coerce.number().int().positive().default(4100),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  // Names only — never echo values (they're secrets).
  const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ')
  console.error(`[chat] invalid environment: ${fields}`)
  process.exit(1)
}

export const env = {
  ...parsed.data,
  allowedOrigins: parsed.data.CHAT_ALLOWED_ORIGINS.split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean),
}
