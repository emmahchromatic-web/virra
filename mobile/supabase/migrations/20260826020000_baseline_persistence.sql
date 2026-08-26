-- Card 227: the onboarding 5K time and weekly-mileage bracket were collected and
-- discarded. `baseline_pace_seconds_per_km` was only ever written by the Fitness
-- Update, and `weekly_mileage_km` was never written at all, so every consumer fell
-- back to 360 s/km (6:00/km) and 30 km — i.e. every runner's plan was generated for
-- the same imaginary person.
--
-- This adds provenance to the baseline and backfills the accounts that already exist.

-- 1. Provenance ------------------------------------------------------------

alter table public.user_profiles
  add column if not exists baseline_source text,
  add column if not exists baseline_anchor text not null default '5k';

alter table public.user_profiles drop constraint if exists user_profiles_baseline_source_check;
alter table public.user_profiles add constraint user_profiles_baseline_source_check
  check (baseline_source is null or baseline_source in ('stated', 'derived', 'calibrated'));

alter table public.user_profiles drop constraint if exists user_profiles_baseline_anchor_check;
alter table public.user_profiles add constraint user_profiles_baseline_anchor_check
  check (baseline_anchor in ('5k', 'threshold'));

comment on column public.user_profiles.baseline_source is
  'Where the baseline came from: stated = the runner gave us a 5K time; derived = '
  'inferred from their fitness level because they left it blank; calibrated = the '
  'Fitness Update measured it from completed runs. A derived baseline is a guess, '
  'and calibration should converge on the truth faster from one.';

comment on column public.user_profiles.baseline_anchor is
  'Which pace baseline_pace_seconds_per_km holds. 5k = the runner''s 5K pace, the '
  'original meaning. threshold = their threshold pace, which the pace-model re-anchor '
  '(card 228) converts everything to. Present now so that conversion can run exactly '
  'once, whenever it lands.';

-- 2. Backfill the baseline -------------------------------------------------

-- 2a. Anyone who gave us a 5K time at onboarding: it reached fitness_assessments
-- even though it never reached the profile. Take their earliest one.
update public.user_profiles p
set baseline_pace_seconds_per_km = fa.actual_pace_seconds_per_km,
    baseline_source              = 'stated'
from (
  select distinct on (user_id) user_id, actual_pace_seconds_per_km
  from public.fitness_assessments
  where actual_pace_seconds_per_km is not null
  order by user_id, assessed_on asc
) fa
where fa.user_id = p.id
  and p.baseline_pace_seconds_per_km is null;

-- 2b. Everyone else falls back to their self-reported level. Values mirror
-- DERIVED_BASELINE_BY_LEVEL in src/lib/completeOnboarding.ts — keep them in step.
update public.user_profiles p
set baseline_pace_seconds_per_km = case p.fitness_level
                                     when 'advanced'     then 240
                                     when 'intermediate' then 275
                                     when 'recreational' then 346
                                     when 'returning'    then 367
                                     when 'beginner'     then 406
                                   end,
    baseline_source              = 'derived'
where p.baseline_pace_seconds_per_km is null
  and p.fitness_level is not null;

-- 2c. Baselines that were already set can only have come from the Fitness Update.
update public.user_profiles
set baseline_source = 'calibrated'
where baseline_pace_seconds_per_km is not null
  and baseline_source is null;

-- 3. Backfill weekly mileage ------------------------------------------------

-- No stored bracket for existing accounts, so measure it: average weekly running
-- volume over the last 28 days. Accounts with no runs keep null and their
-- consumers keep the old default until the runner next tells us.
update public.user_profiles p
set weekly_mileage_km = round(a.km / 4.0, 1)
from (
  select user_id, sum(coalesce(distance_meters, 0)) / 1000.0 as km
  from public.activities
  where activity_type = 'run'
    and started_at >= now() - interval '28 days'
  group by user_id
) a
where a.user_id = p.id
  and p.weekly_mileage_km is null
  and a.km > 0;
