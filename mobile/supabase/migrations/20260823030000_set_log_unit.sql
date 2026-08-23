-- Distinguish a hold from a rep count on per-set logs.
--
-- Some prescriptions are a duration rather than a rep count ("20-40 sec",
-- "15-30 sec each side"), and the logger now times them. Without a unit the
-- seconds held would land in actual_reps alongside genuine rep counts, and a
-- 30-second plank would be indistinguishable from 30 reps in any later
-- analysis.
--
-- Additive and defaulted, so existing rows stay correct: everything logged so
-- far was a rep count.

begin;

alter table public.strength_set_logs
  add column if not exists unit text not null default 'reps';

alter table public.strength_set_logs
  drop constraint if exists strength_set_logs_unit_check;

alter table public.strength_set_logs
  add constraint strength_set_logs_unit_check
  check (unit in ('reps', 'seconds'));

commit;

notify pgrst, 'reload schema';
