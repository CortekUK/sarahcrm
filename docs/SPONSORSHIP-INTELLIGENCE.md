# Sponsorship Intelligence & AI Sales Assistant — Build Spec & Handover

V2 headline **Feature 25**. Built 2026-07-25 via the sub-agent → orchestrator-review workflow (same as Marketing AI Engine & Team Accountability). Migration applied live; `npm run build` passing.

---

## What this is (client requirement, from Sarah's transcript)

Feature 25 (and spec §8 "AI Sponsorship Sales Assistant" + the Sponsorship Automations section): *match ideal sponsors to events and guestlists, find decision-makers, and draft personalised outreach + follow-up — with a sponsor portal showing assets, guest allocation, deadlines and ROI.*

The CRM already had a solid **sponsorship spine** (proposals, ROI, sponsor portal, delivery checklist, follow-up chasers). What was missing — and explicitly deferred in code (`sponsors/proposal/route.ts:11-13`, `automations/run.ts:435`) — was the **intelligence layer**. This feature adds exactly that layer on top of the existing spine; it does NOT rebuild the spine.

## Locked product decisions (confirmed with the user — DO NOT re-litigate)

- **Match inputs = all three together:** event details (type/venue/theme/description) + the confirmed guestlist's sectors/companies + an optional free-text brief or parsed deck. (User: "all three.")
- **Prospect pool = WARM-FIRST** (Sarah #9, verbatim): prioritise past sponsors + CRM members flagged `sponsor_aligned` + warm leads; use the data vendor for **selective, clearly-labelled COLD** targets only. Warm always ranks above cold (+20 score boost).
- **Outreach = AI draft → human review/edit → approve → send.** Nothing sends without an explicit approve. Sends via existing Resend. Multi-step follow-up **sequences now run in the CRM** (2026-10-16 — see "Sequences + reply tracking" below); every step still needs its own approval. `InstantlySender` stays an unused stub.
- **Two brand voices** reused from the Marketing engine (`marketing_voices` keys `club`/`sarah`) so voice edits apply everywhere.
- **Vendor-agnostic:** NO sponsorship file names a vendor. Everything sits behind the existing `EnrichmentProvider` abstraction, extended with company- + people-search. **Clay** is the live plug-in (Public Search API — see go-live section); Apollo has been removed.
- **Convert bridge:** a prospect becomes a real event sponsor via "Add to event sponsors" → creates a `sponsorships` row → flows into the existing proposal/invite/ROI/portal tools.

## Explicitly OUT / deferred (what we did NOT build — pick up here)

1. ~~**Live Clay integration.**~~ **DONE** — live via Clay's synchronous Public Search API (see go-live section; the old async-webhook assessment was wrong/obsolete).
2. **Deck FILE upload.** `deck/parse` route supports `asset_path` (PDF via pdfjs-dist, DOCX via mammoth) **and** pasted `text`. The UI wires only the **paste-text** path — no file-upload-to-`sponsor-assets` control yet (MediaPicker is image/video-only). pptx is unsupported by design (export to PDF).
3. ~~**Instantly / automated sequences.**~~ **DONE in-CRM (2026-10-16)** — scheduled follow-up steps sent by the daily automation runner, each still human-approved. Instantly is no longer the plan; `InstantlySender` remains an unused stub.
4. ~~**Reply / bounce tracking.**~~ **DONE (2026-10-16)** — replies matched from the synced Gmail table (`gmail_messages`), bounces + opens from the Resend webhook. See "Sequences + reply tracking".
5. **Deeper cold-targeting criteria.** Sarah #9 lists sector, brand fit, client demographic, geography, sponsorship budget, existing relationships, previous engagement. We use sector/keywords/employee-range/location. "Sponsorship budget," "client demographic," and "previous-engagement scoring" are not yet modelled as filters.
6. **Deck brief not persisted.** `deck/parse` returns a brief to the client which passes it into `match`; the deck file/brief is not stored on the event.
7. **One-click convert + deep-link.** "Add to event sponsors" lives in the expanded prospect row; a top-level row shortcut and a direct link to the event's Sponsors panel were offered as optional polish (not yet built).

## Reuse map (verified paths — copy these patterns, don't reinvent)

- Admin auth / service-role: `requireAdmin()` + `getAdmin()` from `src/lib/marketing/admin.ts` (untyped client — the new `sponsor_*` tables are intentionally absent from `src/types/database.ts`).
- RLS helpers: `public.is_admin()` / `public.is_staff()`. Updated-at trigger: `public.handle_updated_at()` (from `20260728_sop_library.sql`).
- AI text: inline `new OpenAI`, `process.env.OPENAI_MODEL || 'gpt-4o-2024-08-06'`, structured output `response_format: {type:'json_schema', json_schema:{...strict...}}` + Zod, `logOpenAIUsage` from `src/lib/ai/usage-logger.ts`. Voice: `buildVoiceContext(voice)` + `CLUB_VOICE` + `marketing_voices` (copied from `src/app/api/admin/marketing/generate/route.ts`).
- Closest analog for AI + fallback: `src/app/api/admin/sponsors/proposal/route.ts`.
- Email: `renderClubEmail` + `sendClubEmail` from `src/lib/email/club-email.ts` (Resend; logs `email_log`).
- Adapter-seam template: `src/lib/marketing/publish/` → mirrored as `src/lib/sponsorship/outreach/`.
- House UI only from `@/components/ui`. Pipeline stage mapper: `src/lib/pipeline/stages.ts` (`sponsorshipStage`).
- Existing spine reused for the won tail: `/api/admin/sponsors/{proposal,invite,roi}`, sponsor portal `/sponsor/[token]`, `sponsor_deliverables`, follow-up chasers in `src/lib/automations/run.ts`.

## Data model — `supabase/migrations/20260801_sponsorship_intelligence.sql` (applied live)

Three new admin-only RLS tables (`for all using(is_admin()) with check(is_admin())`):
- **`sponsor_prospects`** — one candidate company per event. Provenance (`source`, `temperature` warm/cold, `source_ref_id`, `vendor`, `vendor_raw`), ranking (`match_score` 0-100, `match_reasons` jsonb, `ai_rationale`), funnel `status` (`suggested`→…→`won`/`lost`/`dismissed`), `converted_sponsorship_id` FK→`sponsorships`. Partial-unique on `(event_id, lower(company_domain))`.
- **`sponsor_decision_makers`** — people per prospect (name/title/seniority/email/linkedin, `is_primary`).
- **`sponsor_outreach`** — the review queue: `step`, `sender` (resend|instantly), `voice`, `subject`, `body_html`, `body_text`, `status` (draft|approved|scheduled|sent|failed|replied|bounced), `to_email`, `approved_by`/`approved_at`, `sent_at`, `external_id`, `response_at`, `response_snippet`.

## Vendor abstraction (extended, not replaced) — `src/lib/enrichment/`

- `types.ts`: `SearchCriteria`, `SponsorCandidate`, `DecisionMaker`, `CapabilityStatus` (`ok|unavailable|upgrade_required|error`), `SearchResult<T>`.
- `provider.ts`: `enrich` stays required; added OPTIONAL `capabilities`, `searchCompanies?`, `searchPeople?`.
- `index.ts`: `providerCan()` + safe wrappers **`searchSponsorCompanies()`** / **`searchDecisionMakers()`** (feature code calls ONLY these — never a provider directly). Factory `getEnrichmentProvider()` returns Clay when `CLAY_API_KEY` is set, Stub fallback.
- `clay.ts` (+ `clay-client.ts`, `clay-query.ts`, `clay-constants.ts`): live Clay provider — `searchCompanies`, `searchPeople`, `enrich`; quota exhausted (402) **degrades to `upgrade_required`**. (Apollo provider removed.)
- `stub.ts`: capabilities false → `unavailable`.

## Outreach sender seam — `src/lib/sponsorship/outreach/`
`OutreachSender` interface; `ResendSender` (real, wraps `sendClubEmail`, category `sponsor_outreach`); `InstantlySender` (stub, throws — unused); `getSender(channel)`.
Sequence modules (2026-10-16): `sequence.ts` (lifecycle, `dispatchOutreach` = the ONE send path with the hard `status==='approved'` guard, `scheduleNextStep`, `computeDueAt`, `cancelPendingSteps`), `runner.ts` (`sponsorOutreachSequences` — daily flow), `replies.ts` (`detectOutreachReplies` — Gmail-table reply matching), `tracking.ts` (`recordOutreachEngagement` — Resend open/click/bounce), `render.ts` (`renderOutreachHtml` — re-renders body_html after an edit).

## API routes — `src/app/api/admin/sponsorship/`
- `match` POST `{event_id, brief?, deck_brief?}` — warm gather + audience signal (bookings) + selective cold (only if warm<8) + OpenAI ranking (rule fallback) + warm +20 + upsert preserving human status.
- `prospects` GET `?event_id=` (warm-first) / PATCH `{id,status}`.
- `decision-makers` POST `{prospect_id, role_filters?}` (persists; degrades) / GET.
- `deck/parse` POST `{asset_path?|text?}` → `{deck_brief, target_sectors, keywords}`.
- `outreach/draft` POST `{prospect_id, decision_maker_id?, voice?, steps?, delays?, note?}` — AI first-touch + follow-ups in chosen voice → draft rows sharing one `sequence_id`; `delays[i]` = days between step i and step i+1 (default 3, 4, 7, 7).
- `outreach` GET `?event_id=&status=&sequence_id=` (queue; flattens company_name + decision_maker_name + `prospect_replied_at`) / PATCH (edit — subject/body edits re-render `body_html`; approve / unapprove / cancel; `auto_send` = approve-and-schedule; `delay_days`; `stop_sequence`; cannot set `sent`/`replied`/`bounced`).
- `outreach/send` POST — calls `dispatchOutreach`: **HARD GATE: status must be `approved`**; claims the row (no double send); uses `getSender` seam; bumps prospect → `contacted`; stamps the next step's `due_at`.
- `convert` POST `{prospect_id, decision_maker_id?, package_name?, amount_pence?}` — creates a `sponsorships` row + links prospect (`converted_sponsorship_id`, status `won`). Idempotent.

## Sequences + reply tracking (2026-10-16) — migration `20261016_sponsor_outreach_sequences.sql`
**New columns** on `sponsor_outreach`: `sequence_id`, `delay_days` (days after the PREVIOUS step is sent), `due_at`, `auto_send`, `send_claimed_at`, `opened_at`, `clicked_at`, `response_gmail_message_id`; status `cancelled` added. `sponsor_prospects.replied_at`.

**Lifecycle.** `draft` → (admin) `approved` → sent by hand at any time, **or** (admin) "Approve & schedule" = `approved` + `auto_send=true` (shown as **scheduled**; not a separate DB status). `due_at` stays null until the previous step is sent; then `due_at = previous.sent_at + delay_days`. A scheduled first touch (no earlier step) is due straight away; an unscheduled first touch never has a due date. **Editing the subject/body of an approved step returns it to draft** (approval, `auto_send` and `due_at` cleared) — it must be re-approved. The daily runner (`runAllAutomations` → `sponsorOutreachSequences`, at the configured UK send-hour) sends only rows that are `approved` AND `auto_send` AND `due_at <= now` AND whose prospect hasn't replied (and whose address hasn't bounced), through the same `dispatchOutreach` the Send button uses (max 50 a run). Drafts are never sent. Unapprove clears the schedule. Send errors → `failed` (admin can move it back to draft).

