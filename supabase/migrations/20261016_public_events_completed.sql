-- Public (signed-out) visibility for live + completed events.
--
-- The anon policy only allowed status = 'published', while signed-in users
-- could already see published / live / completed. Result: signed-out visitors
-- saw an empty Past Events archive, got a 404 on finished events' pages, and
-- recap blog posts couldn't link to their event. The public pages already
-- filter to these three statuses, so this aligns RLS with them.
-- planning / draft / cancelled stay hidden. Idempotent.

drop policy if exists "Public can view published events" on public.events;

create policy "Public can view published events"
  on public.events
  for select
  to anon
  using (status in ('published', 'live', 'completed'));
