-- ============================================================
-- 20260617_schema_drift_catchup.sql
--
-- Versions tables/columns that the app code already depends on but
-- which were created via the Supabase dashboard and never captured in
-- a migration. The goal is to make the repo's migration set
-- self-consistent WITHOUT disturbing a live DB — every statement here
-- is idempotent and safe to run against a database where the object
-- already exists:
--   * create table if not exists
--   * alter table ... add column if not exists
--   * create policy guarded by `drop policy if exists`
--   * updated_at triggers via the shared public.handle_updated_at()
--
-- Columns were DERIVED from the actual code reads/writes (not guessed):
--   reviews          → share-your-experience insert, /reviews select,
--                      ReviewsAdminPage select/update, list_reviews tool
--   audiences        → newsletter ListsTab / CampaignsTab, campaigns/send
--   audience_members → ListsTab toggles, campaigns/send buildRecipients
--   email_campaigns  → campaigns/send insert+update, CampaignsTab select
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- reviews — member-submitted reviews
--
-- Public "share your experience" form inserts pending rows; the public
-- /reviews carousel reads approved+active rows; ReviewsAdminPage and the
-- list_reviews AI tool read/curate everything.
-- ────────────────────────────────────────────────────────────
create table if not exists public.reviews (
  id uuid default gen_random_uuid() primary key,
  -- Reviewer identity (public form collects first/last/email; company +
  -- title are optional and render as the "role / company" subtitle).
  first_name text not null,
  last_name text not null,
  email text not null,
  company text,
  title text,
  -- Optional link to the event the review is about.
  event_id uuid references public.events(id) on delete set null,
  -- The review copy itself.
  body text not null,
  -- Moderation: pending (default, set by the public insert) → approved
  -- / rejected by an admin. is_active is the publish toggle that lets an
  -- admin hide an approved review without deleting it.
  status text not null default 'pending',
  is_active boolean not null default true,
  -- Moderation breadcrumbs.
  admin_notes text,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Re-running against a hand-created table backfills any missing columns
-- without touching existing data.
alter table public.reviews add column if not exists first_name text;
alter table public.reviews add column if not exists last_name text;
alter table public.reviews add column if not exists email text;
alter table public.reviews add column if not exists company text;
alter table public.reviews add column if not exists title text;
alter table public.reviews add column if not exists event_id uuid references public.events(id) on delete set null;
alter table public.reviews add column if not exists body text;
alter table public.reviews add column if not exists status text not null default 'pending';
alter table public.reviews add column if not exists is_active boolean not null default true;
alter table public.reviews add column if not exists admin_notes text;
alter table public.reviews add column if not exists reviewed_at timestamptz;
alter table public.reviews add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;
alter table public.reviews add column if not exists approved_at timestamptz;
alter table public.reviews add column if not exists created_at timestamptz default now();
alter table public.reviews add column if not exists updated_at timestamptz default now();

-- The public carousel filters on (status, is_active) and orders by
-- approved_at/created_at; the admin orders by created_at.
create index if not exists reviews_status_active_idx
  on public.reviews (status, is_active);
create index if not exists reviews_created_idx
  on public.reviews (created_at desc);

drop trigger if exists set_updated_at on public.reviews;
create trigger set_updated_at before update on public.reviews
  for each row execute function public.handle_updated_at();

alter table public.reviews enable row level security;

-- Public can submit a review, but only as a pending + active row. This
-- mirrors the comment in share-your-experience/page.tsx: the form omits
-- status/is_active and relies on this policy + column defaults.
drop policy if exists "Public insert reviews" on public.reviews;
create policy "Public insert reviews"
  on public.reviews
  for insert
  with check (status = 'pending' and is_active = true);

-- Public can read only approved + active reviews (the /reviews page).
drop policy if exists "Public read approved reviews" on public.reviews;
create policy "Public read approved reviews"
  on public.reviews
  for select
  using (status = 'approved' and is_active = true);

-- Admins can do anything (read pending, approve/reject, edit notes,
-- toggle active, delete).
drop policy if exists "Admin all reviews" on public.reviews;
create policy "Admin all reviews"
  on public.reviews
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- ────────────────────────────────────────────────────────────
-- audiences — reusable newsletter recipient lists
--
-- ListsTab creates/edits/deletes them; CampaignsTab + campaigns/send
-- read them and resolve audience_label from `name`.
-- ────────────────────────────────────────────────────────────
create table if not exists public.audiences (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.audiences add column if not exists name text;
alter table public.audiences add column if not exists description text;
alter table public.audiences add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.audiences add column if not exists created_at timestamptz default now();
alter table public.audiences add column if not exists updated_at timestamptz default now();

drop trigger if exists set_updated_at on public.audiences;
create trigger set_updated_at before update on public.audiences
  for each row execute function public.handle_updated_at();

alter table public.audiences enable row level security;

-- Audiences are an admin-only construct (managed from /dashboard
-- newsletter). The send route uses the service-role key which bypasses
-- RLS, so a single admin-all policy is sufficient.
drop policy if exists "Admin all audiences" on public.audiences;
create policy "Admin all audiences"
  on public.audiences
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- ────────────────────────────────────────────────────────────
-- audience_members — join rows: an audience contains subscribers
-- (mailing_list) and/or members. Each row references exactly one side.
--
-- ListsTab toggles upsert/delete by (audience_id, subscriber_id) or
-- (audience_id, member_id); campaigns/send reads both id sets.
-- ────────────────────────────────────────────────────────────
-- NB: this is a pure join table (no surrogate uuid PK in the live DB) —
-- the code only ever reads (subscriber_id, member_id) and writes by
-- (audience_id, subscriber_id | member_id), so the unique indexes below
-- ARE the identity.
create table if not exists public.audience_members (
  audience_id uuid not null references public.audiences(id) on delete cascade,
  -- A row points at a mailing_list subscriber OR a member, never both.
  subscriber_id uuid references public.mailing_list(id) on delete cascade,
  member_id uuid references public.members(id) on delete cascade,
  added_at timestamptz default now(),
  constraint audience_members_one_side check (
    (subscriber_id is not null and member_id is null)
    or (subscriber_id is null and member_id is not null)
  )
);

alter table public.audience_members add column if not exists audience_id uuid references public.audiences(id) on delete cascade;
alter table public.audience_members add column if not exists subscriber_id uuid references public.mailing_list(id) on delete cascade;
alter table public.audience_members add column if not exists member_id uuid references public.members(id) on delete cascade;
alter table public.audience_members add column if not exists added_at timestamptz default now();

-- The toggle logic relies on at most one membership row per side; a
-- unique index also makes the upsert path race-safe.
create unique index if not exists audience_members_subscriber_uniq
  on public.audience_members (audience_id, subscriber_id)
  where subscriber_id is not null;
create unique index if not exists audience_members_member_uniq
  on public.audience_members (audience_id, member_id)
  where member_id is not null;
create index if not exists audience_members_audience_idx
  on public.audience_members (audience_id);

alter table public.audience_members enable row level security;

drop policy if exists "Admin all audience_members" on public.audience_members;
create policy "Admin all audience_members"
  on public.audience_members
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- ────────────────────────────────────────────────────────────
-- email_campaigns — a record of every campaign send (incl. drafts and
-- failures), with a snapshot of the subject/body so editing the source
-- template later doesn't rewrite history.
--
-- campaigns/send inserts the row up-front then updates status + counts;
-- CampaignsTab reads the full row.
-- ────────────────────────────────────────────────────────────
create table if not exists public.email_campaigns (
  id uuid default gen_random_uuid() primary key,
  -- Source template (kept for reference; body/subject are snapshotted).
  template_id uuid references public.email_templates(id) on delete set null,
  -- Target audience; null means "all active subscribers".
  audience_id uuid references public.audiences(id) on delete set null,
  audience_label text,
  -- Snapshot of what was sent.
  name text,
  subject text,
  body_html text,
  -- Delivery counters.
  recipient_count int not null default 0,
  sent_count int not null default 0,
  failed_count int not null default 0,
  -- draft | queued | sending | sent | failed
  status text not null default 'draft',
  error_message text,
  created_by uuid references public.profiles(id) on delete set null,
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.email_campaigns add column if not exists template_id uuid references public.email_templates(id) on delete set null;
alter table public.email_campaigns add column if not exists audience_id uuid references public.audiences(id) on delete set null;
alter table public.email_campaigns add column if not exists audience_label text;
alter table public.email_campaigns add column if not exists name text;
alter table public.email_campaigns add column if not exists subject text;
alter table public.email_campaigns add column if not exists body_html text;
alter table public.email_campaigns add column if not exists recipient_count int not null default 0;
alter table public.email_campaigns add column if not exists sent_count int not null default 0;
alter table public.email_campaigns add column if not exists failed_count int not null default 0;
alter table public.email_campaigns add column if not exists status text not null default 'draft';
alter table public.email_campaigns add column if not exists error_message text;
alter table public.email_campaigns add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.email_campaigns add column if not exists scheduled_at timestamptz;
alter table public.email_campaigns add column if not exists sent_at timestamptz;
alter table public.email_campaigns add column if not exists created_at timestamptz default now();
alter table public.email_campaigns add column if not exists updated_at timestamptz default now();

create index if not exists email_campaigns_created_idx
  on public.email_campaigns (created_at desc);

drop trigger if exists set_updated_at on public.email_campaigns;
create trigger set_updated_at before update on public.email_campaigns
  for each row execute function public.handle_updated_at();

alter table public.email_campaigns enable row level security;

drop policy if exists "Admin all email_campaigns" on public.email_campaigns;
create policy "Admin all email_campaigns"
  on public.email_campaigns
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- ────────────────────────────────────────────────────────────
-- enquiries — column catch-up.
--
-- Base table is in 20260506_website_content.sql (id, first_name,
-- last_name, email, phone, company, position, intent[], message,
-- status, created_at). The admin EnquiriesListPage writes three fields
-- that have no migration yet.
-- ────────────────────────────────────────────────────────────
alter table public.enquiries add column if not exists admin_notes text;
alter table public.enquiries add column if not exists reviewed_at timestamptz;
alter table public.enquiries add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;
alter table public.enquiries add column if not exists replied_at timestamptz;
alter table public.enquiries add column if not exists updated_at timestamptz default now();

-- ────────────────────────────────────────────────────────────
-- mailing_list — column catch-up.
--
-- Base table is in 20260506_website_content.sql (id, email, first_name,
-- last_name, source, subscribed, created_at). The subscribe/unsubscribe
-- flows + admin SubscribersTab depend on these three columns that have
-- no migration yet:
--   * subscribed_at    — sort key used everywhere (defaults to now()).
--   * unsubscribed_at  — null = active; set on unsubscribe.
--   * unsubscribe_token— per-row token for the one-click /unsubscribe.
-- ────────────────────────────────────────────────────────────
alter table public.mailing_list add column if not exists subscribed_at timestamptz default now();
alter table public.mailing_list add column if not exists unsubscribed_at timestamptz;
alter table public.mailing_list add column if not exists unsubscribe_token uuid default gen_random_uuid();
-- Free-text admin notes column the live DB carries on subscribers.
alter table public.mailing_list add column if not exists notes text;

-- The public unsubscribe page looks rows up by token, so it must be
-- unique. Partial index tolerates legacy null tokens.
create unique index if not exists mailing_list_unsubscribe_token_uniq
  on public.mailing_list (unsubscribe_token)
  where unsubscribe_token is not null;
