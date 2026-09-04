-- Tag the seeded recipes to training loads, completing the content pass.
--
-- Companion to 20260827010000 (phases). `loads` matters less than `phases`: an
-- empty loads array only forgoes a small ranking bonus, where an empty phases
-- array hid a whole rail. So this is a smaller change, made for the same
-- reason: an untagged recipe cannot be recognised as suiting today.
--
-- The load axis in src/lib/nutritionTargets.ts is a carbohydrate gradient. Every
-- phase moves the same way; luteal is representative:
--
--   rest      1900 kcal   215 g carbs   105 g protein
--   easy      2100        245           115
--   moderate  2300        275           130
--   hard      2550        310           145
--
-- Carbohydrate climbs hardest, so the tagging follows carbohydrate density.
-- Recipes that are mostly carbohydrate belong to the hard end, and the
-- protein-dense, near-zero-carb one belongs at the rest end where the carb
-- target is lowest and protein still has to be met.
--
-- Same discipline as the phase pass: at most two loads each, and a load is
-- added only where the recipe genuinely answers that day.
--
-- EMMA: content judgements again, one line each to change.

begin;

-- 110 kcal, 2 g carbs, 11 g protein. Forty per cent protein by calories and
-- almost no carbohydrate, which is the shape a low-carb day wants: protein
-- held up while the carbohydrate target comes down.
update public.recipes
   set loads = array['rest','easy']::text[]
 where id = 'mini-frittata-bites';

-- 414 kcal, 44 g carbs, 28 g protein. A genuinely mid-range breakfast: enough
-- carbohydrate to matter, enough protein to recover on, not so much of either
-- that it only makes sense around a hard session.
update public.recipes
   set loads = array['easy','moderate']::text[]
 where id = 'biscoff-overnight-oats';

-- 410 kcal, 68 g carbs, 11 g protein. The most carbohydrate-dominant recipe in
-- the book and the lowest in fat and fibre, which is what makes it sit well
-- close to a session rather than only in the day's totals.
update public.recipes
   set loads = array['moderate','hard']::text[]
 where id = 'fruity-cous-cous';

-- 506 kcal, 71 g carbs, 24 g protein. The most carbohydrate of any recipe here
-- and real protein alongside it, which is the combination a hard day is short
-- of by the evening.
update public.recipes
   set loads = array['moderate','hard']::text[]
 where id = 'prawn-pineapple-stir-fry';

-- Every load must offer at least one recipe. Unlike the phase rail an untagged
-- load hides nothing, so this is a weaker guarantee than the phase one by
-- design: it only ensures each kind of day has something that suits it.
do $$
declare ld text; n int;
begin
  foreach ld in array array['rest','easy','moderate','hard'] loop
    select count(*) into n from public.recipes
     where is_active and loads @> array[ld]::text[];
    if n < 1 then
      raise exception 'No recipe suits a % day', ld;
    end if;
  end loop;
end $$;

commit;
