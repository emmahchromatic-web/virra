-- =============================================================================
-- SUBJECT ACCESS REQUEST (GDPR Art. 15 / Art. 20) -- manual export
--
-- Card 249. Interim process until a self-service export ships.
--
-- WHY THIS IS NOT JUST A LIST OF TABLES
--
-- The repo's migrations are NOT a complete description of the production
-- schema. At least two tables holding personal data were created through the
-- dashboard and have no create-table migration:
--
--   * body_weights  -- every weight reading the user has ever recorded, plus
--                      the cycle phase each was taken in. Arguably the most
--                      sensitive data Virra holds.
--   * insight_cache -- singular; distinct from public.insights_cache, which
--                      DOES have a migration. Both exist in production. This
--                      is the pair that broke Delete Account in build 7.
--
-- A SAR query hand-written from the repo would have silently omitted the
-- user's entire weight history. Understating what we hold is itself a
-- compliance failure, so §1 discovers the truth from the live schema and §2
-- generates the export from that discovery rather than from a list anyone has
-- to remember to maintain.
--
-- Run §1 and §2 in order. Both are READ-ONLY.
--
-- NOT YET RUN AGAINST THE LIVE DATABASE. Written from the migrations and
-- never executed -- there is no Postgres on the machine it was written on.
-- §1 is a harmless catalogue query, so run that first: if it returns sensible
-- rows the connection and syntax are good.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- §1  COVERAGE CHECK -- run this FIRST, every time
--
-- Every table in public that keys to a user, discovered from the live schema.
-- If a table appears here that you do not recognise, it still holds personal
-- data and still belongs in the export.
-- -----------------------------------------------------------------------------
select
  c.table_name,
  c.column_name                                   as user_key,
  (select count(*) from information_schema.columns k
    where k.table_schema = 'public' and k.table_name = c.table_name) as columns,
  obj_description(format('public.%I', c.table_name)::regclass)       as comment
from information_schema.columns c
where c.table_schema = 'public'
  and (
    c.column_name = 'user_id'
    -- user_profiles keys on id, not user_id: it IS the user row.
    or (c.table_name = 'user_profiles' and c.column_name = 'id')
  )
order by c.table_name;


-- -----------------------------------------------------------------------------
-- §2  GENERATE THE EXPORT
--
-- Emits the SQL text of a complete export for every directly-keyed table found
-- in §1.
--
-- Find-and-replace <<USER_UUID>> with the subject's id FIRST (it appears more
-- than once), then run this. It returns a single text cell: copy that into a
-- new editor tab and run it. That second query is the actual export.
--
-- Generated rather than hand-maintained so it cannot go stale: a table added
-- next month is included the first time this is run, with nobody having to
-- remember it exists.
-- -----------------------------------------------------------------------------
select
  'select jsonb_pretty(jsonb_build_object(' || E'\n' ||
  '  ''export_generated_at'', now(),' || E'\n' ||
  '  ''subject_user_id'', ' || quote_literal('<<USER_UUID>>') || '::uuid,' || E'\n' ||
  string_agg(
    format(
      '  %L, (select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x where x.%I = %L::uuid)',
      c.table_name, c.table_name, c.column_name, '<<USER_UUID>>'
    ),
    ',' || E'\n' order by c.table_name
  ) || E'\n' || '));'                             as export_sql
from information_schema.columns c
where c.table_schema = 'public'
  and (
    c.column_name = 'user_id'
    or (c.table_name = 'user_profiles' and c.column_name = 'id')
  );


-- -----------------------------------------------------------------------------
-- §3  THE PARTS DISCOVERY CANNOT INFER
--
-- These hold the subject's data but carry no user column, so no catalogue query
-- will find them. They must be added to the export by hand. Replace the UUID in
-- all four places.
-- -----------------------------------------------------------------------------
select jsonb_pretty(jsonb_build_object(
  'subject_user_id', '<<USER_UUID>>'::uuid,

  -- The auth record itself: email, sign-in history, provider metadata.
  'account', (
    select to_jsonb(a) from (
      select u.id, u.email, u.phone, u.created_at, u.updated_at,
             u.last_sign_in_at, u.email_confirmed_at,
             u.raw_app_meta_data, u.raw_user_meta_data
      from auth.users u
      where u.id = '<<USER_UUID>>'::uuid
    ) a
  ),

  -- food_entries has no user_id. It joins through nutrition_logs.
  'food_entries', (
    select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb)
    from public.food_entries f
    where f.log_id in (
      select n.id from public.nutrition_logs n where n.user_id = '<<USER_UUID>>'::uuid
    )
  ),

  -- run_details and strength_details hang off activities.
  -- run_details.gps_trace is a precise location history. It is personal data of
  -- a particularly sensitive kind and must not be omitted from a SAR.
  'run_details', (
    select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
    from public.run_details r
    where r.activity_id in (
      select a.id from public.activities a where a.user_id = '<<USER_UUID>>'::uuid
    )
  ),
  'strength_details', (
    select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
    from public.strength_details s
    where s.activity_id in (
      select a.id from public.activities a where a.user_id = '<<USER_UUID>>'::uuid
    )
  ),

  -- Storage. Onboarding and the profile screen both write the avatar to
  -- avatars/<user_id>/avatar.jpg. `owner` is null for service-role uploads, so
  -- match on the path prefix too rather than trusting one of them.
  'stored_files', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'bucket',     o.bucket_id,
      'path',       o.name,
      'created_at', o.created_at,
      'updated_at', o.updated_at,
      'size_bytes', (o.metadata->>'size')
    )), '[]'::jsonb)
    from storage.objects o
    -- If this errors on `owner`, the project is on a Storage version that uses
    -- owner_id text instead. Drop that line: the path prefix alone is correct
    -- for avatars, which is the only bucket in use today.
    where o.owner = '<<USER_UUID>>'::uuid
       or o.name like '<<USER_UUID>>' || '/%'
  )
));


-- =============================================================================
-- §4  DELIBERATELY EXCLUDED, AND WHY
--
-- Shared editorial content, identical for every user and not personal data:
--   articles, exercises, plan_templates, programmes, programme_days,
--   programme_exercises, recipes, recipe_ingredients, recipe_steps, tips
--
-- Note that recipe_FAVOURITES is personal (it is user_id-keyed and reveals
-- preferences) and IS picked up by §1. Only the recipe content is excluded.
--
--
-- §5  KNOWN GAPS -- input for next week's privacy work, NOT solved here
--
-- 1. haiku_meal_cache. Primary key is a hash of the meal description, with the
--    user's own free-text description stored alongside it and NO user column.
--    So a description someone typed cannot be attributed back to them, which
--    means it can be neither exported under Art. 15 nor erased under Art. 17,
--    and it survives account deletion. Whether it is personal data depends on
--    what people type: "chicken salad" is not, a description mentioning a
--    medical condition is. Worth a decision -- add a user_id, or stop storing
--    the raw description and key the cache on the hash alone.
--
-- 2. Erasure vs this export. delete-account cascades from auth.users, so the
--    two paths are independent. Anything appearing here that is NOT cascade-
--    deleted is a right-to-erasure gap. Worth diffing the two once.
--
-- 3. Identity verification. Answering a SAR to the wrong person is itself a
--    breach, and an email address alone is weak proof. Agree a check before
--    the first request arrives, not during it.
--
-- 4. The clock is ONE CALENDAR MONTH from receipt. Log the date received and
--    the date answered, with a named owner.
-- =============================================================================
