-- Seed: twenty-one more recipes, taking the book from 4 to 25.
--
-- Authored for VIRRA, in the format of Emma's own #TeamFIT cards: metric, UK
-- ingredients, exact weights, and her voice. Nothing here is derived from the
-- Exceed Nutrition packs, which are licensed for coach-to-client delivery only
-- (RECIPE_BOOK_PROPOSAL.md section 11).
--
-- 125 of the 147 ingredient rows (85%) are priced from the app's own
-- COMMON_FOODS catalogue and carry `common_food_id`, so a recipe's macros agree
-- with what the same food logs as through search. The remaining 22 are spices,
-- fresh herbs, stock, soy sauce and canned black beans, which the catalogue
-- does not hold; those use standard UK reference values.
--
-- As with the first seed, `recipes` macros are NOT hand-written. They are
-- computed at the end from the ingredient rows, so ingredients stay the single
-- source of truth and the two cannot drift.
--
-- Collections after this: Breakfast 5, Pre-run and race morning 5, Quick
-- dinners 6, Recovery and high-protein 5, Batch and freeze 4.
--
-- EMMA: every recipe, tag and intro line here is Claude's work, not yours. The
-- macros are arithmetic and can be trusted; the judgement calls (which phase,
-- which load, which collection, the voice of the intro) are yours to change.

begin;

delete from public.recipes where source = 'virra-authored';


-- Red Lentil & Vegetable Soup: serves 6, 237.1 kcal per serving
insert into public.recipes (
  id, name, collection, collection_label, intro, meal_types, phases, loads,
  dietary, serves, prep_minutes, cook_minutes, source, sort_order
) values (
  'red-lentil-vegetable-soup', 'Red Lentil & Vegetable Soup', 'batch-and-freeze', 'Batch and freeze',
  'Makes six, freezes for three months, and costs very little. The kind of thing that means a bad week still has lunch in it.',
  array['lunch', 'dinner']::text[], array['menstrual', 'luteal']::text[], array['rest', 'easy']::text[],
  array['vegan', 'vegetarian', 'gf', 'df']::text[], 6, 15, 35,
  'virra-authored', 20
);

insert into public.recipe_ingredients
  (recipe_id, position, food_name, quantity, unit, note, common_food_id,
   calories, carbs_g, protein_g, fat_g, fibre_g) values
  ('red-lentil-vegetable-soup', 1, 'Lentils, red', 300, 'g', 'dry weight, rinsed', 'lentils-red-dry', 954.0, 168.0, 72.0, 3.9, 33.0),
  ('red-lentil-vegetable-soup', 2, 'Vegetable stock', 1200, 'ml', null, null, 48.0, 7.2, 2.4, 1.2, 0.0),
  ('red-lentil-vegetable-soup', 3, 'Tomatoes, chopped', 400, 'g', null, 'tomatoes-chopped-canned', 72.0, 12.0, 4.0, 0.8, 4.0),
  ('red-lentil-vegetable-soup', 4, 'Carrot', 200, 'g', '2 large, diced', 'carrot-raw', 70.0, 15.8, 1.2, 0.6, 4.8),
  ('red-lentil-vegetable-soup', 5, 'Onion', 150, 'g', '1 large, diced', 'onion-raw', 54.0, 11.85, 1.8, 0.3, 2.1),
  ('red-lentil-vegetable-soup', 6, 'Celery', 100, 'g', '2 sticks, diced', 'celery-raw', 7.0, 0.9, 0.5, 0.2, 1.1),
  ('red-lentil-vegetable-soup', 7, 'Olive oil', 20, 'ml', null, 'olive-oil-as-packed', 179.8, 0.0, 0.0, 19.98, 0.0),
  ('red-lentil-vegetable-soup', 8, 'Garlic', 10, 'g', '3 cloves', 'garlic-raw', 9.8, 1.6, 0.79, 0.06, 0.41),
  ('red-lentil-vegetable-soup', 9, 'Ground cumin', 6, 'g', null, null, 22.5, 2.04, 1.08, 1.32, 0.66),
  ('red-lentil-vegetable-soup', 10, 'Lemon', 30, 'g', 'half a lemon, to finish', 'lemon-raw', 5.7, 0.96, 0.3, 0.09, 0.84);

insert into public.recipe_steps (recipe_id, position, body) values
  ('red-lentil-vegetable-soup', 1, 'Heat the oil in a large pan and cook the onion, carrot and celery gently for 10 minutes. Do not rush this part, it is where the flavour comes from.'),
  ('red-lentil-vegetable-soup', 2, 'Stir in the garlic and cumin for a minute.'),
  ('red-lentil-vegetable-soup', 3, 'Add the lentils, tomatoes and stock, and bring it up to a simmer.'),
  ('red-lentil-vegetable-soup', 4, 'Cook for 25 to 30 minutes, until the lentils have collapsed and it has thickened.'),
  ('red-lentil-vegetable-soup', 5, 'Season properly and squeeze the lemon in at the end.'),
  ('red-lentil-vegetable-soup', 6, 'Cool completely before freezing in portions. It keeps 5 days in the fridge and 3 months frozen.');

-- Turkey & Vegetable Chilli: serves 4, 383.5 kcal per serving
insert into public.recipes (
  id, name, collection, collection_label, intro, meal_types, phases, loads,
  dietary, serves, prep_minutes, cook_minutes, source, sort_order
) values (
  'turkey-vegetable-chilli', 'Turkey & Vegetable Chilli', 'batch-and-freeze', 'Batch and freeze',
  'Leaner than the beef version and every bit as good the next day. Make it on a Sunday and Wednesday looks after itself.',
  array['lunch', 'dinner']::text[], array['menstrual', 'ovulatory']::text[], array['moderate', 'hard']::text[],
  array['gf', 'df']::text[], 4, 15, 35,
  'virra-authored', 30
);

insert into public.recipe_ingredients
  (recipe_id, position, food_name, quantity, unit, note, common_food_id,
   calories, carbs_g, protein_g, fat_g, fibre_g) values
  ('turkey-vegetable-chilli', 1, 'Turkey mince', 500, 'g', null, 'turkey-mince-raw', 750.0, 0.0, 105.0, 37.5, 0.0),
  ('turkey-vegetable-chilli', 2, 'Kidney beans', 240, 'g', '1 tin, drained', 'kidney-beans-canned-drained', 240.0, 40.8, 16.8, 1.2, 14.4),
  ('turkey-vegetable-chilli', 3, 'Tomatoes, chopped', 400, 'g', null, 'tomatoes-chopped-canned', 72.0, 12.0, 4.0, 0.8, 4.0),
  ('turkey-vegetable-chilli', 4, 'Bell pepper, red', 160, 'g', '1 pepper, diced', 'bell-pepper-red-raw', 51.2, 9.6, 1.6, 0.64, 2.72),
  ('turkey-vegetable-chilli', 5, 'Onion', 150, 'g', '1 large, diced', 'onion-raw', 54.0, 11.85, 1.8, 0.3, 2.1),
  ('turkey-vegetable-chilli', 6, 'Sweetcorn', 100, 'g', 'tinned, drained', 'sweetcorn-canned', 122.0, 26.6, 2.9, 1.2, 1.4),
  ('turkey-vegetable-chilli', 7, 'Rapeseed oil', 20, 'ml', null, 'rapeseed-oil-as-packed', 179.8, 0.0, 0.0, 19.98, 0.0),
  ('turkey-vegetable-chilli', 8, 'Garlic', 10, 'g', '3 cloves', 'garlic-raw', 9.8, 1.6, 0.79, 0.06, 0.41),
  ('turkey-vegetable-chilli', 9, 'Ground cumin', 8, 'g', null, null, 30.0, 2.72, 1.44, 1.76, 0.88),
  ('turkey-vegetable-chilli', 10, 'Smoked paprika', 6, 'g', null, null, 16.92, 2.04, 0.84, 0.78, 2.1),
  ('turkey-vegetable-chilli', 11, 'Dried chilli flakes', 3, 'g', 'to taste', null, 8.46, 1.5, 0.36, 0.42, 0.81);

