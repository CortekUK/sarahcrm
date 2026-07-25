-- Multi-inbox + noise-filtering support for gmail_messages.
--   mailbox  : which connected inbox this row was synced from (e.g. sarah@…)
--   is_noise : true when an UNMATCHED message is from a no-reply/newsletter/
--              receipt/automated sender, so it's kept out of the suggested-
--              contact ("Detected from email") list. Matched-to-a-member rows
--              are never flagged.
alter table public.gmail_messages
  add column if not exists mailbox text,
  add column if not exists is_noise boolean not null default false;

create index if not exists gmail_messages_noise_idx
  on public.gmail_messages (created_at desc)
  where member_id is null and is_noise = false;
