-- 016_strength_structure.sql
-- Phase I — Plan-owned strength workout structure.

alter table public.planned_sessions
  add column if not exists strength_structure jsonb;

comment on column public.planned_sessions.strength_structure is
  'Plan-owned strength workout structure (exercises, target sets/reps/weight, rest). Generated at insert time by strengthWorkoutGenerator.ts. Null for non-strength sessions or pre-Phase-I rows pending lazy backfill.';

notify pgrst, 'reload schema';
