-- 20260910100000_cycle_logs_unique_period_start.sql
--
-- One period start, one row. Emma's account held two rows for 2026-08-15,
-- logged three minutes apart at 28 days and then 27, and the store read them
-- with `order by period_start desc limit 1` and no tiebreaker. Which cycle
-- length the app used was down to whatever the planner returned first.
--
-- That is not cosmetic. cycle_length sets the ovulation day, which sets every
-- phase boundary, which decides how each weight reading is phase-stamped and
-- how the plan modulates. It could differ between two launches with no data
-- having changed.
--
-- The duplicates came from `resetCycleToToday`, which INSERTed unconditionally:
-- tapping "my period started today" twice produced two rows for the same date.
-- `completeOnboarding` had the same shape. Both now upsert on this constraint,
-- so the second tap corrects the first rather than competing with it.
--
-- Adding the constraint before the app change would make an old build throw on
-- that second tap. That is the right way round: a visible error on an unusual
-- double tap beats silently corrupting which cycle a woman is being told she is
-- in. The duplicates themselves were removed on 2026-09-10 (keep newest per
-- (user_id, period_start)), so this applies cleanly.

-- Fail loudly rather than half-applying if anything slipped in since the sweep.
do $$
declare
  dupes int;
begin
  select count(*) into dupes
  from (
    select user_id, period_start
    from public.cycle_logs
    group by user_id, period_start
    having count(*) > 1
  ) d;

  if dupes > 0 then
    raise exception
      'cycle_logs still holds % duplicate (user_id, period_start) group(s); dedupe before adding the constraint', dupes;
  end if;
end $$;

alter table public.cycle_logs
  add constraint cycle_logs_user_period_start_key unique (user_id, period_start);
