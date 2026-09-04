-- Tag the seeded recipes to cycle phases, so the "for your phase" rail exists.
--
-- Until now every recipe shipped with `phases = '{}'`, which the schema reads as
-- "suits any phase". That is the honest default, but it has a visible cost: the
-- rail filters on an explicit phase match and hides itself when nothing matches,
-- so the rail has never once appeared. One of the tab's two headline ideas was
-- invisible.
--
-- These are content judgements, made against the app's own phase targets in
-- src/lib/nutritionTargets.ts rather than invented. What those targets say:
--
--   menstrual   lowest calories and carbs of the four
--   follicular  protein climbs, for adaptation
--   ovulatory   the peak: highest carbs AND highest protein
--   luteal      highest carbs overall, highest fat, protein eases back
--
-- So carbohydrate-dense recipes earn ovulatory and luteal, protein-dense ones
-- earn follicular and ovulatory, and menstrual is where iron-bearing recipes
-- belong, since that is the phase where iron actually matters.
--
-- Deliberately at most two phases each. A recipe tagged to everything is the
-- same as a recipe tagged to nothing, only less honest: the rail would fill
-- with recipes that merely happen to exist rather than ones that suit today.
--
-- EMMA: these are mine, not yours, and every one is a single line to change.
-- `loads` is left empty on purpose; that is a separate pass.

begin;

-- 110 kcal, 11 g protein, 2 g carbs. Forty per cent of its calories are protein,
-- which is the most protein-dense thing in the book.
--   menstrual  : spinach, egg yolk and bacon carry iron, and small warm savoury
--                portions suit the phase with the lowest calorie target
--   follicular : protein density is exactly what the rising-protein phase wants
update public.recipes
   set phases = array['menstrual','follicular']::text[]
 where id = 'mini-frittata-bites';

-- 414 kcal, 44 g carbs, 28 g protein, and sweet.
--   luteal     : the highest-carb phase, and a recipe that answers a sweet
--                craving honestly rather than pretending it away. Oats bring
--                magnesium, which is the mineral luteal is usually short of
--   follicular : 28 g of protein still serves adaptation
update public.recipes
   set phases = array['follicular','luteal']::text[]
 where id = 'biscoff-overnight-oats';

-- 410 kcal, 68 g carbs, 11 g protein. The most carbohydrate-dominant recipe.
--   menstrual  : dried apricots and almonds are non-haem iron, and the tomato
--                and lemon alongside them supply the vitamin C that makes that
--                iron absorbable. That pairing is the reason, not the carbs
--   ovulatory  : the peak-carbohydrate phase, and it is quick pre-session fuel
update public.recipes
   set phases = array['menstrual','ovulatory']::text[]
 where id = 'fruity-cous-cous';

-- 506 kcal, 71 g carbs, 24 g protein. The only recipe that is high in both.
--   ovulatory  : the one phase whose targets peak on carbohydrate AND protein
--   luteal     : highest carbs overall, and this has the most of any recipe
update public.recipes
   set phases = array['ovulatory','luteal']::text[]
 where id = 'prawn-pineapple-stir-fry';

-- Every phase must offer at least one recipe, or the rail stays invisible for
-- whoever is in the phase we missed, which is the bug this migration fixes.
do $$
declare ph text; n int;
begin
  foreach ph in array array['menstrual','follicular','ovulatory','luteal'] loop
    select count(*) into n from public.recipes
     where is_active and phases @> array[ph]::text[];
    if n < 1 then
      raise exception 'No recipe is tagged to the % phase; its rail would never appear', ph;
    end if;
  end loop;
end $$;

commit;
