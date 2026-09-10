-- Allow spoon and whole-item measures on recipe ingredients.
--
-- The book was authored metric on purpose: weights are what make a recipe's
-- numbers agree with what the same food logs as through search, and the
-- adaptation pipeline converted cups to grams for exactly that reason.
-- Spoons are the one case where that reads worse than it measures. "5 g
-- vanilla extract" is a figure nobody can act on at the counter; "1 tsp" is.
--
-- This is safe because the unit does no arithmetic. recipe_ingredients macros
-- are authored as absolute figures for the stated quantity of that ingredient
-- in the whole recipe, not per 100 g and not derived from the quantity, so
-- widening the unit changes presentation and nothing else.
--
-- Deliberately NOT widened: food_entries.quantity_unit stays g/ml. A logged
-- entry is a mass or a volume, and logRecipe writes one food_entries row for
-- the whole recipe rather than one per ingredient, so no spoon ever reaches it.
--
-- 'unit' counts whole things: one red pepper, two eggs. It prints as the bare
-- number, because the food name already says what is being counted.
--
-- Use weights for anything substantial. Spoons are for vanilla, spices, soy
-- sauce: quantities small enough that the gram figure is noise.

begin;

alter table public.recipe_ingredients drop constraint if exists recipe_ingredients_unit_check;
alter table public.recipe_ingredients add constraint recipe_ingredients_unit_check
  check (unit in ('g','ml','tsp','tbsp','unit'));

comment on column public.recipe_ingredients.unit is
  'How the quantity is written for the cook: g, ml, tsp, tbsp, or unit for '
  'whole things counted rather than measured. Presentation '
  'only. Macros on this row are absolute for the stated quantity, so no unit '
  'here is ever converted or multiplied. Not the same vocabulary as '
  'food_entries.quantity_unit, which is g/ml because a logged entry is a mass.';

commit;

notify pgrst, 'reload schema';