**Reply stop.** `detectOutreachReplies` runs after every Gmail sync (`/api/cron/gmail-sync`) and again at the start of the daily runner. It reads `gmail_messages` only (never the Gmail API): an INBOUND message received after a step was sent, from the exact recipient address, or from the same company domain (not free-mail) with the step's subject (ignoring Re:/Fwd:). Out-of-office / auto-replies / mailer-daemon are ignored. On a match: that step → `replied` (+ `response_at`, `response_snippet`), every draft/approved step for the prospect → `cancelled`, `sponsor_prospects.replied_at` set, prospect → `responded` (if earlier). **Reply-To:** outreach is sent from `RESEND_FROM_EMAIL` (`noreply@…`, not synced), so every step sets Resend `reply_to` = `SPONSOR_OUTREACH_REPLY_TO`, defaulting to `GOOGLE_WORKSPACE_SUBJECT` (Sarah's synced inbox). Replies land there and sync as inbound mail from the prospect's address; matching ignores which synced mailbox a message is in. Limits: the reply-to inbox must be enabled in the Gmail sync config (`app_settings.gmail_sync_config`), otherwise nothing is caught; if neither env var is set there is no reply-to and replies go to the no-reply address; a reply from a personal address or another domain isn't caught; a forwarded thread with a changed subject from a colleague isn't caught.

