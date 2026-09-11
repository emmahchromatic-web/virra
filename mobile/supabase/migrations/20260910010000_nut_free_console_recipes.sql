-- The three recipes added through the admin console on 10 September, audited
-- and tagged nut free.
--
-- The previous migration left them untagged because they had appeared from
-- another session mid-audit and had not been read. Emma confirmed they are hers
-- (added to test the console), and all thirty-two ingredient rows have now been
-- read line by line rather than pattern matched:
--
--   chipotle-chicken   slaw mix, chicken breast mini fillets, chicken stock,
--                      chipotle paste, garlic clove, ground coriander, ground
--                      smoked paprika, lime, mayonnaise, tomato puree,
--                      long grain rice
--   mexican-tray-bake  black beans, cherry tomatoes, chipotle paste, coriander,
--                      dried chilli flakes, feta cheese, ground cumin, ground
--                      smoked paprika, natural yoghurt, red pepper, sweet potato
--   sausage-ragu       chicken stock, chinese rice wine, cracked black pepper,
--                      dried bay leaves, fresh pasta, garlic clove, parmesan
--                      cheese, ground paprika, sausage meat, tomato puree
--
-- No nuts in any of them. The same caveat as before applies: this is a claim
-- about the recipe as written, not about what a given brand of chipotle paste
-- or mayonnaise was made alongside.

begin;

update public.recipes
   set dietary = (
     select array_agg(distinct v order by v)
       from unnest(dietary || array['nf']) as v
   )
 where id in ('chipotle-chicken', 'mexican-tray-bake', 'sausage-ragu');

do $$
declare
  tagged int;
  leaked text;
begin
  select count(*) into tagged from public.recipes where 'nf' = any(dietary);
  if tagged <> 20 then
    raise exception 'expected 20 recipes tagged nut free, found %', tagged;
  end if;

  -- Named nuts match as substrings so plurals are caught; the bare word "nut"
  -- keeps its boundaries so it does not fire on "Mushrooms, chestnut".
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
