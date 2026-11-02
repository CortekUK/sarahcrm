# @sarahcrm/voice

AI phone receptionist for The Club: inbound calls to **+44 7915 919880** are answered by
**Twilio ConversationRelay** (speech-to-text via Deepgram, text-to-speech via ElevenLabs, en-GB), which
streams the caller's words to this service over a WebSocket. Each turn goes to OpenAI (streaming chat
completions with tools) and the reply tokens stream straight back to Twilio, so the caller hears the reply
start within about a second. When the call ends the service writes the call (transcript, AI summary,
outcome), files an enquiry + follow-up task and raises an in-app admin notification. Admins review calls at
`/dashboard/calls`.

Standalone on purpose, like `services/chat`: it has its own `package-lock.json` and imports nothing from
outside `services/voice` (Railway's root directory isolates it). `src/scoring.ts` is a copy of
`src/lib/leads/scoring.ts` and `src/phone.ts` mirrors `normalizeE164` in `src/lib/whatsapp/client.ts`, so keep
them in sync.

## How a call flows

1. **`POST /voice/incoming`** (Twilio Voice webhook). Checks `X-Twilio-Signature` (auth token + `VOICE_PUBLIC_URL`
   + original path), inserts a `voice_calls` row, and returns:
   ```xml
   <Response><Connect action="…/voice/connect-action" method="POST">
     <ConversationRelay url="wss://…/relay" welcomeGreeting="Good morning, and thank you for calling The Club…
       I'm The Club's AI assistant, and this call is transcribed for our team…" welcomeGreetingInterruptible="speech"
       language="en-GB" ttsProvider="ElevenLabs" voice="Fahco4VZzobUeiPqni1S" transcriptionProvider="Deepgram"
       interruptible="any" interruptSensitivity="medium" dtmfDetection="true" hints="Sarah Restrick,…">
       <Parameter name="callSid" value="CA…"/><Parameter name="from" value="+44…"/>
     </ConversationRelay></Connect></Response>
   ```
   With OpenAI unconfigured it says a polite "unavailable" line and hangs up.
2. **`WS /relay`**: the handshake signature is checked too (Twilio signs it; we accept the `wss://` or `https://`
   form of the URL) and the `setup` CallSid must be one we just answered. On `setup` the service loads facts
   (upcoming published/live events and active membership plans, **no prices**, cached for 5 min) and matches the
   caller ID to a member/contact (`voice_match_caller` RPC). Then:
   - `prompt` → an OpenAI turn (`VOICE_OPENAI_MODEL`, `max_completion_tokens` = `VOICE_MAX_REPLY_TOKENS`). Each
     content delta is sent as `{type:"text", token, last:false}` and the talk cycle closes with `{token:"", last:true}`.
     Tool calls are applied and the model is called again (up to 4 rounds per turn).
   - `interrupt` → the in-flight stream is aborted and the agent's last line is truncated to
     `utteranceUntilInterrupt` in the transcript and history, so the model knows what the caller actually heard.
   - `dtmf` / `error` are logged into the transcript.
   - Tool `end_call` (or the time or turn limit, or two OpenAI failures in a row) → the goodbye is spoken, then
     `{type:"end"}` is sent after an estimate of how long the speech takes. Twilio then calls `/voice/connect-action`,
     which returns `<Hangup/>` (or an apology + hang-up when `SessionStatus=failed`).
3. **Finalize**, run when the socket closes, or from **`POST /voice/status`** for calls that never reached the relay
   (busy, no-answer, failed, or hung up during the greeting). It runs exactly once per CallSid (an in-process lock
   plus a DB claim on `finalized_at`). It writes the summary (OpenAI JSON, or a templated fallback), the outcome
   and the enquiry, task and notification.

## What the agent does

British, warm, concise. It always says it's The Club's AI assistant and that the call is transcribed. Tools:

| Tool | Effect (in memory; the CRM is written after hang-up) |
|---|---|
| `save_caller_details` | name, phone (defaults to caller ID; `phone_confirmed`), email (validated), company, role, interest (`membership/event/private_event/sponsorship/concierge/press/other`), turnover band, message |
| `request_callback` | preferred time as text + ISO (accepted only if it's in the future and within 90 days), team `sales/events/sarah`. **Nothing is booked and Google Calendar is never touched.** |
| `create_enquiry` | flags that the caller wants their enquiry passed on |
| `mark_escalation` | complaint / payment / cancellation / press / sensitive / other → `escalated` |
| `end_call` | hang up after the goodbye |

The prompt forbids quoting or promising prices, discounts or availability, taking card details, claiming to be
human, revealing whether someone is a member, and going off-topic. Hard limits: `VOICE_MAX_CALL_SECONDS`
(600), `VOICE_MAX_TURNS` (40) and `VOICE_MAX_REPLY_TOKENS` (200). If OpenAI fails, the agent apologises and
offers to take a message. A second failure in a row ends the call politely.

### What gets written at call end

- **Enquiry** (`source: 'phone_agent'`). Filed when the caller gave a name, there's a way to reach them, and they
  asked for something (a callback, an enquiry, an interest or a message). It is **inserted directly, not via
  `/api/enquiries/intake`**, because the intake requires an email and always emails an acknowledgement to the
  enquirer, plus a notification email to admins. This service never emails anyone. It copies the intake's
  minimum: the lead score, owner routing (`app_settings.enquiry_routing`, otherwise the first admin), and a
  follow-up task linked both ways. A call-back fills `enquiries.call_requested_at / call_team / call_preferences`
  (from `20261016_concierge_events_calls.sql`). If those columns don't exist, it retries without them, and the
  call-back is still in the message text. `email` is `''` when the caller gave none (the column is NOT NULL).
- **Escalations are not leads**: they get a high-priority "Escalated call" task and a `voice_call_escalated`
  notification, but no enquiry.
- **Task**: "Call back: …" (due on the preferred day, otherwise the next business day), "Escalated call: …", or
  "Follow up phone enquiry: …".
- **`admin_notifications`** row (`kind` `voice_call` / `voice_call_escalated`, link `/dashboard/calls?call=<id>`) for
  every outcome except `no_action` and `failed`.
- **`voice_calls`**: captured fields, `summary`, `outcome` (`escalated` > `callback_requested` > `enquiry_created`
  > `message_taken` > `failed` > `no_action`, worked out from the captured data rather than chosen by the model),
  transcript `[{role: caller|agent|event, text, at, interrupted?}]`, `member_id` / `contact_id`, and token counts.

## Local development

Prerequisites: apply `supabase/migrations/20261028_voice_calls.sql` (and `20261016_concierge_events_calls.sql`).
Until it's applied, calls still work, but nothing is saved and the logs show `call_insert_failed` and
`finalize_claim_failed`.

```bash
cd services/voice
cp .env.example .env            # fill TWILIO_*, OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
npm install
npm test                        # unit tests: no network, no DB, no Twilio
npm run typecheck && npm run build

# 1. run the service on :4200
node --env-file=.env --import tsx src/index.ts      # or: npm run build && node --env-file=.env dist/index.js

# 2. expose it (separate terminal)
/opt/homebrew/bin/ngrok http 4200
#    copy the https://….ngrok-free.app URL into .env as VOICE_PUBLIC_URL, then restart step 1
#    (the URL is part of the signature check and of the wss:// relay URL)

# 3. check it
curl https://<your-ngrok>.ngrok-free.app/health          # "ready": true, "missing": []

# 4. point the Twilio number at it — DRY RUN first, prints current → new
node --env-file=.env --import tsx scripts/configure-number.ts
node --env-file=.env --import tsx scripts/configure-number.ts --apply
#    sets voiceUrl = ${VOICE_PUBLIC_URL}/voice/incoming (POST) and
#         statusCallback = ${VOICE_PUBLIC_URL}/voice/status (POST) on +447915919880.
#    (Or by hand: Console → Phone Numbers → +44 7915 919880 → Voice configuration →
#     "A call comes in" Webhook <url>/voice/incoming HTTP POST; "Call status changes" <url>/voice/status.)

# 5. call +44 7915 919880 and watch the logs; the call appears at /dashboard/calls
```

Free ngrok URLs change on every restart, so redo steps 2 and 4 each time (or use a reserved ngrok domain).
`VOICE_VALIDATE_SIGNATURE=false` turns signature checks off for a local fake-Twilio harness only. Never set it
in production.

## Railway

- New service from this repo. **Root Directory** `services/voice`, **Watch Paths** `services/voice/**`.
- `railway.json`: build `npm run build`, start `npm start`, healthcheck `GET /health` (always 200, and lists
  `missing` settings), 30 s draining so live calls can finish on redeploy.
- Variables: everything in `.env.example`. `VOICE_PUBLIC_URL` = the Railway public domain (e.g.
  `https://voice.theclubgroup.co`). `PORT` is injected.
- **One replica.** Live sessions and the "CallSids we answered" check are in memory, and `/voice/incoming` and
  `/relay` for the same call must reach the same instance.
- After deploying, run `scripts/configure-number.ts --apply` with the production `VOICE_PUBLIC_URL`.

## Voice, model and cost settings

- `VOICE_TTS_VOICE`: ElevenLabs voice id, optionally `<id>-<model>-<speed>_<stability>_<similarity>` (Twilio
  format). The default `Fahco4VZzobUeiPqni1S` is Twilio's documented en-GB ElevenLabs default. Alternatives:
  `Xb7hH8MSUJpSbSDYk0k2` (Alice), `JBFqnCBsd6RMkjVDRZzb` (George). Test them on a real call.
- `VOICE_SPEECH_MODEL`: Deepgram model (empty means Twilio's default, `nova-3-general`).
- `VOICE_OPENAI_MODEL` (default `gpt-4.1-mini`, fast with streaming tool calls) and `VOICE_SUMMARY_MODEL`.
- Twilio bills ConversationRelay per minute on top of voice minutes. OpenAI usage per call is in
  `voice_calls.prompt_tokens / completion_tokens / llm_requests`.

## Not built (deliberately)

- Live calendar booking (call-backs are requests only), warm transfer to a human, voicemail, outbound calls, SMS
  follow-ups and caller email acknowledgements.
- Recording audio. Only the text transcript is stored.
