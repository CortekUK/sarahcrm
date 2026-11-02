# AI Operational Agents — Build Spec & Handover

V2 headline **Feature 26**. Built 2026-07-25 via the sub-agent → orchestrator-review workflow. Migrations applied live; `npm run build` passing.

Sarah's brief lists six "agents." We built the **three that work today** (pure internal CRM data) and left the **three that need external accounts** for later.

---

## Built now (work with existing CRM data)
1. **AI Chief of Staff** — daily leadership briefing (7am) across memberships, sales, events, team, finance, risks. CRM page + emailed to admins.
2. **Member Success Manager** — background watcher + flags view surfacing at-risk / renewal-soon / no-introductions / dormant / upgrade-ready members.
3. **Website Concierge** — public luxury AI chat that qualifies visitors and creates a CRM enquiry.

## Deferred — need external setup (NOT built; would only be stubs)
- **WhatsApp assistant** — blocked on WhatsApp Business verification.
- ~~**Phone receptionist**~~ — **built 2026-10-28** on Twilio ConversationRelay (see AS BUILT — Phone receptionist).
- **Onboarding-call recorder** — needs meeting transcription (Fathom-type).

---

## Locked decisions (confirmed with user)
- Build the 3 internal agents; defer the 3 externally-blocked.
- Chief of Staff delivery: **CRM page + email** now; WhatsApp later.

## Reuse map (verified)
- Summary-route blueprint: `src/app/api/admin/handover/report/route.ts` (admin auth + service-role fan-out + OpenAI + templated fallback + upsert).
- Scoring engine (MSM): `src/lib/members/scoring.ts` `computeMemberScores()` + recompute route `src/app/api/admin/members/recompute-scores/route.ts`.
- Pipeline maths: `src/lib/pipeline/stages.ts` + Executive/Dashboard/Finance query logic ported server-side.
- Finance helpers: `src/lib/finance/metrics.ts`.
- Cron: `/api/cron/automations` runs `runAllAutomations(dryRun)` only when Europe/London hour === `app_settings.daily_send_hour` (default 7). New flows added there run ~7am daily. Auth = `Bearer CRON_SECRET` or admin.
- Email: `renderClubEmail`/`sendClubEmail` + `notifyAdmins` (`src/lib/email/admin-notify.ts`).
- Enquiry intake (concierge): `src/app/api/enquiries/intake/route.ts` (public, anonymous) — concierge creates enquiries via internal POST to it, inheriting scoring/routing/ack/task/enrichment/notify.
- Multi-turn OpenAI pattern: `src/app/api/templates/ai-generate/route.ts`.
- Public floating element pattern: `src/components/website/night/JoinBadge.tsx`.

---

## AS BUILT — 1. AI Chief of Staff
- **Migration** `supabase/migrations/20260802_chief_of_staff.sql` (applied): `chief_of_staff_reports` (report_date unique, sections jsonb, narrative, generated_at/by), admin RLS.
- **Aggregator** `src/lib/chief-of-staff/aggregate.ts` — `buildChiefOfStaffData(admin, now)`, per-section `safe()` (never throws; a bad sub-query → 0/[] + console.warn). Sections: memberships (active/pending/renewingIn30), pipeline (open value by stream via stages.ts), events (upcoming 14d + sponsor deliverables due 7d), team (overdue accountability_tasks), finance (debtors from payments pending/overdue, MRR from membership_plans×active subs), introductions (toFollowUp/thisMonth), risks (membersAtRisk churn≥60, sponsorAssetsMissing, accountantOverdue from finance_task_occurrences). All column assumptions verified live.
- **Shared generator** `src/lib/chief-of-staff/generate.ts` — `generateChiefOfStaffReport(admin,{userId?,now?})` = aggregate → OpenAI narrative (feature `chief_of_staff`) → templated fallback → upsert on London date. Used by BOTH the route and the cron flow (one implementation).
- **Route** `src/app/api/admin/chief-of-staff/report/route.ts` — POST generate, GET today/latest (`?date=`).
- **Daily flow** `chiefOfStaffDaily(admin,dryRun)` in `src/lib/automations/run.ts` — generate + `notifyAdmins`; registered in `runAllAutomations` (dedicated result key). Runs ~7am via the existing cron.
- **UI** `src/views/admin/chief-of-staff/ChiefOfStaffPage.tsx` + page + top-of-nav "Chief of Staff" (Sunrise icon). Hero narrative + section cards + "Generate today's briefing".