insert into public.recipe_steps (recipe_id, position, body) values
  ('turkey-vegetable-chilli', 1, 'Heat the oil in a large pan and brown the turkey mince in two batches. One batch steams and goes grey.'),
  ('turkey-vegetable-chilli', 2, 'Add the onion and pepper and cook for 6 to 7 minutes.'),
  ('turkey-vegetable-chilli', 3, 'Stir in the garlic, cumin, paprika and chilli and cook for a minute until fragrant.'),
  ('turkey-vegetable-chilli', 4, 'Add the tomatoes, beans and sweetcorn, season well, and simmer gently for 25 minutes.'),
  ('turkey-vegetable-chilli', 5, 'Taste and adjust the salt and chilli at the end, not the beginning.'),
  ('turkey-vegetable-chilli', 6, 'Cool fully before portioning. Fridge 4 days, freezer 3 months.');

-- Sweet Potato & Black Bean Chilli: serves 4, 348.0 kcal per serving
insert into public.recipes (
  id, name, collection, collection_label, intro, meal_types, phases, loads,
  dietary, serves, prep_minutes, cook_minutes, source, sort_order
) values (
  'sweet-potato-black-bean-chilli', 'Sweet Potato & Black Bean Chilli', 'batch-and-freeze', 'Batch and freeze',
  'The vegan one that nobody feels short-changed by. Sweet potato gives it body, and the carbohydrate makes it a proper post-session dinner rather than a side.',
  array['lunch', 'dinner']::text[], array['luteal', 'ovulatory']::text[], array['moderate', 'hard']::text[],
  array['vegan', 'vegetarian', 'gf', 'df']::text[], 4, 15, 35,
  'virra-authored', 40
);

insert into public.recipe_ingredients
  (recipe_id, position, food_name, quantity, unit, note, common_food_id,
   calories, carbs_g, protein_g, fat_g, fibre_g) values
  ('sweet-potato-black-bean-chilli', 1, 'Sweet potato', 600, 'g', 'peeled and cubed', 'sweet-potato-raw', 522.0, 126.0, 9.6, 1.8, 14.4),
  ('sweet-potato-black-bean-chilli', 2, 'Black beans, canned', 480, 'g', '2 tins, drained', null, 436.8, 76.8, 28.8, 2.4, 31.2),
  ('sweet-potato-black-bean-chilli', 3, 'Tomatoes, chopped', 400, 'g', null, 'tomatoes-chopped-canned', 72.0, 12.0, 4.0, 0.8, 4.0),
  ('sweet-potato-black-bean-chilli', 4, 'Bell pepper, red', 160, 'g', 'diced', 'bell-pepper-red-raw', 51.2, 9.6, 1.6, 0.64, 2.72),
  ('sweet-potato-black-bean-chilli', 5, 'Onion', 150, 'g', '1 large, diced', 'onion-raw', 54.0, 11.85, 1.8, 0.3, 2.1),
  ('sweet-potato-black-bean-chilli', 6, 'Vegetable stock', 400, 'ml', null, null, 16.0, 2.4, 0.8, 0.4, 0.0),
  ('sweet-potato-black-bean-chilli', 7, 'Olive oil', 20, 'ml', null, 'olive-oil-as-packed', 179.8, 0.0, 0.0, 19.98, 0.0),
  ('sweet-potato-black-bean-chilli', 8, 'Garlic', 10, 'g', '3 cloves', 'garlic-raw', 9.8, 1.6, 0.79, 0.06, 0.41),
  ('sweet-potato-black-bean-chilli', 9, 'Ground cumin', 8, 'g', null, null, 30.0, 2.72, 1.44, 1.76, 0.88),
  ('sweet-potato-black-bean-chilli', 10, 'Smoked paprika', 6, 'g', null, null, 16.92, 2.04, 0.84, 0.78, 2.1),
  ('sweet-potato-black-bean-chilli', 11, 'Coriander, fresh', 15, 'g', 'to finish', null, 3.45, 0.14, 0.32, 0.07, 0.42);

insert into public.recipe_steps (recipe_id, position, body) values
  ('sweet-potato-black-bean-chilli', 1, 'Heat the oil and cook the onion and pepper for 7 minutes until soft.'),
  ('sweet-potato-black-bean-chilli', 2, 'Add the garlic, cumin and paprika for a minute.'),
  ('sweet-potato-black-bean-chilli', 3, 'Stir in the sweet potato, beans, tomatoes and stock.'),
  ('sweet-potato-black-bean-chilli', 4, 'Simmer for 25 to 30 minutes, until the sweet potato is tender but still holding its shape. Stir now and then so it does not catch.'),
  ('sweet-potato-black-bean-chilli', 5, 'Season, and scatter the coriander over just before serving.'),
  ('sweet-potato-black-bean-chilli', 6, 'Cool completely before freezing. Fridge 4 days, freezer 3 months.');

-- Smoked Salmon Scrambled Eggs: serves 1, 444.6 kcal per serving
insert into public.recipes (
  id, name, collection, collection_label, intro, meal_types, phases, loads,
  dietary, serves, prep_minutes, cook_minutes, source, sort_order
) values (
  'smoked-salmon-scrambled-eggs', 'Smoked Salmon Scrambled Eggs', 'breakfast', 'Breakfast',
  'The breakfast to make when you want the day to start well rather than just start. Thirty grams of protein before you have properly woken up.',
  array['breakfast']::text[], array['follicular', 'ovulatory']::text[], array['easy', 'moderate']::text[],
  array['pescatarian']::text[], 1, 5, 8,
  'virra-authored', 20
);

insert into public.recipe_ingredients
  (recipe_id, position, food_name, quantity, unit, note, common_food_id,
   calories, carbs_g, protein_g, fat_g, fibre_g) values
  ('smoked-salmon-scrambled-eggs', 1, 'Whole egg', 100, 'g', '2 large eggs', 'whole-egg-raw', 143.0, 0.7, 12.5, 9.7, 0.0),
  ('smoked-salmon-scrambled-eggs', 2, 'Salmon, smoked', 40, 'g', null, 'salmon-smoked-as-eaten', 56.8, 0.0, 10.16, 1.8, 0.0),
  ('smoked-salmon-scrambled-eggs', 3, 'Semi-skimmed milk', 30, 'ml', null, 'semi-skimmed-milk-as-packed', 15.0, 1.41, 1.05, 0.51, 0.0),
  ('smoked-salmon-scrambled-eggs', 4, 'Butter', 10, 'g', null, 'butter-as-eaten', 74.4, 0.06, 0.05, 8.2, 0.0),
  ('smoked-salmon-scrambled-eggs', 5, 'Bread, sourdough', 60, 'g', '1 thick slice, toasted', 'bread-sourdough-as-eaten', 153.6, 30.6, 5.4, 0.72, 1.44),
  ('smoked-salmon-scrambled-eggs', 6, 'Parsley, fresh', 5, 'g', 'chopped, to finish', null, 1.8, 0.1, 0.15, 0.04, 0.17);

insert into public.recipe_steps (recipe_id, position, body) values
  ('smoked-salmon-scrambled-eggs', 1, 'Whisk the eggs with the milk and a good grind of pepper. Do not season with salt yet, the salmon brings plenty.'),
  ('smoked-salmon-scrambled-eggs', 2, 'Melt the butter in a cold pan over a low heat, then add the eggs.'),
  ('smoked-salmon-scrambled-eggs', 3, 'Stir slowly and constantly. Low and slow is the whole trick: pull the pan off the heat while they still look slightly underdone, because they carry on cooking.'),
  ('smoked-salmon-scrambled-eggs', 4, 'Toast the sourdough and tear the smoked salmon over it.'),
  ('smoked-salmon-scrambled-eggs', 5, 'Spoon the eggs on top, scatter with parsley and eat immediately.');

-- Banana & Peanut Butter Porridge: serves 1, 596.2 kcal per serving
insert into public.recipes (
  id, name, collection, collection_label, intro, meal_types, phases, loads,
  dietary, serves, prep_minutes, cook_minutes, source, sort_order
) values (
  'banana-peanut-porridge', 'Banana & Peanut Butter Porridge', 'breakfast', 'Breakfast',
  'Warm, sweet and genuinely filling, with enough carbohydrate behind it to hold up a hard morning. The peanut butter is not optional.',
  array['breakfast']::text[], array['ovulatory', 'luteal']::text[], array['moderate', 'hard']::text[],
  array['vegetarian']::text[], 1, 2, 6,
  'virra-authored', 30
);

