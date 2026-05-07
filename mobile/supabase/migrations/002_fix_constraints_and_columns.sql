-- Fix mismatches introduced by manual ALTER TABLE during debugging
-- and align check constraints with actual app values.

-- Remove columns that were incorrectly added (wrong names from CLAUDE.md spec)
alter table public.user_profiles drop column if exists goal;
alter table public.user_profiles drop column if exists baseline_pace;

-- Fix fitness_level constraint: add 'recreational' which the app uses
alter table public.user_profiles drop constraint if exists user_profiles_fitness_level_check;
alter table public.user_profiles add constraint user_profiles_fitness_level_check
  check (fitness_level in ('beginner', 'recreational', 'intermediate', 'advanced'));

-- Fix running_goal constraint: rename 'half_marathon' (was 'half'), add 'general'
alter table public.user_profiles drop constraint if exists user_profiles_running_goal_check;
alter table public.user_profiles add constraint user_profiles_running_goal_check
  check (running_goal in ('5k', '10k', 'half_marathon', 'marathon', 'general'));

-- Fix cycle_logs: remove incorrect 'cycle_length' column if added
alter table public.cycle_logs drop column if exists cycle_length;

-- Fix fitness_assessments: remove incorrect columns if added
alter table public.fitness_assessments drop column if exists date;
alter table public.fitness_assessments drop column if exists actual_pace;
alter table public.fitness_assessments drop column if exists trigger;
alter table public.fitness_assessments drop column if exists celebrated_at;
alter table public.fitness_assessments add column if not exists celebrated_at timestamptz;

-- Notify PostgREST to reload schema cache
notify pgrst, 'reload schema';
