-- Bring stored dietary preferences into the recipe book's vocabulary.
--
-- The onboarding diet step (added May 2026, deleted in 27f4e36) wrote long-form
-- ids: 'gluten-free', 'dairy-free', 'nut-free', 'halal'. The recipe book tags
-- recipes 'gf' and 'df', and `satisfiesDietary` asks the recipe to satisfy every
-- stored requirement, so an account carrying 'dairy-free' asked for something no
-- recipe could ever supply. Every recipe scored null, and all three rails on the
-- Recipes tab disappeared while the collection lists below still showed the whole
-- book: the tab looked like it had simply lost its rails.
--
-- Nothing migrated those rows when the screen was deleted. Two accounts still
-- carry 'dairy-free' and neither carries 'nut-free' or 'halal', so this maps only
-- the two values that HAVE a counterpart and leaves anything else untouched:
-- dropping a requirement the book cannot express is a product decision, not a
-- data cleanup, and it does not belong in a migration.

begin;

update public.user_profiles
   set dietary_prefs = (
     select array_agg(distinct mapped order by mapped)
       from (
         select case v
                  when 'gluten-free' then 'gf'
                  when 'dairy-free'  then 'df'
                  else v
                end as mapped
           from unnest(dietary_prefs) as v
       ) m
   )
 where dietary_prefs && array['gluten-free', 'dairy-free']::text[];

do $$
declare
  stale int;
begin
  select count(*) into stale
    from public.user_profiles
   where dietary_prefs && array['gluten-free', 'dairy-free']::text[];

  if stale <> 0 then
    raise exception 'dietary_prefs still holds % legacy row(s) after the rewrite', stale;
  end if;
end $$;

commit;
