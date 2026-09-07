# The Club by Sarah Restrick — `src/lib/` Business Logic Layer Map

This document maps every file under `/Users/apple/Ghulam/sarahcrm/src/lib/`. It is
organised by subfolder. `src/lib` is the app's business-logic layer: pure
scoring/matching functions, Supabase data-access helpers, third-party API
clients (Stripe, Xero, DocuSign, Google Workspace, Resend, OpenAI, Apollo,
WhatsApp, Metricool/Instantly), and the automation/AI engines that drive the
CRM for "The Club by Sarah Restrick" — a private members' business club selling
memberships, running curated events, brokering introductions between members,
and selling event sponsorships.

---

## Top-level files (directly in `src/lib/`)

### `src/lib/accountability.ts`
Business meaning: shared constants/helpers for the **Accountability** module — the internal staff task-tracking tool (separate from CRM member data). A task has a status, is assigned to a person, can have comments/attachments/activity history, and file uploads go to a private Supabase Storage bucket.

Exports:
| Export | Signature | Description |
|---|---|---|
| `ACC_BUCKET` | `'accountability-files'` | Storage bucket name |
| `AccStatus` | type | `'not_started' \| 'in_progress' \| 'blocked' \| 'done'` |
| `ACC_STATUS_META` | const map | label + badge variant per status |
| `ACC_STATUS_OPTIONS` | const array | `{value,label}` list for selects |
| `personName(p)` | `(PersonLite\|null) => string` | "First Last" or "Someone"/"Unnamed" |
| `isAccOverdue(t)` | `(AccTaskRow) => boolean` | true if deadline passed and not done |
| `describeActivity(a, peopleById)` | `(AccActivityRow, Record) => string` | human-readable activity log line (created/status_changed/reassigned/outcome_recorded/comment_added/attachment_added) |
| `uploadAccAttachment(taskId, file, uploadedBy)` | async | uploads file to storage + inserts attachment row; rolls back storage on DB failure |
| `accSignedUrl(filePath)` | async | 10-minute signed download URL |

No AI. No scoring formulas. Business rule: attachment path is `<taskId>/<uuid>-<sanitized filename>`.

### `src/lib/finance-tasks.ts`
Business meaning: shared logic for **Module 6 — Accountant Auto-Escalation**. A "finance task" is a recurring deliverable (monthly/quarterly/annual) with three tiers of contact (accountant → Finance Director → Sarah). Each period generates one "occurrence" with a computed due date; overdue occurrences escalate up the contact chain.

Key exports:
| Export | Description |
|---|---|
| `Cadence` | `'monthly' \| 'quarterly' \| 'annual'` |
| `CADENCE_OPTIONS` / `CADENCE_LABEL` | UI labels |
| `ESCALATION_DAYS` | `{ accountant: 0, director: 3, final: 7 }` — **hardcoded escalation thresholds in days overdue** |
| `ESCALATION_LEVEL_META` | label/variant per level 0–3 |
| `contactForLevel(task, level)` | returns `{role, name, email}` for level 1 (Accountant) / 2 (Finance Director) / 3 (Sarah) |
| `todayDate()`, `daysLate(dueDate, ref?)`, `formatDate(date)` | date helpers (YYYY-MM-DD arithmetic) |
| `currentPeriods(cadence, dueDay, ref?)` | computes the CURRENT period's due date |
| `formatPeriodLabel(label)` | "July 2026" / "Q3 2026" / "2026" |

**Business rule — period → due date mapping** (documented as a fixed spec choice since the client spec only gave a day-of-month):
- monthly → period `YYYY-MM`; due date = `due_day` of that month.
- quarterly → period `YYYY-Qn`; due date = `due_day` of the quarter's FINAL month (Mar/Jun/Sep/Dec).
- annual → period `YYYY`; due date = `due_day` of December.
- `due_day` is constrained 1–28 (always valid in every month).

Escalation cadence (levels emailed once each, in `automations/finance-escalation.ts`): Level 1 (Accountant) at ≥0 days overdue, Level 2 (Finance Director) at ≥3 days, Level 3 (Sarah) at ≥7 days. Idempotent via `escalation_level` column.

### `src/lib/handover.ts`
Business meaning: **Daily Handover** — every staff member submits one end-of-day handover per calendar day (4 free-text fields); an admin can condense a day's handovers into "Sarah's Daily Leadership Report."

Exports: `HANDOVER_FIELDS` (4 fields in display order — `completed_today`, `working_tomorrow`, `blocked`, `support_needed` — each with label+placeholder), `handoverHasContent(h)`, `today()`, `addDays(date,n)`, `isToday(date)`, `formatHandoverDate(date)`. Pure date-string helpers, no AI.

### `src/lib/scorecards.ts`
Business meaning: **Weekly Scorecards** — Monday-to-Sunday KPI tracking per staff member. Each target has a `source` deciding how its actual value is computed.

Key logic:
- `ScorecardSource`: `'manual'` (staff self-report), `'tasks_completed'` (auto-count of `accountability_tasks` with `status='done'` updated in the week), `'hours_logged'` (auto-sum of `time_entries.hours` in the week).
- `mondayOf(date)`, `weekEnd(weekStart)`, `addWeeks`, `formatWeekRange`, `isCurrentWeek` — week-boundary date helpers.
- `actualForTarget(target, auto)` — dispatches on source.
- `isTargetMet(target, auto)` — target met if `actual >= target_value`; a target_value ≤0 is always "met" (nothing required).
- `computeScore(targets, auto)` — **score = round(met / total × 100)**, 0 when no targets.
- `tasksCompletedInWeek(tasks, weekStart)`, `hoursLoggedInWeek(entries, weekStart)` — reducers over already-fetched rows.

### `src/lib/sops.ts`
Business meaning: **SOP Library (Module 7)** — admin-authored rich-text "knowledge that doesn't walk out the door." Draft/published states; staff only see published.

Exports: `CATEGORY_SUGGESTIONS` (free-text category hints: Onboarding, Sponsorship, Events, Finance, Membership, Renewals, General), `STATUS_META`, `groupByCategory(sops)` (groups + sorts by suggestion order then alpha), `sanitizeSopHtml(html)` (DOMPurify allow-list: p/br/strong/b/em/i/u/s/blockquote/code/pre/h1-4/ul/ol/li/a/hr/span/div; attrs href/target/rel only), `toPlainText(html)` (strips to plain text preserving block-boundary spacing).

