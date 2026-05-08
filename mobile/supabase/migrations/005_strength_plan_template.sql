insert into public.plan_templates (id, name, sport_type, distance_goal, duration_weeks, description, sessions_json)
values (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'Gym 2×/week',
  'strength',
  null,
  8,
  'Upper/lower split designed to complement your run training without adding fatigue. Two sessions a week, progressive load, with a deload in week 4 and a taper in week 8.',
  '[
    {"week":1,"km":2,"label":"Base",     "sessions":["lower","upper"]},
    {"week":2,"km":2,"label":"Base",     "sessions":["lower","upper"]},
    {"week":3,"km":2,"label":"Build",    "sessions":["lower","upper"]},
    {"week":4,"km":1,"label":"Recovery", "sessions":["strength"]},
    {"week":5,"km":2,"label":"Build",    "sessions":["lower","upper"]},
    {"week":6,"km":2,"label":"Build",    "sessions":["lower","upper"]},
    {"week":7,"km":2,"label":"Peak",     "sessions":["lower","upper"]},
    {"week":8,"km":1,"label":"Taper",    "sessions":["strength"]}
  ]'::jsonb
)
on conflict (id) do nothing;
