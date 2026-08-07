-- Mirror migration: fibre_g on food_entries.
--
-- This column was applied directly to the live database via the Supabase SQL
-- editor and never made it into a repo migration, so a fresh database built
-- from migrations alone was missing it. The app treats fibre as a first-class
-- macro alongside carbs/protein/fat: it is selected on every food_entries read
-- (app/(app)/(tabs)/nutrition.tsx), summed into the daily totals, rendered as
-- its own MacroBar, and carries a per-load target in src/lib/nutritionTargets.ts.
--
-- Nullable with a 0 default rather than `not null` like its sibling macros:
-- rows logged before fibre existed have no value, which is why the app reads it
-- as `e.fibre_g ?? 0` in both nutrition.tsx and food-search.tsx.
--
-- Idempotent — re-running this against live is a no-op.

alter table public.food_entries
  add column if not exists fibre_g numeric default 0;

comment on column public.food_entries.fibre_g is
  'Dietary fibre in grams for this entry. Nullable: entries logged before the '
  'column existed have no value, so readers must treat null as 0.';
