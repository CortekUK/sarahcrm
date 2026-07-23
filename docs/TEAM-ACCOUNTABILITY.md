# Team Accountability — Build Documentation

Covers the two modules shipped so far for the Team Accountability system:

1. **Foundation** — staff login roles, staff records, and a self‑contained "Accountability" task module with a full transparency layer.
2. **Time Tracking & Profitability** — staff log hours against their tasks; tasks link to events; per‑event profitability (revenue − cost).

Both are built on the existing Next.js 15 (App Router) + Supabase stack, use the house UI primitives (`src/components/ui/*`, not raw `ui-shadcn`) styled with the theme tokens in `globals.css`, and follow the app's existing auth/migration conventions.

---

## Module 1 — Foundation

### What it does
- Adds two **limited staff login roles** — `team_member` and `freelancer` — alongside the existing `admin` and `member`. Staff sign in and see **only their own** work; they cannot reach the rest of the CRM.
- Admins manage staff records and create/assign tasks.
- Every task is a **transparency record**: single owner, deadline, status, comment thread, file attachments, an outcome field, and an append‑only activity/history log.

### Roles & access
- `user_role` enum extended: `admin | member | team_member | freelancer`.
- `profiles.staff_status` (`active | inactive`) — staff **are** profiles with a staff role.
- **Routing (`src/middleware.ts`):** each role has exactly one workspace and cross‑role traffic is hard‑redirected via a `homeForRole` helper:
  - `admin` → `/dashboard`
  - `member` → `/portal`
  - `team_member` / `freelancer` → `/team`
- Staff sign in at **`/admin/login`** (it serves admins + staff and routes each to its home; members are rejected there).

### Data model (tables)
- `accountability_tasks` — `id, title, description, owner_id → profiles, created_by, event_id → events (added in Module 2), deadline, status (not_started|in_progress|blocked|done), outcome, created_at, updated_at`
- `accountability_task_comments` — `id, task_id, author_id, body, created_at`
- `accountability_task_attachments` — `id, task_id, uploaded_by, file_path, file_name, created_at`
- `accountability_task_activity` — `id, task_id, actor_id, event_type, detail (jsonb), created_at` — **append‑only**, written by `SECURITY DEFINER` triggers (created / status_changed / reassigned / outcome_recorded / comment_added / attachment_added). No direct INSERT policy.
- Storage bucket **`accountability-files`** (private); objects keyed `<task_id>/<uuid>-<filename>`.

