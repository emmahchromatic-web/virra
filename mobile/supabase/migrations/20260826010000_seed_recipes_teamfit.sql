-- Seed: Emma's four #TeamFIT recipes.
--
-- Written by her for her own coaching clients, so VIRRA owns what it ships.
-- (The September packs in the same folder are Exceed Nutrition's, licensed for
-- coach-to-client delivery only, and are deliberately NOT here. See section 11
-- of RECIPE_BOOK_PROPOSAL.md.)
--
-- PROVISIONAL, pending Emma's content pass:
--   * `collection` assignments are a first guess.
--   * `intro` lines are drafts written to her cards' voice, not her words.
--   * `phases` and `loads` are deliberately EMPTY, which the schema reads as
--     "suits any". Tagging a recipe to a cycle phase is the whole point of the
--     feature and is a judgement call that belongs to Emma, not to a guess
--     made at seed time. An empty array is the honest default until she makes
--     that pass; a wrong one would quietly mis-serve every rail.
--
-- Three corrections applied to the source cards, all confirmed 2026-08-26:
--   * Biscoff Overnight Oats: the card said 4376 kcal, a ten-fold typo.
--     Derived here from the ingredients instead.
--   * Biscoff Overnight Oats: the card was tagged VEGAN but contains skyr and
--     whey, both dairy. Now vegetarian.
--   * Prawn & Pineapple Stir-Fry: the card's ingredient list was contaminated
--     with Fruity Cous Cous's ingredients. Only the stir-fry's own are here,
--     and the added oils are counted, which the card's macros did not do.
--
-- Macros on `recipes` are NOT written by hand below. They are computed at the
-- end of this migration from the ingredient rows, so ingredients remain the
-- single source of truth and the two can never drift.

begin;

-- Re-runnable: cascades take the ingredients and steps with them.
delete from public.recipes where source = 'virra-teamfit';


-- Mini Frittata Bites: serves 6
insert into public.recipes (
  id, name, collection, collection_label, intro, meal_types, phases, loads,
  dietary, serves, prep_minutes, cook_minutes, source, sort_order
) values (
  'mini-frittata-bites', 'Mini Frittata Bites', 'batch-and-freeze', 'Batch and freeze',
  'Six of these in the fridge answer the question of what to eat after a morning session. They freeze too, so a batch on Sunday is a week of breakfasts you do not have to think about.',
  array['breakfast', 'snack']::text[], '{}'::text[], '{}'::text[],
  '{}'::text[], 6, 10, 20,
  'virra-teamfit', 10
);

insert into public.recipe_ingredients
  (recipe_id, position, food_name, quantity, unit, note, common_food_id,
   calories, carbs_g, protein_g, fat_g, fibre_g) values
  ('mini-frittata-bites', 1, 'Medium eggs', 300, 'g', '6 eggs, about 50 g each once shelled', 'whole-egg-raw', 429.0, 2.1, 37.5, 29.1, 0.0),
  ('mini-frittata-bites', 2, 'Milk', 20, 'ml', null, 'semi-skimmed-milk-as-packed', 10.0, 0.94, 0.7, 0.36, 0.0),
  ('mini-frittata-bites', 3, 'Spinach', 20, 'g', null, 'spinach-raw', 5.0, 0.32, 0.56, 0.16, 0.42),
  ('mini-frittata-bites', 4, 'Cherry tomatoes', 90, 'g', '6 tomatoes, about 15 g each', 'tomato-raw', 15.3, 2.79, 0.63, 0.27, 0.9),
  ('mini-frittata-bites', 5, 'Ricotta', 50, 'g', null, null, 78.0, 1.5, 5.5, 5.5, 0.0),
  ('mini-frittata-bites', 6, 'Red bell pepper', 80, 'g', 'half a pepper', 'bell-pepper-red-raw', 25.6, 4.8, 0.8, 0.32, 1.36),
  ('mini-frittata-bites', 7, 'Bacon medallions', 50, 'g', '2 medallions', null, 60.0, 0.25, 11.0, 1.75, 0.0),
  ('mini-frittata-bites', 8, 'Eat Lean cheese', 20, 'g', null, null, 36.0, 0.2, 7.2, 0.7, 0.0);

