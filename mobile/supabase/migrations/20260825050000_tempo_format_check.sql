-- Guard the one cell Emma edits by hand.
--
-- PR #36 made exercises.default_tempo the single place to correct a tempo, and
-- workout-preview reads it live, so an edit reaches every enrolled user the
-- next time they open the session. That immediacy is the point of the design,
-- but it cuts both ways: a typo ('2-1-21', '2.1.2.1', a trailing space) would
-- reach everyone just as fast, and would fail silently, since the app renders
-- whatever string it finds.
--
-- Postgres can reject it at the point of saving instead, which turns a silent
-- production bug into an error message in the Table Editor.
--
-- Verified before adding: of 103 exercises, 58 carry a tempo and 45 are null,
-- and none of the 58 fail this pattern.
--
-- NULL stays legal: it is how the four block-varying exercises (DB Pullover,
-- Push-up, DB Single-leg Calf Raises, Pike Push-up) tell the app to fall back
-- to the tempo authored on the prescription row.

alter table public.exercises
  add constraint exercises_default_tempo_format
    check (default_tempo is null or default_tempo ~ '^[0-9]+-[0-9]+-[0-9]+-[0-9]+$');

comment on constraint exercises_default_tempo_format on public.exercises is
  'Tempo is four hyphen-separated counts, e.g. 2-1-2-1. Edited by hand in the '
  'Table Editor and read live by the app, so a malformed value would reach '
  'every enrolled user silently.';
