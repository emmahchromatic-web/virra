-- 015_run_structure.sql
-- Phase I — Plan-owned run workout structure.
-- See docs/superpowers/specs/2026-05-15-phase-i-active-workout-engine-design.md

alter table public.planned_sessions
  add column if not exists run_structure jsonb;

comment on column public.planned_sessions.run_structure is
  'Plan-owned run workout structure (steps, repeats, targets). Generated at insert time by runWorkoutGenerator.ts. Null for non-run sessions or pre-Phase-I rows pending lazy backfill.';
