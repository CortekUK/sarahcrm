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
- Remaining Team Accountability modules not yet built: **accountability dashboard, accountant auto‑escalation, SOP library**. (Weekly scorecards — Module 3; daily handover — Module 4 above.)
- Daily Handover email delivery of the leadership report was left as an optional nice‑to‑have (spec: "email optional/nice‑to‑have, not required"); only the required in‑app delivery is implemented.
- A weekly-scorecard **cron** to auto-generate Friday summaries was left as a nice-to-have; only the on-demand "Generate summary" button is implemented (the required path).
