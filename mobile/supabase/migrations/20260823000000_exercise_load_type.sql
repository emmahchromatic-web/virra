-- Which exercises actually take a weight.
--
-- The logger rendered a kg field on every exercise, including stretches, banded
-- activation work and plyometrics, where it is meaningless (Trello 195). Section
-- is the wrong lever: Power & Core is a mix of loaded raises and bodyweight
-- plyos, and Strength is a mix of barbell work and a whole bodyweight tier.
--
-- So this is a per-exercise property:
--   weighted  the movement is loaded; show the kg field (default)
--   optional  bodyweight by default, but people do load it (vest, held
--             dumbbell); hide the field behind an "add weight" tap
--   none      never loaded; no kg field at all
--
-- Editable by hand afterwards: one cell per exercise in the Table Editor.

begin;

alter table public.exercises
  add column if not exists load_type text not null default 'weighted';

alter table public.exercises
  drop constraint if exists exercises_load_type_check;

alter table public.exercises
  add constraint exercises_load_type_check
  check (load_type in ('weighted', 'optional', 'none'));

-- Never loaded: mobility, activation, plyometrics and isometric core holds.
update public.exercises set load_type = 'none' where name in (
  -- Mobility
  '90/90', '90/90s', 'Squat & Reach', 'World''s Greatest Stretch',
  -- Activation
  'Banded Air Squats', 'Banded Glute Bridges', 'Banded Monster Walks',
  'Banded Pull-aparts', 'Banded Strict Press', 'Banded Upright Rows',
  'Bodyweight Squat (tempo)', 'Prone W-Raise', 'Prone Y-Raise',
  'Side-lying Hip Abduction', 'Single-leg Glute Bridge', 'Split Squat Hold',
  'World''s Greatest Stretch flow',
  -- Power & Core: jumps, hops, bounds, planks and holds
  'Banded Pallof Press', 'Bear Plank with Reach', 'Box Jumps',
  'Copenhagen Plank', 'Copenhagen Plank (top-leg raise)', 'Dead Bug',
  'Explosive Jump Squat', 'Explosive Single-leg Hops', 'Hanging Knee Raises',
  'Hollow Hold', 'Lateral Skater Bounds', 'Lying Leg Raises', 'Prone T-Raise',
  'Side Plank Banded Knee Drives', 'Side Plank Knee Drive', 'Single-leg Hops',
  'Squat Jump', 'Squat Jumps'
);

-- Bodyweight by default, but progressed by adding load, so the field is
-- available on request rather than gone.
update public.exercises set load_type = 'optional' where name in (
  -- Strength, bodyweight tier
  'B-stance RDL', 'Bodyweight Good Morning', 'Bodyweight Hip Thrust',
  'Bodyweight Tempo RDL', 'Box Squat (to a chair)', 'Bulgarian Split Squat',
  'Feet-elevated Push-up', 'Heel-elevated Squat', 'Nordic Hamstring Curl',
  'Pike Push-up', 'Prone Floor Lat Pulldown', 'Prone Floor Row (Y-T-W)',
  'Push-up', 'Single-leg RDL', 'Slider Hamstring Curl', 'Sliding Leg Curl',
  -- The dumbbells here are handles for extra range of motion, not resistance.
  'Deficit DB Push-ups',
  -- Accessory, bodyweight calf and tibialis work
  'Eccentric Single-leg Calf Raises', 'Eccentric Single-leg Calf Raises (deficit)',
  'Wall Tibialis Raise'
);

commit;

notify pgrst, 'reload schema';
