-- Two content fixes from Emma's review of the recipe book.
--
-- 1. Smoked Salmon Scrambled Eggs said "2 large eggs" beside 100 g of egg.
--    UK large eggs are 55-63 g each once shelled, so two of them is 110-125 g;
--    100 g is nearer two medium. The weight is what the macros are computed
--    from, so the choice is which of the pair to move. Keeping the instruction
--    natural and moving the weight to match it is the better read: most people
--    buy large, and the recipe should say what you would actually do.
--
-- 2. Fruity Cous Cous sat in "Pre-run and race morning" while being tagged as a
--    lunch, with an intro that calls it lunch. The other four in that
--    collection are genuinely morning food. The book had no lunch collection to
--    move it to, so this adds one; the recipe packs being imported next are
--    heavy on lunches and will fill it.

begin;

-- 110 g of raw whole egg at the same per-100 g basis the row already used
-- (143 kcal, 0.7 g carbohydrate, 12.5 g protein, 9.7 g fat, no fibre).
update public.recipe_ingredients
   set quantity  = 110,
       calories  = 157.3,
       carbs_g   = 0.77,
       protein_g = 13.75,
       fat_g     = 10.67
 where recipe_id = 'smoked-salmon-scrambled-eggs'
   and food_name = 'Whole egg';

update public.recipes
   set collection       = 'lunch',
       collection_label = 'Lunch'
 where id = 'fruity-cous-cous';

-- Totals are derived from the ingredients, so the egg change has to flow up.
-- Scoped to the one recipe rather than recomputing the whole book.
update public.recipes r
   set calories  = round(t.calories  / r.serves, 1),
       carbs_g   = round(t.carbs_g   / r.serves, 1),
       protein_g = round(t.protein_g / r.serves, 1),
       fat_g     = round(t.fat_g     / r.serves, 1),
       fibre_g   = case when t.fibre_known then round(t.fibre_g / r.serves, 1) else null end
  from (
    select recipe_id,
           coalesce(sum(calories),  0) as calories,
           coalesce(sum(carbs_g),   0) as carbs_g,
           coalesce(sum(protein_g), 0) as protein_g,
           coalesce(sum(fat_g),     0) as fat_g,
           coalesce(sum(fibre_g),   0) as fibre_g,
           count(fibre_g) > 0          as fibre_known
      from public.recipe_ingredients
     where recipe_id = 'smoked-salmon-scrambled-eggs'
     group by recipe_id
  ) t
 where t.recipe_id = r.id;

do $$
declare
  n int;
  kcal numeric;
begin
  select count(*) into n from public.recipes where collection = 'lunch';
  if n <> 1 then
    raise exception 'expected exactly one recipe in the lunch collection, found %', n;
  end if;

  select calories into kcal from public.recipes where id = 'smoked-salmon-scrambled-eggs';
  if kcal is null or kcal < 450 or kcal > 470 then
    raise exception 'scrambled eggs recomputed to % kcal, expected about 459', kcal;
  end if;
end $$;

-- Same Atwater guard the seeds use: a 15% band catches a misplaced decimal
-- without tripping on rounding or fibre.
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
