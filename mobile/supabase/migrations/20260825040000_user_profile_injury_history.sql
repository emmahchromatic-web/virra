-- Injury history, asked for at onboarding and editable afterwards.
--
-- Free text on purpose. A structured injury model (site, side, date, status)
-- is a real feature and would need a screen of its own; what card 3 asks for
-- is somewhere to say "left achilles, on and off since March" so it is on the
-- record and a coach can read it. Forcing that into a taxonomy this early
-- would lose the detail that actually matters.
--
-- Nothing reads this to modify training yet. It is context, not a signal, and
-- it must not quietly start changing programmes without that being designed.

alter table public.user_profiles
  add column if not exists injury_history text;

comment on column public.user_profiles.injury_history is
  'Free-text injury context supplied by the user. Displayed and editable in '
  'profile, collected during onboarding. Not consumed by any training logic.';
