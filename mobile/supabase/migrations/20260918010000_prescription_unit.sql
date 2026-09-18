-- Say whether a prescription is counted or timed, instead of guessing from prose.
--
-- Authored prescriptions are free text: "8-10" is a rep count, "20-40 sec" and
-- "15-30 sec each side" are holds. The app inferred the difference with a regex
-- at render time, so a plank's target was read as its first number (20 reps),
-- the column header said REPS, and the seconds held were written into the reps
-- field with the unit only recovered at save. Emma cannot see how long she held
-- a plank last session, which is what progressing a hold needs.
--
-- The unit now lives with the prescription. The regex stays in the app as a
-- fallback for sessions scheduled before this ran.
--
-- Additive and defaulted: everything already authored is a rep count unless the
-- backfill below says otherwise.

begin;

alter table public.programme_exercises
  add column if not exists unit text not null default 'reps';

alter table public.programme_exercises
  drop constraint if exists programme_exercises_unit_check;

alter table public.programme_exercises
  add constraint programme_exercises_unit_check
  check (unit in ('reps', 'seconds'));

-- Backfill from the authored text. Deliberately narrow: a number followed by a
-- duration word. "8-10" and "AMRAP" stay reps; "20-40 sec", "30s each side",
-- "1 min" become seconds. En-dashes appear in the source sheet, so treat them
-- as hyphens.
update public.programme_exercises
   set unit = 'seconds'
 where unit = 'reps'
   and reps is not null
   and replace(reps, chr(8211), '-') ~* '[0-9]+ *(- *[0-9]+ *)?(s|secs?|seconds?|mins?|minutes?)([^a-z]|$)';

commit;

notify pgrst, 'reload schema';
