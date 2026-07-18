-- AI lead enrichment (Apollo.io) columns for public.enquiries.
-- Idempotent: safe to re-run. Company + person fields are populated by the
-- enrichment provider (Apollo today, swappable via the provider interface).
alter table public.enquiries add column if not exists enrichment_status       text;
alter table public.enquiries add column if not exists enriched_at             timestamptz;
alter table public.enquiries add column if not exists enrichment_source       text;
alter table public.enquiries add column if not exists company_domain          text;
alter table public.enquiries add column if not exists company_website         text;
alter table public.enquiries add column if not exists company_linkedin_url    text;
alter table public.enquiries add column if not exists company_industry        text;
alter table public.enquiries add column if not exists company_employee_count  integer;
alter table public.enquiries add column if not exists company_revenue         bigint;
alter table public.enquiries add column if not exists company_revenue_printed text;
alter table public.enquiries add column if not exists person_title            text;
alter table public.enquiries add column if not exists person_seniority        text;
alter table public.enquiries add column if not exists person_linkedin_url     text;
alter table public.enquiries add column if not exists enrichment_raw          jsonb;
