-- 20260805000000_strength_set_logs.sql
-- Per-set performance logging for guided strength sessions ("every set, every
-- rep"), plus a session-level RPE on the strength sidecar. The guided runner
-- previously recorded duration only.

-- One row per performed set.
create table public.strength_set_logs (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  activity_id        uuid references public.activities(id) on delete cascade,
  planned_session_id uuid references public.planned_sessions(id) on delete set null,
  exercise_id        text not null,   -- PlannedExercise.id within the session structure
  exercise_name      text not null,
  set_index          int  not null,   -- 0-based position within the exercise
  target_reps        int,
  actual_reps        int,
  weight_kg          numeric,
  completed_at       timestamptz default now(),
  created_at         timestamptz default now()
);

alter table public.strength_set_logs enable row level security;

create policy "owner_all" on public.strength_set_logs
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- History / PR lookups by movement over time, and fast fetch by activity.
create index strength_set_logs_user_exercise_idx
  on public.strength_set_logs (user_id, exercise_name, completed_at desc);
create index strength_set_logs_activity_idx
  on public.strength_set_logs (activity_id);

-- Session-level RPE captured on the finish screen (1-10).
alter table public.strength_details
  add column if not exists session_rpe smallint;

-- The app emits session_type 'general' (see strengthTypes.ts SessionType), but
-- the original CHECK only allowed lower/upper/strength. Widen it so guided
-- 'general' sessions can persist their sidecar.
alter table public.strength_details
  drop constraint if exists strength_details_session_type_check;
alter table public.strength_details
  add constraint strength_details_session_type_check
  check (session_type in ('lower', 'upper', 'general', 'strength'));