### Security (RLS)
- `accountability_tasks`: admins manage all; an owner (`owner_id = auth.uid()`) can SELECT/UPDATE only their own task, and the `WITH CHECK` keeps them the owner (can't reassign away). Only admins create/delete.
- comments / attachments: admins all; owner can SELECT + INSERT for their own task's rows (author/uploader must be self); owner can DELETE only their own attachments.
- activity: SELECT‑only (admins all; owner for their own task's rows).
- Storage: `can_access_accountability_object()` derives the owning task from the path and allows admin‑or‑owner for select/insert/delete.
- Helpers: `is_admin()` (pre‑existing), `is_staff()` (added).

### Files
**Migration:** `supabase/migrations/20260723_accountability_foundation.sql` (applied via `scripts/apply-accountability-migration.mjs`; idempotent).

**Admin UI**
- `src/views/admin/accountability/TeamMembersPage.tsx` — list/create/invite staff, activate/deactivate, resend login. (Rate column added in Module 2.)
- `src/views/admin/accountability/AccountabilityTasksPage.tsx` — create/assign tasks, filter, open a task to comment/attach/change status/record outcome + see activity. (Event selector added in Module 2.)
- Thin pages: `src/app/(admin)/dashboard/accountability/{tasks,team}/page.tsx`
- Nav group "Accountability" added in `src/app/(admin)/layout.tsx`.

**Staff UI**
- `src/app/(staff)/layout.tsx`, `src/app/(staff)/team/page.tsx`
- `src/views/staff/StaffTasksPage.tsx` — a staff member sees only their own tasks; update status, comment, attach, record outcome.

**Shared / API**
- `src/components/accountability/TaskCollab.tsx` — comments + attachments + activity component.
- `src/lib/accountability.ts` — constants, types, attachment helpers, activity formatter.
- `src/app/api/admin/team/create/route.ts` — create/invite a staff login (service‑role; reuses the Resend invite/temporary‑password flow). Returns `invite_sent` + `invite_error`.
- `src/app/api/admin/team/resend-invite/route.ts` — resend login (resets password + emails).
- `src/middleware.ts` — `/team` gating + `homeForRole`.

---

## Module 2 — Time Tracking & Profitability

### What it does
- **All staff** (`team_member` + `freelancer`) log time against **their own tasks**, either by **manual entry** (hours + date + note) or a **start/stop timer** (one running timer per person; on stop, hours are computed from start→end).
- A task can be linked to an **Event**; time rolls up **Event → its tasks → their entries**. Staff never need access to the events table — they only ever touch their own tasks.
- Admins set a per‑staff **hourly rate** and enter each event's **revenue** manually. The system computes **cost = Σ(hours × rate)** and **profit = revenue − cost** per event.

### Data model (added)
- `accountability_tasks.event_id` — nullable FK → `events` (on delete set null).
- `staff_rates` — `staff_id (PK) → profiles, hourly_rate numeric(10,2), updated_by, updated_at`. **Separate admin‑only table** (see security note).
- `time_entries` — `id, staff_id → profiles, task_id → accountability_tasks (cascade), hours numeric(6,2) (null while a timer runs), entry_date, note, source ('manual'|'timer'), started_at, ended_at, created_at, updated_at`.
- `event_profitability` — `event_id (PK) → events, revenue numeric(12,2) default 0, updated_by, updated_at`. Separate table so the existing `events` schema/feature is untouched.
- Partial unique index **`uniq_running_timer_per_staff`** on `time_entries(staff_id) WHERE source='timer' AND ended_at IS NULL` — enforces one running timer per staff.

### Security (RLS)
- `time_entries`: admins manage all; a staff member can SELECT/INSERT/UPDATE/DELETE only rows where `staff_id = auth.uid()` **and** the referenced task's `owner_id = auth.uid()` (they can only log against their own tasks).
- `staff_rates` and `event_profitability`: **admin‑only** (staff have no access) — so rates, revenue, and profit are never exposed to staff.

> **Why rates live in their own table, not on `profiles`:** the initial schema has a policy `"Authenticated users can view profiles"` (`SELECT using (true)`), so every authenticated user — including staff — can read every profile row. Postgres RLS is row‑level, not column‑level, so a `hourly_rate` column on `profiles` could **not** be hidden from staff. The dedicated `staff_rates` table (admin‑only RLS) closes that leak.

### Files
**Migration:** `supabase/migrations/20260724_time_tracking.sql` (applied via `scripts/apply-time-tracking-migration.mjs`; idempotent).

- `src/lib/time-tracking.ts` — types + a `formatPounds` helper (the existing `formatCurrency` expects pence; rates/revenue are stored in pounds).
- `src/components/accountability/TaskTimeLog.tsx` — the shared time UI (manual entry + timer + entry list), embedded in both the staff and admin task modals.
- `src/views/admin/accountability/TimeProfitabilityPage.tsx` — the **Time & Profitability** page: per‑event revenue (inline‑editable) / hours / cost / profit, plus a per‑staff summary (hours, rate, cost, tasks completed).
- `src/app/(admin)/dashboard/accountability/time/page.tsx` — thin page; nav child added in `src/app/(admin)/layout.tsx`.
- Modified: `AccountabilityTasksPage.tsx` (Event selector on the task modal), `TeamMembersPage.tsx` (inline £/h rate column), `StaffTasksPage.tsx` (embeds `TaskTimeLog`).

---

## Module 3 — Weekly Scorecards

### What it does
- An **admin sets each staff member's weekly targets** — a `label` + a `target_value` number, each with a **source**:
  - `manual` — the actual value is **self-reported by the staff member** (stored in `scorecard_targets.manual_actual`); admins can also edit it. *(Decision: manual actuals are entered by the staff member themselves; the admin can override.)*
  - `tasks_completed` — actual auto-computed = count of that staff member's `accountability_tasks` with status `done` whose `updated_at` falls in the week.
  - `hours_logged` — actual auto-computed = Σ of that staff member's `time_entries.hours` with `entry_date` in the week.
- Weeks run **Monday→Sunday**, identified by `week_start` (a Monday date).
- A **performance score** = % of targets met (met = actual ≥ target; a zero target counts as met). A **Friday summary** rolls up Met / Total + the score + a short **AI narrative** (on-demand "Generate summary" admin button; reuses the repo OpenAI setup with a templated fallback).

### Data model (added)
- `scorecard_targets` — `id, staff_id → profiles, week_start date, label, target_value numeric, source ('manual'|'tasks_completed'|'hours_logged'), manual_actual numeric default 0, created_by, created_at, updated_at`. Index `(staff_id, week_start)`.
- `scorecard_summaries` — `id, staff_id → profiles, week_start date, performance_score, targets_met, targets_total, narrative, generated_at, generated_by`. **Unique `(staff_id, week_start)`** (upsert on regenerate).

### Security (RLS)
- `scorecard_targets`: admins manage all. A staff member may **SELECT** their own rows, and **UPDATE only their own `source='manual'` targets** — and only the `manual_actual` column. The UPDATE *policy* limits which rows (own + manual); a **BEFORE UPDATE trigger** (`scorecard_targets_guard`) enforces which *columns* by forcing every protected column (`label`, `target_value`, `source`, `staff_id`, `week_start`, …) back to its OLD value for non-admins. This is the column-level guarantee a policy alone can't give (WITH CHECK can't see OLD; admin+staff share the `authenticated` DB role so per-column GRANTs can't separate them). Target **create/delete is admin-only** (no staff INSERT/DELETE policy).
- `scorecard_summaries`: admins manage all; a staff member may **SELECT** their own summary only. Staff never write summaries.
- *All seven behaviours were verified live against the staff test account* (select own ✓, edit manual_actual ✓, label/target change reverted by trigger ✓, update auto target blocked ✓, insert/delete target blocked ✓, write summary blocked ✓).

### Files
**Migration:** `supabase/migrations/20260725_weekly_scorecards.sql` (applied via `scripts/apply-scorecards-migration.mjs`; idempotent, RLS-verified).
- `src/lib/scorecards.ts` — types, Monday-week helpers, source metadata, and the shared actual/score computation (used by both UIs and the API).
- `src/app/api/admin/scorecards/summary/route.ts` — admin-only; computes authoritative actuals server-side, calls OpenAI (fallback templated), upserts `scorecard_summaries`.
- `src/views/admin/accountability/ScorecardsPage.tsx` — the **Scorecards** page: week picker, per-staff targets (live auto actuals, inline manual actual, add/edit/remove), performance score, and the Generate-summary button. Thin page `src/app/(admin)/dashboard/accountability/scorecards/page.tsx`; nav child added in `src/app/(admin)/layout.tsx`.
- `src/views/staff/StaffScorecardPanel.tsx` — the staff "My scorecard" area at `/team` (this week's targets, live progress, self-report manual actuals, score, read-only Friday summary). Wired into `src/app/(staff)/team/page.tsx`.

---

## Module 4 — Daily Handover

### What it does
- **Every staff member** (`team_member` + `freelancer`) submits a short **end-of-day handover** through a **form inside the CRM** (not WhatsApp/Slack), with four fields: **What I completed today**, **What I'm working on tomorrow**, **What's blocked**, **Support needed**.
- **One handover per staff per day** (`handover_date`), **editable that day** (saved via upsert on `(staff_id, handover_date)`).
- An admin picks a **date** and sees **every active staff member's** handover for that day plus a clear list of **who hasn't submitted**, then clicks **Generate report** to produce **"Sarah's Daily Leadership Report"** — the repo's OpenAI setup condenses the day's handovers into one concise leadership narrative (with a **templated fallback** if OpenAI is unavailable, which surfaces blockers + support needs even without the model). The report is **saved** to `daily_reports` and **re-generatable**. Delivery is **in-app** on the admin page.

### Data model (added)
- `daily_handovers` — `id, staff_id → profiles (cascade), handover_date date, completed_today text, working_tomorrow text, blocked text, support_needed text, created_at, updated_at`. **UNIQUE `(staff_id, handover_date)`** (`uniq_daily_handover_staff_date`, the upsert target); index `idx_daily_handovers_date` on `(handover_date)`. `set_updated_at` trigger reuses `handle_updated_at()`.
- `daily_reports` — `id, report_date date, narrative text, submitted_count int, staff_total int, generated_at, generated_by → profiles`. **UNIQUE `(report_date)`** (`uniq_daily_report_date`, upsert on regenerate).

### Security (RLS)
- `daily_handovers`: admins manage all. A staff member may **SELECT / INSERT / UPDATE only their OWN** handover (`staff_id = auth.uid()`, enforced by `USING`/`WITH CHECK`). **No staff DELETE policy.** Staff cannot read others' handovers — there is no policy exposing other rows to non-admins.
- `daily_reports`: **admin-only** — no staff policy exists at all, so staff have **no access** (the leadership report aggregates everyone, so it is never exposed to staff).
- *All eight behaviours were verified live against the staff test account* (`scripts/verify-handover-rls.mjs`): upsert own ✓, update own ✓, read own ✓, others' handovers hidden ✓, insert for another `staff_id` blocked (42501) ✓, delete affects 0 rows ✓, read `daily_reports` blocked (0 rows) ✓, write `daily_reports` blocked (42501) ✓.

### Files
**Migration:** `supabase/migrations/20260726_daily_handover.sql` (applied via `scripts/apply-daily-handover-migration.mjs`; idempotent, RLS-verified). RLS verifier: `scripts/verify-handover-rls.mjs`.
- `src/lib/handover.ts` — types, the four `HANDOVER_FIELDS` (keys + labels + placeholders), a `handoverHasContent()` predicate, and date helpers (`today`, `addDays`, `isToday`, `formatHandoverDate`).
- `src/app/api/admin/handover/report/route.ts` — admin-only; reads the date's handovers (service role), calls OpenAI (templated fallback), upserts `daily_reports`.
- `src/views/admin/accountability/DailyHandoverPage.tsx` — the **Daily Handover** admin page: date stepper, submitted/waiting-on status, per-staff handover cards (4 fields), and the Generate/Regenerate-report button + rendered report. Thin page `src/app/(admin)/dashboard/accountability/handover/page.tsx`; nav child "Daily Handover" (ClipboardCheck) added under Accountability in `src/app/(admin)/layout.tsx`.
- `src/views/staff/StaffHandoverPanel.tsx` — the staff "Daily handover" panel at `/team`: fills/edits **today's** handover (4 textareas), submits/updates via upsert, with a "Submitted" badge + last-saved confirmation. Wired into `src/app/(staff)/team/page.tsx` alongside the scorecard + tasks panels.

---

## Module 5 — Accountability Dashboard

### What it does
- A **team-only, admin-only, read-only** overview that **aggregates the existing accountability data** (tasks, time, scorecards, handovers) into one "what needs Sarah's attention" landing page. It does **not** duplicate the Executive dashboard (sales/finance/events/membership) — it is purely about the **team**.
- All figures are scoped to the **current Monday→Sunday week** (via `mondayOf()`/`weekEnd()` from `src/lib/scorecards.ts`) and **today** (via `today()` from `src/lib/handover.ts`), and to **active staff only** (`role in team_member|freelancer` and `staff_status = active`) so the headline numbers match the per-staff table.

**Headline StatCards:** active staff · open tasks (status ≠ done) · overdue tasks (deadline's date < today and status ≠ done) · blocked tasks · hours logged this week · handovers submitted today (x/total).

**Sections:**
1. **Task status breakdown** — a small house-styled proportion bar (not_started / in_progress / blocked / done) across active-staff tasks, with a legend + counts. (The optional visual; done with plain theme-token divs, no recharts, to stay clean.)
2. **Needs attention** — four focused lists: overdue tasks (title + owner + days late, sorted worst-first), blocked tasks (title + owner), staff with **no handover today**, and staff whose scorecard is **below 50%** this week. Collapses to a single "Nothing needs attention" empty state when all four are clear.
3. **Per-staff workload table** — each active staff member: open / overdue / blocked task counts, hours logged this week, tasks completed this week, this week's scorecard score, and a ✓/✗ for today's handover. The **scorecard score** prefers a generated `scorecard_summaries` row for the week; if none exists it is **computed live** from that week's `scorecard_targets` + auto metrics (`computeScore` / `tasksCompletedInWeek` / `hoursLoggedInWeek` from `scorecards.ts`). Staff with no targets show `—`.

### Data model
- **No new tables, columns, or migration.** This module is entirely read/aggregate over existing tables: `profiles`, `accountability_tasks`, `time_entries`, `scorecard_targets`, `scorecard_summaries`, `daily_handovers`.

### Security (RLS)
- **Admin-only** by placement under `/dashboard/*` (existing middleware gates the admin group). All reads use the **admin's session**, and admin RLS on every one of these tables already grants full read — **no new policies were added or needed**.

### Efficiency
- Six parallel queries in one `Promise.all` (staff, all tasks, this-week time entries, this-week targets, this-week summaries, today's handovers). No per-staff N+1 — everything is composed in JS with `useMemo` maps keyed by `staff_id`. Time entries and scorecard rows are date-filtered server-side to the current week; handovers to today.

### Files
- `src/views/admin/accountability/AccountabilityDashboardPage.tsx` — the dashboard view.
- `src/app/(admin)/dashboard/accountability/overview/page.tsx` — thin page.
- Nav: an **"Overview"** child (LayoutDashboard icon) was added **first** in the "Accountability" group in `src/app/(admin)/layout.tsx`, so it reads as the section landing. The other four children (Tasks, Team Members, Time & Profitability, Scorecards, Daily Handover) are unchanged.

---

## Module 6 — Accountant Auto-Escalation

### What it does
- Captures **recurring finance deliverables** (e.g. Monthly Management Accounts, VAT Return, Payroll, Cashflow Forecast) as reusable definitions, each with a **cadence** (monthly / quarterly / annual) and a **due day**.
- Each definition carries **three assignable contacts — name + email only** (they need **not** be app users / have logins): an **accountant** (level 1), an **escalation contact / Finance Director** (level 2), and a **final contact / Sarah** (level 3).
- Every period produces one **occurrence** with a computed **due_date**. When an occurrence goes **overdue**, the existing hourly automations cron **emails each level in turn, automatically** — "the system chases, not Sarah." Nothing is ever emailed twice (guarded by `escalation_level`).
- Admins create/edit/deactivate the definitions, see each period's occurrence (status, due date, days late, current escalation level), and **Mark complete** — which stops the chasing.

### Data model (added)
- `finance_tasks` — `id, title, cadence text check ('monthly'|'quarterly'|'annual'), due_day int check (1–28), accountant_name, accountant_email, escalation_name, escalation_email, final_name, final_email, active boolean default true, created_by → profiles, created_at, updated_at`. `set_updated_at` trigger reuses `handle_updated_at()`.
- `finance_task_occurrences` — `id, finance_task_id → finance_tasks (cascade), period_label text ('2026-07' | '2026-Q3' | '2026'), due_date date, status text check ('pending'|'completed') default 'pending', completed_at, completed_by → profiles, escalation_level int default 0 (0=none 1=accountant 2=FD 3=final), last_notified_at, created_at, updated_at`. **UNIQUE `(finance_task_id, period_label)`** (`uniq_finance_occurrence_task_period`, the upsert target); index `idx_finance_occurrences_status_due` on `(status, due_date)`.

### Security (RLS)
- **Admin-only on BOTH tables** — this is finance data, so staff/members have **no access**. There is a single `for all using (is_admin()) with check (is_admin())` policy on each table and **no non-admin policy at all**. Verified live: RLS enabled on both, only the two admin policies present.

### Escalation engine + cron hook
- New module `src/lib/automations/finance-escalation.ts` exports `financeEscalation(admin, dryRun)`, hooked into `runAllAutomations()` in `src/lib/automations/run.ts` (added to the `flows` array), so it runs on the existing hourly `/api/cron/automations` heartbeat with the **service-role** client. (The real batch fires once a day at the admin-configured send-hour, like every other flow; daily cadence is ample because the thresholds are measured in days.)
- Each run: **(1)** for every `active` finance task, idempotently upserts the **current** period's occurrence (and the immediately-**previous** one, so a just-passed deadline is tracked) with the computed `due_date`; **(2)** for every `pending` occurrence whose `due_date` has passed, escalates by time overdue using named constants `ESCALATION_DAYS = { accountant: 0, director: 3, final: 7 }`:
  - overdue ≥ 0d & level < 1 → email **accountant**, set level 1.
  - overdue ≥ 3d & level < 2 → email **Finance Director**, set level 2.
  - overdue ≥ 7d & level < 3 → email **Sarah (final)**, set level 3.
- **Dedup / idempotency:** `escalation_level` **is** the ledger. A level is emailed only when the stored level is below it, and the advanced level is persisted immediately after the sends — so the hourly cron can never email the same level twice. Completed occurrences are excluded at the query (`status='pending'`). Emails go via `sendClubEmail` (logged to `email_log`) and clearly state the task, period, due date, and days late.
- **Documented decision — one run can advance multiple levels:** an occurrence first seen already ≥7 days overdue fires all applicable levels in a single run (the deadlines really have passed), then never re-fires. A contact with **no email set** still "consumes" its level (so it isn't retried forever); `last_notified_at` is stamped only when an email actually sent.
- **Documented decision — due_date month for quarterly/annual:** the spec gives only a day-of-month. Fixed rule: monthly → `due_day` of the period month; quarterly → `due_day` of the quarter's **final** month (Mar/Jun/Sep/Dec); annual → `due_day` of **December**. `due_day` is constrained 1–28 so it is valid in every month.

### Files
**Migration:** `supabase/migrations/20260727_finance_tasks.sql` (applied via `scripts/apply-finance-tasks-migration.mjs`; idempotent — run twice, verified; RLS admin-only verified).
- `src/lib/finance-tasks.ts` — shared types, cadence options/labels, escalation-threshold + level-meta constants, contact-for-level resolver, and the pure period/due-date/days-late maths (used by both the UI and the engine).
- `src/lib/automations/finance-escalation.ts` — the escalation engine (occurrence seeding + guarded per-level emailing); returns a `FlowResult`.
- `src/lib/automations/run.ts` — hooked `financeEscalation` into the `flows` array in `runAllAutomations`.
- `src/views/admin/accountability/FinanceTasksPage.tsx` — the **Finance Tasks** admin page: headline stats, a prominent **Overdue — being chased** section, per-task definition cards (cadence, due day, three contacts, Edit / Deactivate) with each period's occurrences (status, due date, days late, escalation-level badge, **Mark complete**), and a create/edit modal. Creating a task immediately seeds the current + previous occurrences (idempotently) so it is actionable before the next cron run.
- `src/app/(admin)/dashboard/accountability/finance/page.tsx` — thin page; nav child "Finance Tasks" (PoundSterling icon) added under **Accountability** in `src/app/(admin)/layout.tsx`.
- `src/types/database.ts` — added `finance_tasks` + `finance_task_occurrences` table types.

### Test instructions (including escalation WITHOUT waiting for the cron)
Admin dev login: `/admin/login` → `claude-admin@theclub.local` (password in `.env` `DEV_ADMIN_PASSWORD`). The page is at **Accountability → Finance Tasks** (`/dashboard/accountability/finance`).

1. **UI CRUD:** Add a finance task (e.g. "Monthly Management Accounts", monthly, due day 7) with three name+email contacts. It appears immediately with its current + previous occurrences. Edit it, deactivate/reactivate it, and **Mark complete** an occurrence (status flips to Complete; it leaves the Overdue list).

2. **Trigger escalation without waiting — safe DRY-RUN (sends nothing, writes nothing).** Create a task whose current period is already overdue (monthly, due day 7 → this month's occurrence is overdue after the 7th). Then, with the dev server running, preview the engine via the cron endpoint (dry-run is **not** gated to the send-hour):
   ```bash
   SECRET=$(grep '^CRON_SECRET=' .env | cut -d= -f2-)
   curl -s "http://localhost:3000/api/cron/automations?dryRun=true" \
     -H "Authorization: Bearer $SECRET" | jq '.flows[] | select(.flow=="finance_escalation")'
   ```
   The `finance_escalation` flow lists which levels **would_send**, to whom, for which period, with the days-overdue count. An occurrence already stored at level 1 shows only L2/L3 would_send (L1 is never re-sent); one at level 3 counts as `alreadyHandled`. (Verified live: a 16-day-overdue monthly task previewed L1/L2/L3 to the contacts; with a stored level-1 occurrence only L2/L3 queued; a stored level-3 occurrence was `alreadyHandled`.)

3. **Real send (advances `escalation_level` + sends via Resend).** A real cron run is gated to the admin-configured UK send-hour (Settings → Automation Send Time) and runs **all** automation flows, so do this on a **safe/staging** dataset only (a real run would email live members via the other flows). Set `app_settings.daily_send_hour` to the current UK hour, then:
   ```bash
   curl -s "http://localhost:3000/api/cron/automations" -H "Authorization: Bearer $SECRET" | jq '.flows[] | select(.flow=="finance_escalation")'
   ```
   Watch `finance_task_occurrences.escalation_level` advance and check the sent emails in the **`email_log`** table (category `automation:finance_escalation`) — emails go via Resend, so use a real deliverable address on the contacts. Run it again: the same levels are **not** re-sent (idempotent).

## Module 7 — SOP Library

### What it does
- A **rich-text knowledge base** of Standard Operating Procedures — "knowledge that doesn't walk out the door." **Admins author** SOPs; **all staff read** the published ones.
- Each SOP has a **title**, a **free-text category** (Onboarding, Sponsorship, Events, Finance, Membership, Renewals are *suggestions* via a datalist — not a rigid enum; you can type any category), a **rich-text HTML body**, and a **draft/published status**.
- Admins can list/search/filter by category, create/edit (with a lightweight formatting toolbar), **publish/unpublish**, preview, and **delete (with a confirm)**. Staff get a read-only **"Playbook"** section on `/team` that browses **published** SOPs by category and expands each to read it.

### Rich text (reuse of the app's approach)
- The repo's existing rich editors (`src/components/templates/editor/*`, `src/components/contracts/editor/*`) are heavyweight **block-based email/contract canvases**, not a drop-in body editor, and there is no shared single-field rich-text component. Per the task's fallback guidance, this module adds a **small reusable rich-text component pair** in `src/components/sops/RichText.tsx`:
  - `RichTextEditor` — a `contentEditable` surface with a basic toolbar (bold / italic / underline / H2 / H3 / bullet + numbered lists / quote / link / clear), emitting HTML. This matches the app's `contentEditable` + `dangerouslySetInnerHTML` pattern.
  - `RichTextRenderer` — renders the body through **`isomorphic-dompurify`** (the app's existing sanitizer, `sanitizeSopHtml` in `src/lib/sops.ts`) on **every render**, with a strict tag/attr allowlist. Bodies are **also** sanitized on save (defence in depth).

### Data model (added)
- `sops` — `id, title text, category text default 'General', body text (sanitized rich-text HTML), status text check ('draft'|'published') default 'draft', created_by → profiles, updated_by → profiles, created_at, updated_at`. Indexes `idx_sops_category` on `(category)` and `idx_sops_status` on `(status)`. `set_updated_at` trigger reuses `handle_updated_at()`.

### Security (RLS)
- **Admins manage all** — a single `for all using (is_admin()) with check (is_admin())` policy: create, edit, delete, and see **drafts**.
- **Staff read published only** — a SELECT policy `using (is_staff() and status = 'published')`. There is **no staff INSERT/UPDATE/DELETE policy**, so staff cannot write, and drafts are never returned to them.
- **Members / anon** — no policy at all → no access.
- *All six behaviours were verified live* (`scripts/verify-sop-rls.mjs`, admin + staff test accounts): admin creates draft+published ✓, staff sees the published SOP ✓, staff does **not** see the draft ✓, staff INSERT blocked (42501) ✓, staff UPDATE affects 0 rows ✓, staff DELETE affects 0 rows ✓.

### Files
**Migration:** `supabase/migrations/20260728_sop_library.sql` (applied via `scripts/apply-sop-library-migration.mjs`; idempotent — safe to run twice; RLS verified). RLS verifier: `scripts/verify-sop-rls.mjs`.
- `src/lib/sops.ts` — shared types, `CATEGORY_SUGGESTIONS`, `STATUS_META`, `groupByCategory`, and the `sanitizeSopHtml` / `toPlainText` DOMPurify helpers.
- `src/components/sops/RichText.tsx` — `RichTextEditor` + `RichTextRenderer` (sanitized).
- `src/views/admin/accountability/SopLibraryPage.tsx` — the **SOP Library** admin page (stats, search, category filter chips, grouped list, create/edit modal with the rich editor + category datalist, preview modal, publish/unpublish, delete confirm). Thin page `src/app/(admin)/dashboard/accountability/sops/page.tsx`; nav child "SOP Library" (BookOpen) added under **Accountability** in `src/app/(admin)/layout.tsx`.
- `src/views/staff/StaffSopPanel.tsx` — the staff **Playbook** panel at `/team` (search + category groups + expand-to-read, sanitized render), wired into `src/app/(staff)/team/page.tsx`.
- `src/types/database.ts` — added the `sops` table types.

### Test instructions
Admin dev login: `/admin/login` → `claude-admin@theclub.local` (password in `.env` `DEV_ADMIN_PASSWORD`). Staff test login: `aw736024@gmail.com` / `TestStaff2026!`.

1. **Admin creates a DRAFT.** As admin, go to **Accountability → SOP Library** (`/dashboard/accountability/sops`). Click **Add SOP**, give it a title (e.g. "New Member Onboarding"), pick/type a category (e.g. "Onboarding"), write a body using the toolbar, and click **Save draft**. It appears with a grey **Draft** badge.
2. **Staff cannot see the draft.** In another browser/incognito, sign in as staff at `/admin/login` → you land on `/team`. Scroll to the **Playbook** section — the draft SOP is **not** listed (RLS blocks unpublished rows).
3. **Admin publishes.** Back as admin, open the SOP (Edit) and click **Publish** (or use the row's **Publish** action). The badge flips to green **Published**.
4. **Staff sees & reads it.** Reload `/team` as staff — the SOP now appears under its category in the **Playbook**. Click it to expand and read the sanitized rich-text body. Staff have **no** edit/delete controls (read-only) and still cannot see any remaining drafts.
5. *(Optional, automated)* run `node scripts/verify-sop-rls.mjs` to assert all six RLS behaviours live (it creates a draft + a published SOP, checks staff visibility/writes, and cleans up).

---

## How the whole flow works
1. **Admin** creates a staff member (Team Members) → an invite/temporary password is emailed (or set via "Send login").
2. **Admin** sets that staff member's **hourly rate**.
3. **Admin** creates a task, assigns it to the staff owner, and (optionally) links it to an **Event**.
4. **Staff** signs in at `/admin/login`, lands on `/team`, opens their task, and works it: change status, comment, attach files, record an outcome, and **log time** (manual or timer).
5. **Admin** opens **Time & Profitability**, sees hours roll up per event, enters the event's **revenue**, and reads **cost** and **profit**; the per‑staff table shows each person's hours, rate, cost, and completed‑task count.

---

## Test credentials & notes
- **Admin dev login:** `/admin/login` → `claude-admin@theclub.local` (password in `.env` `DEV_ADMIN_PASSWORD`).
- **Staff test login:** `aw736024@gmail.com` / `TestStaff2026!` (a freelancer account; password was set directly for testing — reset anytime).
- Invite emails go through Resend; on localhost, if the email doesn't arrive, set the staff password in the Supabase dashboard or via the admin API. The create‑staff toast now surfaces the real reason when an invite email doesn't send.

## Fixes applied during testing
- **Invite toast:** now shows the actual failure reason (existing‑account note or the Resend error) instead of a generic message.
- **Modal scroll:** `src/components/ui/Modal.tsx` used `max-h-[calc(100vh-2rem)]`, which Tailwind emitted as invalid CSS (`calc(100vh-2rem)` needs spaces around `-`), so the height cap was dropped and tall modals didn't scroll. Fixed by setting the cap as an inline style: `style={{ maxHeight: 'calc(100vh - 2rem)' }}`. (The same pattern still exists in `src/components/portal/PortalChrome.tsx` — not yet fixed.)

## Known open items
- `profiles` is readable by any authenticated user (pre‑existing policy). Staff can't reach CRM pages (middleware) but could read `profiles` rows directly — a ~10‑minute RLS tightening if desired.
- `PortalChrome.tsx` has the same modal‑scroll `calc()` bug (member portal).
- **All seven Team Accountability modules are now built** — Foundation (1), Time Tracking (2), Weekly Scorecards (3), Daily Handover (4), Accountability Dashboard (5), Accountant Auto‑Escalation (6), and **SOP Library (7)**. No Team Accountability modules remain.
- SOP Library uses a lightweight `contentEditable` rich-text editor (`src/components/sops/RichText.tsx`) rather than the heavyweight block-based email/contract editors, since those are not drop-in body editors and no shared single-field rich-text component existed. If a shared rich-text field is added later, both the SOP editor and renderer can be swapped to it. Bodies are sanitized with `isomorphic-dompurify` on both save and render.
- Daily Handover email delivery of the leadership report was left as an optional nice‑to‑have (spec: "email optional/nice‑to‑have, not required"); only the required in‑app delivery is implemented.
- A weekly-scorecard **cron** to auto-generate Friday summaries was left as a nice-to-have; only the on-demand "Generate summary" button is implemented (the required path).
