-- Widen which meal slots each seeded recipe suits.
--
-- Found on device, 2026-08-27: the "fits what is left for <slot>" rail showed a
-- single card. The scoring was right; the data was too narrow. The rail filters
-- on `meal_types` containing the current slot, and with four recipes each
-- claiming one or two slots, most slots had exactly one candidate:
--
--   breakfast : frittata, oats          lunch  : cous cous
--   dinner    : stir-fry                snack  : frittata
--
-- These are judgement calls about Emma's own recipes rather than anything
-- structural, and they are meant to be argued with. The rule applied: add a
-- slot only where the dish genuinely works there, not to pad the rails.
--
--   Mini Frittata Bites  + lunch   egg muffins are a normal packed lunch
--   Biscoff Overnight Oats + snack a small pot of oats is an afternoon snack
--   Fruity Cous Cous     + dinner  works as a light dinner, not only lunch
--   Prawn & Pineapple    + lunch   reheats well, so leftovers are lunch
--
-- After this every slot has at least two candidates, which is the point.
--
-- NOTE: this does not edit 20260826010000_seed_recipes_teamfit.sql, which is
-- already applied to production and merged. If that seed is ever re-run it
-- restores the narrow values, so re-run this migration after it. It is
-- idempotent and safe to run repeatedly.

begin;

update public.recipes
   set meal_types = array['breakfast','lunch','snack']::text[]
 where id = 'mini-frittata-bites';

update public.recipes
   set meal_types = array['breakfast','snack']::text[]
 where id = 'biscoff-overnight-oats';

update public.recipes
   set meal_types = array['lunch','dinner']::text[]
 where id = 'fruity-cous-cous';

update public.recipes
   set meal_types = array['lunch','dinner']::text[]
 where id = 'prawn-pineapple-stir-fry';

-- Prove the point of the change rather than trusting it: every slot must now
-- offer at least two recipes, or the rail is back where it started.
do $$
declare slot text; n int;
begin
  foreach slot in array array['breakfast','lunch','dinner','snack'] loop
    select count(*) into n from public.recipes
     where is_active and meal_types @> array[slot]::text[];
    if n < 2 then
      raise exception 'Slot % has only % recipe(s); the rail needs at least 2', slot, n;
    end if;
  end loop;
end $$;

commit;
