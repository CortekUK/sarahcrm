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
- Remaining Team Accountability modules not yet built: **weekly scorecards, daily handover, accountability dashboard, accountant auto‑escalation, SOP library**.
