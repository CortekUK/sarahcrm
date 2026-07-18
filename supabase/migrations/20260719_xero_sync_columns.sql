alter table public.sponsorships       add column if not exists xero_invoice_id text;
alter table public.concierge_requests add column if not exists xero_invoice_id text;
alter table public.introductions      add column if not exists xero_invoice_id text;
alter table public.reward_referrals   add column if not exists xero_bill_id    text;
