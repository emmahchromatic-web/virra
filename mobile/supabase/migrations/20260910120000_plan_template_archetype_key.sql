-- 20260910120000_plan_template_archetype_key.sql
--
-- Card 266. archetypeForTemplate() worked out what kind of plan a template was
-- by regex-matching its NAME, which made the name load-bearing: renaming
-- "Path to parkrun" to "Your first 5K" silently stopped it being a walk-run
-- plan and handed a continuous-running plan to people who cannot yet run
-- continuously. Run template content is edited directly in the dashboard,
-- where no test can intervene, so the coupling had to go.
--
-- The column is the answer where it is set. The name regexes remain the
-- fallback for any row without one, so nothing breaks if a row is added and
-- this is forgotten.
--
-- No foreign key and no check constraint on purpose. The archetype list lives
-- in code (src/lib/runProgramme/archetypes.ts), which is where it is versioned
-- and tested; a key naming nothing is ignored and the row falls back, which is
-- a better failure than an insert the dashboard refuses.
--
-- WHY THE FOUR GOAL PLANS ARE 'distance_goal' AND NOT 'race':
-- whether a goal plan is a race plan or a distance-goal plan depends on
-- whether the RUNNER set a race date. That is a fact about the runner, not
-- about the template. The stored key names the base archetype and the app
-- still upgrades distance_goal -> race when a date is set. Freezing 'race'
-- here would stop Beginner 5K tapering for a real race.
--
-- This backfill is a deliberate no-op: every value below is what
-- archetypeForTemplate already returns for that row today, and
-- __tests__/lib/runProgramme/archetypeKey.test.ts asserts exactly that.
--
-- Idempotent: keyed on name, and only fills rows that are still null.
--
-- NOT applied here — the parent applies it.

begin;

alter table public.plan_templates
  add column if not exists archetype_key text;

comment on column public.plan_templates.archetype_key is
  'Which run archetype this template is, from src/lib/runProgramme/archetypes.ts. '
  'Null falls back to matching the template name, which is fragile — set it. '
  'Goal plans use distance_goal; the app upgrades that to race when the runner '
  'sets an event date.';

with seed(name, archetype_key) as (values
  ('New to Running',      'new_to_running'),
  ('Path to parkrun',     'path_to_parkrun'),
  ('Return to Running',   'return_after_break'),
  ('Beginner 5K',         'distance_goal'),
  ('Intermediate 10K',    'distance_goal'),
  ('Half Marathon Build', 'distance_goal'),
  ('Marathon Foundation', 'distance_goal'),
  ('General Fitness',     'train_your_way')
)
update public.plan_templates t
   set archetype_key = seed.archetype_key
  from seed
 where t.name = seed.name
   and t.sport_type = 'run'
   and t.archetype_key is null;

commit;
