-- WhatsApp inbox thread list + unread state. One row per external contact
-- (keyed by the contact's phone = whatsapp_log.to_phone in BOTH directions),
-- kept in sync automatically by an AFTER INSERT trigger on whatsapp_log — so
-- both the outbound lib sender and the inbound webhook update it with NO code
-- change to either. Admin-only, mirrors the other admin tables (is_admin()).
create table if not exists public.whatsapp_contacts (
  phone                text primary key,          -- the external contact number (= whatsapp_log.to_phone)
  display_name         text,                      -- optional admin-set name (nullable)
  member_id            uuid references public.members on delete set null,
  last_message_at      timestamptz,
  last_message_preview text,
  last_direction       text,                      -- 'inbound' | 'outbound'
  unread_count         integer not null default 0,
  admin_read_at        timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists whatsapp_contacts_last_message_idx
  on public.whatsapp_contacts (last_message_at desc);

-- ── Sync trigger ────────────────────────────────────────────────────
-- Upsert the contact row on every whatsapp_log insert. Inbound messages bump
-- unread_count; outbound leave it (and re-open row if needed). SECURITY DEFINER
-- so it runs regardless of the inserting role (webhook = service-role, lib =
-- service-role, admin composer path also inserts via the lib/service-role).
create or replace function public.whatsapp_contacts_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  preview text;
begin
  -- Failed outbound attempts (e.g. invalid numbers) must not spawn a thread.
  if NEW.status = 'failed' then
    return NEW;
  end if;

  preview := case
    when NEW.template_name is not null then 'Template: ' || NEW.template_name
    else left(coalesce(NEW.body, ''), 140)
  end;

  insert into public.whatsapp_contacts as c (
    phone, last_message_at, last_message_preview, last_direction, unread_count, updated_at
  ) values (
    NEW.to_phone,
    NEW.created_at,
    preview,
    NEW.direction,
    case when NEW.direction = 'inbound' then 1 else 0 end,
    now()
  )
  on conflict (phone) do update set
    last_message_at      = NEW.created_at,
    last_message_preview = preview,
    last_direction       = NEW.direction,
    unread_count         = case
                             when NEW.direction = 'inbound' then c.unread_count + 1
                             else c.unread_count
                           end,
    updated_at           = now();

  return NEW;
end;
$$;

drop trigger if exists whatsapp_contacts_sync_trg on public.whatsapp_log;
create trigger whatsapp_contacts_sync_trg
  after insert on public.whatsapp_log
  for each row
  execute function public.whatsapp_contacts_sync();

-- ── Backfill existing whatsapp_log (safe to re-run) ─────────────────
-- One row per distinct to_phone: latest message drives preview/direction/time,
-- unread_count = count of inbound. `on conflict do nothing` keeps re-runs safe.
insert into public.whatsapp_contacts (
  phone, last_message_at, last_message_preview, last_direction, unread_count
)
select
  latest.to_phone,
  latest.created_at,
  case
    when latest.template_name is not null then 'Template: ' || latest.template_name
    else left(coalesce(latest.body, ''), 140)
  end,
  latest.direction,
  coalesce(counts.inbound, 0)
from (
  select distinct on (to_phone)
    to_phone, created_at, template_name, body, direction
  from public.whatsapp_log
  where status <> 'failed'
  order by to_phone, created_at desc
) latest
left join (
  select to_phone, count(*) filter (where direction = 'inbound') as inbound
  from public.whatsapp_log
  where status <> 'failed'
  group by to_phone
) counts on counts.to_phone = latest.to_phone
on conflict (phone) do nothing;

-- ── RLS: admin-only, matches the newer admin tables ─────────────────
alter table public.whatsapp_contacts enable row level security;
drop policy if exists whatsapp_contacts_admin_all on public.whatsapp_contacts;
create policy whatsapp_contacts_admin_all on public.whatsapp_contacts
  for all
  using (public.is_admin()) with check (public.is_admin());
