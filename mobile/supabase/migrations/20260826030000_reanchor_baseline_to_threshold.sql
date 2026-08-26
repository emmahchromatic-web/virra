-- Card 228: baseline_pace_seconds_per_km held the runner's 5K pace, but every
-- band multiplier applied to it only makes sense against THRESHOLD pace. The
-- code side of that is fixed in src/lib/runProgramme/paceModel.ts; this converts
-- the stored values so the two agree.
--
-- The conversion is Riegel solved for the distance covered in an hour:
--
--   D_thr_km = 5 × (3600 / (5 × P)) ^ (1 / 1.06)      P = stored 5K pace, s/km
--   threshold = 3600 / D_thr_km
--
-- which simplifies to 3600 / (5 × power(720 / P, 1 / 1.06)). A 25:00 5K runner
-- stored at 300 s/km becomes 315 s/km — 5:00/km becomes 5:15/km, and their easy
-- runs go from 5:45/km to 6:18/km.
--
-- Idempotent by construction: it only touches rows still marked baseline_anchor
-- = '5k', and flips them to 'threshold' in the same statement. Running it twice
-- is a no-op, which matters because the column was added precisely so this
-- conversion could be run exactly once per row.

update public.user_profiles
set baseline_pace_seconds_per_km =
      round(3600.0 / (5.0 * power(720.0 / baseline_pace_seconds_per_km, 1.0 / 1.06))),
    baseline_anchor = 'threshold'
where baseline_anchor = '5k'
  and baseline_pace_seconds_per_km is not null
  and baseline_pace_seconds_per_km > 0;

-- Rows with no baseline at all cannot be converted, but leaving them on '5k'
-- would mean a future run of this migration converts whatever lands there next.
-- They have no anchor because they have no value.
update public.user_profiles
set baseline_anchor = 'threshold'
where baseline_anchor = '5k'
  and (baseline_pace_seconds_per_km is null or baseline_pace_seconds_per_km <= 0);

-- fitness_assessments.actual_pace_seconds_per_km is deliberately NOT converted.
-- It records a measured 5K performance, which is a fact about a run the runner
-- did, not a training anchor. The onboarding backfill in 20260826020000 was the
-- only place it was ever read as a baseline.
