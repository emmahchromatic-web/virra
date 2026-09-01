-- =============================================================================
-- BUILD 12 UAT DIAGNOSTICS -- read-only
--
-- Two open cards need production data that RLS puts out of Claude's reach.
-- Replace <<USER_UUID>> with your own user id (auth.users.id) and run each
-- section. Paste the results back and the diagnosis finishes itself.
--
-- Written 2026-08-30, not executed -- there is no Postgres on the machine it
-- was written on.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- §1  CARD 26 -- "runs do not appear on the calendar outside the current week"
--
-- The read path is provably correct: the hook queries the whole calendar month,
-- month navigation is wired, the store's cache cannot mask a month, and the
-- generator materialises the full plan at enrol. That points at the DATA.
--
-- This answers all three questions at once: does the plan have sessions beyond
-- this week, when was it enrolled, and how far do its sessions actually run.
-- -----------------------------------------------------------------------------
select
  b.id                                             as block_id,
  b.modality,
  t.name                                           as plan_name,
  b.starts_on,
  b.ends_on,
  b.created_at::date                               as enrolled_on,
  count(s.id)                                      as sessions_total,
  min(s.scheduled_date)                            as first_session,
  max(s.scheduled_date)                            as last_session,
  count(*) filter (where s.scheduled_date >= date_trunc('week', current_date)::date
                     and s.scheduled_date <  date_trunc('week', current_date)::date + 7) as this_week,
  count(*) filter (where s.scheduled_date >= date_trunc('week', current_date)::date + 7) as after_this_week,
  count(distinct s.week_number)                    as distinct_week_numbers
from public.training_blocks b
left join public.plan_templates  t on t.id = b.template_id
left join public.planned_sessions s on s.block_id = b.id and s.status <> 'dropped'
where b.user_id = '<<USER_UUID>>'::uuid
  and (b.ends_on is null or b.ends_on >= current_date)
group by b.id, b.modality, t.name, b.starts_on, b.ends_on, b.created_at
order by b.created_at desc;

-- How to read it:
--   after_this_week = 0        -> the rows genuinely stop. A generation bug.
--                                 Next suspect: buildGeneratedRunPlan returning
--                                 a short plan, since the run path only falls
--                                 back to the template when the plan is NULL,
--                                 never when it is merely shorter than asked.
--   after_this_week > 0        -> the rows exist and the CALENDAR is at fault
--                                 after all, which would contradict the code
--                                 read and is worth knowing immediately.
--   enrolled_on before 28 Aug  -> historic data from older code, not a live bug.


-- -----------------------------------------------------------------------------
-- §2  CARD 216 -- Virra says 12.9 km this week, Garmin says 10.7 km
--
-- The tiles are correctly filtered to activity_type = 'run'. What they do NOT
-- do is dedup, or filter by source. Two sources recording the same run start
-- seconds apart survive as two rows, because the import upserts on an EXACT
-- (user_id, started_at) match.
-- -----------------------------------------------------------------------------
select
  a.started_at,
  a.started_at::date                    as day,
  a.activity_type,
  a.sub_type,
  round(a.distance_meters / 1000.0, 2)  as km,
  a.duration_seconds / 60               as minutes,
  a.hk_uuid,
  case when a.hk_uuid is null then 'recorded in Virra' else 'imported from Health' end as origin,
  rd.hr_avg,
  rd.avg_pace_seconds_per_km
from public.activities a
left join public.run_details rd on rd.activity_id = a.id
where a.user_id = '<<USER_UUID>>'::uuid
  and a.activity_type = 'run'
  and a.started_at >= date_trunc('week', current_date)
order by a.started_at;

-- How to read it:
--   3+ rows where Garmin shows 2, with two start times MINUTES apart
--     -> the same run from two sources. The fix is a dedup tolerance window
--        plus a rule for which source wins, which is a real decision: Garmin is
--        your source of truth, but Virra's own tracker holds the GPS trace.
--   3+ rows with clearly distinct times
--     -> a genuine extra workout, most likely a Garmin warm-up or cool-down
--        segment pushed to Health as its own "Running" workout.
--   exactly 2 rows summing to 12.9
--     -> the per-run distances themselves are wrong, which points at the
--        miles-to-metres conversion in healthKitImport rather than at dedup.
--
-- The `origin` column is the quickest tell: two rows for one run will normally
-- show one of each.


-- -----------------------------------------------------------------------------
-- §3  Same week, everything NOT counted as a run
--
-- Sanity check on the August fix. These carry distance but must never appear in
-- the running tiles. If a walk shows here and your km tile still looks high,
-- the filter has regressed.
-- -----------------------------------------------------------------------------
select
  a.activity_type,
  a.sub_type,
  count(*)                                        as activities,
  round(sum(a.distance_meters) / 1000.0, 2)       as km_total
from public.activities a
where a.user_id = '<<USER_UUID>>'::uuid
  and a.activity_type <> 'run'
  and a.started_at >= date_trunc('week', current_date)
group by a.activity_type, a.sub_type
order by km_total desc nulls last;
