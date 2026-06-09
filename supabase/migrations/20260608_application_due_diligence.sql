-- Application due-diligence + introduction-strategy fields (Spec §2/§3)
-- ----------------------------------------------------------------------
-- Captures the relationship-intelligence inputs at intake so every new
-- member arrives with them (they flow into the member profile on
-- approval). Also adds a `track` so early-stage applicants seeking
-- investment can be routed to the PITCH track instead of membership.

alter table public.membership_applications
  -- "Who they want to meet / what they're looking for" — the key
  -- matchmaking input.
  add column if not exists looking_for text,
  -- What the applicant can offer other members.
  add column if not exists what_they_can_offer text,
  -- Business stage, used to decide the track (established vs early-stage).
  add column if not exists applicant_stage text,
  -- 'membership' (default) or 'pitch'. Derived from applicant_stage at
  -- submission; admins can override later.
  add column if not exists track text not null default 'membership';
