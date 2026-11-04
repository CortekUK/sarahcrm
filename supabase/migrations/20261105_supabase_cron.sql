-- ============================================================
-- 20261105_supabase_cron.sql
--   Move the scheduled jobs from Vercel Cron to Supabase (pg_cron + pg_net).
--   Same four endpoints, same schedules as vercel.json had. Each job POSTs
--   to the app with `Authorization: Bearer <CRON_SECRET>`, which every one
--   of these routes already accepts.
--
-- BEFORE RUNNING — add two secrets in Supabase → Project Settings → Vault
-- (the values are never stored in this file or in git):
--   app_base_url  e.g. https://sarahcrm.vercel.app   (no trailing slash;
--                 change it to https://theclubgroup.co on launch day —
--                 the jobs read it at run time, nothing to reschedule)
--   cron_secret   the same value as CRON_SECRET in Vercel
--
-- Check runs:   select * from cron.job_run_details order by start_time desc limit 20;
-- Responses:    select id, status_code, left(content, 200) from net._http_response order by created desc limit 20;
-- Pause a job:  select cron.unschedule('club-automations');
--
-- Safe to run twice (cron.schedule replaces a job with the same name).
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- One place that builds the request, so each job is a single line.
-- SECURITY DEFINER so cron (running as postgres) can read the vault; not
-- callable by API users.
create or replace function public.call_app_cron(p_path text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
  secret text;
begin
  select decrypted_secret into base from vault.decrypted_secrets where name = 'app_base_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_secret';
  if base is null or secret is null then
    raise exception 'call_app_cron: add app_base_url and cron_secret to Vault first';
  end if;
  return net.http_post(
    url := rtrim(base, '/') || p_path,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    -- The routes allow up to 60 s (maxDuration); don't hang up before that.
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function public.call_app_cron(text) from public, anon, authenticated;

-- Hourly; the route itself only does the daily work at the configured UK
-- send hour (Settings → Automations) and skips the other runs.
select cron.schedule('club-automations', '0 * * * *',
  $$select public.call_app_cron('/api/cron/automations')$$);

select cron.schedule('club-gmail-sync', '*/15 * * * *',
  $$select public.call_app_cron('/api/cron/gmail-sync')$$);

select cron.schedule('club-gmail-backfill', '*/5 * * * *',
  $$select public.call_app_cron('/api/cron/gmail-backfill')$$);

select cron.schedule('club-gmail-extract', '30 * * * *',
  $$select public.call_app_cron('/api/admin/google/gmail/extract')$$);