insert into public.recipe_ingredients
  (recipe_id, position, food_name, quantity, unit, note, common_food_id,
   calories, carbs_g, protein_g, fat_g, fibre_g) values
  ('banana-peanut-porridge', 1, 'Rolled / porridge oats', 50, 'g', null, 'rolled-porridge-oats-dry', 181.5, 30.0, 5.5, 4.0, 4.5),
  ('banana-peanut-porridge', 2, 'Semi-skimmed milk', 250, 'ml', null, 'semi-skimmed-milk-as-packed', 125.0, 11.75, 8.75, 4.25, 0.0),
  ('banana-peanut-porridge', 3, 'Banana', 120, 'g', '1 medium, sliced', 'banana-raw', 114.0, 27.6, 1.44, 0.36, 1.32),
  ('banana-peanut-porridge', 4, 'Peanut butter, smooth', 20, 'g', null, 'peanut-butter-smooth-no-added-sugar', 121.2, 2.6, 4.6, 10.0, 1.2),
  ('banana-peanut-porridge', 5, 'Honey', 10, 'g', null, 'honey-as-packed', 33.4, 8.2, 0.04, 0.0, 0.0),
  ('banana-peanut-porridge', 6, 'Chia seeds', 5, 'g', 'optional, for a bit of body', 'chia-seeds-raw', 21.1, 0.2, 0.85, 1.55, 1.7);

insert into public.recipe_steps (recipe_id, position, body) values
  ('banana-peanut-porridge', 1, 'Put the oats and milk in a pan over a medium heat.'),
  ('banana-peanut-porridge', 2, 'Stir often and let it bubble gently for 5 to 6 minutes, until it thickens and the oats soften.'),
  ('banana-peanut-porridge', 3, 'Take it off the heat and stir through half the banana so it melts into the porridge.'),
  ('banana-peanut-porridge', 4, 'Pour into a bowl, top with the rest of the banana, the peanut butter and the honey.'),
  ('banana-peanut-porridge', 5, 'Scatter the chia seeds over if you are using them, and let it sit for a minute before eating.');

-- Greek Yogurt & Berry Bowl: serves 1, 416.6 kcal per serving
insert into public.recipes (
  id, name, collection, collection_label, intro, meal_types, phases, loads,
  dietary, serves, prep_minutes, cook_minutes, source, sort_order
) values (
  'greek-yogurt-berry-bowl', 'Greek Yogurt & Berry Bowl', 'breakfast', 'Breakfast',
  'Five minutes, no cooking, and a lot of protein for something that feels like a treat. The one to make when the morning is already busy.',
  array['breakfast', 'snack']::text[], array['follicular']::text[], array['rest', 'easy']::text[],
  array['vegetarian']::text[], 1, 5, 0,
  'virra-authored', 40
);

insert into public.recipe_ingredients
  (recipe_id, position, food_name, quantity, unit, note, common_food_id,
   calories, carbs_g, protein_g, fat_g, fibre_g) values
  ('greek-yogurt-berry-bowl', 1, 'Greek yogurt, 0% fat', 200, 'g', null, 'greek-yogurt-0-fat-as-packed', 114.0, 8.0, 20.0, 0.8, 0.0),
  ('greek-yogurt-berry-bowl', 2, 'Blueberries', 80, 'g', null, 'blueberries-raw', 45.6, 11.2, 0.56, 0.24, 1.92),
  ('greek-yogurt-berry-bowl', 3, 'Raspberries', 60, 'g', null, 'raspberries-raw', 15.0, 2.76, 0.84, 0.18, 3.9),
  ('greek-yogurt-berry-bowl', 4, 'Granola', 30, 'g', null, 'granola', 135.0, 19.5, 3.0, 4.8, 1.2),
  ('greek-yogurt-berry-bowl', 5, 'Honey', 15, 'g', null, 'honey-as-packed', 50.1, 12.3, 0.06, 0.0, 0.0),
  ('greek-yogurt-berry-bowl', 6, 'Pumpkin seeds', 10, 'g', null, 'pumpkin-seeds-raw', 56.9, 1.5, 2.4, 4.6, 0.53);

insert into public.recipe_steps (recipe_id, position, body) values
  ('greek-yogurt-berry-bowl', 1, 'Spoon the yogurt into a bowl and level it off.'),
  ('greek-yogurt-berry-bowl', 2, 'Pile the berries over one half and the granola over the other, so the granola stays crunchy for longer.'),
  ('greek-yogurt-berry-bowl', 3, 'Drizzle over the honey and scatter the pumpkin seeds.'),
  ('greek-yogurt-berry-bowl', 4, 'Eat straight away, or cover and take it with you.');

-- Mushroom & Spinach Omelette: serves 1, 391.6 kcal per serving
insert into public.recipes (
  id, name, collection, collection_label, intro, meal_types, phases, loads,
  dietary, serves, prep_minutes, cook_minutes, source, sort_order
) values (
  'mushroom-spinach-omelette', 'Mushroom & Spinach Omelette', 'breakfast', 'Breakfast',
  'Iron from the spinach and the yolks, protein to spare, and it is on the plate in under fifteen minutes. A good one for the days you need feeding rather than fuelling.',
  array['breakfast', 'lunch']::text[], array['menstrual', 'follicular']::text[], array['rest', 'easy']::text[],
  array['vegetarian', 'gf']::text[], 1, 5, 8,
  'virra-authored', 50
);

insert into public.recipe_ingredients
  (recipe_id, position, food_name, quantity, unit, note, common_food_id,
   calories, carbs_g, protein_g, fat_g, fibre_g) values
  ('mushroom-spinach-omelette', 1, 'Whole egg', 150, 'g', '3 large eggs', 'whole-egg-raw', 214.5, 1.05, 18.75, 14.55, 0.0),
  ('mushroom-spinach-omelette', 2, 'Mushrooms, chestnut', 80, 'g', 'sliced', 'mushrooms-chestnut-raw', 12.0, 0.4, 1.6, 0.4, 0.8),
  ('mushroom-spinach-omelette', 3, 'Spinach', 40, 'g', null, 'spinach-raw', 10.0, 0.64, 1.12, 0.32, 0.84),
  ('mushroom-spinach-omelette', 4, 'Cheddar, mature', 20, 'g', 'grated', 'cheddar-mature-as-eaten', 83.2, 0.02, 5.0, 7.0, 0.0),
  ('mushroom-spinach-omelette', 5, 'Olive oil', 8, 'ml', null, 'olive-oil-as-packed', 71.92, 0.0, 0.0, 7.99, 0.0);

insert into public.recipe_steps (recipe_id, position, body) values
  ('mushroom-spinach-omelette', 1, 'Heat the oil in a non-stick pan over a medium-high heat and cook the mushrooms until they have taken some colour, about 4 minutes. Do not crowd them or they steam.'),
  ('mushroom-spinach-omelette', 2, 'Add the spinach and let it wilt, then tip the lot onto a plate.'),
  ('mushroom-spinach-omelette', 3, 'Beat the eggs, season, and pour into the same pan over a medium heat.'),
  ('mushroom-spinach-omelette', 4, 'Draw the setting edges into the middle with a spatula and tilt the pan so the raw egg runs into the gaps.'),
  ('mushroom-spinach-omelette', 5, 'When it is just set but still glossy, spoon the mushrooms and spinach over one half, scatter the cheddar, and fold it over.'),
  ('mushroom-spinach-omelette', 6, 'Slide it onto a plate and eat while it is hot.');

