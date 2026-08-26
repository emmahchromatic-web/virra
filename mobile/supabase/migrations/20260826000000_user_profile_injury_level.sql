-- Injury history becomes a category the plan can act on.
--
-- 20260825040000 added injury_history as free text, one day earlier. Emma's
-- challenge: what is that worth if it does not drive the plan? Fair. Nothing
-- reads it, and VIRRA has no coach-facing surface, so it was a field that
-- lengthened onboarding and implied a promise the app does not keep. The same
-- flaw the 'returning' fitness level already has: asked, then ignored.
--
-- A category can be acted on. Four values, chosen so the middle two are
-- distinguishable by someone answering honestly about themselves rather than
-- self-diagnosing:
--
--   none      no real history
--   niggles   occasional minor issues, or one bigger injury fully recovered
--   managing  recent, ongoing, or recurring
--   declined  chose not to say
--
-- 'declined' is stored rather than left null on purpose: "asked and declined"
-- and "never asked" are different states, and only the second should ever
-- prompt again.
--
-- NOT read by any training logic yet, deliberately. It is designed to feed
-- volume and ramp rate alongside the 'returning' fitness level and the dynamic
-- run programming Emma is working on separately, so those rules land together
-- rather than as two half-designed adaptations in different builds.
--
-- injury_history is intentionally left in place and unused. It holds no rows
-- (verified: 0 of 8 profiles), and card 2's structured model may want a notes
-- field, so dropping it would be destructive for no gain.

alter table public.user_profiles
  add column if not exists injury_level text
    check (injury_level is null or injury_level in ('none', 'niggles', 'managing', 'declined'));

comment on column public.user_profiles.injury_level is
  'Self-reported injury history band, captured at onboarding and editable in '
  'profile. NULL means never asked; declined means asked and refused. Intended '
  'to modulate volume and ramp rate, not yet read by any training logic.';
