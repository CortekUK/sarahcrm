-- ============================================================
-- 20260803_concierge_conversations.sql
--   AI Website Concierge — conversation transcripts for the public
--   floating concierge chat widget.
--
--   One row per visitor session (session_token, client-generated per
--   visit). Holds the full transcript, the user-message count (used for
--   the per-conversation abuse cap), the fields the concierge collected
--   across turns, and — once qualified — a link to the enquiry it created
--   via /api/enquiries/intake.
--
-- SECURITY MODEL
--   • ADMIN-ONLY RLS. `for all using is_admin() with check is_admin()`.
--     There is NO public / anon / staff policy — transcripts stay private.
--   • The public chat endpoint (/api/concierge/chat) writes these rows
--     with the SERVICE-ROLE client, which bypasses RLS. That is the only
--     writer; the browser never touches this table directly.
--   • Written by the untyped service-role client, so it is intentionally
--     absent from src/types/database.ts.
--
-- Fully guarded — safe to run twice.
-- ============================================================

create table if not exists public.concierge_conversations (
  id             uuid primary key default gen_random_uuid(),
  session_token  text not null unique,
  messages       jsonb not null default '[]'::jsonb,   -- [{role, content, at}]
  message_count  int not null default 0,               -- user-message count (cap)
  visitor_name   text,
  visitor_email  text,
  visitor_goal   text,
  qualified      boolean not null default false,
  enquiry_id     uuid references public.enquiries(id) on delete set null,
  ip             text,
  user_agent     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_concierge_conversations_ip
  on public.concierge_conversations(ip);
create index if not exists idx_concierge_conversations_session_token
  on public.concierge_conversations(session_token);
-- Supports the per-IP / hour rate-limit count (created_at window by ip).
create index if not exists idx_concierge_conversations_ip_created
  on public.concierge_conversations(ip, created_at);

drop trigger if exists set_updated_at on public.concierge_conversations;
create trigger set_updated_at before update on public.concierge_conversations
  for each row execute function public.handle_updated_at();

alter table public.concierge_conversations enable row level security;

drop policy if exists "Admins manage concierge_conversations" on public.concierge_conversations;
create policy "Admins manage concierge_conversations"
  on public.concierge_conversations for all
  using (public.is_admin()) with check (public.is_admin());
