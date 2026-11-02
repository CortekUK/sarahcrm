// TwiML builders (Twilio SDK VoiceResponse, so escaping is handled for us).
//
// <Connect action="…/voice/connect-action">
//   <ConversationRelay url="wss://…/relay" welcomeGreeting="…" language="en-GB"
//     ttsProvider="ElevenLabs" voice="…" transcriptionProvider="Deepgram"
//     interruptible="any" welcomeGreetingInterruptible="speech" … >
//     <Parameter name="callSid" value="CA…"/>
//     <Parameter name="from" value="+44…"/>
//   </ConversationRelay>
// </Connect>
//
// Attribute names per https://www.twilio.com/docs/voice/twiml/connect/conversationrelay
import twilio from 'twilio'

const { VoiceResponse } = twilio.twiml

export interface RelayTwimlOptions {
  relayUrl: string // wss://…/relay
  actionUrl?: string | null // https://…/voice/connect-action
  welcomeGreeting: string
  language: string // en-GB
  ttsProvider: string // ElevenLabs
  voice: string
  transcriptionProvider: string // Deepgram
  speechModel?: string | null
  hints?: string
  parameters: Record<string, string | null | undefined>
}

export function buildRelayTwiml(o: RelayTwimlOptions): string {
  const response = new VoiceResponse()
  const connect = response.connect(o.actionUrl ? { action: o.actionUrl, method: 'POST' } : {})
  const relay = connect.conversationRelay({
    url: o.relayUrl,
    welcomeGreeting: o.welcomeGreeting,
    // Let the caller talk over the greeting, but don't let a cough (DTMF/noise) cut it.
    welcomeGreetingInterruptible: 'speech',
    language: o.language,
    ttsProvider: o.ttsProvider,
    voice: o.voice,
    transcriptionProvider: o.transcriptionProvider,
    ...(o.speechModel ? { speechModel: o.speechModel } : {}),
    interruptible: 'any',
    interruptSensitivity: 'medium',
    dtmfDetection: true,
    ...(o.hints ? { hints: o.hints } : {}),
  })
  for (const [name, value] of Object.entries(o.parameters)) {
    if (value) relay.parameter({ name, value })
  }
  return response.toString()
}

/** Spoken + hang up — for misconfiguration or a failed relay session. */
export function buildSayHangupTwiml(message: string): string {
  const response = new VoiceResponse()
  response.say({ voice: 'Polly.Amy-Neural', language: 'en-GB' }, message)
  response.hangup()
  return response.toString()
}

export function buildHangupTwiml(): string {
  const response = new VoiceResponse()
  response.hangup()
  return response.toString()
}

/** "Good morning" / "Good afternoon" / "Good evening" in UK time. */
export function partOfDay(now: Date): 'morning' | 'afternoon' | 'evening' {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/London' }).format(now),
  )
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

export function welcomeGreeting(now: Date): string {
  return (
    `Good ${partOfDay(now)}, and thank you for calling The Club by Sarah Restrick. ` +
    `I'm The Club's AI assistant, and this call is transcribed for our team. How can I help you today?`
  )
}

/** Recognition hints for names the transcriber would otherwise mangle. */
export const RECOGNITION_HINTS =
  'The Club,the club,Club,members club,The Club by Sarah Restrick,Sarah Restrick,Sarah,Restrick,Knutsford,Cheshire,Manchester,concierge,sponsorship,sponsor,membership,member,introduction,events'

/** Static hints + live event names (e.g. "INSPIRE", "Swinton Estate"), de-duplicated, Twilio's comma list. */
export function buildRecognitionHints(extra: string[] = []): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of [...RECOGNITION_HINTS.split(','), ...extra]) {
    const h = raw.replace(/[,"<>&]/g, ' ').replace(/\s+/g, ' ').trim()
    if (!h || h.length > 60 || seen.has(h.toLowerCase())) continue
    seen.add(h.toLowerCase())
    out.push(h)
  }
  return out.slice(0, 60).join(',')
}
