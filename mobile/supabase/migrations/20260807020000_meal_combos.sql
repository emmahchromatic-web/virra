-- Mirror migration: meal_combos ("MY MEALS").
--
-- This table was applied directly to the live database via the Supabase SQL
-- editor and never made it into a repo migration, so a fresh database built
-- from migrations alone was missing it entirely.
--
-- A combo is a named group of foods the user logs together. It is written from
-- the "Save as meal" flow in app/(app)/(tabs)/nutrition.tsx once a meal has two
-- or more entries, and read back in app/(app)/food-search.tsx, which lists the
-- combos for the meal type being logged and bumps last_used_at on selection.
--
-- Column shapes are inferred from that app usage; the column names below were
-- each verified present on the live database. Because everything here is
-- guarded, re-running against live is a no-op and the live definitions win
-- wherever the hand-applied ones differ in nullability or default.

create table if not exists public.meal_combos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,              -- user-supplied, from the save prompt
  meal_type    text not null,
  items_json   jsonb not null default '[]'::jsonb,  -- [{food_name, quantity_g, quantity_unit, calories, carbs_g, protein_g, fat_g, fibre_g}]
  last_used_at timestamptz,                -- null until the combo is logged again
  created_at   timestamptz default now()
);

-- Same four meal types as food_entries.meal_type.
alter table public.meal_combos
  drop constraint if exists meal_combos_meal_type_check;
alter table public.meal_combos
  add constraint meal_combos_meal_type_check
  check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack'));

-- User-owned rows. The app's read in food-search.tsx filters on meal_type only
-- and relies on RLS for the user scoping, so the policy is load-bearing, not
-- just defence in depth.
alter table public.meal_combos enable row level security;

drop policy if exists "owner_all" on public.meal_combos;
create policy "owner_all" on public.meal_combos
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Serves the combo list: user (via RLS) + meal_type, most recently used first.
create index if not exists meal_combos_user_meal_last_used_idx
  on public.meal_combos (user_id, meal_type, last_used_at desc);