insert into public.recipe_steps (recipe_id, position, body) values
  ('mini-frittata-bites', 1, 'Preheat the oven to 180C, fan assisted.'),
  ('mini-frittata-bites', 2, 'Crack the eggs into a bowl, whisk thoroughly and season with salt and pepper.'),
  ('mini-frittata-bites', 3, 'Finely chop your spinach and other veggies and add to the bowl along with your chopped bacon medallions.'),
  ('mini-frittata-bites', 4, 'Spray a muffin tray with oil and evenly distribute the mixture between the 6 holes.'),
  ('mini-frittata-bites', 5, 'Place in the centre of the oven and bake for 18 to 20 minutes, until the top is golden and the bites are firm but springy to touch.'),
  ('mini-frittata-bites', 6, 'Enjoy warm, or pop in the fridge for up to 4 days. They freeze for up to 3 months.');

-- Biscoff Overnight Oats: serves 1
insert into public.recipes (
  id, name, collection, collection_label, intro, meal_types, phases, loads,
  dietary, serves, prep_minutes, cook_minutes, source, sort_order
) values (
  'biscoff-overnight-oats', 'Biscoff Overnight Oats', 'breakfast', 'Breakfast',
  'Made the night before, eaten cold, sweet enough to feel like a treat, and carrying nearly thirty grams of protein. The kind of breakfast that makes an early alarm easier.',
  array['breakfast']::text[], '{}'::text[], '{}'::text[],
  array['vegetarian']::text[], 1, 5, 0,
  'virra-teamfit', 10
);

insert into public.recipe_ingredients
  (recipe_id, position, food_name, quantity, unit, note, common_food_id,
   calories, carbs_g, protein_g, fat_g, fibre_g) values
  ('biscoff-overnight-oats', 1, 'Porridge oats', 45, 'g', null, 'rolled-porridge-oats-dry', 163.35, 27.0, 4.95, 3.6, 4.05),
  ('biscoff-overnight-oats', 2, 'Protein powder', 20, 'g', 'vanilla works best', 'whey-protein', 75.0, 1.2, 15.0, 1.0, 0.0),
  ('biscoff-overnight-oats', 3, 'Almond milk', 100, 'ml', null, 'almond-milk-unsweetened', 13.0, 0.1, 0.4, 1.1, 0.0),
  ('biscoff-overnight-oats', 4, 'Plain skyr', 60, 'g', null, null, 37.8, 2.4, 6.3, 0.12, 0.0),
  ('biscoff-overnight-oats', 5, 'Biscoff spread', 15, 'g', null, null, 88.2, 8.25, 0.51, 5.85, 0.18),
  ('biscoff-overnight-oats', 6, 'Biscoff biscuit', 7.6, 'g', '1 biscuit', null, 36.78, 5.4, 0.41, 1.48, 0.15);

insert into public.recipe_steps (recipe_id, position, body) values
  ('biscoff-overnight-oats', 1, 'Mix together your oats, milk, yoghurt and protein powder until the mixture is smooth. Any flavour works, but vanilla is best for this.'),
  ('biscoff-overnight-oats', 2, 'Melt the Biscoff spread, either microwaved for 20 seconds or with a little boiling water. Stir until silky.'),
  ('biscoff-overnight-oats', 3, 'Pop your mixture in a Kilner jar, or any bowl you can cover, and top with the melted spread.'),
  ('biscoff-overnight-oats', 4, 'Crumble your Biscoff biscuit over the top, or be an animal and dunk it.'),
  ('biscoff-overnight-oats', 5, 'Leave overnight and enjoy.');

-- Fruity Cous Cous: serves 2
insert into public.recipes (
  id, name, collection, collection_label, intro, meal_types, phases, loads,
  dietary, serves, prep_minutes, cook_minutes, source, sort_order
) values (
  'fruity-cous-cous', 'Fruity Cous Cous', 'pre-run', 'Pre-run and race morning',
  'Ten minutes, nothing hotter than a kettle, and it travels well. Carbs and something bright for the days when lunch has to happen between other things.',
  array['lunch']::text[], '{}'::text[], '{}'::text[],
  array['vegan', 'vegetarian', 'df']::text[], 2, 10, 0,
  'virra-teamfit', 10
);

