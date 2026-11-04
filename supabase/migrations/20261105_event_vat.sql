-- ============================================================
-- 20261105_event_vat.sql
--   Per-event VAT setting, chosen by the admin on the event form:
--     vat_mode 'included' (default) — the prices ARE what people pay
--              'added'               — vat_rate % is added on top at checkout
--     vat_rate  percentage used when vat_mode = 'added' (default 20, UK
--               standard rate)
--   Defaults keep every existing event exactly as it charges today.
--   Safe to run twice.
-- ============================================================

alter table public.events
  add column if not exists vat_mode text not null default 'included',
  add column if not exists vat_rate numeric(5,2) not null default 20;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_vat_mode_check') then
    alter table public.events add constraint events_vat_mode_check
      check (vat_mode in ('included', 'added'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_vat_rate_check') then
    alter table public.events add constraint events_vat_rate_check
      check (vat_rate >= 0 and vat_rate <= 100);
  end if;
end $$;
