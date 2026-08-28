-- Repoint recipe ingredients at the staples now in COMMON_FOODS.
--
-- Ten foods that recipes are genuinely built from were missing from the app's
-- catalogue, so 34 ingredient rows carried standard reference values and a null
-- `common_food_id`. They now exist (see the same-numbered change to
-- src/lib/commonFoods.ts), so those rows can point at them.
--
-- This updates the macros as well as the id. Setting the id alone would make it
-- a lie: `common_food_id` claims "these numbers came from that catalogue entry",
-- and for one row (Sultanas, previously priced as raisins) the numbers genuinely
-- move. Recipe totals are then re-derived and re-checked.
--
-- Spices and herbs are deliberately left on reference values. They are a real
-- gap in provenance, but nobody logs 2 g of cumin and adding them to the
-- catalogue would clutter every food search to fix a rounding error.

begin;

update public.recipe_ingredients set
  common_food_id = 'bacon-medallions',
  calories  = round(quantity * 120 / 100.0, 2),
  carbs_g   = round(quantity * 0.5 / 100.0, 2),
  protein_g = round(quantity * 22.0 / 100.0, 2),
  fat_g     = round(quantity * 3.5 / 100.0, 2),
  fibre_g   = round(quantity * 0.0 / 100.0, 2)
where food_name = 'Bacon medallions' and quantity is not null;

update public.recipe_ingredients set
  common_food_id = 'ricotta',
  calories  = round(quantity * 156 / 100.0, 2),
  carbs_g   = round(quantity * 3.0 / 100.0, 2),
  protein_g = round(quantity * 11.0 / 100.0, 2),
  fat_g     = round(quantity * 11.0 / 100.0, 2),
  fibre_g   = round(quantity * 0.0 / 100.0, 2)
where food_name = 'Ricotta' and quantity is not null;

update public.recipe_ingredients set
  common_food_id = 'skyr-plain',
  calories  = round(quantity * 63 / 100.0, 2),
  carbs_g   = round(quantity * 4.0 / 100.0, 2),
  protein_g = round(quantity * 10.5 / 100.0, 2),
  fat_g     = round(quantity * 0.2 / 100.0, 2),
  fibre_g   = round(quantity * 0.0 / 100.0, 2)
where food_name = 'Plain skyr' and quantity is not null;

update public.recipe_ingredients set
  common_food_id = 'cornflour',
  calories  = round(quantity * 381 / 100.0, 2),
  carbs_g   = round(quantity * 91.0 / 100.0, 2),
  protein_g = round(quantity * 0.3 / 100.0, 2),
  fat_g     = round(quantity * 0.1 / 100.0, 2),
  fibre_g   = round(quantity * 0.9 / 100.0, 2)
where food_name = 'Cornflour' and quantity is not null;

update public.recipe_ingredients set
  common_food_id = 'black-beans-canned-drained',
  calories  = round(quantity * 91 / 100.0, 2),
  carbs_g   = round(quantity * 16.0 / 100.0, 2),
  protein_g = round(quantity * 6.0 / 100.0, 2),
  fat_g     = round(quantity * 0.5 / 100.0, 2),
  fibre_g   = round(quantity * 6.5 / 100.0, 2)
where food_name = 'Black beans, canned' and quantity is not null;

update public.recipe_ingredients set
  common_food_id = 'sultanas-dried',
  calories  = round(quantity * 275 / 100.0, 2),
  carbs_g   = round(quantity * 69.4 / 100.0, 2),
  protein_g = round(quantity * 2.7 / 100.0, 2),
  fat_g     = round(quantity * 0.4 / 100.0, 2),
  fibre_g   = round(quantity * 2.0 / 100.0, 2)
where food_name = 'Sultanas' and quantity is not null;

update public.recipe_ingredients set
  common_food_id = 'pineapple-canned-in-juice',
  calories  = round(quantity * 60 / 100.0, 2),
  carbs_g   = round(quantity * 14.5 / 100.0, 2),
  protein_g = round(quantity * 0.4 / 100.0, 2),
  fat_g     = round(quantity * 0.1 / 100.0, 2),
  fibre_g   = round(quantity * 1.0 / 100.0, 2)