insert into public.recipe_ingredients
  (recipe_id, position, food_name, quantity, unit, note, common_food_id,
   calories, carbs_g, protein_g, fat_g, fibre_g) values
  ('fruity-cous-cous', 1, 'Couscous', 120, 'g', null, 'couscous-dry', 451.2, 92.4, 15.6, 2.28, 6.0),
  ('fruity-cous-cous', 2, 'Sultanas', 30, 'g', null, 'raisins-dried', 81.6, 20.7, 0.63, 0.12, 0.6),
  ('fruity-cous-cous', 3, 'Dried apricots', 30, 'g', null, 'apricots-dried', 56.4, 12.9, 1.2, 0.15, 2.19),
  ('fruity-cous-cous', 4, 'Salad tomatoes', 220, 'g', '2 tomatoes, about 110 g each', 'tomato-raw', 37.4, 6.82, 1.54, 0.66, 2.2),
  ('fruity-cous-cous', 5, 'Vegetable stock', 250, 'ml', null, null, 10.0, 1.5, 0.5, 0.25, 0.0),
  ('fruity-cous-cous', 6, 'Flaked almonds', 15, 'g', null, 'almonds-raw', 91.8, 1.03, 3.17, 8.37, 1.11),
  ('fruity-cous-cous', 7, 'Lemon', 10, 'g', 'a wedge', 'lemon-raw', 1.9, 0.32, 0.1, 0.03, 0.28),
  ('fruity-cous-cous', 8, 'Olive oil', 10, 'ml', 'a drizzle, to finish', 'olive-oil-as-packed', 89.9, 0.0, 0.0, 9.99, 0.0);

insert into public.recipe_steps (recipe_id, position, body) values
  ('fruity-cous-cous', 1, 'In a heatproof dish, combine your couscous, sultanas and diced apricots.'),
  ('fruity-cous-cous', 2, 'Boil a kettle and dissolve your vegetable stock cube in 250 ml of boiling water.'),
  ('fruity-cous-cous', 3, 'Pour your stock over the couscous and fruit and give everything a good stir. Cover with a tea towel and set to one side, leaving it to soak up the stock for 5 to 10 minutes, stirring occasionally to make it fluffy.'),
  ('fruity-cous-cous', 4, 'Dice your tomatoes and cut a lemon into wedges.'),
  ('fruity-cous-cous', 5, 'Once the couscous has absorbed the stock, add a drizzle of olive oil, the juice of one lemon wedge and the chopped tomatoes. Stir, top with the flaked almonds and serve.');

-- Prawn & Pineapple Stir-Fry: serves 2
insert into public.recipes (
  id, name, collection, collection_label, intro, meal_types, phases, loads,
  dietary, serves, prep_minutes, cook_minutes, source, sort_order
) values (
  'prawn-pineapple-stir-fry', 'Prawn & Pineapple Stir-Fry', 'quick-dinners', 'Quick dinners',
  'On the table in twenty-five minutes, and the juice from the pineapple tin does the work of a shop-bought sauce. A good one the evening before a long run.',
  array['dinner']::text[], '{}'::text[], '{}'::text[],
  array['pescatarian', 'df']::text[], 2, 10, 15,
  'virra-teamfit', 10
);

insert into public.recipe_ingredients
  (recipe_id, position, food_name, quantity, unit, note, common_food_id,
   calories, carbs_g, protein_g, fat_g, fibre_g) values
  ('prawn-pineapple-stir-fry', 1, 'Cornflour', 8, 'g', '1 tbsp', null, 30.48, 7.28, 0.02, 0.01, 0.07),
  ('prawn-pineapple-stir-fry', 2, 'Dried chilli flakes', 1, 'g', 'half a tsp', null, 2.82, 0.5, 0.12, 0.14, 0.27),
  ('prawn-pineapple-stir-fry', 3, 'Garlic', 6, 'g', '2 cloves, finely sliced', 'garlic-raw', 5.88, 0.96, 0.47, 0.04, 0.25),
  ('prawn-pineapple-stir-fry', 4, 'Red pepper', 160, 'g', '1 pepper, deseeded and cut into thin strips', 'bell-pepper-red-raw', 51.2, 9.6, 1.6, 0.64, 2.72),
  ('prawn-pineapple-stir-fry', 5, 'Toasted sesame oil', 10, 'ml', null, null, 89.9, 0.0, 0.0, 9.99, 0.0),
  ('prawn-pineapple-stir-fry', 6, 'Egg noodles', 124, 'g', '2 nests', 'egg-noodles-dry', 476.16, 90.52, 14.88, 5.46, 3.72),
  ('prawn-pineapple-stir-fry', 7, 'King prawns', 171, 'g', 'raw, peeled', 'king-prawns-raw-raw', 121.41, 0.0, 28.21, 0.51, 0.0),
  ('prawn-pineapple-stir-fry', 8, 'Soy sauce', 15, 'ml', null, null, 7.95, 0.73, 1.21, 0.01, 0.12),
  ('prawn-pineapple-stir-fry', 9, 'Spring onion', 15, 'g', '1 onion, sliced on the diagonal', 'spring-onion-raw', 3.45, 0.45, 0.3, 0.07, 0.22),
  ('prawn-pineapple-stir-fry', 10, 'Canned pineapple', 220, 'g', 'in juice, save the juice for the sauce', null, 132.0, 31.9, 0.88, 0.22, 2.2),
  ('prawn-pineapple-stir-fry', 11, 'Vegetable oil', 10, 'ml', 'a drizzle, for the pan', 'olive-oil-as-packed', 89.9, 0.0, 0.0, 9.99, 0.0);

