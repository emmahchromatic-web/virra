-- 20260910000000_walk_run_plan_templates.sql
--
-- Card 257, second half. The walk-run archetypes (new_to_running,
-- path_to_parkrun, return_after_break) shipped with PR #51 and are reachable
-- only by template name: archetypeForTemplate matches /parkrun/,
-- /new to running/ and /return|comeback|back to running/. The live catalogue is
-- Beginner 5K, Intermediate 10K, Half Marathon Build, Marathon Foundation and
-- General Fitness, so none of it matches and nothing in the app can route a
-- run-walker anywhere. The code has been on main since #51 with no door to it.
--
-- These three rows are that door. The names are load-bearing: they are what
-- archetypeForTemplate reads, and renaming one silently changes which plan a
-- runner gets. An explicit archetype_key column would end that coupling and is
-- the right follow-up; it is not this migration.
--
-- sessions_json is the authored skeleton, not the plan. The generator computes
-- the ladder, the volume and the labels for the individual runner; what these
-- weeks carry is the shape (three sessions a week, all run-walk) that the day
-- picker and the sessions-per-week stepper read before generation runs.
--
-- Idempotent: keyed on name, delete-then-insert.
--
-- NOT applied here. The copy is Emma's call and the parent applies it.

begin;

-- Present in prod, absent from every migration in this repo: added here so a
-- database rebuilt from migrations alone matches what is live.
alter table public.plan_templates add column if not exists tagline     text;
alter table public.plan_templates add column if not exists description text;
alter table public.plan_templates add column if not exists sort_order  integer;
alter table public.plan_templates add column if not exists is_active   boolean not null default true;

delete from public.plan_templates
 where name in ('New to Running', 'Path to parkrun', 'Return to Running');

-- Sorted above the existing run plans: these are the way in, and a runner who
-- cannot yet run 5km should meet them before Beginner 5K rather than after it.
with base as (
  select coalesce(min(sort_order), 10) as first_run
    from public.plan_templates
   where sport_type = 'run'
     and is_active
),
seed(name, distance_goal, duration_weeks, offset_from_first, tagline, description) as (values
  (
    'New to Running', null::text, 9, -3,
    'Start from walking. No running needed.',
    'A nine week plan that turns walking into running, one interval at a time. Every session is a walk with short runs in it, and the runs get longer as the walks get shorter. You do not need to be able to run to start, and nothing here asks you to run further than you are ready to.'
  ),
  (
    'Path to parkrun', '5k', 9, -2,
    'Get to your first parkrun. Walk breaks included.',
    'Nine weeks to a 5K you finish rather than survive. Walk breaks are part of the plan, not a failure of it, and they shrink week by week until the last one is your parkrun. Built for anyone who wants to cross the line, not to chase a time.'
  ),
  (
    'Return to Running', null::text, 8, -1,
    'Coming back after time off, gently.',
    'Eight weeks to rebuild after a break, whether that break was three weeks or three years. Walk breaks are built in from week one so you are not asking your body to pick up where it left off. If you are returning from an injury that still needs attention, see a physio before you start this.'
  )
)
insert into public.plan_templates
  (name, sport_type, distance_goal, duration_weeks, description, tagline, sort_order, is_active, sessions_json)
select
  s.name,
  'run',
  s.distance_goal,
  s.duration_weeks,
  s.description,
  s.tagline,
  base.first_run + s.offset_from_first,
  true,
  (
    select jsonb_agg(
             jsonb_build_object(
               'week',  w,
               -- A fallback only: the generator recomputes every one of these
               -- for the runner in front of it.
               'km',    round((6 + w * 1.5)::numeric, 1),
               'label', case
                          when s.distance_goal is not null and w = s.duration_weeks
                            then 'Race'
                          else 'Base'
                        end,
               'sessions', case
                             when s.distance_goal is not null and w = s.duration_weeks
                               then jsonb_build_array('run_walk', 'run_walk', 'race')
                             else jsonb_build_array('run_walk', 'run_walk', 'run_walk')
                           end
             )
             order by w
           )
      from generate_series(1, s.duration_weeks) as w
  )
from seed s cross join base;

commit;