**Opens/bounces.** `/api/webhooks/resend` matches `data.email_id` to `sponsor_outreach.external_id`: opens/clicks stamp `opened_at`/`clicked_at` ("Opened" badge); a bounce sets `bounced` and cancels the remaining steps to that address. Opens need open tracking enabled on the Resend domain.

**UI.** Queue rows show step, due/sent date, Opened and Replied badges, display status (draft/approved/scheduled/sent/replied/bounced/failed/cancelled). The editor has a Sequence timeline, "Send after (days)", Approve, Approve & schedule, Schedule/Unschedule, Unapprove, Cancel step, Back to draft, Stop sequence, Send / Send now. ProspectsView shows a "Replied" badge; the draft modal takes "Days between steps".

## UI + nav
- New top-level **Sponsorship** nav group (`src/app/(admin)/layout.tsx`): Hub / Prospects / Review queue.
- Views (`src/views/admin/sponsorship/`): `SponsorshipHub` (event picker + brief/deck + Find ideal sponsors + StatCards, embeds ProspectsView), `ProspectsView` (compact rows; warm/cold badges; match score; expand → reasons/rationale/description + decision-makers + "Add to event sponsors"), `OutreachQueueView` (Event·Status·Voice filters; rows show company + voice badge; editor Modal with the visible approve→send gate).
- Deep-link "Find ideal sponsors" added to `src/views/admin/events/SponsorsPanel.tsx`.

