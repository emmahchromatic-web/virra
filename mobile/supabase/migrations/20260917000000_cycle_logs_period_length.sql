-- 20260917000000_cycle_logs_period_length.sql
--
-- Card 304. How long each period lasted.
--
-- The menstrual phase was a fixed 5 days in the app, so a 3-day period still
-- read as menstrual on days 4 and 5, and everything keyed off the phase on
-- those days (plan volume, fuelling, the phase stamped on runs, meals and
-- weights) was a follicular day treated as a bleed day.
--
-- Stored per period, beside cycle_length_days, because it varies month to
-- month. NULL means no end was logged for that period; the app then assumes
-- the average of the last three logged periods, or 5 days with no history.
--
-- 1 to 10 days (Emma, 2026-09-17): normal variation is 2 to 7, and a longer
-- period must be recordable rather than refused.
--
-- Additive and nullable, so it is safe before the app change ships. The app
-- reads it in its own query, so a build that runs before this lands falls back
-- to 5 days instead of failing the whole cycle load.

alter table public.cycle_logs
  add column if not exists period_length_days smallint;

alter table public.cycle_logs
  drop constraint if exists cycle_logs_period_length_days_check;

alter table public.cycle_logs
  add constraint cycle_logs_period_length_days_check
  check (period_length_days is null or period_length_days between 1 and 10);
