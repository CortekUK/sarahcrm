// Point The Club's Twilio number at this voice service.
//
//   npm run configure-number              # dry run: prints current vs new config
//   npm run configure-number -- --apply   # actually updates the number
//
// Env (from services/voice/.env, e.g. `node --env-file=.env --import tsx scripts/configure-number.ts`):
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, VOICE_PUBLIC_URL,
//   TWILIO_PHONE_NUMBER (default +447915919880)
//
// Sets on the IncomingPhoneNumber:
//   voiceUrl            = ${VOICE_PUBLIC_URL}/voice/incoming   (POST)
//   statusCallback      = ${VOICE_PUBLIC_URL}/voice/status     (POST)
// Nothing else (SMS config, friendly name…) is touched. Only run this
// deliberately — it changes where real calls to the number go.
import twilio from 'twilio'

const DEFAULT_NUMBER = '+447915919880'

async function main() {
  const apply = process.argv.includes('--apply')
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim()
  const token = process.env.TWILIO_AUTH_TOKEN?.trim()
  const publicUrl = process.env.VOICE_PUBLIC_URL?.trim().replace(/\/+$/, '')
  const number = process.env.TWILIO_PHONE_NUMBER?.trim() || DEFAULT_NUMBER

  const missing = [!sid && 'TWILIO_ACCOUNT_SID', !token && 'TWILIO_AUTH_TOKEN', !publicUrl && 'VOICE_PUBLIC_URL'].filter(Boolean)
  if (missing.length) {
    console.error(`Missing env: ${missing.join(', ')}`)
    process.exit(1)
  }
  if (!/^https:\/\//.test(publicUrl!)) {
    console.error('VOICE_PUBLIC_URL must be an https:// URL Twilio can reach (e.g. your ngrok URL).')
    process.exit(1)
  }

  const client = twilio(sid, token)
  const matches = await client.incomingPhoneNumbers.list({ phoneNumber: number, limit: 5 })
  if (!matches.length) {
    console.error(`No incoming phone number ${number} on this Twilio account.`)
    process.exit(1)
  }
  const pn = matches[0]
  const next = {
    voiceUrl: `${publicUrl}/voice/incoming`,
    voiceMethod: 'POST',
    statusCallback: `${publicUrl}/voice/status`,
    statusCallbackMethod: 'POST',
  }

  console.log(`Number ${pn.phoneNumber} (${pn.sid})`)
  const rows: [string, string | null | undefined, string][] = [
    ['voiceUrl', pn.voiceUrl, next.voiceUrl],
    ['voiceMethod', pn.voiceMethod, next.voiceMethod],
    ['statusCallback', pn.statusCallback, next.statusCallback],
    ['statusCallbackMethod', pn.statusCallbackMethod, next.statusCallbackMethod],
  ]
  for (const [k, cur, nxt] of rows) {
    console.log(`  ${k.padEnd(22)} ${cur || '(none)'}  →  ${nxt}${cur === nxt ? '  (unchanged)' : ''}`)
  }
  if (pn.voiceApplicationSid) {
    console.log(`  NOTE: voiceApplicationSid ${pn.voiceApplicationSid} is set — it overrides voiceUrl. Clear it in the console first.`)
  }

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to make these changes.')
    return
  }
  await client.incomingPhoneNumbers(pn.sid).update(next)
  console.log('\nUpdated.')
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
