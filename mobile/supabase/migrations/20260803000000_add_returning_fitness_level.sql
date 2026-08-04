-- Add 'returning' to the fitness_level check constraint.
-- Comeback runners (postpartum, injury, extended time off) select this at
-- onboarding. It is self-reported only — deriveFitnessLevel() never infers it
-- from HealthKit pace. fitness_assessments.stated_level is unconstrained text,
-- so no change is needed there.
alter table public.user_profiles drop constraint if exists user_profiles_fitness_level_check;
alter table public.user_profiles add constraint user_profiles_fitness_level_check
  check (fitness_level in ('beginner', 'recreational', 'intermediate', 'advanced', 'returning'));