## How we work (workflow — unchanged from Marketing/Team Accountability)
Sub-agent (Opus) builds one chunk → orchestrator reviews (live RLS check via Supabase Management API curl, grep new files for `ui-shadcn` + vendor-name leaks, `npx tsc --noEmit`, `npm run build`, decision-compliance, regression) → fix/send-back → hand user "done + how to test." User tests at the end.

---

# ═══════ STATUS & HANDOVER (2026-07-25) ═══════

## COMPLETE end-to-end, reviewed, build-passing
Discover → rank (warm-first) → decision-makers → AI outreach (2 voices) → review queue → human-gated send → **convert to real event sponsor** → existing proposal/invite/ROI/portal spine. Verified live: tsc clean, build passes (3 pages + 8 API routes incl. `convert`), RLS admin-only, two voices produce distinctly different copy, send works (logged to `email_log`).

## Current runtime state
- `ENRICHMENT_PROVIDER=clay` + `CLAY_API_KEY` (updated 2026-10-07). Company (cold) search and decision-maker search both run on Clay; `upgrade_required` now means the Clay search quota for the period is used up.
- Test data seeded: members **Ralph Lauren, Aether Lounge, Mistoria** flagged `sponsor_aligned=true` (reversible — set false to undo).

## ═══ CLAY GO-LIVE — ✅ LIVE (updated 2026-10-07) ═══
Clay is **live** via Clay's **Public Search API**, which IS synchronous (create a search with `POST /search/query-mode {query}`, run it with `POST /search/query-mode/{search_id}/run {limit}`; rows come back in the same request). The earlier "async table+webhook only" assessment, the Enterprise-lookup option and the `clay-callback` / Growth-plan plan are all **obsolete** — nothing async was needed, and no feature code changed (the wrappers in `src/lib/enrichment/index.ts` stayed the same).
- `ClayProvider` (`src/lib/enrichment/clay.ts`) implements all three methods: `searchCompanies` (industry enum, or description keywords only when no industry matched / HQ country or city / size + revenue buckets; returns `unavailable` instead of an unfiltered search when no criteria survive), `searchPeople` (people currently at the domain — leadership seniorities, or job titles similar to `role_filters`), and `enrich` (company by domain + named person at the company).
- Query building + Clay enum values: `clay-query.ts`, `clay-constants.ts`. HTTP (axios, 20s timeout, 429 retry, 402 → quota exhausted): `clay-client.ts`.
- Apollo has been removed. Factory: Clay whenever `CLAY_API_KEY` is set (`ENRICHMENT_PROVIDER` optional, defaults to `clay`), else Stub.
- Limits to know: no emails and no seniority in Clay people results (seniority derived from title); company size/revenue are buckets; usage is metered by a per-period **search quota** (402 → `upgrade_required`), so enquiry/member enrichment is **manual-only**.
