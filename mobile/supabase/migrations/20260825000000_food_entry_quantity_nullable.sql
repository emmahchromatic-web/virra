-- Manual food entries have no quantity.
--
-- The "Log manually" panel on food-search asks only for a name and the macros:
-- the user is describing a portion she has already weighed in her head, so
-- there is no gram figure to record. The insert has always sent
-- quantity_g: null and the app has always typed the column as `number | null`
-- (nutrition.tsx renders kcal alone when it is absent), but the column was
-- created NOT NULL in 001_initial_schema.sql and was never relaxed.
--
-- Every manual entry therefore failed with a 23502 not-null violation. The
-- error was reported through appAlert(), which could not draw over
-- food-search's native modal, so the screen simply closed and the food never
-- appeared. Raised in build 11 UAT as "manual entry is not working".
--
-- Nullable is the honest shape: absent means "portion not quantified", which
-- is different from 0 g and must not be scaled by the edit modal.

alter table public.food_entries
  alter column quantity_g drop not null;

comment on column public.food_entries.quantity_g is
  'Portion size in the unit given by quantity_unit. NULL for manually entered '
  'foods, where the user supplies macros directly and never states a portion.';
