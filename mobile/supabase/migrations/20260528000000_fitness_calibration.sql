-- 20260528000000_fitness_calibration.sql
-- F3a: persist a dismissed Fitness Update suggestion (snooze) and record the
-- direction of each baseline assessment.

alter table public.user_profiles
  add column if not exists fitness_check_snoozed_until timestamptz;

alter table public.fitness_assessments
  add column if not exists direction text check (direction in ('faster','slower'));
