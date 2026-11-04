-- ============================================================
-- 20261106_a_website_rebuild_schema.sql
--   Schema for Sarah's Website & Platform Build Brief (28 Oct 2026).
--   Structure only — content/data lives in the 20261106_b_* / c_* / d_*
--   files that follow. Run this one first.
--
--   * events: programme, visibility (members-only events never reach
--     signed-out visitors — RLS, not just the UI), booking status, the
--     extra fields the brief's event record lists.
--   * portfolio_case_studies: replaces Gallery.
--   * testimonials: type (member / partner / venue) + photo.
--   * blog_posts (Journal): strand + visibility + press fields.
--   * business_categories: "one business per category" chips, each can
--     be marked Taken.
--   * enquiries / concierge_requests: form_data jsonb for each form's
--     extra fields.
--   * reward_partners: visitors no longer read partner rows at all (the
--     public page shows categories + counts, built server-side).
--   * club_stats / site numbers: app_settings row, editable in the CMS.
--
--   Fully guarded — safe to run twice. No existing rows are changed.
-- ============================================================

-- ── events ──────────────────────────────────────────────────
alter table public.events
  add column if not exists programme text,
  add column if not exists visibility text not null default 'public',
  add column if not exists booking_status text not null default 'open',
  add column if not exists short_description text,
  add column if not exists who_youll_meet text,
  add column if not exists sponsorship_available boolean not null default false,
  add column if not exists is_portfolio boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_programme_check') then
    alter table public.events add constraint events_programme_check
      check (programme is null or programme in
        ('member_event', 'round_table', 'pitch', 'curated_experience', 'london_series', 'partner_event'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_visibility_check') then
    alter table public.events add constraint events_visibility_check
      check (visibility in ('public', 'members'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_booking_status_check') then
    alter table public.events add constraint events_booking_status_check
      check (booking_status in ('open', 'waitlist', 'invitation_only', 'sold_out'));
  end if;
end $$;

create index if not exists idx_events_programme on public.events (programme);

-- Signed-out visitors only ever see PUBLIC events (members-only Curated
-- Experiences: no dates, venues or prices in page source or API).
drop policy if exists "Public can view published events" on public.events;
create policy "Public can view published events"
  on public.events for select to anon
  using (
    status = any (array['published'::event_status, 'live'::event_status, 'completed'::event_status])
    and visibility = 'public'
  );

-- ── portfolio_case_studies (replaces Gallery) ───────────────
create table if not exists public.portfolio_case_studies (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  title           text not null,
  partner_names   text,
  -- filter chip: member_event | brand_activation | curated_experience | private_corporate | pitch
  category        text not null default 'member_event',
  location        text,
  event_date      date,
  date_label      text,                 -- e.g. "Sep 2025", "12 months", "4 years"
  headline_result text,                 -- one line on the card
  hero_image_url  text,
  hero_video_url  text,
  brief           text,
  delivered       jsonb not null default '[]'::jsonb,   -- ["Venue: …", …]
  results         jsonb not null default '[]'::jsonb,   -- [{"figure":"£1.5m","label":"in sales"}]
  gallery_urls    text[] not null default '{}',
  partner_quote   text,
  partner_quote_by text,
  layout          text not null default 'half',         -- full | half (editorial grid)
  display_order   integer not null default 0,
  is_featured     boolean not null default false,       -- homepage "Recent Nights"
  is_published    boolean not null default false,
  event_id        uuid references public.events(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint portfolio_category_check check (category in
    ('member_event', 'brand_activation', 'curated_experience', 'private_corporate', 'pitch')),
  constraint portfolio_layout_check check (layout in ('full', 'half')),
  constraint portfolio_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

alter table public.portfolio_case_studies enable row level security;

drop policy if exists "Public read published portfolio" on public.portfolio_case_studies;
create policy "Public read published portfolio"
  on public.portfolio_case_studies for select
  using (is_published = true);

drop policy if exists "Admins manage portfolio" on public.portfolio_case_studies;
create policy "Admins manage portfolio"
  on public.portfolio_case_studies for all
  using (public.is_admin()) with check (public.is_admin());

drop trigger if exists set_updated_at on public.portfolio_case_studies;
create trigger set_updated_at
  before update on public.portfolio_case_studies
  for each row execute function public.handle_updated_at();

-- ── testimonials ────────────────────────────────────────────
alter table public.testimonials
  add column if not exists testimonial_type text not null default 'member',
  add column if not exists photo_url text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'testimonials_type_check') then
    alter table public.testimonials add constraint testimonials_type_check
      check (testimonial_type in ('member', 'partner', 'venue'));
  end if;
end $$;

-- ── blog_posts (Journal) ────────────────────────────────────
alter table public.blog_posts
  add column if not exists strand text not null default 'stories',
  add column if not exists visibility text not null default 'public',
  add column if not exists author_name text,
  add column if not exists author_type text not null default 'sarah',
  add column if not exists outlet text,
  add column if not exists original_url text,
  add column if not exists tags text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'blog_posts_strand_check') then
    alter table public.blog_posts add constraint blog_posts_strand_check
      check (strand in ('press', 'founders_letter', 'stories', 'members'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'blog_posts_visibility_check') then
    alter table public.blog_posts add constraint blog_posts_visibility_check
      check (visibility in ('public', 'members'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'blog_posts_author_type_check') then
    alter table public.blog_posts add constraint blog_posts_author_type_check
      check (author_type in ('sarah', 'member', 'guest'));
  end if;
end $$;

-- Members' Editorial is never readable signed out.
drop policy if exists "Public read published blog_posts" on public.blog_posts;
create policy "Public read published blog_posts"
  on public.blog_posts for select to anon
  using (status = 'published' and visibility = 'public');

drop policy if exists "Signed-in read published blog_posts" on public.blog_posts;
create policy "Signed-in read published blog_posts"
  on public.blog_posts for select to authenticated
  using (status = 'published');

-- ── business_categories ("one business per category") ───────
create table if not exists public.business_categories (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  is_taken      boolean not null default false,
  display_order integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.business_categories enable row level security;

drop policy if exists "Public read business_categories" on public.business_categories;
create policy "Public read business_categories"
  on public.business_categories for select
  using (true);

drop policy if exists "Admins manage business_categories" on public.business_categories;
create policy "Admins manage business_categories"
  on public.business_categories for all
  using (public.is_admin()) with check (public.is_admin());

drop trigger if exists set_updated_at on public.business_categories;
create trigger set_updated_at
  before update on public.business_categories
  for each row execute function public.handle_updated_at();

-- ── form data on enquiries / concierge requests ─────────────
alter table public.enquiries
  add column if not exists form_data jsonb;
alter table public.concierge_requests
  add column if not exists form_data jsonb;

-- The Concierge rebuild adds four service areas; let members file them.
-- (Same function as 20261105_security_hardening.sql with the new types.)
create or replace function public.concierge_requests_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_privileged_writer() then
    return new;
  end if;

  if not exists (
    select 1 from public.members m
    where m.id = new.member_id
      and m.profile_id = auth.uid()
      and m.membership_status = 'active'
      and m.deleted_at is null
  ) then
    raise exception 'REQUEST_NOT_ALLOWED: only active members can send concierge requests.';
  end if;

  new.status := 'pending';
  new.quoted_amount_pence := null;
  new.fulfilled_by := null;
  new.notes := null;
  new.assigned_to := null;
  new.supplier_name := null;
  new.supplier_cost_pence := null;
  new.sale_price_pence := null;
  new.commission_pence := null;
  new.priority := null;
  new.delivered_at := null;
  new.feedback_note := null;
  new.feedback_rating := null;
  new.commission_status := 'pending';
  new.commission_paid_at := null;
  new.xero_invoice_id := null;

  if new.request_type not in ('Access Request', 'Travel Services',
      'Retail & Hospitality Bookings', 'Event Services',
      'Travel', 'Holidays', 'Private Events', 'Luxury Goods', 'Fashion',
      'Sports & Events Tickets', 'Private Aviation', 'Transfers',
      'Private Lounges', 'Venue Finding', 'Other') then
    raise exception 'REQUEST_INVALID: unknown request type.';
  end if;
  if length(trim(coalesce(new.description, ''))) = 0 then
    raise exception 'REQUEST_INVALID: please describe your request.';
  end if;
  if length(new.description) > 5000
     or length(coalesce(new.event_name, '')) > 300
     or length(coalesce(new.location, '')) > 300
     or length(coalesce(new.dates, '')) > 300
     or length(coalesce(new.form_data::text, '')) > 10000 then
    raise exception 'REQUEST_INVALID: the request is too long.';
  end if;
  if new.guests is not null and (new.guests < 1 or new.guests > 1000) then
    raise exception 'REQUEST_INVALID: number of guests must be between 1 and 1,000.';
  end if;
  if new.budget_pence is not null and (new.budget_pence < 0 or new.budget_pence > 1000000000) then
    raise exception 'REQUEST_INVALID: budget is out of range.';
  end if;

  if (
    select count(*) from public.concierge_requests r
    where r.member_id = new.member_id
      and r.created_at > now() - interval '1 hour'
  ) >= 10 then
    raise exception 'REQUEST_RATE_LIMITED: too many requests in the last hour — please try again later.';
  end if;

  return new;
end;
$$;

-- ── reward partners: names/offers are members-only ──────────
-- The public /rewards page shows categories and counts only (computed
-- server-side). Visitors can no longer read partner rows.
revoke select on public.reward_partners from anon;
drop policy if exists "Anyone reads active reward_partners" on public.reward_partners;
drop policy if exists "Signed-in read active reward_partners" on public.reward_partners;
create policy "Signed-in read active reward_partners"
  on public.reward_partners for select to authenticated
  using (is_active);