insert into public.recipe_steps (recipe_id, position, body) values
  ('prawn-pineapple-stir-fry', 1, 'Boil a kettle. Deseed the red pepper and cut into thin strips.'),
  ('prawn-pineapple-stir-fry', 2, 'Remove the pineapple from the can, saving the can and juice for later, and chop into quarters.'),
  ('prawn-pineapple-stir-fry', 3, 'Heat a large, wide-based pan with a drizzle of vegetable oil over a high heat. Once hot, add the chopped pepper and pineapple quarters with a pinch of salt and cook for 4 to 5 minutes, until the pineapple has slightly caramelised.'),
  ('prawn-pineapple-stir-fry', 4, 'Meanwhile, peel and finely slice the garlic. Slice, do not chop.'),
  ('prawn-pineapple-stir-fry', 5, 'Add the egg noodles to a pot and cover with boiled water until fully submerged. Bring to the boil over a high heat and cook for 5 to 6 minutes, until cooked with a slight bite. Drain and set aside, reserving a cup of the starchy noodle water.'),
  ('prawn-pineapple-stir-fry', 6, 'Lower the heat to medium-high and add the sliced garlic and chilli flakes to the pan. Cook for 1 to 2 minutes until softened. Go easy on the chilli if you would rather.'),
  ('prawn-pineapple-stir-fry', 7, 'While the garlic softens, add the soy sauce and toasted sesame oil to the can with the reserved pineapple juice. This is your stir-fry sauce.'),
  ('prawn-pineapple-stir-fry', 8, 'Once the garlic has softened, add the cornflour to the pan and mix everything well.'),
  ('prawn-pineapple-stir-fry', 9, 'Add the king prawns and the stir-fry sauce and cook for 4 to 5 minutes, until the prawns are cooked through and the sauce is sticky.'),
  ('prawn-pineapple-stir-fry', 10, 'While the prawns cook, trim and slice the spring onion on the diagonal.'),
  ('prawn-pineapple-stir-fry', 11, 'Add the drained noodles to the pan with a splash of the reserved starchy noodle water to loosen the sauce, and stir everything together.'),
  ('prawn-pineapple-stir-fry', 12, 'Serve with the sliced spring onion sprinkled over the top.');

-- ---------------------------------------------------------------------------
-- Derive the per-serving macros from the ingredient rows.
-- ---------------------------------------------------------------------------
-- This is the step that makes `recipes` a cache of `recipe_ingredients` rather
-- than a second, hand-typed set of numbers that can disagree with the first.
--
-- Rounded to one decimal, matching scaleFood() in src/lib/commonFoods.ts so a
-- recipe's macros and the same food logged through search agree on precision.
--
-- fibre_g is left NULL when no ingredient supplied one: null means unknown,
-- and summing an all-null set to zero would silently claim a recipe has no
-- fibre. Every recipe seeded here does have fibre data, so this is a guard for
-- future content rather than a live case.
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

-- Atwater sanity check on the seeded content. 4 kcal per gram of carbohydrate
-- and protein, 9 per gram of fat. Content we did not compute ourselves can
-- carry transcription errors, and this is the cheap way to catch them: it is
-- what flagged the Biscoff card's ten-fold calorie typo. A 15% band tolerates
-- rounding, fibre and alcohol without tolerating a misplaced decimal point.
do $$
declare bad record;
begin
  for bad in
    select id, calories, round(4*carbs_g + 4*protein_g + 9*fat_g, 1) as atwater
    from public.recipes
    where calories > 0
      and abs(calories - (4*carbs_g + 4*protein_g + 9*fat_g)) > 0.15 * calories
  loop
    raise exception 'Recipe % fails the Atwater check: % kcal stated, % from macros',
      bad.id, bad.calories, bad.atwater;
  end loop;
end $$;

commit;
