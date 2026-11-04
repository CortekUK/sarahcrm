-- ============================================================
-- ROLLBACK for supabase/migrations/20261105_supabase_cron.sql
--   Stops the four Supabase-scheduled jobs. If you go back to Vercel Cron,
--   also restore the "crons" block in vercel.json (git history) and redeploy.
--   The pg_cron / pg_net extensions and the Vault secrets are left in place
--   (harmless; delete the secrets in Vault by hand if wanted).
--   Kept outside supabase/migrations/ on purpose. Safe to run twice.
-- ============================================================

do $$
declare
  j text;
begin
  if to_regclass('cron.job') is null then
    return;
  end if;
  foreach j in array array['club-automations', 'club-gmail-sync',
                           'club-gmail-backfill', 'club-gmail-extract']
  loop
    if exists (select 1 from cron.job where jobname = j) then
      perform cron.unschedule(j);
    end if;
  end loop;
end $$;

drop function if exists public.call_app_cron(text);
