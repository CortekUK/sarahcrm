-- Member lead enrichment — TRACKING columns only.
-- The company DATA columns (annual_turnover, employee_count, sector,
-- company_linkedin_url, company_website, company_description, …) already exist
-- on public.members and are autofilled in place. These columns just record
-- when/what/how the last enrichment run happened. Idempotent.

alter table public.members add column if not exists enrichment_status text;
alter table public.members add column if not exists enriched_at timestamptz;
alter table public.members add column if not exists enrichment_source text;
alter table public.members add column if not exists enrichment_raw jsonb;
