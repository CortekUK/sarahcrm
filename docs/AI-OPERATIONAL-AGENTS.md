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
- **Phone receptionist** — needs telephony (Twilio/Vapi-type).
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

---

# STATUS & HANDOVER (2026-07-25)

## COMPLETE, reviewed, build-passing
All three agents: tsc clean, `npm run build` passes, migrations live (RLS admin-only), no `ui-shadcn`, no vendor leaks, all Chief-of-Staff column assumptions verified live, concierge protections verified in code.

## Scheduling note
Chief of Staff email + Member Success recompute run inside `runAllAutomations`, which the cron fires once/day at `app_settings.daily_send_hour` (Europe/London, default 7). To preview without waiting: hit the cron with `?dryRun=true`, or use the in-page "Generate" / "Recompute now" buttons.

## Outstanding / deferred (pick up here)
- WhatsApp assistant, phone receptionist, onboarding-call recorder (need external accounts).
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

## B. AI Phone Receptionist — BLOCKED on a telephony/voice service
**What it does:** answers inbound calls about membership/concierge, qualifies the caller, books an appointment.
**Needs:** a voice-AI/telephony provider (Vapi, Twilio Voice + a realtime voice model, Retell, or similar) + a phone number.
**Reusable seams:** same qualification/enquiry-creation logic (`/api/enquiries/intake`) and the concierge system-prompt approach; calendar booking would reuse whatever call-booking flow the CRM uses (currently none dedicated — likely a `tasks`/meeting record + `notifyAdmins`).
**Build sketch when live:** provider handles speech↔text; our webhook receives the transcript/intent turns and runs the same qualify → create-enquiry → book/notify logic. Transcript stored like the concierge conversation. Human approval for anything committing The Club.

## C. Onboarding-Call Recorder — BLOCKED on a meeting-transcription service
**What it does (Sarah's scope, #5):** joins/records an onboarding (or speeches/panels/podcasts), transcribes, and auto-updates the CRM (goals, industry, who they want to meet, revenue targets, services required) + repurposes into social clips/quotes/LinkedIn/blog/email. Content team reviews before publish.
**Needs:** a meeting-notetaker/transcription service (Fathom, Otter, or an upload-and-transcribe pipeline via Whisper).
**Reusable seams:** transcription → structured extraction reuses the deck-parse pattern (`src/app/api/admin/sponsorship/deck/parse/route.ts`: file/text → OpenAI structured JSON). Member-field autofill reuses the member enrichment/gaps-only update pattern (`src/lib/enrichment/enrich-member.ts`). Content repurposing → feed the transcript into the **Marketing AI Engine** generate route (Feature 24) which already turns one asset into many, with the approval queue. So this agent is mostly a **transcript intake → route to existing engines**, not net-new generation.
**Build sketch when live:** (1) ingest transcript (webhook from the notetaker, or upload → Whisper); (2) OpenAI structured extraction → gaps-only update of the member profile (human-review the diffs for member data); (3) hand the transcript to the marketing generate route to produce draft assets into the existing approval queue. Content team approves before anything publishes.