where food_name = 'Canned pineapple' and quantity is not null;

update public.recipe_ingredients set
  common_food_id = 'sesame-oil-toasted',
  calories  = round(quantity * 899 / 100.0, 2),
  carbs_g   = round(quantity * 0.0 / 100.0, 2),
  protein_g = round(quantity * 0.0 / 100.0, 2),
  fat_g     = round(quantity * 99.9 / 100.0, 2),
  fibre_g   = round(quantity * 0.0 / 100.0, 2)
where food_name = 'Toasted sesame oil' and quantity is not null;

update public.recipe_ingredients set
  common_food_id = 'soy-sauce-light',
  calories  = round(quantity * 53 / 100.0, 2),
  carbs_g   = round(quantity * 4.9 / 100.0, 2),
  protein_g = round(quantity * 8.1 / 100.0, 2),
  fat_g     = round(quantity * 0.1 / 100.0, 2),
  fibre_g   = round(quantity * 0.8 / 100.0, 2)
where food_name = 'Soy sauce' and quantity is not null;

update public.recipe_ingredients set
  common_food_id = 'vegetable-stock-made-up',
  calories  = round(quantity * 4 / 100.0, 2),
  carbs_g   = round(quantity * 0.6 / 100.0, 2),
  protein_g = round(quantity * 0.2 / 100.0, 2),
  fat_g     = round(quantity * 0.1 / 100.0, 2),
  fibre_g   = round(quantity * 0.0 / 100.0, 2)
where food_name = 'Vegetable stock' and quantity is not null;

-- Re-derive every recipe's per-serving macros from its ingredient rows.
update public.recipes r set
  calories  = round(t.calories  / r.serves, 1),
  carbs_g   = round(t.carbs_g   / r.serves, 1),
  protein_g = round(t.protein_g / r.serves, 1),
  fat_g     = round(t.fat_g     / r.serves, 1),
  fibre_g   = case when t.fibre_known then round(t.fibre_g / r.serves, 1) end
from (
  select recipe_id,
         coalesce(sum(calories),  0) as calories,
         coalesce(sum(carbs_g),   0) as carbs_g,
         coalesce(sum(protein_g), 0) as protein_g,
         coalesce(sum(fat_g),     0) as fat_g,
         coalesce(sum(fibre_g),   0) as fibre_g,
         count(fibre_g) > 0          as fibre_known
  from public.recipe_ingredients group by recipe_id
) t
where t.recipe_id = r.id;

-- Same Atwater guard as the seeds, over the whole book.
do $$
declare bad record;
begin
  for bad in
    select id, calories, round(4*carbs_g + 4*protein_g + 9*fat_g, 1) as atwater
    from public.recipes
    where calories > 0
      and abs(calories - (4*carbs_g + 4*protein_g + 9*fat_g)) > 0.15 * calories
  loop
    raise exception 'Recipe % fails the Atwater check after backfill: % vs %',
      bad.id, bad.calories, bad.atwater;
  end loop;
end $$;

-- Prove the backfill actually did something, so a silent no-op cannot pass for
-- success if a food_name is ever renamed in a seed.
--
-- 159, not the 180 total. Ten staples were added, but Sultanas already carried
-- an id (it was priced as raisins, which this corrects), so only nine foods add
-- rows: 13 of them. That leaves 21 rows deliberately on reference values, all
-- spices, dried and fresh herbs, and two branded items (Biscoff, Eat Lean) that
-- belong in Open Food Facts rather than the catalogue.
--
-- An earlier draft of this migration asserted 175 and correctly rolled itself
-- back. The number below is measured, not hoped for.
do $$
declare n int;
begin
  select count(*) into n from public.recipe_ingredients where common_food_id is not null;
  if n < 159 then
    raise exception 'Only % ingredient rows carry a common_food_id; expected at least 159', n;
  end if;
end $$;

commit;
