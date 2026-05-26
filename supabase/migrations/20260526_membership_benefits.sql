-- ============================================================
-- 20260526_membership_benefits.sql
--
-- CMS-managed copy + imagery for the 9 "Membership benefits" tiles
-- that render in BenefitsBento on /memberships. Editors can update
-- title/body/image and toggle visibility from
-- /dashboard/website/membership-benefits — they CANNOT add new tiles
-- or delete the existing ones (the bento layout is hand-tuned to nine
-- positions, so creation is locked at the policy level).
-- ============================================================

create table if not exists public.membership_benefits (
  id uuid default gen_random_uuid() primary key,
  -- Display position (1..9). The bento spans are keyed off this so we
  -- keep it as the canonical sort key and a stable identifier we can
  -- show in the admin UI ("Card I", "Card II"…).
  position int not null,
  -- Roman numeral shown in the top-right corner. Editable so we can
  -- swap to Arabic numerals later if design changes; defaults match
  -- position on seed.
  numeral text not null,
  title text not null,
  body text not null,
  -- Public URL (typically supabase storage / public bucket). Nullable
  -- so a card can be temporarily image-less without blocking save.
  image_url text,
  -- Hide toggle. Hidden cards are not returned to the public page; the
  -- bento re-flows around them.
  is_visible boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  -- Position is unique so the bento renders without collisions.
  constraint membership_benefits_position_unique unique (position),
  constraint membership_benefits_position_range check (position between 1 and 9)
);

create index if not exists membership_benefits_position_idx
  on public.membership_benefits (position);

-- ── Updated-at trigger ──────────────────────────────────────
create or replace function public.touch_membership_benefits()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists membership_benefits_touch on public.membership_benefits;
create trigger membership_benefits_touch
  before update on public.membership_benefits
  for each row execute function public.touch_membership_benefits();

-- ── RLS ──────────────────────────────────────────────────────
alter table public.membership_benefits enable row level security;

-- Public read — only visible cards. Anyone hitting /memberships gets
-- the curated list with no auth.
drop policy if exists "Public read membership_benefits" on public.membership_benefits;
create policy "Public read membership_benefits"
  on public.membership_benefits
  for select
  using (is_visible = true);

-- Admins can read everything (including hidden) and update copy.
-- INSERT and DELETE are intentionally NOT granted — the set is fixed
-- at 9 and admins manage it via update/toggle only.
drop policy if exists "Admin read membership_benefits" on public.membership_benefits;
create policy "Admin read membership_benefits"
  on public.membership_benefits
  for select
  using (public.is_admin());

drop policy if exists "Admin update membership_benefits" on public.membership_benefits;
create policy "Admin update membership_benefits"
  on public.membership_benefits
  for update
  using (public.is_admin())
  with check (public.is_admin());

-- ── Seed: nine existing benefits, verbatim from the public page ─
-- INSERT … ON CONFLICT DO NOTHING so re-running the migration is safe
-- and editors' subsequent edits aren't trampled.
insert into public.membership_benefits (position, numeral, title, body, image_url)
values
  (
    1, 'I',
    'Access to The Club Network',
    'Unlock privileged access to The Club''s elite network of members, connecting you with key industry leaders and high-net-worth professionals for unmatched business opportunities.',
    '/gallery/bigland.png'
  ),
  (
    2, 'II',
    'Choose Your Membership',
    'Experience the freedom of choice with our flexible membership options, designed to cater to your individual preferences, ensuring a tailored and versatile networking experience.',
    '/gallery/land1.png'
  ),
  (
    3, 'III',
    'Advertise Your Business',
    'Elevate your visibility with the opportunity to showcase your brand through strategic advertising on our member directory and website, reaching a discerning audience of influential professionals and decision-makers.',
    '/gallery/land2.png'
  ),
  (
    4, 'IV',
    'Access to The Club Events',
    'Enjoy privileged access to The Club''s exclusive members-only events, curated to provide a premium networking experience and unique opportunities for building meaningful connections within our distinguished community.',
    '/gallery/land3.png'
  ),
  (
    5, 'V',
    'Monthly Members "Work In"',
    'Participate in our monthly member work-in sessions, designed to foster collaboration and productivity, providing a dedicated space for members to engage, share insights, and advance their professional endeavors together.',
    '/gallery/potrait.png'
  ),
  (
    6, 'VI',
    'Private Dining Experiences',
    'Indulge in exquisite private dining experiences at exclusive member rates, curated to elevate your culinary journey and provide a luxurious backdrop for building connections and hosting memorable business gatherings.',
    '/theclub-section.png'
  ),
  (
    7, 'VII',
    'Bespoke & Ticketed Events',
    'Unlock exclusive member rates for both bespoke and ticketed events, ensuring you have privileged access to a diverse range of curated experiences, from intimate gatherings to high-profile events, designed to enrich your networking journey.',
    '/theapproch-image.png'
  ),
  (
    8, 'VIII',
    'Curated Sponsored Events',
    'Enhance your brand visibility and influence by sponsoring curated events included in our Business and Corporate memberships. Position your business at the forefront of exclusive gatherings, establishing a powerful presence within our elite community.',
    '/manchester.png'
  ),
  (
    9, 'IX',
    'Corporate Luxury Concierge',
    'Experience the pinnacle of service with our Corporate Luxury Concierge, a premier offering exclusively included in our Business and Corporate memberships. Enjoy personalized assistance to complement your professional lifestyle.',
    '/gallery/bigland.png'
  )
on conflict (position) do nothing;