-- Race Morning Bagel: serves 1, 413.1 kcal per serving
insert into public.recipes (
  id, name, collection, collection_label, intro, meal_types, phases, loads,
  dietary, serves, prep_minutes, cook_minutes, source, sort_order
) values (
  'race-morning-bagel', 'Race Morning Bagel', 'pre-run', 'Pre-run and race morning',
  'Deliberately dull, and that is the point. Low fibre, low fat, plenty of carbohydrate, and nothing in it your stomach has to think about two hours before a start line.',
  array['breakfast']::text[], array['ovulatory', 'luteal']::text[], array['hard']::text[],
  array['vegan', 'vegetarian', 'df']::text[], 1, 3, 0,
  'virra-authored', 20
);

insert into public.recipe_ingredients
  (recipe_id, position, food_name, quantity, unit, note, common_food_id,
   calories, carbs_g, protein_g, fat_g, fibre_g) values
  ('race-morning-bagel', 1, 'bagel', 85, 'g', '1 plain bagel', 'bagel', 212.5, 42.5, 8.5, 1.36, 1.7),
  ('race-morning-bagel', 2, 'Peanut butter, smooth', 10, 'g', 'a thin scrape, not a thick layer', 'peanut-butter-smooth-no-added-sugar', 60.6, 1.3, 2.3, 5.0, 0.6),
  ('race-morning-bagel', 3, 'Banana', 120, 'g', '1 medium, sliced', 'banana-raw', 114.0, 27.6, 1.44, 0.36, 1.32),
  ('race-morning-bagel', 4, 'Maple syrup', 10, 'g', null, 'maple-syrup-as-packed', 26.0, 6.7, 0.0, 0.01, 0.0);

insert into public.recipe_steps (recipe_id, position, body) values
  ('race-morning-bagel', 1, 'Split and toast the bagel if you like it warm. Untoasted is fine and quicker.'),
  ('race-morning-bagel', 2, 'Spread the peanut butter thinly over both halves. Thin matters: fat slows everything down on a race morning.'),
  ('race-morning-bagel', 3, 'Lay the banana over the top and trickle the maple syrup on.'),
  ('race-morning-bagel', 4, 'Eat about two to three hours before you start, with a glass of water.');

-- Honey & Banana Toast: serves 1, 350.0 kcal per serving
insert into public.recipes (
  id, name, collection, collection_label, intro, meal_types, phases, loads,
  dietary, serves, prep_minutes, cook_minutes, source, sort_order
) values (
  'honey-banana-toast', 'Honey & Banana Toast', 'pre-run', 'Pre-run and race morning',
  'The simplest thing in the book. White bread on purpose, because an hour before a session is not the moment for fibre.',
  array['breakfast', 'snack']::text[], array['ovulatory', 'luteal']::text[], array['moderate', 'hard']::text[],
  array['vegetarian', 'df']::text[], 1, 3, 2,
  'virra-authored', 30
);

insert into public.recipe_ingredients
  (recipe_id, position, food_name, quantity, unit, note, common_food_id,
   calories, carbs_g, protein_g, fat_g, fibre_g) values
  ('honey-banana-toast', 1, 'Bread, white sliced', 72, 'g', '2 slices', 'bread-white-sliced-as-eaten', 169.2, 35.28, 6.05, 1.37, 1.73),
  ('honey-banana-toast', 2, 'Banana', 120, 'g', '1 medium', 'banana-raw', 114.0, 27.6, 1.44, 0.36, 1.32),
  ('honey-banana-toast', 3, 'Honey', 20, 'g', null, 'honey-as-packed', 66.8, 16.4, 0.08, 0.0, 0.0);

insert into public.recipe_steps (recipe_id, position, body) values
  ('honey-banana-toast', 1, 'Toast the bread.'),
  ('honey-banana-toast', 2, 'Slice the banana over both slices.'),
  ('honey-banana-toast', 3, 'Trickle the honey on and eat within the next few minutes, while the toast is still warm.');

-- Pre-Run Smoothie: serves 1, 382.5 kcal per serving
insert into public.recipes (
  id, name, collection, collection_label, intro, meal_types, phases, loads,
  dietary, serves, prep_minutes, cook_minutes, source, sort_order
) values (
  'pre-run-smoothie', 'Pre-Run Smoothie', 'pre-run', 'Pre-run and race morning',
  'For the mornings when eating feels like hard work but you still have to fuel. Drinkable carbohydrate, and gentler on a nervous stomach than a plate of anything.',
  array['breakfast', 'snack']::text[], array['ovulatory', 'luteal']::text[], array['moderate', 'hard']::text[],
  array['vegetarian', 'df']::text[], 1, 5, 0,
  'virra-authored', 40
);

insert into public.recipe_ingredients
  (recipe_id, position, food_name, quantity, unit, note, common_food_id,
   calories, carbs_g, protein_g, fat_g, fibre_g) values
  ('pre-run-smoothie', 1, 'Banana', 120, 'g', '1 medium, frozen is best', 'banana-raw', 114.0, 27.6, 1.44, 0.36, 1.32),
  ('pre-run-smoothie', 2, 'Oat milk', 150, 'ml', null, 'oat-milk', 67.5, 10.05, 1.5, 2.25, 1.2),
  ('pre-run-smoothie', 3, 'Apple juice', 100, 'ml', null, 'apple-juice-unsweetened', 42.0, 9.9, 0.1, 0.1, 0.0),
  ('pre-run-smoothie', 4, 'Rolled / porridge oats', 30, 'g', null, 'rolled-porridge-oats-dry', 108.9, 18.0, 3.3, 2.4, 2.7),
  ('pre-run-smoothie', 5, 'Honey', 15, 'g', null, 'honey-as-packed', 50.1, 12.3, 0.06, 0.0, 0.0);

insert into public.recipe_steps (recipe_id, position, body) values
  ('pre-run-smoothie', 1, 'Put everything in a blender.'),
  ('pre-run-smoothie', 2, 'Blitz for a good 45 seconds. Longer than feels necessary: the oats need breaking down or it drinks gritty.'),
  ('pre-run-smoothie', 3, 'Pour into a glass and drink about an hour before you head out.');

-- Pineapple & Yogurt Pot: serves 1, 281.3 kcal per serving
insert into public.recipes (
  id, name, collection, collection_label, intro, meal_types, phases, loads,
  dietary, serves, prep_minutes, cook_minutes, source, sort_order
) values (
  'pineapple-yogurt-pot', 'Pineapple & Yogurt Pot', 'pre-run', 'Pre-run and race morning',
  'Light enough to sit well before a session, with enough protein to still be doing something for you afterwards. Make it the night before and it travels.',
  array['breakfast', 'snack']::text[], array['follicular', 'ovulatory']::text[], array['easy', 'moderate']::text[],
  array['vegetarian', 'gf']::text[], 1, 5, 0,
  'virra-authored', 50
);

insert into public.recipe_ingredients
  (recipe_id, position, food_name, quantity, unit, note, common_food_id,
   calories, carbs_g, protein_g, fat_g, fibre_g) values
  ('pineapple-yogurt-pot', 1, 'Greek yogurt, 0% fat', 150, 'g', null, 'greek-yogurt-0-fat-as-packed', 85.5, 6.0, 15.0, 0.6, 0.0),
  ('pineapple-yogurt-pot', 2, 'Pineapple', 150, 'g', 'fresh, chopped', 'pineapple-raw', 61.5, 15.0, 0.6, 0.3, 2.1),
  ('pineapple-yogurt-pot', 3, 'Honey', 20, 'g', null, 'honey-as-packed', 66.8, 16.4, 0.08, 0.0, 0.0),
  ('pineapple-yogurt-pot', 4, 'Granola', 15, 'g', 'for the top, added last', 'granola', 67.5, 9.75, 1.5, 2.4, 0.6);

insert into public.recipe_steps (recipe_id, position, body) values
  ('pineapple-yogurt-pot', 1, 'Spoon the yogurt into a jar or a bowl.'),
  ('pineapple-yogurt-pot', 2, 'Stir the honey through it rather than leaving it sitting on top, so every spoonful gets some.'),
  ('pineapple-yogurt-pot', 3, 'Add the pineapple.'),
  ('pineapple-yogurt-pot', 4, 'Keep the granola separate until you are about to eat, or it goes soft overnight.');

