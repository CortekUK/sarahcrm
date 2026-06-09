-- Multi-representative business accounts.
--
-- A business (or partner) membership can have several people who each
-- get their own portal login and share the company's tier. We model a
-- "representative" as a normal members row whose parent_member_id points
-- at the billed business account. This keeps every existing portal query
-- (profile_id -> members) working unchanged: a rep simply has their own
-- member row. Billing lives on the parent (the rep rows carry no Stripe
-- subscription); benefits/quotas are per-member as before.

alter table public.members
  add column if not exists parent_member_id uuid
    references public.members (id) on delete set null;

-- Flag the primary contact on a business account (the main rep). At most
-- one is expected per parent, but we don't hard-enforce it to keep admin
-- edits forgiving.
alter table public.members
  add column if not exists is_primary_rep boolean not null default false;

-- The job title / role this person holds at the business, shown in the
-- representatives roster.
alter table public.members
  add column if not exists rep_role text;

create index if not exists members_parent_member_id_idx
  on public.members (parent_member_id)
  where parent_member_id is not null;
