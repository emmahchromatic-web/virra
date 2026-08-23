-- Repair the cycle phase stamped on historical weight readings.
--
-- body_weights.cycle_phase_at_time was written by sampleToRow() using
-- getCycleInfo(), whose day-of-cycle maths was `(elapsed % cycleLength) + 1`.
-- Postgres and JavaScript both keep the sign of the dividend on `%`, so any
-- reading dated before the user's most recent period start produced a
-- dayOfCycle of zero or below, which passed the `<= 5` menstrual test. Every
-- back-dated HealthKit import was therefore stamped 'menstrual'.
--
-- Consequence: computeBaseline() needs five follicular readings inside a
-- 70-day window before any band exists, and almost never saw them, so the
-- cycle weight band sat on CALIBRATING indefinitely. One user had 38 of 40
-- readings mislabelled.
--
-- This recomputes day and phase for every reading from the period actually
-- current on that date, falling back to extrapolating from the nearest logged
-- period where the reading predates all of them. Idempotent: it derives
-- everything from cycle_logs and can be re-run safely.
--
-- Phase boundaries mirror cycleEngine.ts: days 1-5 menstrual, ovulation at
-- cycleLength - 14 with a one-day window either side, follicular before that
-- window, luteal after.

begin;

with ref as (
  select bw.id           as bw_id,
         bw.recorded_on,
         cl.period_start,
         coalesce(cl.cycle_length_days, 28) as len
    from public.body_weights bw
    left join lateral (
      select c.period_start, c.cycle_length_days
        from public.cycle_logs c
       where c.user_id = bw.user_id
       -- Prefer the period that had already started on the reading's date;
       -- otherwise take the nearest one and extrapolate backwards.
       order by (c.period_start <= bw.recorded_on) desc,
                abs(c.period_start - bw.recorded_on)
       limit 1
    ) cl on true
),
calc as (
  select bw_id,
         len,
         -- Double modulo so negative differences wrap into the previous cycle
         -- instead of going below zero.
         (((((recorded_on - period_start) % len) + len) % len) + 1) as day_of_cycle
    from ref
   where period_start is not null
)
update public.body_weights bw
   set cycle_day_at_time   = calc.day_of_cycle,
       cycle_phase_at_time = case
         when calc.day_of_cycle <= 5                                   then 'menstrual'
         when calc.day_of_cycle between (calc.len - 15) and (calc.len - 13) then 'ovulatory'
         when calc.day_of_cycle <  (calc.len - 15)                     then 'follicular'
         else                                                               'luteal'
       end
  from calc
 where calc.bw_id = bw.id;

commit;