-- Lemon Chicken & New Potatoes: serves 2, 423.5 kcal per serving
insert into public.recipes (
  id, name, collection, collection_label, intro, meal_types, phases, loads,
  dietary, serves, prep_minutes, cook_minutes, source, sort_order
) values (
  'lemon-chicken-new-potatoes', 'Lemon Chicken & New Potatoes', 'quick-dinners', 'Quick dinners',
  'One tray, one lemon, and very little washing up. The potatoes go in first so they are properly crisp by the time the chicken is done.',
  array['lunch', 'dinner']::text[], array['follicular', 'ovulatory']::text[], array['moderate']::text[],
  array['gf']::text[], 2, 10, 25,
  'virra-authored', 20
);

insert into public.recipe_ingredients
  (recipe_id, position, food_name, quantity, unit, note, common_food_id,
   calories, carbs_g, protein_g, fat_g, fibre_g) values
  ('lemon-chicken-new-potatoes', 1, 'Chicken breast, skinless', 300, 'g', '2 breasts', 'chicken-breast-skinless-raw', 318.0, 0.0, 66.9, 5.1, 0.0),
  ('lemon-chicken-new-potatoes', 2, 'New potato', 400, 'g', 'halved', 'new-potato-raw', 280.0, 64.0, 6.8, 1.2, 6.0),
  ('lemon-chicken-new-potatoes', 3, 'Green beans', 200, 'g', 'trimmed', 'green-beans-raw', 48.0, 6.4, 3.8, 1.0, 4.8),
  ('lemon-chicken-new-potatoes', 4, 'Olive oil', 20, 'ml', null, 'olive-oil-as-packed', 179.8, 0.0, 0.0, 19.98, 0.0),
  ('lemon-chicken-new-potatoes', 5, 'Lemon', 60, 'g', '1 lemon, half sliced and half for squeezing', 'lemon-raw', 11.4, 1.92, 0.6, 0.18, 1.68),
  ('lemon-chicken-new-potatoes', 6, 'Garlic', 10, 'g', '3 cloves, skin on and lightly crushed', 'garlic-raw', 9.8, 1.6, 0.79, 0.06, 0.41);

insert into public.recipe_steps (recipe_id, position, body) values
  ('lemon-chicken-new-potatoes', 1, 'Heat the oven to 200C fan. Toss the potatoes with half the oil, the garlic and plenty of salt, and roast for 15 minutes.'),
  ('lemon-chicken-new-potatoes', 2, 'Rub the chicken with the rest of the oil and season it well.'),
  ('lemon-chicken-new-potatoes', 3, 'Push the potatoes to one side of the tray, add the chicken and the lemon slices, and roast for another 15 minutes.'),
  ('lemon-chicken-new-potatoes', 4, 'Add the green beans to the tray and give everything a shake. Back in for 5 minutes.'),
  ('lemon-chicken-new-potatoes', 5, 'Check the chicken is cooked through, then squeeze the remaining lemon over the whole tray before serving.');

-- Salmon, Sweet Potato & Broccoli: serves 2, 586.3 kcal per serving
insert into public.recipes (
  id, name, collection, collection_label, intro, meal_types, phases, loads,
  dietary, serves, prep_minutes, cook_minutes, source, sort_order
) values (
  'salmon-sweet-potato-broccoli', 'Salmon, Sweet Potato & Broccoli', 'quick-dinners', 'Quick dinners',
  'The dinner that quietly does everything: oily fish, a proper amount of carbohydrate, and something green. Good the night before a long run.',
  array['dinner']::text[], array['follicular', 'ovulatory']::text[], array['moderate', 'hard']::text[],
  array['pescatarian', 'gf', 'df']::text[], 2, 10, 25,
  'virra-authored', 30
);

insert into public.recipe_ingredients
  (recipe_id, position, food_name, quantity, unit, note, common_food_id,
   calories, carbs_g, protein_g, fat_g, fibre_g) values
  ('salmon-sweet-potato-broccoli', 1, 'Salmon, fresh (farmed)', 260, 'g', '2 fillets', 'salmon-fresh-farmed-raw', 559.0, 0.0, 53.04, 37.96, 0.0),
  ('salmon-sweet-potato-broccoli', 2, 'Sweet potato', 400, 'g', 'cut into wedges, skin on', 'sweet-potato-raw', 348.0, 84.0, 6.4, 1.2, 9.6),
  ('salmon-sweet-potato-broccoli', 3, 'Broccoli', 200, 'g', 'broken into florets', 'broccoli-raw', 66.0, 3.6, 8.8, 1.8, 5.2),
  ('salmon-sweet-potato-broccoli', 4, 'Olive oil', 20, 'ml', null, 'olive-oil-as-packed', 179.8, 0.0, 0.0, 19.98, 0.0),
  ('salmon-sweet-potato-broccoli', 5, 'Lemon', 30, 'g', 'half a lemon', 'lemon-raw', 5.7, 0.96, 0.3, 0.09, 0.84),
  ('salmon-sweet-potato-broccoli', 6, 'Smoked paprika', 5, 'g', null, null, 14.1, 1.7, 0.7, 0.65, 1.75);

insert into public.recipe_steps (recipe_id, position, body) values
  ('salmon-sweet-potato-broccoli', 1, 'Heat the oven to 200C fan.'),
  ('salmon-sweet-potato-broccoli', 2, 'Toss the sweet potato wedges with half the oil, the paprika and salt, and roast for 20 minutes.'),
  ('salmon-sweet-potato-broccoli', 3, 'Rub the salmon with the remaining oil and season it.'),
  ('salmon-sweet-potato-broccoli', 4, 'Make space on the tray, add the salmon skin side down, and roast for 10 to 12 minutes until it flakes.'),
  ('salmon-sweet-potato-broccoli', 5, 'Steam or boil the broccoli for 4 minutes while the salmon finishes. It should still have some bite.'),
  ('salmon-sweet-potato-broccoli', 6, 'Squeeze the lemon over everything and serve.');

-- Beef & Black Bean Rice: serves 3, 487.0 kcal per serving
insert into public.recipes (
  id, name, collection, collection_label, intro, meal_types, phases, loads,
  dietary, serves, prep_minutes, cook_minutes, source, sort_order
) values (
  'beef-black-bean-rice', 'Beef & Black Bean Rice', 'quick-dinners', 'Quick dinners',
  'Iron from the beef and the beans in one bowl, which makes it a good one when you are heavy or tired. It reheats well, so make the full three.',
  array['dinner']::text[], array['menstrual', 'ovulatory']::text[], array['moderate', 'hard']::text[],
  array['gf', 'df']::text[], 3, 10, 25,
  'virra-authored', 40
);

insert into public.recipe_ingredients
  (recipe_id, position, food_name, quantity, unit, note, common_food_id,
   calories, carbs_g, protein_g, fat_g, fibre_g) values
  ('beef-black-bean-rice', 1, 'Beef mince, lean (5% fat)', 300, 'g', null, 'beef-mince-lean-5-fat-raw', 411.0, 0.0, 64.5, 15.0, 0.0),
  ('beef-black-bean-rice', 2, 'Black beans, canned', 240, 'g', '1 tin, drained', null, 218.4, 38.4, 14.4, 1.2, 15.6),
  ('beef-black-bean-rice', 3, 'White rice, basmati', 150, 'g', 'dry weight', 'white-rice-basmati-dry', 535.5, 117.0, 11.1, 1.05, 2.1),
  ('beef-black-bean-rice', 4, 'Bell pepper, red', 160, 'g', '1 pepper, diced', 'bell-pepper-red-raw', 51.2, 9.6, 1.6, 0.64, 2.72),
  ('beef-black-bean-rice', 5, 'Onion', 100, 'g', '1 onion, diced', 'onion-raw', 36.0, 7.9, 1.2, 0.2, 1.4),
  ('beef-black-bean-rice', 6, 'Tomatoes, chopped', 200, 'g', null, 'tomatoes-chopped-canned', 36.0, 6.0, 2.0, 0.4, 2.0),
  ('beef-black-bean-rice', 7, 'Rapeseed oil', 15, 'ml', null, 'rapeseed-oil-as-packed', 134.85, 0.0, 0.0, 14.98, 0.0),
  ('beef-black-bean-rice', 8, 'Garlic', 10, 'g', '3 cloves', 'garlic-raw', 9.8, 1.6, 0.79, 0.06, 0.41),
  ('beef-black-bean-rice', 9, 'Ground cumin', 6, 'g', null, null, 22.5, 2.04, 1.08, 1.32, 0.66),
  ('beef-black-bean-rice', 10, 'Dried chilli flakes', 2, 'g', 'to taste', null, 5.64, 1.0, 0.24, 0.28, 0.54);

