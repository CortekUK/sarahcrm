-- Default new members into the member directory.
--
-- The portal Network/Community directory only lists members with
-- showcase_enabled = true. New members previously defaulted to false, so
-- they were invisible until manually flipped. Default it on so members
-- appear in the directory as soon as they're active; admins can still hide
-- an individual member via the toggle on the member detail page.
alter table public.members alter column showcase_enabled set default true;
