-- The same cycle-phase repair, for the two tables the last one missed.
--
-- 20260823020000 fixed body_weights.cycle_phase_at_time after getCycleInfo's
-- `(elapsed % cycleLength) + 1` stamped every back-dated reading 'menstrual'
-- (JS and Postgres both keep the sign of the dividend on %, so any date before
-- the most recent period start produced a day of cycle <= 0, which passed the
-- `<= 5` menstrual test). Two other tables are written by the same function
-- and were never repaired:
--
--   activities.phase_at_time      - Insights' PACE BY PHASE card queries
--     activities with `.not('phase_at_time','is',null)` and hides itself
--     entirely when nothing matches, so a null here makes the whole feature
--     look unbuilt. Where it is non-null it may still be wrong. Raised in
--     build 11 UAT, card 34: "there is no pace insights visible".
--   nutrition_logs.phase_at_time  - feeds phase-based fuelling analysis.
--
-- Same maths as the weights backfill: derive the phase from the period
-- actually current on that date, extrapolating backwards from the nearest
-- logged period where the row predates all of them. Idempotent, since
-- everything is recomputed from cycle_logs.
--
-- Rows for users with no cycle_logs at all are left null, which is honest:
-- they have no cycle to phase against.

begin;

-- activities.started_at is a timestamptz; the phase belongs to the local
-- calendar date the session happened on, not to a UTC instant.
with ref as (
  select a.id as row_id,
         a.started_at::date as on_date,
         cl.period_start,
         coalesce(cl.cycle_length_days, 28) as len
    from public.activities a
    left join lateral (
      select c.period_start, c.cycle_length_days
        from public.cycle_logs c
       where c.user_id = a.user_id
       order by (c.period_start <= a.started_at::date) desc,
                abs(c.period_start - a.started_at::date)
       limit 1
    ) cl on true
),
calc as (
  select row_id,
         len,
         (((((on_date - period_start) % len) + len) % len) + 1) as day_of_cycle
    from ref
   where period_start is not null
)
update public.activities a
   set phase_at_time = case
         when calc.day_of_cycle <= 5                                        then 'menstrual'
         when calc.day_of_cycle between (calc.len - 15) and (calc.len - 13) then 'ovulatory'
         when calc.day_of_cycle <  (calc.len - 15)                          then 'follicular'
         else                                                                    'luteal'
       end
  from calc
 where calc.row_id = a.id;

with ref as (
  select n.id as row_id,
         n.recorded_on,
         cl.period_start,
         coalesce(cl.cycle_length_days, 28) as len
    from public.nutrition_logs n
    left join lateral (
      select c.period_start, c.cycle_length_days
        from public.cycle_logs c
       where c.user_id = n.user_id
       order by (c.period_start <= n.recorded_on) desc,
                abs(c.period_start - n.recorded_on)
       limit 1
    ) cl on true
),
calc as (
  select row_id,
         len,
         (((((recorded_on - period_start) % len) + len) % len) + 1) as day_of_cycle
    from ref
   where period_start is not null
)
update public.nutrition_logs n
   set phase_at_time = case
         when calc.day_of_cycle <= 5                                        then 'menstrual'
         when calc.day_of_cycle between (calc.len - 15) and (calc.len - 13) then 'ovulatory'
         when calc.day_of_cycle <  (calc.len - 15)                          then 'follicular'
         else                                                                    'luteal'
       end
  from calc
 where calc.row_id = n.id;

commit;