insert into public.recipe_steps (recipe_id, position, body) values
  ('beef-black-bean-rice', 1, 'Get the rice on first, cooked to the packet timing.'),
  ('beef-black-bean-rice', 2, 'Heat the oil in a wide pan and brown the mince properly, breaking it up as you go. Give it a few minutes without stirring at the start so it colours rather than steams.'),
  ('beef-black-bean-rice', 3, 'Add the onion and pepper and cook for 5 minutes until softened.'),
  ('beef-black-bean-rice', 4, 'Stir in the garlic, cumin and chilli flakes and cook for another minute, until you can smell them.'),
  ('beef-black-bean-rice', 5, 'Add the tomatoes and the drained beans, season, and simmer for 10 minutes.'),
  ('beef-black-bean-rice', 6, 'Serve over the rice.');

-- Tuna Pasta: serves 2, 603.4 kcal per serving
insert into public.recipes (
  id, name, collection, collection_label, intro, meal_types, phases, loads,
  dietary, serves, prep_minutes, cook_minutes, source, sort_order
) values (
  'tuna-pasta-with-passata', 'Tuna Pasta', 'quick-dinners', 'Quick dinners',
  'Store cupboard, fifteen minutes, and better than it has any right to be. The parmesan at the end is what lifts it.',
  array['lunch', 'dinner']::text[], array['ovulatory', 'luteal']::text[], array['moderate', 'hard']::text[],
  array['pescatarian']::text[], 2, 5, 15,
  'virra-authored', 50
);

insert into public.recipe_ingredients
  (recipe_id, position, food_name, quantity, unit, note, common_food_id,
   calories, carbs_g, protein_g, fat_g, fibre_g) values
  ('tuna-pasta-with-passata', 1, 'Pasta, wholemeal', 160, 'g', 'dry weight', 'pasta-wholemeal-dry', 556.8, 107.2, 20.8, 4.0, 13.6),
  ('tuna-pasta-with-passata', 2, 'Tuna, canned in spring water', 240, 'g', '2 tins, drained', 'tuna-canned-in-spring-water-drained', 237.6, 0.0, 56.4, 1.44, 0.0),
  ('tuna-pasta-with-passata', 3, 'Passata', 300, 'g', null, 'passata-as-packed', 105.0, 18.0, 4.2, 0.6, 4.5),
  ('tuna-pasta-with-passata', 4, 'Onion', 100, 'g', '1 onion, finely diced', 'onion-raw', 36.0, 7.9, 1.2, 0.2, 1.4),
  ('tuna-pasta-with-passata', 5, 'Garlic', 10, 'g', '3 cloves', 'garlic-raw', 9.8, 1.6, 0.79, 0.06, 0.41),
  ('tuna-pasta-with-passata', 6, 'Olive oil', 15, 'ml', null, 'olive-oil-as-packed', 134.85, 0.0, 0.0, 14.98, 0.0),
  ('tuna-pasta-with-passata', 7, 'Parmesan', 30, 'g', 'grated', 'parmesan-as-eaten', 124.5, 0.0, 10.8, 9.0, 0.0),
  ('tuna-pasta-with-passata', 8, 'Basil, fresh', 10, 'g', 'torn', null, 2.3, 0.1, 0.32, 0.06, 0.16);

insert into public.recipe_steps (recipe_id, position, body) values
  ('tuna-pasta-with-passata', 1, 'Cook the pasta in well salted water, and keep a mugful of the water before you drain it.'),
  ('tuna-pasta-with-passata', 2, 'Meanwhile heat the oil and soften the onion for 5 minutes, then add the garlic for one more.'),
  ('tuna-pasta-with-passata', 3, 'Pour in the passata, season, and let it bubble while the pasta finishes.'),
  ('tuna-pasta-with-passata', 4, 'Flake in the drained tuna and warm it through gently. Stirring it hard turns it to paste.'),
  ('tuna-pasta-with-passata', 5, 'Drain the pasta and add it to the sauce with a splash of the reserved water, tossing until it clings.'),
  ('tuna-pasta-with-passata', 6, 'Serve with the parmesan and the basil over the top.');

-- Chickpea & Spinach Curry: serves 2, 546.8 kcal per serving
insert into public.recipes (
  id, name, collection, collection_label, intro, meal_types, phases, loads,
  dietary, serves, prep_minutes, cook_minutes, source, sort_order
) values (
  'chickpea-spinach-curry', 'Chickpea & Spinach Curry', 'quick-dinners', 'Quick dinners',
  'Iron from the chickpeas and the spinach, and a squeeze of lemon at the end to help you actually absorb it. Cheap, fast and better on day two.',
  array['lunch', 'dinner']::text[], array['menstrual', 'luteal']::text[], array['moderate']::text[],
  array['vegan', 'vegetarian', 'gf', 'df']::text[], 2, 10, 20,
  'virra-authored', 60
);

insert into public.recipe_ingredients
  (recipe_id, position, food_name, quantity, unit, note, common_food_id,
   calories, carbs_g, protein_g, fat_g, fibre_g) values
  ('chickpea-spinach-curry', 1, 'Chickpeas', 240, 'g', '1 tin, drained', 'chickpeas-canned-drained', 276.0, 38.4, 17.28, 6.96, 12.96),
  ('chickpea-spinach-curry', 2, 'Tomatoes, chopped', 200, 'g', null, 'tomatoes-chopped-canned', 36.0, 6.0, 2.0, 0.4, 2.0),
  ('chickpea-spinach-curry', 3, 'Spinach', 100, 'g', null, 'spinach-raw', 25.0, 1.6, 2.8, 0.8, 2.1),
  ('chickpea-spinach-curry', 4, 'White rice, basmati', 150, 'g', 'dry weight', 'white-rice-basmati-dry', 535.5, 117.0, 11.1, 1.05, 2.1),
  ('chickpea-spinach-curry', 5, 'Onion', 100, 'g', '1 onion, diced', 'onion-raw', 36.0, 7.9, 1.2, 0.2, 1.4),
  ('chickpea-spinach-curry', 6, 'Garlic', 10, 'g', '3 cloves', 'garlic-raw', 9.8, 1.6, 0.79, 0.06, 0.41),
  ('chickpea-spinach-curry', 7, 'Ginger, fresh', 8, 'g', 'grated', null, 6.4, 1.28, 0.14, 0.06, 0.16),
  ('chickpea-spinach-curry', 8, 'Curry powder', 8, 'g', null, null, 26.0, 2.08, 1.12, 1.12, 2.64),
  ('chickpea-spinach-curry', 9, 'Rapeseed oil', 15, 'ml', null, 'rapeseed-oil-as-packed', 134.85, 0.0, 0.0, 14.98, 0.0),
  ('chickpea-spinach-curry', 10, 'Lemon', 30, 'g', 'half a lemon', 'lemon-raw', 5.7, 0.96, 0.3, 0.09, 0.84),
  ('chickpea-spinach-curry', 11, 'Coriander, fresh', 10, 'g', 'to finish', null, 2.3, 0.09, 0.21, 0.05, 0.28);

insert into public.recipe_steps (recipe_id, position, body) values
  ('chickpea-spinach-curry', 1, 'Start the rice so it is ready when the curry is.'),
  ('chickpea-spinach-curry', 2, 'Heat the oil and cook the onion for 6 to 7 minutes until soft and just golden.'),
  ('chickpea-spinach-curry', 3, 'Add the garlic, ginger and curry powder and stir for a minute. This step is what stops it tasting raw.'),
  ('chickpea-spinach-curry', 4, 'Tip in the tomatoes and chickpeas, season, and simmer for 10 minutes.'),
  ('chickpea-spinach-curry', 5, 'Stir the spinach through in handfuls until it wilts.'),
  ('chickpea-spinach-curry', 6, 'Squeeze the lemon in off the heat, scatter the coriander, and serve with the rice.');

