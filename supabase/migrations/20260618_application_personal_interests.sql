-- Personal / professional interests picked on the membership application form
-- (e.g. Networking, Investing, Golf, Startups). Stored separately from
-- `interests`, which holds event-type preferences. On approval these map to
-- the member's interest tags so the matchmaking engine can use them.
alter table public.membership_applications
  add column if not exists personal_interests text[];