## AS BUILT — 2. Member Success Manager
- **Watcher** `memberSuccessSweep(admin,dryRun)` in `run.ts` — daily bulk recompute of scores for active members (reuses `computeMemberScores`); registered in `runAllAutomations`. No new scoring formula.
- **Flags API** `src/app/api/admin/members/success/route.ts` (GET, admin) — active members with ≥1 flag + reasons + scores; two BATCH queries (bookings, introductions) → no N+1. Thresholds: at_risk churn≥60, renewal_soon ≤30d, no_intros total=0, dormant >90d (or never), upgrade_ready ≥70. `?flag=` filter.
- **View** `src/views/admin/members/MemberSuccessPage.tsx` + page `/dashboard/members/success` + "Member Success" nav (HeartPulse). Flag summary tiles, filters, "Recompute now" (POSTs recompute-scores). No new tables (computed-on-read).

## AS BUILT — 3. Website Concierge
- **Migration** `supabase/migrations/20260803_concierge_conversations.sql` (applied): `concierge_conversations` (session_token unique, messages jsonb, message_count, visitor_*, qualified, enquiry_id→enquiries, ip, user_agent), admin-only RLS (public endpoint uses service-role).
- **Public endpoint** `src/app/api/concierge/chat/route.ts` — POST, service-role, structured OpenAI (json_schema + Zod → `{reply, collected, ready_to_submit}`). **7 abuse protections:** honeypot (`company_url`), 1000-char cap, 20 user-msgs/conversation, 12 new-conversations/IP/hour (429), `max_tokens:500` + `OPENAI_MODEL` env + `logOpenAIUsage`, scope-guarded system prompt, one-enquiry-per-conversation. No key / any failure → calm canned reply (never 500). Creates enquiry via internal POST to `/api/enquiries/intake` (`source:'concierge_chat'`).
- **Widget** `src/components/website/night/ConciergeWidget.tsx` — floating launcher bottom-LEFT (mirrors JoinBadge hide logic; avoids collision), night-palette chat panel, `crypto.randomUUID()` session in localStorage, hidden honeypot, a11y. Mounted in `src/app/(public)/layout.tsx`.