-- Chicken & Quinoa Bowl: serves 2, 614.8 kcal per serving
insert into public.recipes (
  id, name, collection, collection_label, intro, meal_types, phases, loads,
  dietary, serves, prep_minutes, cook_minutes, source, sort_order
) values (
  'chicken-quinoa-bowl', 'Chicken & Quinoa Bowl', 'recovery', 'Recovery and high-protein',
  'Built for the hour after a hard session: a lot of protein, a proper amount of carbohydrate, and it is just as good cold the next day.',
  array['lunch', 'dinner']::text[], array['follicular', 'ovulatory']::text[], array['moderate', 'hard']::text[],
  array['gf', 'df']::text[], 2, 10, 20,
  'virra-authored', 10
);

insert into public.recipe_ingredients
  (recipe_id, position, food_name, quantity, unit, note, common_food_id,
   calories, carbs_g, protein_g, fat_g, fibre_g) values
  ('chicken-quinoa-bowl', 1, 'Chicken breast, skinless', 300, 'g', '2 breasts', 'chicken-breast-skinless-raw', 318.0, 0.0, 66.9, 5.1, 0.0),
  ('chicken-quinoa-bowl', 2, 'Quinoa', 150, 'g', 'dry weight', 'quinoa-dry', 552.0, 96.0, 21.0, 9.15, 10.5),
  ('chicken-quinoa-bowl', 3, 'Broccoli', 200, 'g', 'florets', 'broccoli-raw', 66.0, 3.6, 8.8, 1.8, 5.2),
  ('chicken-quinoa-bowl', 4, 'Bell pepper, red', 160, 'g', '1 pepper', 'bell-pepper-red-raw', 51.2, 9.6, 1.6, 0.64, 2.72),
  ('chicken-quinoa-bowl', 5, 'Olive oil', 20, 'ml', null, 'olive-oil-as-packed', 179.8, 0.0, 0.0, 19.98, 0.0),
  ('chicken-quinoa-bowl', 6, 'Lemon', 30, 'g', 'half a lemon', 'lemon-raw', 5.7, 0.96, 0.3, 0.09, 0.84),
  ('chicken-quinoa-bowl', 7, 'Pumpkin seeds', 10, 'g', 'to finish', 'pumpkin-seeds-raw', 56.9, 1.5, 2.4, 4.6, 0.53);

insert into public.recipe_steps (recipe_id, position, body) values
  ('chicken-quinoa-bowl', 1, 'Rinse the quinoa well, then cook it in twice its volume of water for about 15 minutes, until the grains uncurl.'),
  ('chicken-quinoa-bowl', 2, 'Season the chicken and cook it in half the oil over a medium heat, 6 to 7 minutes a side depending on thickness. Let it rest before slicing.'),
  ('chicken-quinoa-bowl', 3, 'Steam the broccoli for 4 minutes and slice the pepper raw for crunch.'),
  ('chicken-quinoa-bowl', 4, 'Fork the remaining oil and the lemon juice through the quinoa and season it properly. Quinoa needs more salt than you think.'),
  ('chicken-quinoa-bowl', 5, 'Build the bowls with the quinoa underneath, then the vegetables and the sliced chicken.'),
  ('chicken-quinoa-bowl', 6, 'Scatter the pumpkin seeds over the top.');

-- Cottage Cheese Recovery Pot: serves 1, 479.2 kcal per serving
insert into public.recipes (
  id, name, collection, collection_label, intro, meal_types, phases, loads,
  dietary, serves, prep_minutes, cook_minutes, source, sort_order
) values (
  'cottage-cheese-recovery-pot', 'Cottage Cheese Recovery Pot', 'recovery', 'Recovery and high-protein',
  'Not glamorous, extremely effective. Thirty grams of protein in something you can put together in the kitchen with your shoes still on.',
  array['snack', 'breakfast']::text[], array['follicular']::text[], array['easy', 'moderate']::text[],
  array['vegetarian', 'gf']::text[], 1, 5, 0,
  'virra-authored', 20
);

insert into public.recipe_ingredients
  (recipe_id, position, food_name, quantity, unit, note, common_food_id,
   calories, carbs_g, protein_g, fat_g, fibre_g) values
  ('cottage-cheese-recovery-pot', 1, 'Cottage cheese', 200, 'g', null, 'cottage-cheese-as-eaten', 202.0, 6.2, 25.2, 8.6, 0.0),
  ('cottage-cheese-recovery-pot', 2, 'Rolled / porridge oats', 30, 'g', null, 'rolled-porridge-oats-dry', 108.9, 18.0, 3.3, 2.4, 2.7),
  ('cottage-cheese-recovery-pot', 3, 'Blueberries', 100, 'g', null, 'blueberries-raw', 57.0, 14.0, 0.7, 0.3, 2.4),
  ('cottage-cheese-recovery-pot', 4, 'Honey', 15, 'g', null, 'honey-as-packed', 50.1, 12.3, 0.06, 0.0, 0.0),
  ('cottage-cheese-recovery-pot', 5, 'Almonds', 10, 'g', 'roughly chopped', 'almonds-raw', 61.2, 0.69, 2.11, 5.58, 0.74);

insert into public.recipe_steps (recipe_id, position, body) values
  ('cottage-cheese-recovery-pot', 1, 'Spoon the cottage cheese into a bowl.'),
  ('cottage-cheese-recovery-pot', 2, 'Stir the oats straight through it. They soften as they sit, so this is better made ten minutes before you eat it.'),
  ('cottage-cheese-recovery-pot', 3, 'Add the blueberries and the honey.'),
  ('cottage-cheese-recovery-pot', 4, 'Scatter the almonds over the top for something to bite on.');

-- Tofu & Edamame Noodles: serves 2, 538.5 kcal per serving
insert into public.recipes (
  id, name, collection, collection_label, intro, meal_types, phases, loads,
  dietary, serves, prep_minutes, cook_minutes, source, sort_order
) values (
  'tofu-edamame-noodles', 'Tofu & Edamame Noodles', 'recovery', 'Recovery and high-protein',
  'Plant protein that actually adds up, and it comes together in the time the noodles take. Press the tofu if you have ten minutes spare, it makes all the difference.',
  array['lunch', 'dinner']::text[], array['follicular', 'luteal']::text[], array['moderate', 'hard']::text[],
  array['vegan', 'vegetarian', 'df']::text[], 2, 10, 15,
  'virra-authored', 30
);

insert into public.recipe_ingredients
  (recipe_id, position, food_name, quantity, unit, note, common_food_id,
   calories, carbs_g, protein_g, fat_g, fibre_g) values
  ('tofu-edamame-noodles', 1, 'Tofu, firm', 200, 'g', 'pressed and cubed', 'tofu-firm-as-packed', 146.0, 1.4, 16.2, 8.4, 0.8),
  ('tofu-edamame-noodles', 2, 'Edamame', 150, 'g', 'podded', 'edamame', 181.5, 13.5, 18.0, 7.5, 7.2),
  ('tofu-edamame-noodles', 3, 'Rice noodles', 120, 'g', 'dry weight', 'rice-noodles-dry', 436.8, 96.0, 7.08, 0.72, 1.92),
  ('tofu-edamame-noodles', 4, 'Bell pepper, red', 160, 'g', 'sliced', 'bell-pepper-red-raw', 51.2, 9.6, 1.6, 0.64, 2.72),
  ('tofu-edamame-noodles', 5, 'Spring onion', 60, 'g', 'sliced on the diagonal', 'spring-onion-raw', 13.8, 1.8, 1.2, 0.3, 0.9),
  ('tofu-edamame-noodles', 6, 'Soy sauce', 20, 'ml', null, null, 10.6, 0.98, 1.62, 0.02, 0.16),
  ('tofu-edamame-noodles', 7, 'Rapeseed oil', 15, 'ml', null, 'rapeseed-oil-as-packed', 134.85, 0.0, 0.0, 14.98, 0.0),
  ('tofu-edamame-noodles', 8, 'Sesame seeds', 15, 'g', 'toasted', 'sesame-seeds-raw', 85.95, 1.75, 2.65, 7.46, 1.77),
  ('tofu-edamame-noodles', 9, 'Ginger, fresh', 8, 'g', 'grated', null, 6.4, 1.28, 0.14, 0.06, 0.16),
  ('tofu-edamame-noodles', 10, 'Garlic', 10, 'g', '3 cloves', 'garlic-raw', 9.8, 1.6, 0.79, 0.06, 0.41);

