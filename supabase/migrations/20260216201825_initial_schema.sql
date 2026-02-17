-- ============================================================
-- The Club by Sarah Restrick — Full Database Schema
-- ============================================================

-- ============================================================
-- 1. ENUMS
-- ============================================================

create type public.membership_type as enum ('individual', 'business');
create type public.membership_tier as enum ('tier_1', 'tier_2', 'tier_3');
create type public.membership_status as enum ('active', 'pending', 'expired', 'cancelled');
create type public.event_type as enum ('member_event', 'curated_luxury', 'retreat');
create type public.event_status as enum ('draft', 'published', 'live', 'completed', 'cancelled');
create type public.booking_status as enum ('confirmed', 'pending', 'cancelled', 'refunded');
create type public.intro_status as enum ('suggested', 'approved', 'sent', 'accepted', 'completed', 'declined');
create type public.payment_method as enum ('stripe', 'gocardless', 'invoice', 'manual');
create type public.payment_status as enum ('paid', 'pending', 'overdue', 'refunded', 'failed');
create type public.user_role as enum ('admin', 'member');
create type public.tag_category as enum ('industry', 'interest', 'need', 'service');

-- ============================================================
-- 2. TABLES
-- ============================================================

-- profiles — extends auth.users
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  role public.user_role not null default 'member',
  first_name text,
  last_name text,
  email text,
  phone text,
  avatar_url text,
  company_name text,
  job_title text,
  bio text,
  linkedin_url text,
  website_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- members
