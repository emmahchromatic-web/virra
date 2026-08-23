-- Make a tempo correction a one-cell edit.
--
-- Tempo was stored per prescription row, so fixing one meant editing every row
-- that used it: 7 for Barbell Box Squat, 13 for Push-up (Trello 200). It is
-- very nearly a property of the exercise, though: of the 62 exercises carrying
-- a tempo, only 4 ever use more than one, and those are deliberate block
-- progressions (DB Pullover and Push-up ease the tempo in block 3) or authoring
-- inconsistencies still under review (DB Single-leg Calf Raises, Pike Push-up).
--
-- So: exercises.default_tempo becomes the single source for the 58 consistent
-- exercises, and their per-row values are cleared so there is exactly one place
-- to edit. The 4 that vary keep their per-row tempo, and default_tempo stays
-- null for them, which the app treats as "fall back to the authored row".
--
-- Deliberately set-based rather than a hardcoded name list, so it stays correct
-- if the seed changes.

begin;

alter table public.exercises
  add column if not exists default_tempo text;

-- Lift the tempo onto the exercise wherever every row agrees on it.
update public.exercises e
   set default_tempo = t.tempo
  from (
    select exercise_id, min(tempo) as tempo
      from public.programme_exercises
     where tempo is not null
       and tempo <> ''
     group by exercise_id
    having count(distinct tempo) = 1
  ) t
 where t.exercise_id = e.id;

-- Clear the now-redundant per-row copies so there is one source of truth.
-- Exercises whose tempo genuinely varies keep theirs.
update public.programme_exercises pe
   set tempo = null
  from public.exercises e
 where e.id = pe.exercise_id
   and e.default_tempo is not null;

-- Emma's correction from build 9 UAT: the box squat is a two-count lower, one
-- second pause, two-count drive, one second at the top.
update public.exercises
   set default_tempo = '2-1-2-1'
 where name = 'Barbell Box Squat';

commit;

notify pgrst, 'reload schema';
