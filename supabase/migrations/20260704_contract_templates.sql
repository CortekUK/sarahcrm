-- ============================================================
-- 20260704_contract_templates.sql   (Phase 1 · Feature #7 — Contract builder)
--
-- Saved, reusable e-signature CONTRACTS authored in the block editor (a copy of
-- the email template builder). Kept in their OWN tables so the existing email
-- template flow is completely untouched.
--
--   contract_templates   — the saved contract (block JSON + rendered HTML), like
--                          email_templates but for documents sent via DocuSign.
--   contract_ai_chats /   — AI drafting chat history for a contract (mirrors
--   contract_ai_messages    template_ai_chats / template_ai_messages).
--
-- Also links signature_requests → the contract it was sent from.
--
-- Fully guarded (if not exists / drop policy if exists) — safe to re-run.
-- ============================================================

-- ── contract_templates ───────────────────────────────────────
create table if not exists public.contract_templates (
  id             uuid primary key default gen_random_uuid(),
  name           text not null default 'Untitled contract',
  doc_type       text not null default 'contract',
  body_html      text not null default '',
  body_json      jsonb,
  theme          jsonb,
  attachments    jsonb,
  is_draft       boolean not null default true,
  created_by_id  uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_contract_templates_updated on public.contract_templates(updated_at desc);

-- ── contract_ai_chats ────────────────────────────────────────
create table if not exists public.contract_ai_chats (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  contract_id   uuid references public.contract_templates(id) on delete cascade,
  title         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_contract_ai_chats_contract on public.contract_ai_chats(contract_id);
create index if not exists idx_contract_ai_chats_user on public.contract_ai_chats(user_id);

-- ── contract_ai_messages ─────────────────────────────────────
create table if not exists public.contract_ai_messages (
  id                 uuid primary key default gen_random_uuid(),
  chat_id            uuid not null references public.contract_ai_chats(id) on delete cascade,
  role               text not null,
  content            text not null default '',
  blocks_snapshot    jsonb,
  created_at         timestamptz not null default now()
);

create index if not exists idx_contract_ai_messages_chat on public.contract_ai_messages(chat_id, created_at);

-- ── Link signature_requests → source contract ────────────────
alter table public.signature_requests
  add column if not exists contract_template_id uuid references public.contract_templates(id) on delete set null;

create index if not exists idx_signature_requests_contract on public.signature_requests(contract_template_id);

-- ── updated_at touch triggers ────────────────────────────────
create or replace function public.tg_contract_templates_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_contract_templates_updated_at on public.contract_templates;
create trigger trg_contract_templates_updated_at
  before update on public.contract_templates
  for each row execute function public.tg_contract_templates_touch();

drop trigger if exists trg_contract_ai_chats_updated_at on public.contract_ai_chats;
create trigger trg_contract_ai_chats_updated_at
  before update on public.contract_ai_chats
  for each row execute function public.tg_contract_templates_touch();

-- ── RLS — admin-only ─────────────────────────────────────────
alter table public.contract_templates  enable row level security;
alter table public.contract_ai_chats   enable row level security;
alter table public.contract_ai_messages enable row level security;

drop policy if exists "Admins manage contract_templates" on public.contract_templates;
create policy "Admins manage contract_templates"
  on public.contract_templates for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage contract_ai_chats" on public.contract_ai_chats;
create policy "Admins manage contract_ai_chats"
  on public.contract_ai_chats for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage contract_ai_messages" on public.contract_ai_messages;
create policy "Admins manage contract_ai_messages"
  on public.contract_ai_messages for all
  using (public.is_admin()) with check (public.is_admin());