## AS BUILT — 3b. Concierge: event suggestions + call booking (2026-10-16)
Client brief: "Suggest relevant events" + "Books a call with Sarah / sales team / events team".
- **Migration** `supabase/migrations/20261016_concierge_events_calls.sql` (**not yet applied**): `enquiries.call_requested_at / call_team / call_preferences / call_booked_start / call_booked_end / call_calendar_event_id / call_meet_url`; `concierge_conversations.call_state jsonb` + `call_booked_at`; new `admin_notifications` (generic in-app admin feed, admin-only RLS, service-role writes). The chat route tolerates the migration being absent (call_state read/written in separate best-effort queries; the call is also written into the enquiry message + task title).
- **Event suggestions** `src/lib/concierge/events.ts` — up to 8 upcoming events (next 180 days) with `status in ('published','live')` and `start_date >= now` (explicit filter: the route uses service-role, so RLS doesn't hide planning/draft rows). Only slug/title/date/city/type + a ~110-char pitch; cached 5 min in-process. Injected as a second "Live context" system message; the model returns `suggested_events` slugs, which are validated against that list (max 3) and returned as `events` cards (title, date, city, pitch, `/events/[slug]`). No extra OpenAI call.
- **Call routing** `src/lib/concierge/call-booking.ts` — model picks `call.team`: `sales` (membership/general/sponsorship/concierge/press), `events` (event/private_event/venue), `sarah` only when asked for by name. A call request files the enquiry under the matching intent (so `app_settings.enquiry_routing` assigns the owner); plain chats keep `intent: ['concierge']`. Sarah's task is assigned to the profile whose email matches `CONCIERGE_BOOKING_CALENDARS` `sarah=`.
- **Flag `CONCIERGE_BOOKING_ENABLED`** (default off; exactly `true` = on).
  - OFF (current): concierge asks for preferred days/times → enquiry message starts `Call requested (<team>): preferred …`, `call_*` columns set, the intake's follow-up task is retitled `Call requested: <name> — preferred … (<team>)`, category by team, high priority, due next business day. **No Google module is loaded.**
  - ON: after name + email + team, ONE free/busy lookup (`getFreeSlots`, Mon–Fri 10–17 London, 30-min, next 10 days, spread across days) → 3–5 slots appended to the reply + tap buttons. A pick is restated with a Confirm button; only a confirmation of the slot restated on a PREVIOUS turn books it (`createBooking`, re-checks the slot is still free, Meet link, visitor as attendee → Google emails the invite). The enquiry is filed as soon as slots are offered ("preferred: not specified · Times offered …"), and the booking then UPDATES that same enquiry (appended "Update from the AI Concierge" line + `call_*` columns + task retitled with the booked time) and raises one `admin_notifications` row (`concierge_call_booked`), shown on the Enquiries page. The widget stays open while the call flow needs an answer (`awaiting`). Caps: 1 lookup + 1 booking per conversation, 2 bookings / IP / 24h. Any Google failure falls back to capturing preferences.
- **Calendar client** `src/lib/google/calendar.ts` (`getFreeSlots`, `createBooking`; `jwtFor` DWD impersonation) + pure slot maths `src/lib/google/calendar-slots.ts` (DST-safe; calendars freeBusy can't read are treated as unavailable, never free).
- **DWD scopes to add before enabling:** `https://www.googleapis.com/auth/calendar.freebusy`, `https://www.googleapis.com/auth/calendar.events`. Env: `CONCIERGE_BOOKING_ENABLED=true`, `CONCIERGE_BOOKING_CALENDARS=sales=…,events=…,sarah=…` (+ optional `_DURATION_MINS/_HOURS/_DAYS/_TIMEZONE/_HORIZON_DAYS`). Calendar ids must be Workspace user emails (they're impersonated as organiser).
- **Admin UI** `src/views/admin/enquiries/EnquiriesListPage.tsx` — "Call requested: preferred …" / "Call booked: …" under the name in the list + a call panel (team, Meet link) in the detail modal; "Calls booked by the AI Concierge" strip (unread `admin_notifications`, Open / Mark read). `concierge_chat` source label added.
- **Turnover:** for membership/business conversations the concierge asks once, lightly, for approximate annual turnover (`collected.turnover`, never blocks the hand-off). No enquiry column fits a visitor-stated figure (`company_revenue*` are Clay enrichment fields), so it is written as `Approx. turnover: … (stated by the visitor)` in the enquiry message (also matches the scorer's existing `turnover` buying-signal keyword, +6). Carried across turns in `call_state` with company/phone.
- **Never lose a lead:** with a first name + valid email, the enquiry is forced on the conversation's last allowed message (or, if that turn's OpenAI call failed, on the next capped request — backup from stored fields + `call_state`), noted "Filed automatically: the conversation reached its message limit." Still one enquiry per conversation; later news (booking, preferred times, turnover) is appended to it.
- **Not built:** rescheduling/cancelling a booked call is manual in Google Calendar.

## AS BUILT — Phone receptionist (2026-10-28)
Twilio number **+44 7915 919880** (Voice + SMS; AI/ML addendum accepted). **Not live yet**: needs the Twilio credentials in `services/voice/.env`, the migration applied and the number pointed at the service.
- **Service** `services/voice` (Node 22 + TS, Express + `ws`, its own npm lockfile, imports nothing outside the folder; Railway root `services/voice`, watch `services/voice/**`, healthcheck `/health`). It boots without credentials, `/health` lists what's `missing`, and the webhooks answer 503 until they're set. README has the step-by-step for local runs (port 4200 + `ngrok http 4200`) and Railway.
- **Transport: Twilio ConversationRelay.** `POST /voice/incoming` checks `X-Twilio-Signature` (twilio `validateRequest`, `TWILIO_AUTH_TOKEN`, URL rebuilt from `VOICE_PUBLIC_URL`) and returns `<Connect action=/voice/connect-action><ConversationRelay url=wss://…/relay welcomeGreeting=… language=en-GB ttsProvider=ElevenLabs voice=<VOICE_TTS_VOICE> transcriptionProvider=Deepgram interruptible=any …><Parameter callSid/from/></Connect>`. `WS /relay` checks the handshake signature too, and the CallSid must be one we just answered. `POST /voice/status` (status callback) finalizes calls that never reached the relay. `/voice/connect-action` hangs up (with an apology on `SessionStatus=failed`).
- **Agent** (`src/session.ts`, `src/prompt.ts`, `src/tools.ts`): OpenAI streaming chat completions (`VOICE_OPENAI_MODEL`, default `gpt-4.1-mini`, `max_completion_tokens` 200). Tokens stream straight back as `text` messages, and `last:true` closes each talk cycle. `interrupt` aborts the stream and truncates history and transcript to `utteranceUntilInterrupt`. Tools: `save_caller_details`, `request_callback`, `create_enquiry`, `mark_escalation`, `end_call`. They update memory only, so the CRM is written once at hang-up. At call start it loads facts: published/live events for the next 180 days and active membership plans with **no prices**, plus a caller-ID match. Rules: British and concise, says it's an AI and that the call is transcribed, never quotes prices, discounts or availability, never takes card details, never claims to be human, escalates sensitive topics. Limits: 10 min (`VOICE_MAX_CALL_SECONDS`), 40 turns, 4 tool rounds per turn. If OpenAI fails it apologises and offers to take a message; a second failure ends the call politely.
- **Persistence** `supabase/migrations/20261028_voice_calls.sql` (**not yet applied**): `voice_calls` (captured fields, callback request, escalation, summary, outcome check, transcript jsonb, enquiry/member/contact links, token counts, `finalized_at`, `handled_at/by`), admin SELECT+UPDATE RLS, plus `voice_phone_digits()` (expression-indexed on `contacts.phone`/`profiles.phone`) and `voice_match_caller()` (service_role only).
- **End of call** (`src/finalize.ts`, exactly once per CallSid via an in-process lock and a DB `finalized_at` claim): the summary comes from OpenAI JSON, with a templated fallback. The outcome is deterministic (escalated > callback_requested > enquiry_created > message_taken > failed > no_action). The **enquiry is inserted directly** (`source: 'phone_agent'`) rather than through `/api/enquiries/intake`, because the intake requires an email and always emails the enquirer an acknowledgement plus emails admins, and the agent must never email anyone. It copies the intake's minimum: the lead score (`src/scoring.ts` is a copy of `src/lib/leads/scoring.ts`), owner routing, and a linked task. Call-backs fill `enquiries.call_requested_at/call_team/call_preferences` (if those columns are missing it retries without them). Escalations get a high-priority task, not an enquiry. An `admin_notifications` row (`voice_call` / `voice_call_escalated`, link `/dashboard/calls?call=<id>`) is written for every outcome except no_action/failed. **Google Calendar is never touched.**
- **Admin UI** `/dashboard/calls` (Engage → Calls, Phone icon): `src/views/admin/calls/{CallsPage,CallDetailModal,calls-data}.tsx`. Browser client under admin RLS, `useInfiniteQuery` keyset paging 25 at a time on `(started_at, id)`, outcome and Unhandled filters, a detail modal with summary, details, call-back, CRM links, the transcript in `ui/chat` bubbles, and **Mark handled**. `phone_agent` source label added on Enquiries.
- **Twilio number config** `services/voice/scripts/configure-number.ts`: dry run by default, `--apply` sets `voiceUrl=/voice/incoming` and `statusCallback=/voice/status` (POST).
- **Not built:** calendar booking, warm transfer to a person, voicemail, outbound calls, SMS follow-ups, audio recording.

---

# STATUS & HANDOVER (2026-07-25)

## COMPLETE, reviewed, build-passing
All three agents: tsc clean, `npm run build` passes, migrations live (RLS admin-only), no `ui-shadcn`, no vendor leaks, all Chief-of-Staff column assumptions verified live, concierge protections verified in code.

## Scheduling note
Chief of Staff email + Member Success recompute run inside `runAllAutomations`, which the cron fires once/day at `app_settings.daily_send_hour` (Europe/London, default 7). To preview without waiting: hit the cron with `?dryRun=true`, or use the in-page "Generate" / "Recompute now" buttons.

## Outstanding / deferred (pick up here)
- WhatsApp assistant, onboarding-call recorder (need external accounts). Phone receptionist: built 2026-10-28, go-live steps in `services/voice/README.md`.
- Concierge: consider Cloudflare Turnstile for stronger bot protection (needs a key + dep); current protection is app-level only.
- MSM email digest (currently flags surface in the view + feed the Chief of Staff "risks" section; no separate MSM email — one morning email = the Chief of Staff briefing).
- Automation-email opens are a blind spot for engagement scoring (only `communications` campaign email has open/click tracking).

---

# ═══════ DEFERRED AGENTS — HOW TO BUILD WHEN READY ═══════

The three below were NOT built (each needs an external account/service; building now would only produce non-working stubs). Documented here so they can be picked up cleanly once the account exists. All must honour the project rule: **AI prepares, a human approves** for anything outward-facing or money-related, and configurable per-action approval levels (Sarah's brief).

## A. WhatsApp Assistant — BLOCKED on WhatsApp Business verification
**What it does (Sarah's scope, #3):** answers members in WhatsApp for event/ticket enquiries, membership enquiries, concierge requests, existing-member support, FAQs; collects info before handing to the right team member. NOT a general chatbot. For payments it issues a secure **Stripe payment link**; on payment the CRM updates + sends confirmation. Anything unusual/complaint/negotiation/high-value/sensitive → escalate to a person. Team (not just Sarah) can receive/action interactive-Story-type notifications.
**Needs:** a verified **WhatsApp Business** account via Meta (Sarah flagged this as the blocker) + a provider (Meta Cloud API directly, or Twilio/360dialog).
**Reusable seams already in place:** the concierge's conversational + qualification + structured-output + abuse-protection pattern (`src/app/api/concierge/chat/route.ts`) transfers almost directly — swap the transport from HTTP widget to a WhatsApp webhook. Enquiry creation → reuse `/api/enquiries/intake`. There is already a WhatsApp INBOX (admin) UI + the `ui/chat` primitives (built for it) to surface threads. Escalation → `notifyAdmins`.
**Build sketch when live:** (1) inbound webhook `/api/whatsapp/webhook` (verify Meta signature) → normalise message → same AI turn logic as concierge (scope-guarded, collects info) → reply via the WhatsApp send API; (2) intent routing: enquiry → intake; payment → Stripe payment-link + a `payments` row; escalation triggers on low confidence / keywords → `notifyAdmins` + stop auto-replying; (3) persist threads (reuse/extend the WhatsApp inbox tables). Keep an allowlist of auto-send message types; everything else drafts for human approval.

## B. AI Phone Receptionist — ✅ BUILT 2026-10-28 (see AS BUILT — Phone receptionist; original sketch kept below)
**What it does:** answers inbound calls about membership/concierge, qualifies the caller, books an appointment.
**Needs:** a voice-AI/telephony provider (Vapi, Twilio Voice + a realtime voice model, Retell, or similar) + a phone number.
**Reusable seams:** same qualification/enquiry-creation logic (`/api/enquiries/intake`) and the concierge system-prompt approach; calendar booking can reuse the concierge's call-booking seam (`src/lib/google/calendar.ts` `getFreeSlots`/`createBooking` + `src/lib/concierge/call-booking.ts` routing, behind `CONCIERGE_BOOKING_ENABLED`).
**Build sketch when live:** provider handles speech↔text; our webhook receives the transcript/intent turns and runs the same qualify → create-enquiry → book/notify logic. Transcript stored like the concierge conversation. Human approval for anything committing The Club.

## C. Onboarding-Call Recorder — BLOCKED on a meeting-transcription service
**What it does (Sarah's scope, #5):** joins/records an onboarding (or speeches/panels/podcasts), transcribes, and auto-updates the CRM (goals, industry, who they want to meet, revenue targets, services required) + repurposes into social clips/quotes/LinkedIn/blog/email. Content team reviews before publish.
**Needs:** a meeting-notetaker/transcription service (Fathom, Otter, or an upload-and-transcribe pipeline via Whisper).
**Reusable seams:** transcription → structured extraction reuses the deck-parse pattern (`src/app/api/admin/sponsorship/deck/parse/route.ts`: file/text → OpenAI structured JSON). Member-field autofill reuses the member enrichment/gaps-only update pattern (`src/lib/enrichment/enrich-member.ts`). Content repurposing → feed the transcript into the **Marketing AI Engine** generate route (Feature 24) which already turns one asset into many, with the approval queue. So this agent is mostly a **transcript intake → route to existing engines**, not net-new generation.
**Build sketch when live:** (1) ingest transcript (webhook from the notetaker, or upload → Whisper); (2) OpenAI structured extraction → gaps-only update of the member profile (human-review the diffs for member data); (3) hand the transcript to the marketing generate route to produce draft assets into the existing approval queue. Content team approves before anything publishes.
