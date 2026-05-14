-- App Review demo account seed
-- =============================
-- Run AFTER creating the demo account in the live app (so auth.users + user_profiles
-- rows exist). This script:
--   1. Marks the profile as onboarded with a sensible baseline.
--   2. Inserts a cycle log 14 days ago (so the user lands mid-cycle).
--   3. Inserts 28 days of synthetic activities (runs + strength) and check-ins.
--   4. Inserts ~14 days of nutrition logs.
--
-- Usage (via Supabase MCP or the Supabase SQL editor):
--   1. Sign the demo account up in the app and complete the email-verify loop.
--   2. Grab the user's UUID:
--        select id from auth.users where email = 'appreview@virra.app';
--   3. Paste that UUID into :user_id_param below, save, and run.
--
-- The script is idempotent for cycle_logs / activities / nutrition (it deletes
-- the user's existing rows in those tables first). It does NOT delete subscriptions
-- or insights_cache.

\set user_id_param '00000000-0000-0000-0000-000000000000'   -- ← replace

begin;

-- 1. Profile baseline
update public.user_profiles
set
  fitness_level                = 'intermediate',
  running_goal                 = 'half_marathon',
  dietary_prefs                = '{}',
  baseline_pace_seconds_per_km = 330,   -- 5:30/km
  weekly_mileage_km            = 30,
  onboarding_complete          = true,
  updated_at                   = now()
where id = :'user_id_param';

-- 2. Cycle — period started 14 days ago, 28-day length → user is now in ovulatory phase
delete from public.cycle_logs where user_id = :'user_id_param';
insert into public.cycle_logs (user_id, period_start, cycle_length_days)
values (:'user_id_param', current_date - interval '14 days', 28);

-- 3. Activities — 28 days of runs (every 2nd day) + strength (twice a week)
delete from public.activities where user_id = :'user_id_param';

with day_offsets as (
  select generate_series(0, 27) as days_ago
)
insert into public.activities (
  user_id, activity_type, started_at, duration_seconds, distance_meters,
  notes, phase_at_time, hk_uuid
)
select
  :'user_id_param',
  case when days_ago % 2 = 0 then 'run'
       when days_ago % 7 in (1, 4) then 'strength'
       else null end as activity_type,
  (current_date - (days_ago || ' days')::interval + time '07:30') at time zone 'UTC',
  case when days_ago % 2 = 0 then 2400 + (days_ago % 6) * 600    -- 40–90 min runs
       else 2700 end,                                            -- 45 min strength
  case when days_ago % 2 = 0 then 7000 + (days_ago % 6) * 1500   -- 7–14.5 km runs
       else null end,
  case when days_ago % 14 = 0 then 'Long run — felt strong'
       when days_ago % 4  = 0 then 'Intervals'
       else null end,
  case
    when ((current_date - (days_ago || ' days')::interval)::date
          - (current_date - interval '14 days')::date) % 28 between 0 and 4  then 'menstrual'
    when ((current_date - (days_ago || ' days')::interval)::date
          - (current_date - interval '14 days')::date) % 28 between 5 and 13 then 'follicular'
    when ((current_date - (days_ago || ' days')::interval)::date
          - (current_date - interval '14 days')::date) % 28 between 14 and 16 then 'ovulatory'
    else 'luteal'
  end,
  'demo-' || days_ago
from day_offsets
where (days_ago % 2 = 0) or (days_ago % 7 in (1, 4));

-- 4. Symptom logs — daily check-ins for last 21 days
-- energy / mood / sleep_quality are constrained to 1-5 in the schema
delete from public.symptom_logs where user_id = :'user_id_param';

insert into public.symptom_logs (user_id, recorded_on, energy, mood, sleep_quality, symptoms, notes)
select
  :'user_id_param',
  current_date - (d || ' days')::interval,
  case when d % 28 between 0  and 3  then 2     -- menstrual: low
       when d % 28 between 4  and 12 then 4     -- follicular: high
       when d % 28 between 13 and 16 then 5     -- ovulatory: peak
       else 3 end,                              -- luteal: moderate
  case when d % 28 between 24 and 27 then 2     -- late luteal: dip
       when d % 28 between 13 and 16 then 5     -- ovulatory: high
       else 4 end,
  case when d % 3 = 0 then 4 when d % 3 = 1 then 5 else 3 end,
  case when d % 28 between 0  and 2  then array['cramps','low_energy']
       when d % 28 between 22 and 25 then array['bloating']
       else '{}'::text[] end,
  null
from generate_series(0, 20) as d;

-- 5. Nutrition logs — 14 days
delete from public.nutrition_logs where user_id = :'user_id_param';

insert into public.nutrition_logs (user_id, recorded_on, phase_at_time, training_load, targets_json)
select
  :'user_id_param',
  current_date - (d || ' days')::interval,
  case
    when (current_date - (d || ' days')::interval)::date
         - (current_date - interval '14 days')::date >= 0 and
         (current_date - (d || ' days')::interval)::date
         - (current_date - interval '14 days')::date <= 4 then 'menstrual'
    when (d % 28) between 5  and 13 then 'follicular'
    when (d % 28) between 14 and 16 then 'ovulatory'
    else 'luteal'
  end,
  case when d % 2 = 0 then 'moderate' else 'rest' end,
  jsonb_build_object(
    'calories', 2200 + (d % 4) * 150,
    'carbs_g',  280  + (d % 4) * 20,
    'protein_g', 100,
    'fat_g',     70,
    'fibre_g',   28
  )
from generate_series(0, 13) as d;

-- 6. Training block + planned sessions — drives the Training tab and dashboard
--    week strip. Half-marathon plan starting 3 weeks ago, anchored on a Monday.
--    Day-of-week template Mon/Wed/Thu/Sun so today (whichever weekday) tends
--    to fall on a session day.
delete from public.training_blocks where user_id = :'user_id_param';

with new_block as (
  insert into public.training_blocks (
    user_id, template_id, starts_on, modality, is_primary, load_modifier
  ) values (
    :'user_id_param',
    'ec78fe4d-19ac-4885-bc80-6a856bf477c1',   -- Half Marathon Build (12-week)
    (current_date - interval '21 days')::date - extract(dow from (current_date - interval '21 days'))::int + 1,  -- nearest Monday ≤ 3 weeks back
    'run', true, 1.0
  )
  returning id, starts_on
),
session_grid(week, slot, label, training_phase) as (values
  (1,0,'easy','base'),(1,1,'tempo','base'),(1,2,'easy','base'),(1,3,'long','base'),
  (2,0,'easy','base'),(2,1,'tempo','base'),(2,2,'easy','base'),(2,3,'long','base'),
  (3,0,'easy','build'),(3,1,'threshold','build'),(3,2,'easy','build'),(3,3,'long','build'),
  (4,0,'easy','recovery'),(4,1,'easy','recovery'),(4,2,'easy','recovery'),(4,3,'long','recovery'),
  (5,0,'easy','build'),(5,1,'threshold','build'),(5,2,'tempo','build'),(5,3,'long','build'),
  (6,0,'easy','build'),(6,1,'threshold','build'),(6,2,'tempo','build'),(6,3,'long','build'),
  (7,0,'easy','peak'),(7,1,'threshold','peak'),(7,2,'tempo','peak'),(7,3,'long','peak'),
  (8,0,'easy','recovery'),(8,1,'easy','recovery'),(8,2,'easy','recovery'),(8,3,'long','recovery'),
  (9,0,'easy','peak'),(9,1,'threshold','peak'),(9,2,'tempo','peak'),(9,3,'long','peak'),
  (10,0,'easy','peak'),(10,1,'threshold','peak'),(10,2,'tempo','peak'),(10,3,'long','peak'),
  (11,0,'easy','taper'),(11,1,'tempo','taper'),(11,2,'easy','taper'),(11,3,'long','taper'),
  (12,0,'easy','race'),(12,1,'easy','race'),(12,3,'race','race')
),
day_map(slot, dow) as (values (0,0), (1,2), (2,3), (3,6))   -- Mon/Wed/Thu/Sun
insert into public.planned_sessions (
  user_id, block_id, scheduled_date, week_number, day_of_week,
  modality, session_label, status, phase
)
select
  :'user_id_param',
  b.id,
  b.starts_on + ((sg.week - 1) * 7 + dm.dow),
  sg.week,
  dm.dow,
  'run',
  sg.label,
  case when b.starts_on + ((sg.week - 1) * 7 + dm.dow) < current_date
       then 'completed' else 'planned' end,
  sg.training_phase
from new_block b, session_grid sg
join day_map dm on dm.slot = sg.slot;

-- 7. Food entries for the last 3 days — populates the Nutrition tab
delete from public.food_entries
where log_id in (
  select id from public.nutrition_logs where user_id = :'user_id_param'
);

with target_logs as (
  select id from public.nutrition_logs
  where user_id = :'user_id_param'
  and recorded_on >= current_date - 2
)
insert into public.food_entries (
  log_id, meal_type, food_name, quantity_g, carbs_g, protein_g, fat_g, fibre_g, calories
)
select tl.id, m.meal_type, m.food_name, m.qty, m.carbs, m.protein, m.fat, m.fibre, m.kcal
from target_logs tl,
lateral (values
  ('breakfast', 'Porridge with banana and honey',  250, 65,  9,  4,  6, 350),
  ('breakfast', 'Greek yoghurt and berries',       150, 14, 12,  4,  3, 140),
  ('lunch',     'Chicken and quinoa salad',        380, 55, 38, 14,  8, 520),
  ('snack',     'Flat white and almonds',          140, 12,  8, 18,  3, 240),
  ('dinner',    'Salmon, sweet potato and greens', 420, 48, 36, 22,  9, 580)
) as m(meal_type, food_name, qty, carbs, protein, fat, fibre, kcal);

commit;

-- After running, verify with:
--   select count(*) from public.activities    where user_id = :'user_id_param';   -- should be ~16
--   select count(*) from public.symptom_logs  where user_id = :'user_id_param';   -- 21
--   select count(*) from public.nutrition_logs where user_id = :'user_id_param';  -- 14
--   select * from public.user_profiles where id = :'user_id_param';
--
-- Then trigger an Insight by opening the app, navigating to Insights — the Edge
-- Function will populate insights_cache from this seed data.
