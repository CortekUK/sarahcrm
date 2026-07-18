alter table public.members add column if not exists xero_spend_pence bigint;
alter table public.members add column if not exists xero_spend_synced_at timestamptz;
