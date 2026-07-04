-- ============================================================
-- 20260704_signature_requests.sql   (Phase 1 · Feature #7)
--
-- DocuSign e-signature requests. An admin sends a document (NDA, membership
-- agreement, introducer agreement, contract …) to a member for signature.
-- We create a DocuSign envelope and store its `envelope_id` here so status
-- can be polled against it. When the envelope completes, the signed PDF is
-- pulled back into the member document vault and linked via
-- `signed_document_id`.
--
-- No signed PDFs live in this table — only metadata + the DocuSign envelope
-- id and status. The signed file goes into the private 'member-documents'
-- bucket (see 20260704_member_documents.sql).
--
-- Fully guarded (if not exists / drop policy if exists) — safe to re-run and
-- safe against the existing schema.
-- ============================================================

-- ── Table ────────────────────────────────────────────────────
create table if not exists public.signature_requests (
  id                 uuid primary key default gen_random_uuid(),
  member_id          uuid not null references public.members(id) on delete cascade,
  envelope_id        text,                    -- DocuSign envelope id (set once created)
  status             text not null default 'created',
  doc_type           text not null default 'contract',
  title              text,                    -- e.g. "Membership Agreement 2026"
  signer_name        text not null,
  signer_email       text not null,
  subject            text,
  message            text,
  source_file_name   text,                    -- original document name
  signed_document_id uuid references public.member_documents(id) on delete set null,
  declined_reason    text,
  error              text,
  sent_by            uuid references public.profiles(id) on delete set null,
  sent_at            timestamptz,
  completed_at       timestamptz,
  last_checked_at    timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_signature_requests_member on public.signature_requests(member_id);
create index if not exists idx_signature_requests_envelope on public.signature_requests(envelope_id);
create index if not exists idx_signature_requests_created on public.signature_requests(created_at desc);

-- Envelope lifecycle: created → sent → delivered → completed
--                              ↘ declined / voided ;  error on failure to create
alter table public.signature_requests
  drop constraint if exists signature_requests_status_check;
alter table public.signature_requests
  add constraint signature_requests_status_check
  check (status in ('created','sent','delivered','completed','declined','voided','error'));

-- ── updated_at touch trigger ─────────────────────────────────
create or replace function public.tg_signature_requests_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_signature_requests_updated_at on public.signature_requests;
create trigger trg_signature_requests_updated_at
  before update on public.signature_requests
  for each row execute function public.tg_signature_requests_touch();

-- ── RLS — admin-only ─────────────────────────────────────────
alter table public.signature_requests enable row level security;

drop policy if exists "Admins manage signature_requests" on public.signature_requests;
create policy "Admins manage signature_requests"
  on public.signature_requests
  for all
  using (public.is_admin())
  with check (public.is_admin());
