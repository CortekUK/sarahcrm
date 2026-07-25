# Sponsorship Intelligence & AI Sales Assistant — Build Spec & Handover

V2 headline **Feature 25**. Built 2026-07-25 via the sub-agent → orchestrator-review workflow (same as Marketing AI Engine & Team Accountability). Migration applied live; `npm run build` passing.

---

## What this is (client requirement, from Sarah's transcript)

Feature 25 (and spec §8 "AI Sponsorship Sales Assistant" + the Sponsorship Automations section): *match ideal sponsors to events and guestlists, find decision-makers, and draft personalised outreach + follow-up — with a sponsor portal showing assets, guest allocation, deadlines and ROI.*

The CRM already had a solid **sponsorship spine** (proposals, ROI, sponsor portal, delivery checklist, follow-up chasers). What was missing — and explicitly deferred in code (`sponsors/proposal/route.ts:11-13`, `automations/run.ts:435`) — was the **intelligence layer**. This feature adds exactly that layer on top of the existing spine; it does NOT rebuild the spine.

## Locked product decisions (confirmed with the user — DO NOT re-litigate)

- **Match inputs = all three together:** event details (type/venue/theme/description) + the confirmed guestlist's sectors/companies + an optional free-text brief or parsed deck. (User: "all three.")
- **Prospect pool = WARM-FIRST** (Sarah #9, verbatim): prioritise past sponsors + CRM members flagged `sponsor_aligned` + warm leads; use the data vendor for **selective, clearly-labelled COLD** targets only. Warm always ranks above cold (+20 score boost).
- **Outreach = AI draft → human review/edit → approve → send.** Nothing sends without an explicit approve. Sends via existing Resend today; **Instantly stubbed** for automated multi-step sequences later.
- **Two brand voices** reused from the Marketing engine (`marketing_voices` keys `club`/`sarah`) so voice edits apply everywhere.
- **Vendor-agnostic:** NO sponsorship file names a vendor. Everything sits behind the existing `EnrichmentProvider` abstraction, extended with company- + people-search. Apollo is today's plug-in; **Clay drops in** by implementing `clay.ts` + one env line (see go-live section). User is swapping Apollo→Clay (~late July 2026).
- **Convert bridge:** a prospect becomes a real event sponsor via "Add to event sponsors" → creates a `sponsorships` row → flows into the existing proposal/invite/ROI/portal tools.

## Explicitly OUT / deferred (what we did NOT build — pick up here)

1. **Live Clay integration.** Clay has NO synchronous REST search API (it's async table+webhook based — verified against Clay docs). A drop-in synchronous `ClayProvider.searchCompanies()` cannot exist; going live with Clay means either (a) confirm Enterprise-tier lookup API (limited: domain/LinkedIn/email, no criteria company search), or (b) build the async webhook flow (Clay table in + HTTP action out → a new callback route → prospects written back → UI polls). Decision pending with user.
2. **Deck FILE upload.** `deck/parse` route supports `asset_path` (PDF via pdfjs-dist, DOCX via mammoth) **and** pasted `text`. The UI wires only the **paste-text** path — no file-upload-to-`sponsor-assets` control yet (MediaPicker is image/video-only). pptx is unsupported by design (export to PDF).
3. **Instantly / automated sequences.** The follow-up steps are drafted, but each step is sent **manually** one-by-one via Resend after approval. No automated drip/schedule. `InstantlySender` is a stub that throws.
4. **Reply / bounce tracking.** `sponsor_outreach` has `response_at`, `response_snippet`, and `replied`/`bounced` statuses, but nothing **populates** them — needs inbound-email parsing (ties into the Gmail-sync chunk). Manual for now.
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
- `index.ts`: `providerCan()` + safe wrappers **`searchSponsorCompanies()`** / **`searchDecisionMakers()`** (feature code calls ONLY these — never a provider directly). Factory `getEnrichmentProvider()` has a Clay branch ahead of Apollo, Stub fallback.
- `apollo.ts`: `searchCompanies` (`mixed_companies/search`) + `searchPeople` (`mixed_people/search`); people-search **degrades to `upgrade_required`** on 403 / `API_INACCESSIBLE` (free tier). `enrich()` unchanged.
- `stub.ts`: capabilities false → `unavailable`. `clay.ts`: documented stub (throws / returns error status) with wiring instructions.

## Outreach sender seam — `src/lib/sponsorship/outreach/`
`OutreachSender` interface; `ResendSender` (real, wraps `sendClubEmail`, category `sponsor_outreach`); `InstantlySender` (stub, throws); `getSender(channel)`.

## API routes — `src/app/api/admin/sponsorship/`
- `match` POST `{event_id, brief?, deck_brief?}` — warm gather + audience signal (bookings) + selective cold (only if warm<8) + OpenAI ranking (rule fallback) + warm +20 + upsert preserving human status.
- `prospects` GET `?event_id=` (warm-first) / PATCH `{id,status}`.
- `decision-makers` POST `{prospect_id, role_filters?}` (persists; degrades) / GET.
- `deck/parse` POST `{asset_path?|text?}` → `{deck_brief, target_sectors, keywords}`.
- `outreach/draft` POST — AI first-touch + follow-ups in chosen voice → draft rows.
- `outreach` GET (queue; flattens company_name + decision_maker_name) / PATCH (edit + approve/unapprove; cannot set `sent`).
- `outreach/send` POST — **HARD GATE: status must be `approved`**; uses `getSender` seam; catches Instantly throw; bumps prospect → `contacted`.
- `convert` POST `{prospect_id, decision_maker_id?, package_name?, amount_pence?}` — creates a `sponsorships` row + links prospect (`converted_sponsorship_id`, status `won`). Idempotent.

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
- `ENRICHMENT_PROVIDER=apollo` (free key). Company (cold) search works; **decision-maker/people search returns `upgrade_required`** ("needs a paid vendor plan") until Apollo is upgraded OR Clay is wired.
- Test data seeded: members **Ralph Lauren, Aether Lounge, Mistoria** flagged `sponsor_aligned=true` (reversible — set false to undo).

## ═══ CLAY GO-LIVE (deliberately NOT built; blocked on approach) ═══
Clay is async table+webhook based — no synchronous search endpoint. Options: (a) **Enterprise lookup API** if the plan allows (limited: domain/LinkedIn/email lookups → maps to `enrich`/`searchPeople`, NOT criteria `searchCompanies`); implement in `src/lib/enrichment/clay.ts`, set `ENRICHMENT_PROVIDER=clay` + `CLAY_API_KEY`, zero feature changes. (b) **Async webhook flow**: Clay table (webhook in + HTTP action out) → new `/api/admin/sponsorship/clay-callback` route → write prospects back → make `match` kick-off async + UI poll. Bigger build. **Decision pending with user.** A Clay API key was provided for later use (to be rotated).