create table public.members (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles on delete cascade,
  membership_type public.membership_type not null default 'individual',
  membership_tier public.membership_tier not null default 'tier_1',
  membership_status public.membership_status not null default 'pending',
  monthly_intro_quota int not null default 3,
  intros_used_this_month int not null default 0,
  company_name text,
  company_description text,
  company_website text,
  showcase_enabled boolean not null default false,
  sponsor_aligned boolean not null default false,
  membership_start_date date,
  membership_end_date date,
  renewal_date date,
  stripe_customer_id text,
  gocardless_mandate_id text,
  xero_contact_id text,
  source text,
  referred_by uuid references public.members on delete set null,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index members_profile_id_idx on public.members (profile_id);
create index members_membership_status_idx on public.members (membership_status);
create index members_membership_tier_idx on public.members (membership_tier);
create index members_stripe_customer_id_idx on public.members (stripe_customer_id);
create index members_deleted_at_idx on public.members (deleted_at);

-- tags
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category public.tag_category not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tags_category_idx on public.tags (category);

-- member_tags
create table public.member_tags (
  member_id uuid not null references public.members on delete cascade,
  tag_id uuid not null references public.tags on delete cascade,
  primary key (member_id, tag_id)
);

create index member_tags_tag_id_idx on public.member_tags (tag_id);

-- events
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  description text,
  event_type public.event_type not null default 'member_event',
  status public.event_status not null default 'draft',
  venue_name text,
  venue_address text,
  venue_city text,
  venue_postcode text,
  venue_url text,
  start_date timestamptz not null,
  end_date timestamptz,
  doors_open timestamptz,
  capacity int,
  guest_ticket_capacity int default 0,
  member_price_pence int not null default 0,
  guest_price_pence int not null default 0,
  sponsor_price_pence int not null default 0,
  travel_included boolean not null default false,
  accommodation_available boolean not null default false,
  accommodation_price_pence int default 0,
  cover_image_url text,
  gallery_urls text[],
  speakers jsonb default '[]'::jsonb,
  agenda jsonb default '[]'::jsonb,
  guest_list_visible boolean not null default false,
  auto_confirm boolean not null default true,
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index events_status_idx on public.events (status);
create index events_event_type_idx on public.events (event_type);
create index events_start_date_idx on public.events (start_date);
create index events_slug_idx on public.events (slug);

-- bookings
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade,
  member_id uuid not null references public.members on delete cascade,
  status public.booking_status not null default 'pending',
  is_guest boolean not null default false,
  guest_name text,
  guest_email text,
  guest_company text,
  accommodation_booked boolean not null default false,
  sponsor_package text,
  guests_invited int not null default 0,
  amount_pence int not null default 0,
  payment_method public.payment_method,
  stripe_payment_intent_id text,
  dietary_requirements text,
  special_requests text,
  table_assignment text,
  checked_in boolean not null default false,
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bookings_event_id_idx on public.bookings (event_id);
create index bookings_member_id_idx on public.bookings (member_id);
create index bookings_status_idx on public.bookings (status);

-- introductions
create table public.introductions (
  id uuid primary key default gen_random_uuid(),
  member_a_id uuid not null references public.members on delete cascade,
  member_b_id uuid not null references public.members on delete cascade,
  status public.intro_status not null default 'suggested',
  match_score decimal,
  match_reason text,
  matching_tags uuid[],
  requested_by uuid references public.members on delete set null,
  approved_by uuid references public.profiles on delete set null,
  event_id uuid references public.events on delete set null,
  outcome text,
  business_converted boolean not null default false,
  estimated_value_pence int,
  suggested_at timestamptz not null default now(),
  approved_at timestamptz,
  sent_at timestamptz,
  accepted_at timestamptz,
  followed_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint introductions_no_self_intro check (member_a_id <> member_b_id),
  constraint introductions_ordered_members check (member_a_id < member_b_id)
);

create index introductions_member_a_id_idx on public.introductions (member_a_id);
create index introductions_member_b_id_idx on public.introductions (member_b_id);
create index introductions_status_idx on public.introductions (status);

-- payments
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members on delete cascade,
  payment_type text not null,
  reference_id uuid,
  amount_pence int not null,
  currency text not null default 'GBP',
  status public.payment_status not null default 'pending',
  payment_method public.payment_method,
  stripe_payment_intent_id text,
  gocardless_payment_id text,
  xero_invoice_id text,
  due_date date,
  paid_at timestamptz,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_member_id_idx on public.payments (member_id);
create index payments_status_idx on public.payments (status);
create index payments_due_date_idx on public.payments (due_date);

-- sponsorships
create table public.sponsorships (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members on delete cascade,
  event_id uuid not null references public.events on delete cascade,
  package_name text not null,
  amount_pence int not null,
  benefits jsonb default '[]'::jsonb,
  showcase_slot text,
  brand_alignment text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sponsorships_member_id_idx on public.sponsorships (member_id);
create index sponsorships_event_id_idx on public.sponsorships (event_id);

-- communications
create table public.communications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members on delete cascade,
  template_name text,
  channel text not null default 'email',
  subject text,
  body_preview text,
  sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  resend_message_id text,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index communications_member_id_idx on public.communications (member_id);
create index communications_status_idx on public.communications (status);

-- concierge_requests
create table public.concierge_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members on delete cascade,
  request_type text not null,
  description text,
  event_name text,
  location text,
  dates text,
  guests int,
  budget_pence int,
  status text not null default 'pending',
  quoted_amount_pence int,
  fulfilled_by uuid references public.profiles on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index concierge_requests_member_id_idx on public.concierge_requests (member_id);
create index concierge_requests_status_idx on public.concierge_requests (status);

-- ============================================================
-- 3. TRIGGERS — auto updated_at
-- ============================================================

create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at before update on public.profiles
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.members
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.tags
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.events
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.bookings
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.introductions
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.payments
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.sponsorships
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.communications
  for each row execute function public.handle_updated_at();

create trigger set_updated_at before update on public.concierge_requests
  for each row execute function public.handle_updated_at();

-- ============================================================
-- 4. TRIGGER — auto create profile on signup
-- ============================================================

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, first_name, last_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', '')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================

-- Helper: check if current user is admin
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- profiles
alter table public.profiles enable row level security;

create policy "Admins can do everything on profiles"
  on public.profiles for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Authenticated users can view profiles"
  on public.profiles for select
  using (true);

create policy "Members can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- members
alter table public.members enable row level security;

create policy "Admins can do everything on members"
  on public.members for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Authenticated users can view members"
  on public.members for select
  using (deleted_at is null);

create policy "Members can update own member record"
  on public.members for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- tags (readable by all authenticated, writable by admins)
alter table public.tags enable row level security;

create policy "Admins can do everything on tags"
  on public.tags for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Authenticated users can view tags"
  on public.tags for select
  using (auth.role() = 'authenticated');

-- member_tags
alter table public.member_tags enable row level security;

create policy "Admins can do everything on member_tags"
  on public.member_tags for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Authenticated users can view member_tags"
  on public.member_tags for select
  using (true);

create policy "Members can insert own tags"
  on public.member_tags for insert
  with check (
    exists (
      select 1 from public.members
      where members.id = member_tags.member_id
        and members.profile_id = auth.uid()
    )
  );

create policy "Members can delete own tags"
  on public.member_tags for delete
  using (
    exists (
      select 1 from public.members
      where members.id = member_tags.member_id
        and members.profile_id = auth.uid()
    )
  );

-- events
alter table public.events enable row level security;

create policy "Admins can do everything on events"
  on public.events for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Authenticated users can view published events"
  on public.events for select
  using (
    auth.role() = 'authenticated'
    and status in ('published', 'live', 'completed')
  );

-- bookings
alter table public.bookings enable row level security;

create policy "Admins can do everything on bookings"
  on public.bookings for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Members can view own bookings"
  on public.bookings for select
  using (
    exists (
      select 1 from public.members
      where members.id = bookings.member_id
        and members.profile_id = auth.uid()
    )
  );

create policy "Members can create own bookings"
  on public.bookings for insert
  with check (
    exists (
      select 1 from public.members
      where members.id = bookings.member_id
        and members.profile_id = auth.uid()
    )
  );

-- introductions
alter table public.introductions enable row level security;

create policy "Admins can do everything on introductions"
  on public.introductions for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Members can view own introductions"
  on public.introductions for select
  using (
    exists (
      select 1 from public.members
      where members.profile_id = auth.uid()
        and (members.id = introductions.member_a_id or members.id = introductions.member_b_id)
    )
  );

-- payments
alter table public.payments enable row level security;

create policy "Admins can do everything on payments"
  on public.payments for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Members can view own payments"
  on public.payments for select
  using (
    exists (
      select 1 from public.members
      where members.id = payments.member_id
        and members.profile_id = auth.uid()
    )
  );

-- sponsorships
alter table public.sponsorships enable row level security;

create policy "Admins can do everything on sponsorships"
  on public.sponsorships for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Members can view own sponsorships"
  on public.sponsorships for select
  using (
    exists (
      select 1 from public.members
      where members.id = sponsorships.member_id
        and members.profile_id = auth.uid()
    )
  );

-- communications
alter table public.communications enable row level security;

create policy "Admins can do everything on communications"
  on public.communications for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Members can view own communications"
  on public.communications for select
  using (
    exists (
      select 1 from public.members
      where members.id = communications.member_id
        and members.profile_id = auth.uid()
    )
  );

-- concierge_requests
alter table public.concierge_requests enable row level security;

create policy "Admins can do everything on concierge_requests"
  on public.concierge_requests for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Members can view own concierge requests"
  on public.concierge_requests for select
  using (
    exists (
      select 1 from public.members
      where members.id = concierge_requests.member_id
        and members.profile_id = auth.uid()
    )
  );

create policy "Members can create own concierge requests"
  on public.concierge_requests for insert
  with check (
    exists (
      select 1 from public.members
      where members.id = concierge_requests.member_id
        and members.profile_id = auth.uid()
    )
  );

-- ============================================================
-- 6. SEED TAGS
-- ============================================================

insert into public.tags (name, category) values
  -- Industry
  ('Property', 'industry'),
  ('Investment', 'industry'),
  ('Technology', 'industry'),
  ('Jewellery', 'industry'),
  ('Retail', 'industry'),
  ('Security', 'industry'),
  ('Software', 'industry'),
  ('AI & Automation', 'industry'),
  ('Marketing', 'industry'),
  ('Finance', 'industry'),
  ('Legal', 'industry'),
  ('Hospitality', 'industry'),
  ('Fashion', 'industry'),
  ('Food & Drink', 'industry'),
  ('Construction', 'industry'),
  ('Healthcare', 'industry'),
  -- Interest
  ('Sports', 'interest'),
  ('Luxury Travel', 'interest'),
  ('Networking', 'interest'),
  -- Need
  ('Looking for Investment', 'need'),
  ('Looking for Clients', 'need'),
  ('Looking for Partners', 'need'),
  ('Looking for Suppliers', 'need'),
  ('Brand Awareness', 'need'),
  ('Business Growth', 'need'),
  ('Digital Transformation', 'need');