insert into public.recipe_steps (recipe_id, position, body) values
  ('tofu-edamame-noodles', 1, 'Soak or boil the noodles to the packet timing, then drain and rinse them in cold water so they do not clag together.'),
  ('tofu-edamame-noodles', 2, 'Get a wide pan properly hot with the oil, then fry the tofu without moving it for 3 minutes so it forms a crust. Turn and repeat.'),
  ('tofu-edamame-noodles', 3, 'Add the pepper, ginger and garlic and stir fry for 2 minutes.'),
  ('tofu-edamame-noodles', 4, 'Add the edamame and the soy sauce and toss for another minute.'),
  ('tofu-edamame-noodles', 5, 'Fold the noodles through until everything is coated and hot.'),
  ('tofu-edamame-noodles', 6, 'Finish with the spring onion and the toasted sesame seeds.');

-- Protein Recovery Shake: serves 1, 527.1 kcal per serving
insert into public.recipes (
  id, name, collection, collection_label, intro, meal_types, phases, loads,
  dietary, serves, prep_minutes, cook_minutes, source, sort_order
) values (
  'protein-recovery-shake', 'Protein Recovery Shake', 'recovery', 'Recovery and high-protein',
  'For the twenty minutes after a hard session when you are not hungry yet but should be eating something. Carbohydrate and protein together, in a form you can drink.',
  array['snack']::text[], array['ovulatory', 'luteal']::text[], array['hard']::text[],
  array['vegetarian', 'gf']::text[], 1, 3, 0,
  'virra-authored', 40
);

insert into public.recipe_ingredients
  (recipe_id, position, food_name, quantity, unit, note, common_food_id,
   calories, carbs_g, protein_g, fat_g, fibre_g) values
  ('protein-recovery-shake', 1, 'Protein powder', 30, 'g', 'vanilla or chocolate', 'whey-protein', 112.5, 1.8, 22.5, 1.5, 0.0),
  ('protein-recovery-shake', 2, 'Semi-skimmed milk', 250, 'ml', null, 'semi-skimmed-milk-as-packed', 125.0, 11.75, 8.75, 4.25, 0.0),
  ('protein-recovery-shake', 3, 'Banana', 120, 'g', '1 medium', 'banana-raw', 114.0, 27.6, 1.44, 0.36, 1.32),
  ('protein-recovery-shake', 4, 'Peanut butter, smooth', 20, 'g', null, 'peanut-butter-smooth-no-added-sugar', 121.2, 2.6, 4.6, 10.0, 1.2),
  ('protein-recovery-shake', 5, 'Rolled / porridge oats', 15, 'g', null, 'rolled-porridge-oats-dry', 54.45, 9.0, 1.65, 1.2, 1.35);

insert into public.recipe_steps (recipe_id, position, body) values
  ('protein-recovery-shake', 1, 'Put the milk in the blender first. Powder on the bottom welds itself to the blades.'),
  ('protein-recovery-shake', 2, 'Add everything else and blitz for 30 seconds.'),
  ('protein-recovery-shake', 3, 'Drink it within the hour after finishing.');

-- Mackerel with Green Lentils: serves 2, 448.5 kcal per serving
insert into public.recipes (
  id, name, collection, collection_label, intro, meal_types, phases, loads,
  dietary, serves, prep_minutes, cook_minutes, source, sort_order
) values (
  'mackerel-green-lentils', 'Mackerel with Green Lentils', 'recovery', 'Recovery and high-protein',
  'Oily fish and lentils, which between them cover protein, iron and omega-3 in one pan. The lemon is doing real work here, not just brightening it.',
  array['lunch', 'dinner']::text[], array['menstrual', 'follicular']::text[], array['easy', 'moderate']::text[],
  array['pescatarian', 'gf', 'df']::text[], 2, 10, 20,
  'virra-authored', 50
);

insert into public.recipe_ingredients
  (recipe_id, position, food_name, quantity, unit, note, common_food_id,
   calories, carbs_g, protein_g, fat_g, fibre_g) values
  ('mackerel-green-lentils', 1, 'Mackerel, fresh', 220, 'g', '2 fillets', 'mackerel-fresh-raw', 484.0, 0.0, 41.14, 35.42, 0.0),
  ('mackerel-green-lentils', 2, 'Lentils, green', 200, 'g', 'a pouch or a drained tin', 'lentils-green-canned-drained', 198.0, 34.0, 15.2, 1.0, 8.0),
  ('mackerel-green-lentils', 3, 'Spinach', 100, 'g', null, 'spinach-raw', 25.0, 1.6, 2.8, 0.8, 2.1),
  ('mackerel-green-lentils', 4, 'Onion', 100, 'g', '1 onion, finely diced', 'onion-raw', 36.0, 7.9, 1.2, 0.2, 1.4),
  ('mackerel-green-lentils', 5, 'Olive oil', 15, 'ml', null, 'olive-oil-as-packed', 134.85, 0.0, 0.0, 14.98, 0.0),
  ('mackerel-green-lentils', 6, 'Lemon', 30, 'g', 'half a lemon', 'lemon-raw', 5.7, 0.96, 0.3, 0.09, 0.84),
  ('mackerel-green-lentils', 7, 'Garlic', 10, 'g', '3 cloves', 'garlic-raw', 9.8, 1.6, 0.79, 0.06, 0.41),
  ('mackerel-green-lentils', 8, 'Parsley, fresh', 10, 'g', 'chopped', null, 3.6, 0.2, 0.3, 0.08, 0.33);

insert into public.recipe_steps (recipe_id, position, body) values
  ('mackerel-green-lentils', 1, 'Heat half the oil and soften the onion for 6 minutes, then add the garlic for a minute more.'),
  ('mackerel-green-lentils', 2, 'Stir in the lentils and warm them through, then wilt the spinach into them. Season well.'),
  ('mackerel-green-lentils', 3, 'Meanwhile get a separate pan very hot with the rest of the oil.'),
  ('mackerel-green-lentils', 4, 'Season the mackerel and lay it in skin side down. Press it flat for the first few seconds so the skin does not curl, and cook for 3 to 4 minutes until the skin releases cleanly.'),
  ('mackerel-green-lentils', 5, 'Flip it for a final minute.'),
  ('mackerel-green-lentils', 6, 'Squeeze the lemon over the lentils, fold the parsley through, and sit the mackerel on top.');

-- ---------------------------------------------------------------------------
-- Derive per-serving macros from the ingredient rows
-- ---------------------------------------------------------------------------
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
where t.recipe_id = r.id and r.source = 'virra-authored';

-- Atwater check across the WHOLE book, not just the new rows: 4 kcal per gram
-- of carbohydrate and protein, 9 per gram of fat, within 15%.
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

-- Coverage. Every meal slot, phase and load must have somewhere to go, or a rail
-- silently empties for whoever lands in the gap.
do $$
declare v text; n int;
begin
  foreach v in array array['breakfast','lunch','dinner','snack'] loop
    select count(*) into n from public.recipes where is_active and meal_types @> array[v]::text[];
    if n < 3 then raise exception 'Only % recipe(s) offered at %', n, v; end if;
  end loop;
  foreach v in array array['menstrual','follicular','ovulatory','luteal'] loop
    select count(*) into n from public.recipes where is_active and phases @> array[v]::text[];
    if n < 3 then raise exception 'Only % recipe(s) tagged to the % phase', n, v; end if;
  end loop;
  foreach v in array array['rest','easy','moderate','hard'] loop
    select count(*) into n from public.recipes where is_active and loads @> array[v]::text[];
    if n < 2 then raise exception 'Only % recipe(s) suit a % day', n, v; end if;
  end loop;
end $$;

commit;