### `src/lib/time-tracking.ts`
Business meaning: **Time Tracking** module. A "project" is an Event; staff log time against their own accountability tasks; profitability = manual event revenue − staff cost (cost = Σ hours × that staff member's hourly rate). Money here is in **pounds**, not pence (unlike the rest of the app).

Exports: `formatHours(hours)` ("2.5h"), `formatPounds(pounds)` (GBP Intl formatter, pounds not pence), `hoursBetween(startIso,endIso)` (rounded 2dp, never negative), `isRunningTimer(e)` (source='timer' && no ended_at), `elapsedClock(startIso, nowMs)` ("HH:MM:SS"), `sumHours(entries)`.

### `src/lib/utils.ts`
General UI/formatting utilities used app-wide:
- `cn(...inputs)` — tailwind-merge + clsx.
- `formatCurrency(pence)` — **pence → £ with commas** (the standard money formatter used everywhere else in the app).
- `formatDate(date)`, `formatDateTime(date)` — UK-format date/datetime.
- `slugify(text)`, `titleCase(text)`.

---

## `src/lib/ai/` — the AI/agent layer

### `src/lib/ai/attachments.ts`
Business meaning: client-side file ingestion for the **template-builder AI chat** (the admin can attach files when asking the AI to draft an email template). Extracts text from PDFs/DOCX/XLSX in-browser so the AI pipeline only ever deals with text/image payloads.

Limits (hardcoded): `MAX_ATTACHMENTS=6`, `MAX_IMAGE_BYTES=8MB`, `MAX_TEXT_BYTES=256KB`, `MAX_DOC_BYTES=25MB`, `MAX_EXTRACTED_CHARS=200,000`, `MAX_COMBINED_EXTRACTED_CHARS=200,000`.

Exports: `TEXT_EXTENSIONS` (allow-list of ~35 code/text extensions), `ACCEPT_ATTRIBUTE` (the `<input accept>` string), `AiAttachment` type (`image` | `text` variants), `fileExt`, `chipKindForFile`, `chipBadge`, `capExtracted(text,name)` (truncates with a notice), `readAttachment(file)` (async: routes to `extractPdfText` (pdfjs-dist), `extractDocxText` (mammoth), `extractSpreadsheetText` (xlsx → CSV per sheet), or raw text read; throws user-facing error strings for unsupported/oversized/legacy-`.doc` files).

No AI call itself — this is pre-processing before the AI sees the content.

### `src/lib/ai/usage-logger.ts`
Business meaning: lightweight OpenAI cost/latency observability. Logs to console only (no DB usage-history table exists yet).

Export: `logOpenAIUsage({feature, model, startedAt, usage?, error?, userId?})` — computes latency, logs `[openai] success` or `[openai] error` with token counts.

### `src/lib/ai/tools/registry.ts`
Business meaning: the **tool registry for the agentic template-builder AI** (used by `/api/templates/ai-generate`). Gives the OpenAI model READ-ONLY query tools against the CRM's Supabase data so it can ground email drafts in real events/members/applications/etc. Mutations always flow through the structured JSON response path, never through tools.

**AI usage**: Model-agnostic here (model chosen by the calling route), but this defines `ChatCompletionTool[]` with `strict: true` (OpenAI Structured Outputs — every property required, `additionalProperties:false`).

Tools defined (`AGENT_TOOLS`), each a `type:'function'` with strict JSON schema:
| Tool | Purpose |
|---|---|
| `list_events` | list Club events, filter by status/time/limit |
| `get_event` | full detail + booking count for one event (id or slug) |
| `list_members` | list active members, filter by tier |
| `list_applications` | list membership applications, filter by status |
| `list_bookings` | list event bookings, filter by event/status |
| `list_enquiries` | list contact-form enquiries |
| `list_subscribers` | list newsletter subscribers (returns only a 10-row sample + visible_count, for privacy/token cost) |
| `list_reviews` | list submitted reviews/testimonials |

`runAgentTool(name, args, admin)` — dispatches to the matching handler, returns `{error}` (never throws) on failure so the model can recover. `AGENT_TOOL_NAMES` — exported list of tool names. Handlers query Supabase directly with a service-role client and format money via `formatGBP` (pence→"£X.XX" string).

---

## `src/lib/chief-of-staff/` — Sarah's daily leadership briefing (V2 Feature)

### `src/lib/chief-of-staff/aggregate.ts`
Business meaning: pulls together a business-wide snapshot every morning — memberships, sales pipeline, events, team overdue tasks, finance, introductions, and risk flags — so Sarah gets one briefing instead of hunting through the dashboard. Every sub-query is wrapped in a `safe()` helper that defaults to zero/empty on error so one bad query never kills the whole briefing.

Export: `buildChiefOfStaffData(admin, now)` → `ChiefOfStaffData`:
- `memberships`: active count, pending applications, renewing within 30 days.
- `pipeline`: **reuses `src/lib/pipeline/stages.ts`** stage classifiers (`membershipStage`, `sponsorshipStage`, `conciergeStage`, `introductionStage`, `isOpenStage`) so the numbers reconcile with the Pipeline board / Executive Dashboard. Sums open-stage value per stream (membership/sponsorship/concierge/introductions) plus unpaid commission across concierge+introductions.
- `events`: events starting within 14 days; sponsor deliverables (`sponsor_deliverables`, not yet received) due within 7 days.
- `team`: `accountability_tasks` not done with `deadline < now`, resolved to owner names.
- `finance`: outstanding `payments` (pending/overdue) = debtors; overdue invoice count; **MRR** = Σ over active members with a live Stripe subscription of their tier's `membership_plans.monthly_price_pence`.
- `introductions`: count awaiting follow-up (sent/scheduled/accepted with no outcome) and count created this month.
- `risks`: members with `churn_risk_score >= 60` (top 5), sponsor deliverables due within 14 days not received, finance task occurrences overdue and still pending.

### `src/lib/chief-of-staff/generate.ts`
Business meaning: turns the aggregated data into Sarah's plain-English morning briefing — either AI-written or a deterministic fallback — and upserts one row per UK business day.

**AI usage**: model = `process.env.OPENAI_MODEL || 'gpt-4o-2024-08-06'`, temperature 0.5. System prompt (verbatim):
> "You are Sarah's chief of staff; write a crisp, warm, plain-English morning briefing highlighting only what needs her attention today, grouped: Memberships, Sales, Events, Team, Finance, Risks. British English. No fluff."

User message includes the full `ChiefOfStaffData` JSON (money in pence) plus an instruction to reference specific figures and keep sections with nothing noteworthy to one line.

If `OPENAI_API_KEY` is missing or the call fails, falls back to `templatedNarrative(data)` — a fully deterministic paragraph-by-paragraph narrative built directly from the numbers (memberships/sales/events/team/finance/risks), so a briefing is ALWAYS producible even with zero AI cost.

Exports: `londonToday(now?)` (Europe/London YYYY-MM-DD, keyed to the UK business day matching the cron), `generateChiefOfStaffReport(admin, {userId?, now?})` — upserts `chief_of_staff_reports` on conflict `report_date`.

---

## `src/lib/automations/` — the scheduled email/automation engine

This is the heart of the CRM's lifecycle marketing and operational automation. One entry point, `runAllAutomations(dryRun)`, runs every flow. All flows are **best-effort, idempotent, and dry-run-safe**.

### `src/lib/automations/run.ts` (1,685 lines)
Deep documentation of every automation flow + the full trigger catalogue:

**Shared machinery**
- `processFlow` — generic dedup (via `automation_log` table keyed by `flow` + `ref_id`) + send + log for simple one-shot flows.
- `processEventComms` / `loadCommsSent` — dedup via `event_comms_sent` keyed `(event_id, booking_id, kind)` for multi-stage per-attendee sequences.
- `processMemberComms` / `loadMemberCommsSent` — dedup via `member_comms_sent` keyed `(member_id, kind)`.
- `processSponsorComms` / `loadSponsorCommsSent` — dedup via `sponsor_comms_sent` keyed `(sponsorship_id, kind)`.
- All sends go through `sendClubEmail` (Resend) with the branded `renderClubEmail` shell.

**Full automation trigger catalogue** (each is a distinct flow function, run in this order inside `runAllAutomations`):

| # | Flow (`flow` key) | Trigger condition | Stages / cadence | Action |
|---|---|---|---|---|
| 1 | `welcome_journey` | active member, `membership_start_date` within last 16 days | Day 2, Day 10, Day 14 (non-overlapping bands via `daysSince`) | Day 2: onboarding-call + profile email. Day 10: "submit introduction targets" email. Day 14: **AI opportunity report** (see below) |
| 2 | `renewal_cadence` | active member, `renewal_date` within next 90 days | 90d / 60d / 30d / 7d bands via `daysUntil` | Renewal reminder email; wording forks on whether the member has "live auto-renew" (Stripe subscription id set OR `payment_frequency` in `{monthly,quarterly,annual,annually,yearly}`); at the final (7d) stage, if NOT auto-renewing, creates a `tasks` row (category='sales', priority='high', assigned to first admin) so a human chases the renewal — guarded by its own `member_comms_sent` kind (`renewal_retention_task`) so it fires once |
| 3 | `failed_payment` | `payments.status = 'failed'` | one-shot | "A payment didn't go through" email with CTA to `/portal/billing` |
| 4 | `event_reminder` (`eventReminderSequence`) | confirmed bookings on events with `status in (published, live)` starting within 15 days | 14d / 7d / 48h / morning-of bands via `hoursUntil` | Countdown reminder email per stage |
| 5 | `event_thank_you` (`postEventThankYou`) | event ended, confirmed bookings | 0–24h after event end | Thank-you email |
| 6 | `event_feedback` (`postEventFeedback`) | same | 24–48h after | Feedback-request email → `/share-your-experience` |
| 7 | `event_intro_recs` (`postEventIntroRecs`) | same, attendees only (checked_in=true or attendance='attended') | 48–96h after | **Reuses the deterministic suggestion engine** (`generateSuggestions`/`scorePairForSuggestion` from `introductions/`) scoped to ONLY that event's attendees; inserts new `introductions` rows at `status='suggested'` (never auto-sends — lands in the admin Approve/Dismiss queue). Skips (but still stamps) if <2 attendees. |
| 8 | `event_conversion` (`postEventConversion`) | same, NON-member guests only | 168–216h (7–9 days) after | "An invitation to The Club" membership-conversion email → `/memberships` |
| 9 | `invoice_chasing` | `payments.status='overdue'` OR (`pending` AND `due_date` past) | one-shot | Outstanding-balance chaser → `/portal/billing` |
| 10 | `intro_scheduled` (`scheduledIntroductions`) | `introductions` rows with `email_a_scheduled_at`/`email_b_scheduled_at` ≤ today and not yet sent | per side (a/b independently) | Sends Sarah's composed intro email to that side; stamps `email_X_sent_at`, clears the schedule, recomputes overall `status` (scheduled/sent), and bumps each member's `intros_used_this_month` soft-quota counter on first actual send |
| 11 | `sponsor_followup` (`sponsorFollowUps`) | `sponsorships.status='proposed'`, created within last 22 days | 3–7d / 7–14d / 14–21d bands via `daysSince` | Follow-up nudge to the sponsor (or linked member) email |
| 12 | `finance_escalation` | see `finance-escalation.ts` below | 0d/3d/7d overdue | Escalation emails to accountant/FD/Sarah |

Non-email housekeeping run inside `runAllAutomations` (only when `!dryRun`):
- `markOverduePayments` — flips `payments.status='pending'` past `due_date` to `'overdue'` (the ONLY place that status transition happens — feeds `invoice_chasing` and the Finance dashboard).
- `resetMonthlyQuotasIfDue` — resets every member's `intros_used_this_month` to 0 once per calendar month, tracked via `app_settings.intros_reset_month`.
- `memberSuccessSweep` — recomputes `computeMemberScores` (from `members/scoring.ts`) for every active member daily, writing back to the `members` table (mirrors the admin "Recompute now" button). Best-effort per-member; skipped entirely on dry-run.
- `chiefOfStaffDaily` — calls `generateChiefOfStaffReport` and emails the narrative to every admin via `notifyAdmins`.

**AI usage inside automations/run.ts**: the Day-14 "opportunity report" (`buildOpportunityReport`) — model = `process.env.OPENAI_MODEL || 'gpt-4o-2024-08-06'`, temperature 0.6. System prompt (verbatim):
> "You write for The Club by Sarah Restrick, a private members' business club. Voice: warm, considered, intimate, British English — never corporate or flowery. You are writing a short "opportunity report" body for a member at day 14 of membership. Return 2–3 short paragraphs of plain prose (no headings, no lists, no greeting line, no sign-off — those are added around your text). Speak directly to the member about the specific opportunities their profile points to, and reference that we have suggested members for them to meet (listed separately below your text)."

User message: the member's profile fields (company, sector, sub-sector, intro targets, dream introductions, what they can offer, business objectives) plus their top-3 suggested matches (name/company/reason) computed via `topMatchesForMember` → `scorePairForSuggestion` (same deterministic matching engine as the admin "Generate suggestions" button, just scoped to one member vs. the whole active pool). Falls back to a templated report (using only the suggestion panel, no prose) if no API key or on error.

Helper `loadActiveCandidates(admin)` / `buildAttendeeSuggestions(admin, memberIds)` — build the `MatchCandidate[]` pool from `members` + `member_tags` for the whole active membership or an event-attendee subset respectively, reusing `pairKey`/`generateSuggestions` from `introductions/`.

### `src/lib/automations/finance-escalation.ts`
Business meaning: implements Module 6's escalation logic (thresholds/contacts defined in `finance-tasks.ts`).

Algorithm each run:
1. For every ACTIVE `finance_tasks` row, ensure the current period's occurrence exists (`finance_task_occurrences`, upserted idempotently on `(finance_task_id, period_label)`); never back-dates a period whose due date precedes the task's `created_at`.
2. For every PENDING occurrence past due:
   - overdue ≥0d & level<1 → email Accountant → level 1
   - overdue ≥3d & level<2 → email Finance Director → level 2
   - overdue ≥7d & level<3 → email Sarah → level 3
   - A severely-overdue occurrence first seen at ≥7 days fires ALL applicable levels in one run.
   - Missing contact email still "consumes" the level (doesn't retry forever).
3. `escalation_level` column IS the idempotency ledger — persisted immediately after sends.

Email copy escalates in tone per level (verbatim escalation notes): L1 "This is the first reminder that the deliverable below is now due." L2 "...is now being escalated to you as Finance Director." L3 "...remains outstanding after earlier reminders and is now being escalated to you directly."

---

## `src/lib/introductions/` — the deterministic member-matching engine

This is the CRM's core "most powerful sales tool" per the client brief: matching members for warm introductions, with full ROI tracking.

### `src/lib/introductions/matching.ts`
Business meaning: pure, no-I/O tag-based scoring — the shared engine behind both the live member-detail "Suggest matches" panel and the bulk suggestion generator.

**`scoreMatches(targetId, targetName, candidates, excludeIds)`** — per-target NORMALISED scoring (best match in the set = 1.0/100%):
```
rawScore = needToIndustryCount × 3   (one member's tag category='need' text contains the other's category='industry' tag name, either direction — strongest signal)
         + sharedIndustryCount × 1   (both have the same industry tag)
         + sharedInterestCount × 0.5 (both have the same interest tag)
```
Then every candidate's score is divided by the batch's max raw score. Returns top 10, each with a plain-English `matchReason` (built from need-match sentences, or "Both share: X, Y" from shared tags).

**`scorePairForSuggestion(a, b)`** — the SYMMETRIC, RAW (un-normalised) score used by the bulk suggestion engine, so scores are comparable across the whole batch, not just per-target:
```
score = 3 × (need→industry keyword-substring matches, either direction)
      + 1.5 if both share the same `sector` field (case-insensitive exact match)
      + 1   × (shared industry tags)
      + 1   if both share the same `sub_sector` field
      + 0.5 × (shared interest tags)
      + 2   × (shared keyword count, capped at 3) for EACH direction of "complementary" matching:
              tokenize(A's intro_target_types + intro_target_criteria) ∩ tokenize(B's what_they_can_offer + sector + sub_sector)
              — a stopword list (~25 words: "the","and","looking","help","offer",...) filters noise; tokens must be ≥4 chars.
```
Returns `null` if score is 0 (no signal at all) — never a phantom introduction.

Also exports: `orderedPair(id1,id2)` (enforces the DB's `member_a_id < member_b_id` ordering constraint), `MatchCandidate`/`MatchResult`/`PairScore` types, `MemberTag`.

### `src/lib/introductions/suggest.ts`
Business meaning: server-side, pure suggestion generator that turns a pool of `MatchCandidate`s into ranked new-introduction proposals, never re-suggesting a pair that already has ANY introduction row (any status).

`pairKey(id1,id2)` — canonical `"a:b"` key matching the DB ordering constraint.
`generateSuggestions(candidates, existingPairKeys, {minScore=0.5, cap=20})` — scores every unique cross-member pair once via `scorePairForSuggestion`, normalises against the GLOBAL max raw score in the batch (so all suggestions are comparable on one 0–1 scale), filters to `matchScore >= minScore`, sorts descending, returns top `cap`.

### `src/lib/introductions/outcome.ts`
Business meaning: the commercial pipeline definition for a made introduction: **Introduced → Meeting held → Proposal sent → Deal won/lost → Revenue generated → Testimonial**. Both admin UI surfaces (detail page + matches-panel modal) build their DB update through this shared logic to avoid drift.

- `OUTCOME_STAGES` = `['introduced','meeting','proposal','deal','revenue','testimonial']`.
- `outcomeStage(v)` — the FURTHEST stage reached (for a progress-tracker cursor).
- `outcomeStageFlags(v)` — INDEPENDENT per-stage boolean flags (a deal can be won without a formal proposal; unchecking Meeting doesn't affect Deal).
- `buildIntroOutcomeUpdate(v, existingFollowedUpAt, now?)` — builds the `introductions` update payload. **Completion rule**: the intro is marked `status='completed'` and `followed_up_at` stamped ONLY once `deal_status` is set (won or lost) — recording a meeting/proposal alone keeps it "in progress." Realised `revenue_pence` and `commission_pence` are only ever set when `deal_status === 'won'` (cleared otherwise). `business_converted` legacy flag kept in lock-step with `deal_status==='won'`.
- `poundsToPence(input)` / `penceToPounds(pence)` — money string↔integer conversions for form inputs.
- `toDateInput(ts)` / `fromDateInput(date)` — timestamp↔date-input conversions (UTC midnight anchored).

### `src/lib/introductions/reporting.ts`
Business meaning: pure aggregation for the Introductions dashboard — "Total Introductions Requested/Made, Meetings Created, Opportunities (Deals Won), Revenue Generated, ROI by Member, ROI by Industry Sector."

`buildIntroReport(intros, members, {topN=5})`:
- `totalMade` counts intros with a `sent_at` OR `status in {sent, accepted, completed}`.
- Revenue/introCount are attributed to BOTH participants (member_a AND member_b) — "the value flows to everyone the introduction touched" — and their sectors (sector defaults to `'Unspecified'` when blank).
- `byMember` / `bySector` — top-N ranked by revenue, ties don't matter (only rows with revenue > 0 are ranked).

### `src/lib/introductions/intro-email.ts`
Business meaning: the two-sided introduction email — each party gets their OWN email (about the *other* member), editable by Sarah before sending; whatever she composes is persisted so a scheduled send fires exactly that copy.

- `defaultIntroEmail(recipientFirstName, otherName, otherCompany, matchReason)` — builds the default editable draft: "We think there's good reason for you and X to connect" + the match reason + CTA prompt.
- `renderIntroEmail(otherName, draft)` — renders to the branded shell; supports a `{{button}}` token (`CTA_TOKEN`) marking where the CTA button should sit within the body.
- `composeIntroBody(prose, ctaPos)` / `stripCtaToken(body)` — bake/strip the CTA marker for the editor UI.
- CTA always links to `/portal/introductions`.

---

## `src/lib/leads/` — inbound enquiry scoring

### `src/lib/leads/scoring.ts`
Business meaning: **Feature #1 — enquiry routing**. Deterministic, explainable 0–100 lead score for an inbound website enquiry (no ML). A higher score = hotter lead. Used to route/triage contact-form submissions.

**`scoreEnquiry(enquiry: ScorableEnquiry): LeadScore`** — formula (all additive, then clamped 0–100):
```
baseline                         = +10 (always)
company provided                 = +12
phone provided                   = +8
intent weight (first intent only):
    membership / sponsorship     = +25
    event / private_event /
      concierge / venue          = +15
    press / general               = +5
    (any other/unknown intent)   = +8
message length:
    ≥400 chars                    = +12
    ≥200 chars                    = +8
    ≥80 chars                     = +4
buying-signal keywords found in message (turnover, invest, sponsor, budget, acquisition):
    +6 per distinct hit, capped at +18 (3 hits)
email domain:
    corporate (non-free) domain   = +10
    free/consumer domain (gmail, outlook, hotmail, live, yahoo(.co.uk), icloud, me.com, aol, proton(.me/mail)) = +0
```
Returns `{score, reasons[]}` — reasons is a plain-English audit trail always shown in the admin UI so the score is explainable.

---

## `src/lib/members/` — member ROI, scoring, and recommendations

### `src/lib/members/roi.ts`
Business meaning: **Feature #5** — aggregates the commercial value delivered to AND captured from a single member, entirely in integer pence.

`computeMemberRoi(memberId, client?)` returns `MemberRoi`:
- Money captured FROM the member: `revenuePaidPence` (paid `payments`), `eventSpendPence` (confirmed bookings), `sponsorshipSpendPence` (`amount_pence + event_price_pence` across their sponsorships), `conciergeSpendPence` (only REALISED stages: `booked`/`delivered`/`feedback` — NOT `enquiry`/`pending`/`sourcing`/`quoted`, which are unpaid quotes).
- Money the member generated via the network: `introRevenuePence` (realised), `pipelineValuePence` (estimated/not-yet-realised).
- Activity counts: `introsMade`/`introsReceived`/`introsTotal`, `meetingsHeld`, `dealsWon`, `eventsAttended` (checked-in bookings + accepted/attended `event_invitations`).
- **Headline `commercialValueDeliveredPence`** = `introRevenuePence` (the "renewal number" — value The Club delivered to them).
- **`totalValuePence`** (lifetime value) = `revenuePaidPence + introRevenuePence + sponsorshipSpendPence + eventSpendPence + conciergeSpendPence`.

### `src/lib/members/scoring.ts`
Business meaning: **Feature #4 — Relationship scoring**. Deterministic 0–100 scores written to the `members` table, reused by both the client member-detail panel and the admin bulk recompute route and the daily automation sweep.

All formulas explicit and commented in source. Reuses `computeMemberRoi` for commercial signals.

**Engagement score** (0–100):
```
min(25, opens_90d × 5)
+ min(20, clicks_90d × 10)
+ min(20, eventsAttended × 8)
+ min(15, introsTotal × 5)
+ spend signal: 15 if paid in last 90d OR active concierge in last 90d; else 8 if any realised spend ever; else 0
+ recency bonus: 10 if last activity <30d ago; 5 if <90d; else 0
```

**Churn risk score** (0–100, higher = more at risk), additive flags then mitigated:
```
+30 if no activity in >90 days (or never)
+15 if activity quietening (60–90 days) [mutually exclusive with the above]
+20 if zero events attended ever
+15 if zero introductions ever
+20 if renewal is within next 60 days
+15 if zero email opens/clicks in last 90 days
+10 if member has an intro quota but used none this month
mitigations:
−30 if paid in last 90 days
−15 if active concierge request in last 90 days
−15 if ANY realised spend on record (revenue/event/sponsorship/concierge)
```

**Relationship capital score** (0–100) — mirrors the client's spec directly:
```
min(25, eventsAttended × 6)
+ min(20, introsTotal × 4)
+ min(20, floor(introRevenuePounds / 5000) × 5)   — £5,000 of intro revenue = +5, capped 20
+ 10 if any sponsorship spend
+ min(10, referralCount × 5)
+ min(15, engagement_score × 0.15)
```

**Relationship health score** (0–100):
```
health = 0.5 × engagement_score + 0.5 × (100 − churn_risk_score)
if satisfaction/NPS on record:
    satPct = satisfaction × 10 if satisfaction ≤ 10 (treat as 0–10 NPS scale), else satisfaction as-is
    health = 0.8 × health + 0.2 × satPct
```

**Upgrade potential** (0–100) — "room/appetite to upgrade a tier":
```
0.4 × engagement_score + 0.4 × relationship_capital_score + 0.2 × (100 − churn_risk_score)
```

`lifetime_value_pence` = `roi.totalValuePence` (passthrough).

Two exports: `computeMemberScores(memberId, client?)` (numbers only — DB-writable shape) and `computeMemberScoresWithExplanations(memberId, client?)` (adds plain-English reason arrays per score, display-only, never persisted).

### `src/lib/members/recommendations.ts`
Business meaning: **Feature #6** — recommend-only engine (admin acts manually) surfacing relevant upcoming EVENTS, SPONSORS/strategic partners, and CURATED EXPERIENCES/travel for one member, purely via keyword overlap (no ML, no new tables). Explicitly does NOT do member-to-member matchmaking (that's `MemberMatchesPanel`/`introductions/matching.ts`).

Algorithm:
1. Build the member's **interest token set** by tokenizing (lowercase, strip non-alphanumeric, drop words <3 chars and a ~30-word stopword list) every profile signal: sector, sub_sector, event_preferences, interest_flags, travel_profile, hobbies, sporting_interests, charitable_interests, favourite_brands, favourite_restaurants, drink_preferences, plus `member_tags` names. If this set is empty → return `hasSignals:false` (UI prompts "add preferences" rather than dumping an undifferentiated list).
2. **Events**: score = count of distinct member tokens found in the event's title+description+event_type; only `published`/`live` events the member isn't already connected to (via invitation or booking) are candidates; sorted by score desc then soonest start date; top 5.
3. **Sponsors**: dedupe by `sponsor_company`, score against `sponsor_company + brand_alignment + package_name`; excludes rows where the member IS the sponsor; keeps best-scoring instance per company; top 4.
4. **Experiences**: `curated_experiences` (is_active only), scored as `2 × travelTokenMatches + interestTokenMatches` (travel-specific tokens — from travel_profile/event_preferences/interest_flags — weighted double); top 4, ties keep editorial `display_order`.

All three surfaces require `score > 0` AND at least one matched token to appear at all ("only surface genuine matches").

---

## `src/lib/marketing/newsletter.ts` — AI newsletter generation

Business meaning: **Module 2** bridge from a marketing "channel" campaign to a real branded email. Unlike text channels, the newsletter is generated as actual email block-tree JSON (reusing the email builder's `ai-schema`) and materialised into an `email_templates` draft row (`category='campaign', is_draft=true`) so the admin finishes/approves/sends in the EXISTING branded designer — nothing auto-sends.

**AI usage**: model passed in by caller (route-level `OPENAI_MODEL`), `response_format: json_schema` (OpenAI Structured Outputs, schema = `openAiJsonSchema` from `templates/ai-schema.ts`), temperature 0.5.

System prompt (`NEWSLETTER_SYSTEM_PROMPT`, verbatim key excerpts):
> "You are the newsletter writer for The Club by Sarah Restrick — a private membership community curated by Sarah Restrick. ... You turn the supplied source material into ONE polished, on-brand HTML newsletter, expressed as a structured block tree..."

Brand-voice rules baked into the prompt: warm/considered/intimate (not corporate), British English, Sarah always signs off "Warm regards," (never "Cheers"/"Best"), personalise near the top with `Dear {{first_name|there}},`, reference the three core member experiences (curated events, bespoke introductions, warm communications) where relevant, **never invent facts/dates/names/stats/quotes not in the source material**.

Block types available to the model: `heading`, `text` (html allows p/br/strong/em/u/a/ul/ol/li/span + merge tags), `button` (one CTA max), `divider`/`spacer`, `image` (ONLY with a real provided URL — never invented/placeholder), `sarah_signature` (fixed brand signoff block, placed once at the end — model must NOT write a manual "Warm regards, Sarah" text block). Fixed structure: heading → greeting → 2–5 body paragraphs → optional button → optional closing → `sarah_signature`.

Fonts constrained to `AI_FONT_OPTIONS` (named email-safe font list from `ai-schema.ts`).

Exports: `NewsletterDraft` interface (name/subject/preheader/bodyHtml/bodyJson/theme/textSummary), `generateNewsletterDraft({openai, model, campaignTitle, sourceContext})` — calls OpenAI, validates against `aiTemplateResponseSchema` (zod), expands AI blocks via `expandAiBlocks`, renders to HTML via `renderBlocksToHTML`, and builds a `buildTextSummary` (plain-text digest, capped at 1000 chars) for the approval-queue preview. Throws (doesn't fall back) on refusal/invalid JSON/schema mismatch — caller turns errors into HTTP responses.

---

## `src/lib/billing/`

### `src/lib/billing/renewal.ts`
Business meaning: computes the next renewal date from a purchase timestamp + cadence, used by the membership-application approve flow and the Stripe webhook so `members.renewal_date` has a sensible value before the first recurring Stripe invoice fires (Stripe's `current_period_end` is still authoritative once available).

`computeNextRenewal(paidAtIso, cadence)`: `cadence='annual'` → +1 year; anything else (default) → **+1 month**. Guards invalid date strings by falling back to `new Date()`.

---

## `src/lib/cms/`

### `src/lib/cms/cloudinary.ts`
Business meaning: fixes a real production bug — an admin-pasted raw Cloudinary video URL (no transformation segment) delivers the full-size original (up to ~99MB), forcing visitors to stream megabytes before autoplay.

`normalizeCloudinaryVideoUrl(url)` / `normalizeCloudinaryImageUrl(url)` — inserts `f_auto,q_auto/` immediately after `/upload/` for any Cloudinary URL whose path starts with a bare version segment (`v\d+/`), i.e. no transformation was ever added; leaves URLs with an existing transformation segment untouched (admin's explicit choice wins).

### `src/lib/cms/heroes.ts`
Business meaning: server-side hero-banner resolver for public pages. Each page (e.g. `/memberships`) fetches its active hero row (`hero_slides`, `display_order=0`, `is_active=true`) and **field-level merges** it over a hardcoded fallback so the public site is never blank — even if the DB row is missing, has empty fields, or the fetch throws.

`getPageHero(slug, fallback)` → `HeroData`. Merge rule: a DB field of `null` falls back to the hardcoded default (admins must actively type-and-save an empty string, which the form coerces to NULL, to intentionally show blank — otherwise "blank" always means "use the fallback").

---

## `src/lib/communications/`

### `src/lib/communications/merge-data.ts`
Business meaning: the single source of truth for building the per-recipient `{{tag}}` merge-data dictionary for ALL sends (send pipeline, preview API, future automation runner), consumed by `replaceMergeTags` in `utils-templates/merge-tags-core.ts`.

`buildMergeData({member, event?, introduction?, sender?, unsubscribeUrl?})` — populates:
- Member: `first_name`,`last_name`,`email`,`phone`,`membership_tier` (formatted "tier_1"→"Tier 1"), `company_name`.
- Event: `event_name`,`event_date` (en-GB long format),`event_time`,`venue_name`.
- Introduction: `other_member_name` (whichever party ISN'T the recipient), `introduction_note` (= `match_reason`).
- Sender: `sender_name`,`sender_title`,`sender_email`,`sender_phone`,`booking_link` — defaults to `DEFAULT_SENDER = {full_name:'Sarah Restrick', title:'Founder, The Club', email:'sarah@theclub.example.com', ...}` if the sending admin has no profile filled in.
- Misc: `month_name` (current), `unsubscribe_url` (defaults to `'#'`).

Design rule: a tag with no real value is left UNSET (not empty string) so `{{tag|fallback}}` syntax in templates picks up its fallback correctly.

---

## `src/lib/contracts/`

### `src/lib/contracts/editor-types.ts`
Business meaning: settings shape for the contract builder (a slimmed copy of email template settings — no subject/preheader/from-name since contracts aren't emails).

`ContractSettings {name, docType, theme?}`; `defaultContractSettings = {name:'Untitled contract', docType:'contract'}`; `CONTRACT_DOC_TYPES` — `membership_agreement`, `nda`, `introducer_agreement`, `contract`, `other`.

### `src/lib/contracts/fields.ts`
Business meaning: the DocuSign "variable" fields an admin can drop into a contract — at AUTHOR time these are tokens like `[[signature]]`; at SEND time they become invisible (white, 1px) anchor strings in the document's text layer, matched to a DocuSign tab type so DocuSign places a real interactive field exactly there.

`CONTRACT_FIELDS` (exactly 4, per the client spec):
| Label | Token | Anchor | DocuSign tab |
|---|---|---|---|
| Signature | `[[signature]]` | `\ds_sig\` | `signHere` |
| Initials | `[[initials]]` | `\ds_init\` | `initialHere` |
| Printed name | `[[signed_name]]` | `\ds_name\` | `fullName` |
| Date signed | `[[date_signed]]` | `\ds_date\` | `dateSigned` |

`injectDocuSignAnchors(html)` → `{html, presentTabs}` — replaces every token with its hidden anchor span; **safety net**: if no `signHere` field was placed by the admin, appends a default signature+date block before `</body>` so no contract can ever be "completed" without a real signature field.

---

## `src/lib/docusign/`

### `src/lib/docusign/client.ts`
Business meaning: DocuSign eSignature integration via raw `fetch` (no SDK), using **JWT Bearer grant** (server-to-server) — a one-time human consent click (`getConsentUrl`) is required per DocuSign user, after which tokens mint automatically.

Config via env: `DOCUSIGN_INTEGRATION_KEY`, `DOCUSIGN_USER_ID`, `DOCUSIGN_ACCOUNT_ID`, `DOCUSIGN_PRIVATE_KEY` (RSA PEM, auto-normalised from mangled env-file formats), `DOCUSIGN_BASE_PATH` (default `https://demo.docusign.net` sandbox), `DOCUSIGN_OAUTH_BASE` (default `account-d.docusign.com` sandbox), `DOCUSIGN_REDIRECT_URI`.

Key exports: `getDocuSignConfig()` (null if unconfigured — never throws), `getConsentUrl(cfg)`, `buildEventNotification()` (Connect webhook config — only attached if `DOCUSIGN_CONNECT_SECRET` is set and the target URL isn't localhost), `getAccessToken(cfg)` (in-memory token cache, ~1h TTL, throws `DocuSignError` with a `consentUrl` on `consent_required`), `createEnvelope(cfg, token, args)` (PDF envelope, fixed signature+date tab position), `createEnvelopeFromHtml(cfg, token, args)` (HTML→PDF envelope using the anchor-tab system from `contracts/fields.ts`), `getEnvelopeStatus`, `getCombinedDocument` (downloads signed PDF), `voidEnvelope`, `countPdfPages` (pdfjs with byte-scan fallback, defaults to 1).

`DocuSignError` class carries `consentUrl`/`status` so routes can surface a "click to grant access" UI.

### `src/lib/docusign/reconcile.ts`
Business meaning: single reconciliation routine shared by the manual status-check route, the auto-refresh-on-page-load path, and the DocuSign Connect webhook — reads live envelope status, persists changes, and (once completed) files the signed PDF into the member document vault EXACTLY ONCE.

`isSettled(row)` — true once declined/voided, or completed with a `signed_document_id` already filed (no more polling needed).
`syncSignatureRequest(admin, cfg, token, row)` — fetches live status; on `declined` records the reason; on `completed` (and not yet vaulted) downloads the combined signed PDF, uploads to Storage bucket `member-documents` under `<memberId>/<timestamp>-<rand>-signed-<slug>.pdf`, inserts a `member_documents` row, and stamps `signed_document_id`/`completed_at`. Vaulting failure is recorded in `error` but doesn't crash the sync (retried on next poll since `signed_document_id` stays null).

---

## `src/lib/effects/`

### `src/lib/effects/confetti.ts`
Business meaning: celebratory confetti burst (bronze/gold brand palette) shown on the public contact form's success state.

`fireBronzeConfetti()` — client-only (no-op on server), wraps `canvas-confetti` with `BRONZE_GOLD_PALETTE` (`#C09870,#A87B4F,#8B5A2B,#D4AF7A,#F0EBE0`); two angled bottom-corner bursts over 1.4s plus one overhead shower — deliberately kept under 1.5s total.

---

## `src/lib/email/`

### `src/lib/email/club-email.ts`
Business meaning: the ONE branded HTML email shell and the ONE Resend sender every transactional/automated email in the app reuses.

`renderClubEmail({eyebrow?, heading, paragraphs, cta?, ctaAfterIndex?, panelHtml?, panelAfterIndex?, signoff?})` — full HTML email with fixed brand chrome: "The Club" wordmark + "by Sarah Restrick" gold-rule eyebrow header, cream (`#F7F5F0`) background, Georgia serif body, gold (`#B8975A`) CTA pill button, default signoff "Sarah Restrick & the team." CTA and an optional raw-HTML panel can be positioned after a specific paragraph index.

`sendClubEmail({to, subject, html, category?, memberId?})` — sends via **Resend** REST API (`RESEND_API_KEY`, from `RESEND_FROM_EMAIL`/`FROM_EMAIL` + `RESEND_FROM_NAME`, default "The Club"); every send (success or failure) is logged to the `email_log` table (full HTML retained) via a service-role client created inline; returns `{sent, id?, error?}`, never throws.

### `src/lib/email/admin-notify.ts`
`notifyAdmins(admin, {subject, heading, paragraphs, ctaUrl?, ctaLabel?})` — sends the branded shell to every `profiles.role='admin'` email; fully best-effort (swallows all errors so it never breaks the member-facing flow that triggered it, e.g. new application/new booking notifications).

### `src/lib/email/invite.ts`
Business meaning: member/staff onboarding credentials, sent via **Resend** (not Supabase's built-in mailer) — deliberately avoids the magic-link/set-password redirect flow. A temp password is generated, emailed in a highlighted "credentials panel," and the user signs in directly at `/login`.

`generatePassword()` — 12-char password guaranteed to include upper/lower/digit/symbol, excluding ambiguous glyphs (`0/O/1/l/I`) for readability, then Fisher-Yates shuffled.
`sendInviteEmail(admin, {email, firstName?, redirectTo, heading?, intro?, loginUrl?})` — creates a NEW Supabase auth user (`email_confirm:true`, immediate sign-in) with the generated password, emails credentials.
`resetPasswordAndSendCredentials(admin, {userId, email, firstName?, redirectTo, loginUrl?})` — resets an EXISTING user's password (used by admin "Resend login").
Both derive the sign-in URL as `${origin}/login` from the legacy `redirectTo` (`${origin}/set-password`) unless an explicit `loginUrl` is passed.

---

## `src/lib/enrichment/` — company/person data enrichment (Apollo / Clay)

Business meaning: provider-agnostic enrichment layer for two use cases — (1) auto-filling company/person data on inbound enquiries and member profiles, and (2) **sponsor discovery** (finding candidate sponsor companies + their decision-makers for outreach).

### `src/lib/enrichment/types.ts`
Shapes: `EnrichmentCompany` (domain, website, linkedinUrl, industry, employeeCount, revenue, revenuePrinted, description), `EnrichmentPerson` (title, seniority, linkedinUrl), `EnrichmentResult`, and additive sponsor-discovery shapes: `SearchCriteria` (industries, keywords, employeeMin/Max, revenueMin, locations, limit), `SponsorCandidate`, `DecisionMaker`, `CapabilityStatus = 'ok'|'unavailable'|'upgrade_required'|'error'`, `SearchResult<T> = {status, items, message?}`.

### `src/lib/enrichment/provider.ts`
`EnrichmentProvider` interface: required `enrich(input)`, optional `capabilities: {searchCompanies, searchPeople}` + matching optional methods. Contract: implementations must NEVER throw on "not found"/gated — resolve with null fields instead.

### `src/lib/enrichment/apollo.ts`
Business meaning: **Apollo.io** live integration — verified against the real API key. Org enrichment works on the FREE Apollo plan; people-match/people-search are gated to PAID plans (degrades gracefully to `person: null` / `status: 'upgrade_required'` rather than erroring). Auth via `X-Api-Key` header; every fetch bounded by an 8-second `AbortSignal.timeout`.

`ApolloProvider` implements `enrich()` (org enrich POST `/organizations/enrich`, person match POST `/people/match` if firstName+lastName given), `searchCompanies(criteria)` (POST `/mixed_companies/search`, maps `employeeMin/Max` to an Apollo employee-count range string, keywords+industries → `q_organization_keyword_tags`+`q_keywords`), `searchPeople(domain, roleFilters?)` (POST `/mixed_people/search`, defaults to `person_seniorities: ['owner','founder','c_suite','partner','vp','head','director']` when no explicit role filter given; returns `status:'upgrade_required'` on HTTP 403 or `error_code:'API_INACCESSIBLE'`).

### `src/lib/enrichment/clay.ts`
Business meaning: **documented stub** for a future Clay integration (drop-in replacement — same interface, zero downstream changes needed once wired). `enrich()` throws `'ClayProvider not implemented yet — see 20260801 plan'`; `searchCompanies`/`searchPeople` return `status:'error', message:'Clay not wired yet'` (never throw, keeping the safe-wrapper contract honest). Activated by setting `ENRICHMENT_PROVIDER=clay` + `CLAY_API_KEY`.

### `src/lib/enrichment/stub.ts`
`StubProvider` — no-op provider used when nothing is configured; `capabilities: {searchCompanies:false, searchPeople:false}`; `enrich()` always returns all-null; the safe wrappers in `index.ts` route any call to it into `status:'unavailable'`.

### `src/lib/enrichment/index.ts`
`getEnrichmentProvider()` — returns `ClayProvider` if `ENRICHMENT_PROVIDER=clay` AND `CLAY_API_KEY` set; `ApolloProvider` if `ENRICHMENT_PROVIDER=apollo` AND `APOLLO_API_KEY` set; else `StubProvider`.
`providerCan(p, cap)` — true only if BOTH the capability flag AND the method actually exist.
`searchSponsorCompanies(criteria)` / `searchDecisionMakers(domain, roleFilters?)` — the ONLY entry points feature code should call; never touch provider internals directly; catch all exceptions into `status:'error'`.
Re-exports `enrichEnquiry` and `enrichMember`.

### `src/lib/enrichment/enrich.ts`
`enrichEnquiry(db, enquiryId)` — derives a business domain from the enquiry's email (rejects ~14 free/consumer domains: gmail, googlemail, outlook, hotmail, live, yahoo(.co.uk), icloud, me.com, aol, proton(.me/mail)); if no business domain → `enrichment_status='no_domain'`; else calls the active provider and writes `enrichment_status` (`enriched` if company+person, `partial` if company only, `not_found` otherwise), plus all company/person fields and the raw provider payload. Never throws — always resolves and writes SOME status, defaulting to `'failed'` on exception.

### `src/lib/enrichment/enrich-member.ts`
`enrichMember(db, memberId)` — same pattern for a `members` row. Domain derived from `company_website` first, else the profile email's business domain. **Gaps-only write policy**: an admin-entered non-empty field is NEVER overwritten — only empty (`isEmpty`) fields get filled from the provider (annual_turnover ← revenuePrinted, employee_count, sector ← industry, company_linkedin_url, company_website, company_description; and separately, `profiles.linkedin_url` if empty and the paid person-match returned one).

---

## `src/lib/finance/`

### `src/lib/finance/metrics.ts`
Business meaning: pure finance-dashboard aggregations reused by both the page loader and any server route so the numbers can never drift between call sites.

`computeRenewalRate(members, payments, windowDays=90, now?)` — "of memberships that came up for renewal in a trailing window, what share actually renewed?" `due` = active-tracked members whose `renewal_date` fell within `[today − windowDays, today]`; `renewed` = still `membership_status='active'` AND has ≥1 PAID payment dated AFTER their `renewal_date`. `rate = renewed/due` (0 if due=0).

`computeCashflow(inflows, outflows, months=12, now?)` — buckets cash IN (paid payments by `paid_at`) and cash OUT (event expenses by `created_at`) into the trailing N calendar months; `netPence = inPence − outPence` per month bucket.

---

## `src/lib/google/` — Google Workspace integration (Gmail + Drive)

### `src/lib/google/client.ts`
Business meaning: server-to-server Google Workspace auth via a **service account + domain-wide delegation (DWD)** — impersonates a real Workspace mailbox (no browser OAuth per user); the DWD grant is a one-time Workspace-admin console step.

Env: `GOOGLE_SA_KEY_BASE64` (base64 service-account JSON), `GOOGLE_SA_CLIENT_ID`, `GOOGLE_WORKSPACE_SUBJECT` (default mailbox), `GOOGLE_DRIVE_FOLDER_ID`.
Exports: `getGoogleConfig()` (null if unconfigured), `jwtFor(scopes, subject?)`, `gmailClient({subject?, write?})` (scope `gmail.readonly` by default, `gmail.modify` if `write:true` — used only to create drafts, NEVER to send), `driveClient(subject?)` (read-only `drive.readonly`).

### `src/lib/google/gmail.ts`
Business meaning: Gmail read helpers for the inbox-sync pipeline + one write helper that creates a DRAFT reply (a human always sends from Gmail — the CRM never sends on their behalf).

Key exports: `parseMessage(msg)` → `ParsedMessage` (from/fromEmail/to/subject/snippet/bodyText/internalDate/headerMessageId/references/listUnsubscribe — the latter is a newsletter/marketing signal used by the noise classifier), `getStartHistoryId`, `listRecentMessageIds` (seed), `listAddedSince(gmail, startHistoryId)` (incremental; returns `expired:true` on a 404 so the caller re-seeds), `listMessageIdsByQuery` (paged backfill), `getMessage`, `getMessageHtml(subject, messageId)` (HTML-preserving fetch for the inbox reader, UNsanitized — caller sanitizes via `inbox/sanitize-email.ts`), `listThreadMessages`, `createDraftReply({threadId, to, subject, bodyHtml, inReplyTo?, references?, subjectMailbox?})` — builds a raw RFC-2822 MIME message and saves as a Gmail draft.

### `src/lib/google/match.ts`
`resolveMembersByEmail(db, emails)` — batch-resolves lowercased emails → member ids via `profiles.email → members.profile_id` in one round-trip (two queries total regardless of batch size). Unmatched addresses surface as "new contacts."

### `src/lib/google/noise.ts`
Business meaning: conservative heuristic classifier flagging automated/bulk senders (no-reply, newsletters, receipts, system notices) so they don't pollute "detected from email" contact suggestions — applied ONLY to messages that didn't match a member.

`isNoiseSender(msg)` — true if: the email local-part matches `NOISE_LOCALPART` regex (`no-?reply|donotreply|noreply|notifications?|mailer(-daemon)?|bounce|newsletter|updates?|alerts?|postmaster|receipts?|billing|invoice|support`), OR a `List-Unsubscribe` header is present, OR the subject/snippet matches `NOISE_SUBJECT` (receipt/invoice/order confirmations, payment notices, unsubscribe, verify-email, password-reset, "do not reply", "automated", "view in browser"). Deliberately conservative — defaults to `false` (keep as candidate) when in doubt.

### `src/lib/google/sync-config.ts`
Business meaning: admin-facing Gmail sync control surface stored in `app_settings['gmail_sync_config']`. Everything defaults OFF so nothing reads any inbox until an admin explicitly enables it.

`DEFAULT_SYNC_CONFIG`: `enabled:false`, `historyMonths:24`, `noiseFilter:true`, and 7 pre-listed (but disabled) mailboxes: `sarah@`, `leanne@`, `events@`, `membership@`, `legal@`, `accounts@theclubbysarahrestrick.com`, `pa@sarahrestrick.com`.
`getSyncConfig(db)` / `saveSyncConfig(db, cfg)` — defensive merge over defaults so newly-added config fields never break old stored values.

### `src/lib/google/sync-core.ts`
Business meaning: the reusable per-inbox Gmail sync engine (shared by the incremental cron and any future backfill job).

`processMessageIds(db, gmail, mailbox, ids, opts?)` — fetch→parse→classify(direction: inbound/outbound by comparing `fromEmail` to the impersonated mailbox)→resolve counterparts to members in one batch→upsert into `gmail_messages` (idempotent on `gmail_message_id`). Noise flag: `is_noise = noiseFilter && !memberId && isNoiseSender(msg)` — **a matched-member message is ALWAYS `is_noise=false`, matching always wins over the heuristic**.
`syncInboxIncremental(db, mailbox, opts?)` — reads the mailbox's cursor from `app_settings['gmail_sync_state'].cursors[mailbox]` (migrating a legacy single-inbox `{historyId}` value onto the configured default subject on first read), seeds 150 most-recent messages if no cursor or the cursor expired (Gmail history >~30 days old, detected via a 404), otherwise fetches only messages added since the cursor (capped at 200/run), then advances the cursor to the mailbox's current historyId.

### `src/lib/google/drive.ts`
Business meaning: read-only Drive browser for the CRM's media-library picker (website/social/email/brochure assets).

`listChildren({folderId?, subject?})` — root view (no folderId) returns every Shared Drive + top-level My Drive folders (no media); inside a folder returns subfolders + classified media (`image`/`video` only, by mimeType prefix). `getFileParents(fileId, subject?)`, `getFileStream(fileId, subject?)` (streams bytes for a proxy route or copy-to-Storage).

### `src/lib/google/media-access.ts`
Business meaning: media (Drive) access control — ONE "media owner" (Sarah) sees/manages everything; every other admin is restricted to an owner-approved folder allow-list. Both stored in `app_settings` (`media_owner`, `drive_allowed_folders`) — no migration needed. **Opt-in and safe**: until the owner approves any folders, the allow-list is empty and callers keep today's browse-all behaviour (nobody gets locked out by default).

`getMediaOwnerId`/`setMediaOwner`, `getAllowedFolders`/`setAllowedFolders`, `isMediaOwner(db, userId)`.

---

## `src/lib/inbox/` — internal shared-mailbox reader

### `src/lib/inbox/access.ts`
Business meaning: access-control layer over the synced Gmail inbox catalogue (from `google/sync-config.ts`). Admins see every ENABLED catalogue mailbox; every other user sees the intersection of mailboxes explicitly granted to them (`mailbox_access` table) and the enabled catalogue — extensible with zero code changes (grant/revoke = insert/delete a row).

`getInboxCatalog(admin)`, `allowedMailboxes(admin, profile)`, `listGrants(admin, profileId?)`, `grantMailbox(admin, profileId, mailbox, byId)` (idempotent — checks case-insensitively before inserting; mailboxes stored lower-cased), `revokeMailbox(admin, profileId, mailbox)`, `canAccessMailbox(allowed, mailbox)` (case-insensitive membership check).

### `src/lib/inbox/guard.ts`
Business meaning: the route gate every `/api/admin/inbox/*` route calls FIRST — authenticates via SSR session, loads the profile, computes their allowed-mailbox set, and 401/403s appropriately. `requireInboxAccess()` → `InboxAccessOk {profile, allowed, admin}` or `InboxAccessErr {error, status}`. The `allowed` list returned here is the sole authority — routes must validate any client-supplied mailbox param against it, never trust the client directly.

### `src/lib/inbox/sanitize-email.ts`
Business meaning: broader HTML sanitizer than `sops.ts`'s (real emails ship tables/inline styles/images/fonts). Output is still rendered inside a sandboxed iframe by the UI (belt-and-braces).

`sanitizeEmailHtml(html)` — DOMPurify with an allow-list covering tables, images, headings, lists, basic formatting, `font`/`center`/`small`/`sub`/`sup`; forbids `script/iframe/object/embed/form/input/link/meta/style`; `ALLOW_DATA_ATTR:false`; installs a one-time hook forcing every `<a>` to `target="_blank" rel="noopener noreferrer"` (prevents `window.opener` leakage).

---

## Hooks

### `src/lib/hooks/use-toast.ts`
Business meaning: app-wide "toast" notification system (small pop-ups like "Template saved" or "Failed to save template") used across every admin screen for post-action feedback.

Exports:
| Export | Signature | Description |
|---|---|---|
| `reducer` | `(state: State, action: Action) => State` | Pure reducer managing an in-memory toast list (add/update/dismiss/remove) |
| `toast` | `(props: Toast) => { id, dismiss }` | Fires a new toast; auto-dismisses after 5s |
| `useToast` | `() => { toasts, toast, dismiss }` | React hook subscribing to the global toast list |
| `ToasterToast` (type) | `{ id, title?, description?, variant? }` | Shape of one toast |

Hardcoded: `TOAST_LIMIT = 3` (max visible, oldest dropped); `TOAST_REMOVE_DELAY = 5000` ms auto-dismiss.

### `src/lib/hooks/useCurrentUser.ts`
Business meaning: fetches the logged-in admin/member's identity (name, email, role, avatar) for display and role-gating (`admin` vs `member`).

`CurrentUser` interface: `{id, email, first_name, last_name, full_name, role: 'admin'|'member', avatar_url}`. `useCurrentUser()` — React Query hook reading the Supabase auth session then joining `profiles`.

### `src/lib/hooks/useDebouncedValue.ts`
Business meaning: generic debounce hook (search boxes) so the app doesn't query on every keystroke. `useDebouncedValue<T>(value, delay=300)`.

### `src/lib/hooks/useEmailEditor.ts`
Business meaning: state machine behind the drag-and-drop email template builder — manages block list, undo/redo history, autosave, and persistence to `email_templates`. Admin-only.

`useEmailEditor(templateId?)` returns `{blocks, settings, selectedBlockId, loading/saving flags, addBlock, addBlockFromModule, replaceBlocks, updateBlock, deleteBlock, duplicateBlock, moveBlock, updateSettings, undo, redo, canUndo, canRedo, saveTemplate, closeEditor}`.

Business rules: `AUTOSAVE_DEBOUNCE_MS = 2500` (silent autosave); `HISTORY_COALESCE_MS = 600` (rapid edits merged into one undo step); template name auto-derives from the subject line (first 80 chars) while still "Untitled Template"; `saveTemplate` force-writes when a publish/draft flag flip is pending even with no content change; warns on `beforeunload` with unsaved changes; new templates default to published (`is_draft=false`) on "Save & Exit".

### `src/lib/hooks/useTemplateStats.ts`
Business meaning: powers the admin templates-list summary tiles. `useTemplateStats()` runs 4 parallel `count`-only queries against `email_templates` → `{totalTemplates, automationTemplates, campaignTemplates, draftTemplates}`.

### `src/lib/hooks/useTemplates.ts`
Business meaning: React Query CRUD layer for the email template library.

`useTemplates(filters?)`, `useTemplate(templateId)`, `useCreateTemplate()`, `useUpdateTemplate()`, `useDuplicateTemplate()` (prefixes name "Copy of "), `useDeleteTemplate()`.

---

## `src/lib/marketing/` (remaining files — newsletter.ts documented above)

### `src/lib/marketing/admin.ts`
Business meaning: shared server-side guard for every Marketing AI Engine API route — confirms the caller is a logged-in admin and hands back a privileged (service-role) Supabase client for the `marketing_*` tables. Admin-only.

`getAdmin()` — service-role client, RLS bypass, `persistSession:false`. `requireAdmin()` — verifies `role==='admin'` on `profiles`, returns `{profile}` or `{error, status:401|403}`.

### `src/lib/marketing/channels.ts`
Business meaning: catalogue of the 9 marketing "channels" the AI Marketing Engine can generate, plus the 4 LinkedIn "voice" variants per campaign.

`MARKETING_CHANNELS` = `['seo_blog','recap_blog','linkedin','instagram_feed','instagram_carousel','instagram_reel','newsletter','press_release','sponsor_recap']`. `TEXT_CHANNELS` = same minus `newsletter` (newsletter routes to the branded email designer instead of the plain copy generator). `CHANNEL_META` gives label+hint+group per channel; `CHANNEL_GROUP_ORDER` = Blogs, LinkedIn, Instagram, Newsletter, PR, Sponsor. `VOICE_KEYS = ['club','sarah']`, `VOICE_LABELS = {club:'The Club', sarah:'Sarah'}`. `LINKEDIN_VARIANTS = ['voice_club','voice_sarah','sponsor','founder_spotlight']` — LinkedIn always produces exactly **4** drafts per campaign. `LINKEDIN_VARIANT_META`: `voice_club→"The Club"/club`, `voice_sarah→"Sarah"/sarah`, `sponsor→"Sponsor"/club`, `founder_spotlight→"Founder spotlight"/sarah`. Helper predicates: `isLinkedInVariant`, `linkedInVariantLabel`, `isTextChannel`, `isMarketingChannel`.

### `src/lib/marketing/graphics/render.tsx`
Business meaning: renders the pixel layout of a branded social-media graphic (e.g. Instagram square) as JSX for Next.js's `ImageResponse` (satori) — the visual engine behind "Template Graphics" (pre-designed templates admins fill with AI text + a photo to auto-produce on-brand social images).

`renderGraphic({template, values, shape, origin?})` — background (color or photo + dark scrim) + 3 vertical zones (top/middle/bottom) of slots + an always-present brand mark.

Hardcoded design rules: pure flexbox (satori has no CSS grid); default heading font-size 72px, subtext/other 32px, fixed-type slots 28px; heading serif by default, others sans; `fixed`-type slots always render UPPERCASE with `letterSpacing:4`; background photo gets a `rgba(33,29,25,0.45)` dark scrim; photo slot fixed height 360px, `borderRadius:18`; brand mark ALWAYS pinned to the bottom zone and cannot be disabled — "THE CLUB" (serif, 30px, letterSpacing 8, gold `#B8975A`, uppercase) over "by Sarah Restrick" (sans, 16px, letterSpacing 4, cream/gold depending on background, opacity 0.85); foreground padding 72px.

### `src/lib/marketing/graphics/resolve.ts`
Business meaning: turns an untrusted API request body into a safe, typed `MarketingTemplate`/`SlotValues`/`GraphicShape`, either inline or by looking up `marketing_templates` in Supabase — used before handing data to `render.tsx`.

`toAbsoluteUrl(url?, origin?)`, `coerceSlots(raw)` (only accepts type ∈ {photo,heading,subtext,fixed}, zone ∈ {top,middle,bottom}, align ∈ {left,center,right}), `coerceBackground(raw)` (default `{type:'color', value:'#211D19'}`), `coerceShape(raw, fallback='square')`, `coerceTemplate(raw)`, `coerceValues(raw)`, `resolveTemplateFromBody({template_id?, template?})` (inline `template` wins over DB lookup). Re-exports `GRAPHIC_SHAPES`, `BUILDER_SHAPES`.

### `src/lib/marketing/graphics/store.ts`
Business meaning: renders a Template Graphic to a PNG and uploads it to Supabase Storage (`social-graphics` bucket) so it can be attached to a social post.

`renderTemplateToStorage({template, values, shape, origin?})` — uses `next/og`'s `ImageResponse` to rasterize, uploads to `renders/<timestamp>-<random>.png`, `cacheControl:31536000` (1yr), returns public URL. `buildSlotValues(template, ai:{heading,subtext}, photoUrl)` — maps AI-written text + a chosen photo into the template's slot ids (AI heading/subtext slots ← AI text; photo slots + background photo (if type='photo') ← photoUrl; `fixed` slots untouched). `BUCKET = 'social-graphics'`.

### `src/lib/marketing/graphics/types.ts`
Business meaning: shared data model for the graphic engine (shapes, brand palette, fonts, slot model) used by both server render code and the client template builder.

`GRAPHIC_SHAPES = ['square','portrait','landscape']`; `SHAPE_DIMS`: square 1080×1080, portrait 1080×1350, landscape 1200×627 (fixed pixel dims); `BUILDER_SHAPES = ['square','portrait']` (landscape not yet exposed in UI). `BRAND = {cream:'#F7F3EA', gold:'#B8975A', warmBlack:'#2C2825', dark:'#211D19'}` (fixed palette for rendered graphics, distinct from the app's UI theme tokens). `FONT_CHOICES=['serif','sans']`; `FONT_STACKS`: serif `Georgia, 'Times New Roman', 'Noto Sans', serif`, sans `Helvetica, Arial, 'Noto Sans', sans-serif` (satori only bundles Noto Sans, so both currently render visually similar — hierarchy carried by size/spacing/color). `BRAND_LINE='THE CLUB'`, `BRAND_SUBLINE='by Sarah Restrick'` (locked wordmark text). `SlotValues.as_is`/`as_is_url` lets an admin bypass the renderer entirely with a raw pre-designed image.

### `src/lib/marketing/publish/index.ts`
Business meaning: switchboard deciding which "publisher" handles posting a marketing asset live; today everything routes to the mock publisher. `getPublisher(channel)` → `MockPublisher` for adapter channels; throws for `newsletter` (handled separately by the Resend/email pipeline) and any unconfigured channel. Adapter channels: `seo_blog, recap_blog, linkedin, instagram_feed, instagram_carousel, instagram_reel, press_release, sponsor_recap`.

### `src/lib/marketing/publish/metricool.ts`
Business meaning: documented placeholder for the real Metricool social-publishing integration — blocked until the client connects a Metricool account. `MetricoolPublisher.publish()` always **throws** `'NotImplemented: Metricool publishing is not wired yet...'` (never silently no-ops).

### `src/lib/marketing/publish/mock.ts`
Business meaning: default stand-in publisher while Metricool isn't connected — simulates success so the approval→published UI flow works end-to-end today. `MockPublisher.publish(asset)` never calls a real API; returns `{ok:true, externalId:"mock_<channel>_<id8>_<timestamp>", target}`, echoing `graphic_url` into `target.image`.

### `src/lib/marketing/publish/types.ts`
Business meaning: the `Publisher` contract any real social-publishing integration must implement — the seam enforcing that content is never auto-published without human approval. `MarketingChannel`, `PublishableAsset {id,channel,title,body,body_html?,graphic_url?,publish_target?}`, `PublishResult {ok,externalId?,error?,target?}`, `Publisher {name, publish(asset)}`.

### `src/lib/marketing/segments.ts`
Business meaning: turns a saved audience-targeting rule set (e.g. "Tier 1+2, active, tag=VIP") into an actual recipient list for a campaign send, in the shape the send pipeline expects.

`SegmentRules {tiers?, statuses?, types?, tag_ids?, tag_match:'any'|'all'}`; `SegmentRecipient {email, first_name, last_name, unsubscribe_token:null}` (members always null — unlike external campaign recipients). `normaliseRules(raw)`, `resolveSegmentRecipients(admin, rulesRaw)`, `countSegment(admin, rulesRaw)` (uses identical resolution logic so the preview count always matches the real send size), `summariseRules(rulesRaw)` → human string e.g. "tiers tier_1/tier_2, active, any of 2 tag(s)".

**Segment-matching algorithm**: query `members` where `deleted_at IS NULL` → status filter (`statuses` if given, **else defaults to `membership_status='active'`** — segments are active-only unless explicitly widened) → tier filter → type filter → tag filter (`'all'` = must hold every requested tag; `'any'` = at least one) → member-id lookups chunked in batches of 500 → resolves email/name via joined `profiles`, skipping members with no profile email → dedupes by lowercased email.

---

## `src/lib/membership/`

### `src/lib/membership/plans.ts`
Business meaning: the single source of truth mapping a member's subscription plan to their internal tier and membership type, plus the introduction quota that comes with it — prevents `membership_tier`/`membership_type` drift.

**Canonical plan table:**

| Plan | slug | tier | membership_type | default intro quota |
|---|---|---|---|---|
| Individual | `individual` | `tier_1` | `individual` | 3 |
| Business | `business` | `tier_2` | `business` | 5 |
| Corporate | `corporate` | `tier_3` | `business` | 10 |

Note: "Corporate" shares `membership_type='business'` with "Business" (same payee model) but gets a bigger seat count/sponsorship slot and larger intro quota. The LIVE admin-editable intro quota lives in `membership_plans.intro_quota` in the DB — the table above is only the fallback default.

Exports: `MemberTier='tier_1'|'tier_2'|'tier_3'`, `MembershipType='individual'|'business'`, `PlanSlug`, `PlanDef{slug,tier,name,membershipType,defaultIntroQuota}`, `PLANS` (the 3-row table), `planForTier(tier)` (falls back to tier_1 if unrecognised, never throws), `planForSlug(slug?)`, `membershipTypeForTier(tier)` (membership_type is NEVER stored independently of tier), `resolvePlan(input?)` (fuzzy free-text matcher: strips non-alphanumerics+lowercases, then `tier3`/`three`/`platinum`/`corporate`→tier_3, `tier2`/`two`/`gold`/`business`→tier_2, else→tier_1), `resolvePlanFromDb(db, input?)` (looks up `membership_plans.tier_classification` by slug first, falls back to fuzzy match), `PLAN_OPTIONS` (Select options keyed by tier), `introQuotaForTier(db, tier)` (reads live `membership_plans.intro_quota` ordered by `display_order`, falls back to `defaultIntroQuota`).

---

## `src/lib/pipeline/`

### `src/lib/pipeline/stages.ts`
Business meaning: the shared 5-stage sales-pipeline model (`new → qualified → proposal → won/lost`) with per-source status mappers, so the Executive Dashboard's "open pipeline value" reconciles exactly with the visual Pipeline board and the Chief-of-Staff briefing.

```
Stage = 'new' | 'qualified' | 'proposal' | 'won' | 'lost'
OPEN_STAGES = ['new', 'qualified', 'proposal']
```

Status→stage mapping tables (verbatim):
| Function | Mapping |
|---|---|
| `membershipStage(status)` | `approved→won`, `rejected→lost`, `shortlisted→qualified`, default (pending)→`new` |
| `sponsorshipStage(status)` | `paid→won`; `declined\|cancelled\|lost\|rejected→lost`; `confirmed→qualified`; `invoiced→proposal`; default (proposed/pending)→`new` |
| `conciergeStage(status)` | `accepted\|booked\|delivered\|feedback→won`; `declined\|cancelled→lost`; `sourcing→qualified`; `quoted→proposal`; default (pending/assigned)→`new` |
| `introductionStage(status, dealStatus)` | `dealStatus==='won'→won`; `dealStatus==='lost'→lost`; `status==='declined'→lost`; `status==='completed'→won`; `status∈{sent,scheduled,accepted}→qualified`; default (suggested/approved)→`new` |
| `bookingStage(status)` | `confirmed→won`; `cancelled\|refunded→lost`; default (pending)→`new` |

`isOpenStage(stage)` — true for new/qualified/proposal. Source note: deliberately kept in sync (per an in-code comment "KEEP THESE TWO IN SYNC") with an inline duplicate map in `PipelinePage.tsx` pending a refactor.

---

## `src/lib/sponsors/`

### `src/lib/sponsors/portal.ts`
Business meaning: powers the public, no-login Sponsor Portal (`/sponsor/<token>`) where an event sponsor checks their deliverables checklist and views an ROI report — no account needed.

`SponsorDeliverable {id,label,category,due_date,status,notes,file_name,submitted_at,sponsor_note}`; `SponsorPortalData {sponsorLabel, packageName, showcaseSlot, status, event, deliverables, roiReportHtml, roiReach}`; `loadSponsorPortal(token)` → `SponsorPortalData | null`.

Rules: uses the service-role client (auth is purely "possession of the token," no RLS policy needed); **reuses `sponsorships.booking_token`** as the portal token (no separate portal_token field); rejects tokens under 6 characters; sponsor display-name resolution order: `sponsor_company` → `sponsor_name` → linked member's profile full name → member's company name → literal fallback `'Valued sponsor'`; deliverables ordered by `due_date` ascending (nulls last) then `created_at`.

---

## `src/lib/sponsorship/outreach/`

### `src/lib/sponsorship/outreach/index.ts`
Business meaning: switchboard for sponsor-outreach channel selection (mirrors `marketing/publish`). `getSender(channel)` → `'resend'→ResendSender` (live), `'instantly'→InstantlySender` (stub), else throws.

### `src/lib/sponsorship/outreach/instantly.ts`
Business meaning: documented stub for future Instantly.ai multi-step drip sequences for sponsor prospecting. `InstantlySender.send()` always throws `'InstantlySender not implemented — sequences will be wired when Instantly is provisioned'`.

### `src/lib/sponsorship/outreach/resend.ts`
Business meaning: the live sender for one-off, human-approved sponsor outreach emails. `ResendSender.send(m)` calls `sendClubEmail({to, subject, html, category:'sponsor_outreach', memberId})`, maps `{sent,id,error}` → `{ok,externalId,error}`.

### `src/lib/sponsorship/outreach/types.ts`
Business meaning: shared contract enforcing a human always approves a sponsor-outreach message before send. `OutreachMessage {id,to,subject,html,text?,memberId?}`, `SendOutcome {ok,externalId?,error?}`, `OutreachSender {name, send(m)}`, `OutreachChannel='resend'|'instantly'`.

---

## `src/lib/stripe/`

### `src/lib/stripe/client.ts`
Business meaning: loads the Stripe.js browser SDK once (singleton) for the membership-application form's Stripe Elements card widget. `getStripe()` — lazily caches `loadStripe()`; returns `null` (logs error) if `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is unset. Going live is purely an env-var swap (test↔live publishable key), no code change.

---

## `src/lib/supabase/`

### `src/lib/supabase/client.ts`
Browser-side Supabase client for client components (RLS-scoped to the logged-in user). `createClient()` — `createBrowserClient` with trimmed URL/anon key. `supabase` — a `Proxy`-wrapped lazy singleton so accessing it doesn't throw during Next.js static generation before env vars are available.

### `src/lib/supabase/server.ts`
Server-side (SSR/Server Component/Route Handler) Supabase client wired to Next.js cookies. `createClient()` (async) — `createServerClient` from `@supabase/ssr`; silently swallows `setAll` cookie-write errors when called from a Server Component (expects middleware to refresh sessions instead).

---

## `src/lib/templates/`

### `src/lib/templates/ai-schema.ts`
Business meaning: the bridge between the OpenAI structured-output "AI email builder" chat and the visual email editor's block model. Rather than making GPT fill the editor's fully-styled `EditorBlock` shape, the AI is given a simplified `AiBlock` schema (semantic fields only), and the server expands it into a full styled `EditorBlock`.

**AI usage**: doesn't call OpenAI itself (the caller, e.g. `/api/templates/ai-generate`, does), but defines the exact structured-output JSON Schema (`openAiJsonSchema`, `strict:true`) OpenAI's response must conform to, plus the Zod schema (`aiTemplateResponseSchema`) validating the reply, plus expansion/sanitisation.

Top-level AI response schema (verbatim):
```
{
  intent: 'answer' | 'create' | 'enhance',
  reply: string (1–4000 chars),
  name: string (max 80),
  subject: string (max 200),
  preheader: string | null (max 200),
  blocks: AiBlock[] (max 40),
  theme: { headerBgColor, headerTextColor, footerBgColor, footerTextColor,
           footerLinkColor, pageBgColor, bodyBgColor, fontFamily } | null,
  event_picks: string[] | null (max 10)
}
```
`AiBlock` discriminated union by `type`, 11 types: `text, heading, button, divider, spacer, image, sarah_signature, html, video, social, columns`. Notable prompt-facing field docs: `text.html` — "Paragraph content as simple HTML. Allowed tags: p, br, strong, em, u, a (href), ul, ol, li, span. Use `{{first_name|there}}` merge tags freely." `button.color` — "Hex bg colour. Defaults to brand gold (#B8975A)." `columns` — `{columns:2|3, leftBlocks, rightBlocks, centerBlocks?}` — only the 6 "basic" block types (text/heading/button/divider/spacer/image) may nest inside columns.

Exports: `resolveAiFont(input?)` (maps an AI-returned font name/stack to a curated `EMAIL_FONTS` entry — exact/label/loose-substring match; `undefined` if nothing matches, so the AI can never invent an unsupported email font), `AI_FONT_OPTIONS` (comma-quoted label list for the system prompt), `aiBlockSchema`/`basicAiBlockSchema` (Zod), `aiTemplateResponseSchema`/`AiTemplateResponse`, `openAiJsonSchema` (`{name:'EmailTemplate', strict:true, schema:{...}}` — the literal object passed to OpenAI), `expandAiBlock(ai)`/`expandAiBlocks(ai[])` (simplified→full `EditorBlock`, merging `defaultBlockContent`), `mergeAiBlocksWithExisting(aiBlocks, existingFullBlocks)` ("enhance mode": keeps the ORIGINAL full block wherever the AI's block is semantically unchanged (`compactEqual`), so an enhance pass never blows away hand-tweaked styling on untouched blocks), `compactBlockForPrompt(block)` (reverse direction, for feeding "enhance" prompts).

Hardcoded safety rules: `sanitizeHtml` strips `<script>,<iframe>,<style>,<object>,<embed>,<form>,<input>,<button>,<link>,<meta>,<base>` (paired+self-closing), strips all `on*=` handlers, neutralises `javascript:` URLs (→ `href=""`), blacklists `data:` URLs in href/src. `sanitiseColour` only accepts 3/6/8-digit hex, a fixed named-CSS-colour set (`red,green,blue,black,white,gray,grey,yellow,orange,purple,pink,brown,navy,teal,cyan,magenta,lime,olive,maroon,silver,gold,transparent,inherit,currentcolor`), or valid `rgb()`/`rgba()` — else rejected to `''`. Heading level→size: `1→xlarge,2→large,3→normal`. AI image width→%: `full→100,large→75,medium→50,small→25`. Columns: 3-col widths `[33,33,34]`, 2-col `[50,50]`. HTML blocks truncated to 5000 chars post-sanitisation.

### `src/lib/templates/editor-types.ts`
Business meaning: core type system + defaults for the drag-and-drop email builder — every block type, per-template theme, the full merge-tag catalogue offered in the editor's insert menu, and sample preview contacts.

`BlockType` (12 variants: `text, image, button, divider, spacer, video, social, html, columns, conditional, sarah_signature, file`). Per-type content interfaces (`TextBlockContent`, `ImageBlockContent`, etc.). `TemplateTheme` (header/footer bg+text colors, footerLinkColor, pageBgColor, bodyBgColor, fontFamily). `EMAIL_FONTS` — 11 curated email-safe stacks: 2 brand fonts (Playfair Display serif, DM Sans sans) + 9 standard fallbacks (Georgia, Times New Roman, Garamond, Arial, Helvetica, Verdana, Tahoma, Trebuchet MS, Courier New). `DEFAULT_EMAIL_FONT = "'DM Sans', Arial, Helvetica, sans-serif"`. `defaultTemplateSettings = {name:'Untitled Template', subject:'', preheader:'', fromNameType:'sender', category:'campaign', ...}`. `defaultBlockContent` per block type (button default bg `#B8975A` gold, `borderRadius:9999` pill shape; divider default color `#E5E0D8`). `sampleContacts` — 3 fictional sample rows (Charlotte Hayes, James Whitfield, Olivia Pearce) for editor preview.

**Merge-tag catalogue (`templateVariables`, verbatim, by category):**
- member: `{{first_name}}`, `{{last_name}}`, `{{email}}`, `{{phone}}`, `{{membership_tier}}`, `{{company_name}}`
- event: `{{event_name}}`, `{{event_date}}`, `{{event_time}}`, `{{venue_name}}`, `{{dress_code}}`
- intro: `{{other_member_name}}`, `{{introduction_note}}`
- sender: `{{sender_name}}`, `{{sender_title}}`, `{{sender_email}}`, `{{sender_phone}}`, `{{booking_link}}`
- sponsor: `{{sponsor_booking_link}}` (personalised `/events/<slug>?s=<token>`), `{{sponsor_name}}`, `{{sponsor_company}}`, `{{sponsor_price}}`
- misc: `{{month_name}}`

### `src/lib/templates/preview-data.ts`
Business meaning: one canonical fake merge-tag dataset (fictional member "Charlotte Hayes", event "Spring Salon Supper") so every preview surface outside the full editor canvas shows realistic rendered text instead of raw tokens.

`SAMPLE_PREVIEW_DATA` — fixed sample values (event_name: "Spring Salon Supper", event_date: "Saturday, 4 April 2026", venue_name: "The Connaught, Mayfair", sender_name: "Sarah Restrick", sender_title: "Founder, The Club", etc.). `previewMergeTags(text?)` — runs `replaceMergeTags` against this data; `''` for null/undefined input.

### `src/lib/templates/render-html.ts`
Business meaning: converts the editor's block-tree JSON into the final HTML email — fixed brand header/footer chrome, Outlook (mso) compatibility hacks, per-block-type rendering. The last step before an email leaves the CRM.

`DEFAULT_THEME` (verbatim): `headerBgColor:'#FAFAF7'`, `headerTextColor:'#2C2825'`, `footerBgColor:'#F3F0EA'`, `footerTextColor:'#6B6560'`, `footerLinkColor:'#B8975A'`, `pageBgColor:'#F7F5F0'`, `bodyBgColor:'#FFFFFF'`, `fontFamily:"'DM Sans', Arial, Helvetica, sans-serif"`. `resolveTheme(theme?)` merges a template's custom theme over the default. `renderBlocksToHTML(blocks, theme?)` — full table-based HTML doc with MSO conditional comments and a `@media (max-width:600px)` responsive rule, 600px max content width. `replaceVariables(html, data)` — a narrower legacy `{{tag}}` replacer (first_name, last_name, email, event_name, sender_name, sender_email, unsubscribe_url, subject only) vs. the full engine in `utils-templates/merge-tags-core.ts`.

Fixed copy/behaviour: header always "The Club" (Playfair Display serif 26px) over "by Sarah Restrick" (Montserrat uppercase, letterspacing 0.25em); footer always "The Club by Sarah Restrick", "A private membership community", and `{{unsubscribe_url}}`. Text sizes: small=14px, normal=16px, large=18px, xlarge=24px. Social icons rendered via external Iconify CDN (`https://api.iconify.design/simple-icons:<slug>.svg?color=<hex>` — switched from simpleicons.org after it started 404ing brand marks post-trademark-takedowns). `sarah_signature` block ALWAYS renders a hardcoded confidentiality disclaimer + "The Club · by Sarah Restrick" brand line regardless of admin toggles; only variable sender-detail fields are conditional. Fallback sender identity if the sending admin's profile is blank: "Sarah Restrick" / "Founder, The Club" / "sarah@theclub.example.com" / "theclub.example.com".

### `src/lib/templates/social-icons.ts`
Business meaning: SVG icon paths + brand colors for 8 social platforms (Facebook, X/Twitter, Instagram, LinkedIn, YouTube, TikTok, Threads, Flickr) used by the Social block, sourced from Simple Icons (CC0).

`SocialPlatform` (8-key union); `SOCIAL_PLATFORMS` array with official brand hex colors (Facebook `#1877f2`, Instagram `#e4405f`, LinkedIn `#0a66c2`, YouTube `#ff0000`, Flickr `#0063DC`; Twitter's `cdnSlug:'x'` reflects the X rebrand); `socialIconSvg(platform, color, size=16)` returns a raw inline `<svg>` string.

### `src/lib/templates/types.ts`
Business meaning: plain DTO types for an `email_templates` row used by `useTemplates.ts` and anywhere templates are listed/filtered. `Template {id, name, subject, preheader, body_html, body_json, theme, category:'automation'|'campaign'|'transactional', from_name_type:'sender'|'fixed', fixed_from_name, fixed_from_email, attachments, is_draft, created_by_id, created_at, updated_at}`; `TemplateFilters {search?, category?}`; `CreateTemplateInput`.

---

## `src/lib/utils-templates/`

### `src/lib/utils-templates/merge-tags-core.ts`
Business meaning: the canonical merge-tag engine substituting `{{field}}` placeholders in subject lines and bodies with real recipient/event/sender data at send time — including conditional logic and automatic currency/boolean formatting. The heart of email personalization app-wide.

`MergeTagValue = string|number|boolean|null|undefined`; `MergeTagData {[key:string]: MergeTagValue}`; `replaceMergeTags(template, data)` — runs conditional-block processing first, then simple-tag substitution.

**Syntax rules (verbatim):**
| Syntax | Behaviour |
|---|---|
| `{{field_name}}` | Simple substitution |
| `{{field_name\|default text}}` | Falls back to default text if null/undefined/empty string; an EMPTY fallback (`{{field\|}}`) is explicitly supported — renders blank instead of leaking the raw token (a documented bugfix) |
| `{{#if field_name}}...{{/if}}` | Truthy block |
| `{{#if field_name equals "value"}}...{{/if}}` | Exact string match |
| `{{#if field_name not_equals "value"}}...{{/if}}` | Not-equal |
| `{{#if field_name contains "value"}}...{{/if}}` | Case-insensitive substring |
| `{{#unless field_name}}...{{/unless}}` | Falsy/empty block |

Field lookup: exact `snake_case` key first, then falls back to a camelCase conversion of the same key. Value formatting: numbers → GBP currency via `Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',minimumFractionDigits:0})` (e.g. `1500→"£1,500"`); booleans → "Yes"/"No"; everything else → `String(value)`.

---

## `src/lib/whatsapp/`

### `src/lib/whatsapp/client.ts`
Business meaning: shared sender for outbound WhatsApp Business messages via Meta's Cloud API — used by any automation/admin flow needing to WhatsApp a member (e.g. event reminders). Mirrors the email-sending pattern: normalizes numbers defensively, logs every attempt to `whatsapp_log`, never throws from the logging path.

`normalizeE164(raw, defaultCountryCode='44')` — normalizes free-text phone input to digits-only E.164 for the Cloud API `to` field; returns `null` if under 8 digits result. `WhatsAppSendResult {sent, id?, error?}`. `sendClubWhatsApp({to, memberId?, category?, template?:{name, languageCode?, components?}, text?})` — sends an approved WhatsApp template message OR free text (free text only delivers inside an open 24h customer-service window); exactly one of `template`/`text` required.

**Phone normalization algorithm (verbatim, UK/44 default):**
1. Strip non-digits (track leading `+`).
2. Leading `+` → digits already fully international, keep as-is.
3. Leading `00` → strip international access prefix.
4. Leading `0` (no `+`/`00`) → UK trunk digit, strip it and prepend `44`.
5. Digits already start with `44` → leave as-is.
6. Digits ≥11 chars with no leading 0/+ → treated as ALREADY carrying another country's code (e.g. Pakistan `92…`, US `1…`) — do NOT prepend default (explicit bugfix: previously corrupted `923371406125` into `44923371406125`).
7. Otherwise (short bare national number) → prepend default country code.
8. Fewer than 8 digits remaining → `null` (invalid).

Integration: env vars `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION` (default `'v25.0'`); endpoint `POST https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`; every attempt (even invalid-number failures) best-effort logged to `whatsapp_log` via a lazily-created service-role client (logging failures only `console.error`'d); template messages default `languageCode` to `'en_US'`.

---

## `src/lib/xero/`

### `src/lib/xero/client.ts`
Business meaning: implements Xero's OAuth2 Authorization-Code flow from scratch (no SDK) so the CRM can connect to a client's Xero org, and manages token storage/refresh so every other Xero file just asks for "a valid access token." Admin-only (Settings → Xero connect).

Exports: `XeroConfig`/`XeroTokenResponse`/`XeroConnection`/`StoredXeroTokens` types; `XeroNotConnectedError` (thrown when no tokens stored); `getXeroConfig()` (reads/validates `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI`, `XERO_SCOPES`, throws listing missing vars); `buildAuthorizeUrl(state)`; `exchangeCodeForTokens(code)`; `refreshAccessToken(refreshToken)`; `getConnections(accessToken)` (`GET /connections` — lists tenants); `loadXeroTokens(db)` (reads `app_settings['xero_oauth']`); `saveXeroTokens(db, {tokens,tenantId,tenantName,connectedAt?})`; `clearXeroTokens(db)` (disconnect); `getValidAccessToken(db)` — **the function every Xero call goes through**: returns cached token unless near expiry, else refreshes and immediately persists rotated tokens; `xeroApiFetch(db, path, init?)` — convenience wrapper resolving token + `Xero-tenant-id` header then fetching `https://api.xero.com${path}`.

Integration specifics: endpoints `AUTHORIZE_URL=https://login.xero.com/identity/connect/authorize`, `TOKEN_URL=https://identity.xero.com/connect/token`, `CONNECTIONS_URL=https://api.xero.com/connections`, `API_BASE=https://api.xero.com`. Tokens stored as **plaintext JSONB** in `app_settings['xero_oauth']` — protected only by admin-only RLS, no encryption layer. **Critical rule**: Xero issues a brand-new `refresh_token` on every refresh and invalidates the old one — code always immediately re-persists it or the connection breaks permanently. `EXPIRY_SKEW_MS=60_000` (refresh proactively within 60s of expiry; access tokens live ~30 min). Deliberately raw `fetch`, no `xero-node` SDK.

### `src/lib/xero/contacts.ts`
Business meaning: keeps a Xero "Contact" record in sync for every CRM member so invoices can attach to the right contact. Admin-triggered (manual or scheduled).

`findXeroContactByEmail(db, email)` (`GET /Contacts?where=EmailAddress=="..."`), `createXeroContact(db, {name, firstName?, lastName?, email?, memberId?})` (retries once with the member id's first 8 chars appended in parens on a duplicate-name error), `syncMemberToXeroContact(db, member, {force?})` → `{contactId, action:'matched'|'created'|'skipped'}` (match-by-email first, else create; persists `members.xero_contact_id`; skips if already synced unless forced), `syncAllMembers(db, {force?})` → `{created,matched,skipped,failed,errors[]}` (sequential; per-member errors collected without aborting; `XeroNotConnectedError` alone aborts immediately).

Rules: Xero requires unique Contact `Name` per org — display name derivation order: full name → company name → email → member id. Rate-limit handling: Xero allows ~60 calls/min/tenant, 5 concurrent — module processes members SEQUENTIALLY and on HTTP 429 retries up to `MAX_429_RETRIES=8`, honoring `Retry-After` (capped at `MAX_RETRY_AFTER_MS=60_000`).

### `src/lib/xero/invoices.ts`
Business meaning: pushes the CRM's `payments` ledger into Xero as real ACCREC sales invoices, and best-effort marks them paid, so a client's accountant sees CRM revenue reflected in their books.

`xeroFetch429(db, path, init?)` — shared 429-retry wrapper (reused by `revenue.ts`/`spend.ts`). `toYmd(value)`, `penceToAmount(pence)` (`Math.round(pence)/100`). `resolveAccounts(db)` — resolves once per run: sales account (prefers Xero universal code `'200'`, else first REVENUE account, else fallback `'200'`), bank account (first BANK account or `null`), expense account (first EXPENSE account, else fallback `'400'`). `pushPaymentToXero(db, payment, accounts)` → `'created'|'skipped'` (creates ACCREC invoice for one paid payment lacking a Xero id, writes `payments.xero_invoice_id`, then best-effort marks paid via a bank Payment). `pushAllPayments(db)` → `{created,skipped,failed,errors[]}` (sequential over `payments` where `status='paid' AND xero_invoice_id IS NULL`).

Accounting rules: `DEFAULT_SALES_CODE='200'`, `DEFAULT_EXPENSE_CODE='400'`. **Currency deliberately omitted** on invoices (demo org is "Global," GBP may not be enabled — Xero uses the org's base currency). `LineAmountTypes:"NoTax"` (UnitAmount = exact total, no tax calc). Invoice `Reference` always `"CRM payment <payment.id>"`. Line description falls back to a humanized `payment_type` (underscores→spaces, capitalized). Same 429-retry policy as `contacts.ts`.

### `src/lib/xero/revenue.ts`
Business meaning: extends the basic payment push to cover every other confirmed-revenue/money-owed stream — sponsorships, concierge bookings, introduction commissions (money owed TO the club), referral payouts (money the club owes a member) — plus a fallback "guest" Xero contact for memberless payments. The full financial-sync run an admin triggers to reconcile CRM money movement into Xero.

`StreamResult {created,skipped,failed,errors:{id,error}[]}`. `getOrCreateGuestContact(db)` — find-or-create the shared `"The Club — Guest Bookings"` contact, cached in `app_settings['xero_guest_contact_id']` (created once). `createXeroDoc(db, {type:'ACCREC'|'ACCPAY', contactId, date, dueDate, description, amount, reference, accountCode})` — generic invoice/bill creator (both hit `/Invoices`; a bill is `Type:'ACCPAY'`). `pushGuestPayments`, `pushSponsorships` (status `confirmed`/`invoiced`/`paid`; contact = member's Xero contact, or find/create-by-company-name for external sponsors), `pushConcierge` (status `booked`/`delivered`/`feedback` with `sale_price_pence>0`), `pushIntroCommissions` (introductions with `commission_pence>0`, ACCREC to `member_a_id` the introducer), `pushReferralPayouts` (`reward_referrals` with `commission_pence>0` as **ACCPAY bills** against the expense account, writing `reward_referrals.xero_bill_id`). `pushAllRevenue(db)` — runs `pushAllPayments` + all 5 streams; each stream isolated (one stream's exception tallied as failure, doesn't abort others) EXCEPT `XeroNotConnectedError`, which aborts the whole run immediately.

Accounting decision rules (verbatim): sponsorships/concierge/intro-commissions/guest-payments → **ACCREC** (money owed TO the club) on the sales account; referral payouts → **ACCPAY** bills (money the club OWES) on the expense account. Guest contact name literal: `"The Club — Guest Bookings"`.

### `src/lib/xero/spend.ts`
Business meaning: pulls each member's total historical spend directly from Xero's own invoice records (which may predate the CRM) into `members.xero_spend_pence`, so Sarah can tell a member "you've spent £X with us" at renewal time even for pre-CRM spend.

`PullSpendResult {membersUpdated, invoicesScanned, contactsWithSpend}`. `pullMemberSpend(db)` — pages through ALL ACCREC invoices once, aggregates `AmountPaid` by `Contact.ContactID`, writes `xero_spend_pence` + `xero_spend_synced_at` onto every non-deleted member with a linked `xero_contact_id`.

Efficiency rule: deliberately avoids one API call per member (~88 calls) — pages through all invoices once (`PAGE_SIZE=100`, capped at `MAX_PAGES=200`) and aggregates in memory in a single pass regardless of member count. Skips invoices with `Status ∈ {DELETED, VOIDED}`. Writes `0` for members whose contact has no paid invoices on re-run (value always reflects current reality, not cumulative). Currency not forced (same rationale as `invoices.ts`) — `AmountPaid` is in the org's base currency; pence = `Math.round(pounds * 100)`.
