-- Tags were unique on `name` alone, which made the matchmaker impossible:
-- it pairs a member's `need` tag with another's `industry` tag of the SAME
-- name (e.g. need "Website Security" ↔ industry "Website Security"), but a
-- global-unique name forbade having both. Make the name unique PER CATEGORY
-- instead so the same label can live in different categories.
alter table public.tags drop constraint if exists tags_name_key;
create unique index if not exists tags_name_category_key on public.tags (name, category);
