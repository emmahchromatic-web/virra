-- Nut audit of the twenty-five recipes, so 'nut free' can be a filter that
-- actually works rather than a preference the app quietly ignores.
--
-- The tag is a POSITIVE claim: 'nf' means "audited, contains no nuts". That
-- direction matters. `satisfiesDietary` requires a recipe to carry every
-- requirement asked for, so a recipe that has not been audited simply fails the
-- filter and is not shown. Absence is safe by construction: the failure mode of
-- forgetting to tag something is a recipe missing from a list, never a recipe
-- with peanut butter in it being offered to someone avoiding nuts.
--
-- Audited by reading all 96 distinct ingredients across the 180 ingredient rows
-- rather than pattern-matching names. A first pass using a word-boundary regex
-- missed "Flaked almonds", because \balmond\b does not match the plural; that
-- near miss is why this was done by eye.
--
-- Six contain nuts outright:
--   banana-peanut-porridge, protein-recovery-shake, race-morning-bagel  peanut butter
--   biscoff-overnight-oats                                              almond milk
--   cottage-cheese-recovery-pot                                         almonds
--   fruity-cous-cous                                                    flaked almonds
--
-- Two are withheld rather than excluded on their own merits:
--   greek-yogurt-berry-bowl, pineapple-yogurt-pot   list a generic "Granola",
--   and most supermarket granola contains nuts. Naming a nut-free granola in
--   the ingredient would let both qualify; that is Emma's call, not a guess to
--   make on behalf of somebody with an allergy.
--
-- Three recipes added to production on 10 September by another session
-- (chipotle-chicken, sausage-ragu, mexican-tray-bake) are left untagged. A
-- pattern audit against live data finds no nuts in them, but they were written
-- by somebody else, may still be changing, and have not been read line by line.
-- Untagged is the safe state, so they wait rather than being certified on a
-- regex.
--
-- What this CANNOT know: manufacturing cross-contamination, "may contain"
-- warnings, and whatever brand someone actually buys. The claim is about the
-- recipe as written.

begin;

-- The vocabulary is constrained on purpose, so widening it is the first step
-- rather than an afterthought: without this the update below is rejected, which
-- is exactly what happened the first time this was run.
alter table public.recipes drop constraint if exists recipes_dietary_check;
alter table public.recipes add constraint recipes_dietary_check
  check (dietary <@ array['vegan','vegetarian','pescatarian','gf','df','nf']::text[]);

-- Tagged from an explicit list, never "everything except". The book is being
-- edited concurrently (three recipes appeared while this was being written), and
-- an exclusion list silently tags whatever arrives next. An allow-list fails the
-- other way: a new recipe is simply absent from nut-free results until somebody
-- audits it.
update public.recipes
   set dietary = (
     select array_agg(distinct v order by v)
       from unnest(dietary || array['nf']) as v
   )
 where id in (
   'beef-black-bean-rice',
   'chicken-quinoa-bowl',
   'chickpea-spinach-curry',
   'honey-banana-toast',
   'lemon-chicken-new-potatoes',
   'mackerel-green-lentils',
   'mini-frittata-bites',
   'mushroom-spinach-omelette',
   'prawn-pineapple-stir-fry',
   'pre-run-smoothie',
   'red-lentil-vegetable-soup',
   'salmon-sweet-potato-broccoli',
   'smoked-salmon-scrambled-eggs',
   'sweet-potato-black-bean-chilli',
   'tofu-edamame-noodles',
   'tuna-pasta-with-passata',
   'turkey-vegetable-chilli'
 );

do $$
declare
  tagged int;
  leaked text;
begin
  select count(*) into tagged from public.recipes where 'nf' = any(dietary);
  if tagged <> 17 then
    raise exception 'nut audit expected to tag 17 recipes, tagged %', tagged;
  end if;

  -- Named nuts match as substrings, because \yalmond\y does not match "Flaked
  -- almonds" and that is how the first pass of this audit missed one. The bare
  -- word "nut" is the exception and keeps its boundaries, or it fires on
  -- "Mushrooms, chestnut" -- which it did, on the first run of this migration.
  select string_agg(distinct r.id, ', ') into leaked
    from public.recipes r
    join public.recipe_ingredients i on i.recipe_id = r.id
   where 'nf' = any(r.dietary)
     and i.food_name ~* '(almond|peanut|cashew|walnut|pecan|hazelnut|pistachio|macadamia|brazil|pine nut|praline|marzipan|nougat|granola|satay|\ynuts?\y)';

  if leaked is not null then
    raise exception 'recipes tagged nut free that contain nuts: %', leaked;
  end if;
end $$;

commit;
