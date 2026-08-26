-- Recipe Book: the content model behind the Recipes tab (card 214).
--
-- The tab has been a holding page since the education library was descoped.
-- This is the schema the recipes live in, plus the two columns food_entries
-- needs so a recipe can be logged. No app code reads any of it yet.
--
-- Shape follows the Get Strong programmes precedent (20260819000000): text
-- slug primary keys so a seed migration is readable and re-runnable, sort_order
-- and is_active so content can be staged and reordered without code, and RLS
-- with an authenticated-read-only policy because this is content we ship, not
-- rows a user writes. recipe_favourites is the one exception and is user-owned.
--
-- The design note behind every choice here is RECIPE_BOOK_PROPOSAL.md.

begin;

-- ---------------------------------------------------------------------------
-- recipes
-- ---------------------------------------------------------------------------
-- Macros on this table are PER SERVING and are the number the app shows and
-- logs. They are written by the seed as the sum of recipe_ingredients divided
-- by serves, so ingredients stay the single source of truth even though the
-- totals are stored here for cheap filtering and sorting on the list screen.
create table if not exists public.recipes (
  id                text primary key,
  name              text not null,

  -- Which shelf of the book this sits on. collection is the slug used for
  -- grouping and routing; collection_label is what the reader sees, so a
  -- shelf can be renamed without touching any recipe's identity.
  collection        text not null,
  collection_label  text not null,

  -- One or two sentences in VIRRA's voice. The most visible line on a card.
  intro             text,

  -- Which meal slots this suits. Drives the filter on the Nutrition-tab side
  -- and the "fits what's left today" rail, which scores against one slot.
  meal_types        text[] not null,

  -- Cycle phases and training loads this recipe is a good answer to. EMPTY
  -- MEANS "SUITS ANY", not "suits none" — an empty array is the common case
  -- and must never exclude a recipe from a rail.
  phases            text[] not null default '{}',
  loads             text[] not null default '{}',

  -- Dietary properties of the recipe as authored, verified rather than
  -- inferred from the title. Read against user_profiles.dietary_prefs.
  dietary           text[] not null default '{}',

  serves            int not null default 1,
  prep_minutes      int,
  cook_minutes      int,

  -- Null until photography exists. The card design does not assume an image,
  -- so shipping without one is a data state and not a layout problem.
  image_url         text,

  -- Null means "included in the base subscription". Unused at launch, when the
  -- whole tab sits behind the existing paywall. It exists because the book is
  -- expected to split across tiers before launch and adding a column to a
  -- seeded content table later is far more disruptive than carrying it now.
  min_tier          text,

  -- Where the content came from, so a future licence question can be answered
  -- with a query instead of an audit.
  source            text not null default 'virra',

  -- Per serving. fibre_g is nullable because not every source supplies it and
  -- a guessed fibre figure is worse than an absent one; readers treat null as
  -- unknown, NOT as zero.
  calories          numeric not null default 0,
  carbs_g           numeric not null default 0,
  protein_g         numeric not null default 0,
  fat_g             numeric not null default 0,
  fibre_g           numeric,

  sort_order        int not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

-- Array membership rather than a per-element trigger: `<@` asserts every
-- element is drawn from the allowed set, which is exactly the guarantee we
-- want and costs nothing on write.
alter table public.recipes drop constraint if exists recipes_meal_types_check;
alter table public.recipes add constraint recipes_meal_types_check
  check (meal_types <@ array['breakfast','lunch','dinner','snack']::text[]
         -- coalesce because array_length('{}') is NULL, and `NULL >= 1` is
         -- NULL, which a CHECK treats as passing. Without it an empty
         -- meal_types slips through and the recipe appears in no slot at all.
         and coalesce(array_length(meal_types, 1), 0) >= 1);

alter table public.recipes drop constraint if exists recipes_phases_check;
alter table public.recipes add constraint recipes_phases_check
  check (phases <@ array['menstrual','follicular','ovulatory','luteal']::text[]);

alter table public.recipes drop constraint if exists recipes_loads_check;
alter table public.recipes add constraint recipes_loads_check
  check (loads <@ array['rest','easy','moderate','hard']::text[]);

alter table public.recipes drop constraint if exists recipes_dietary_check;
alter table public.recipes add constraint recipes_dietary_check
  check (dietary <@ array['vegan','vegetarian','pescatarian','gf','df']::text[]);

alter table public.recipes drop constraint if exists recipes_serves_check;
alter table public.recipes add constraint recipes_serves_check
  check (serves > 0);

comment on column public.recipes.phases is
  'Cycle phases this recipe suits. An EMPTY array means it suits any phase; it '
  'must never be read as "suits no phase".';
comment on column public.recipes.fibre_g is
  'Fibre per serving, or NULL when the source does not supply it. Null is '
  'unknown, not zero: VIRRA targets five macros and a guessed figure would '
  'quietly mis-report one of the five rings.';

-- ---------------------------------------------------------------------------
-- recipe_ingredients
-- ---------------------------------------------------------------------------
-- The per-ingredient macros are what recipes.* is derived from, and what makes
-- a recipe's numbers agree with what the same food logs as through search.
-- They are nullable throughout because a source may only supply per-serving
-- totals; when they are null the recipe's own totals are authored instead.
create table if not exists public.recipe_ingredients (
  id              bigint generated always as identity primary key,
  recipe_id       text not null references public.recipes(id) on delete cascade,
  position        int not null,

  -- 'For the dressing' and similar. Null for the main, ungrouped list.
  group_label     text,

  food_name       text not null,

  -- Null for "a pinch" / "to taste", which carry no useful weight.
  quantity        numeric,
  unit            text not null default 'g',

  -- 'finely sliced', '2 nests', 'save the juice'. Preparation, not quantity.
  note            text,

  -- Provenance into src/lib/commonFoods.ts. Null where the ingredient is not
  -- in the catalogue and the macros below came from reference values instead.
  -- Kept so that promoting COMMON_FOODS into a table stays a data migration.
  common_food_id  text,

  calories        numeric,
  carbs_g         numeric,
  protein_g       numeric,
  fat_g           numeric,
  fibre_g         numeric,

  unique (recipe_id, position)
);

alter table public.recipe_ingredients drop constraint if exists recipe_ingredients_unit_check;
alter table public.recipe_ingredients add constraint recipe_ingredients_unit_check
  check (unit in ('g','ml'));

comment on table public.recipe_ingredients is
  'Ingredient rows for a recipe. Macros are for the stated quantity of THAT '
  'ingredient in the WHOLE recipe, not per 100 g and not per serving.';

-- ---------------------------------------------------------------------------
-- recipe_steps
-- ---------------------------------------------------------------------------
create table if not exists public.recipe_steps (
  id            bigint generated always as identity primary key,
  recipe_id     text not null references public.recipes(id) on delete cascade,
  position      int not null,
  body          text not null,
  -- Set only where a step has a real wait worth timing. Drives a tap-to-start
  -- timer that reuses the rest timer already in the strength logger.
  timer_seconds int,
  unique (recipe_id, position)
);

-- ---------------------------------------------------------------------------
-- recipe_favourites
-- ---------------------------------------------------------------------------
create table if not exists public.recipe_favourites (
  user_id    uuid not null references auth.users(id) on delete cascade,
  recipe_id  text not null references public.recipes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
-- The list screen reads active recipes a shelf at a time, in authored order.
create index if not exists recipes_collection_sort_idx
  on public.recipes (collection, sort_order) where is_active;

-- Both child tables are only ever read for one recipe, already ordered.
create index if not exists recipe_ingredients_recipe_idx
  on public.recipe_ingredients (recipe_id, position);
create index if not exists recipe_steps_recipe_idx
  on public.recipe_steps (recipe_id, position);

-- The favourites rail reads one user's most recent first.
create index if not exists recipe_favourites_user_idx
  on public.recipe_favourites (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Content tables: any signed-in user may read, nobody may write. Seeding is
-- done by migration, so there is deliberately no insert/update/delete policy.
alter table public.recipes            enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps       enable row level security;

drop policy if exists "recipes_read" on public.recipes;
create policy "recipes_read" on public.recipes
  for select to authenticated using (true);

drop policy if exists "recipe_ingredients_read" on public.recipe_ingredients;
create policy "recipe_ingredients_read" on public.recipe_ingredients
  for select to authenticated using (true);

drop policy if exists "recipe_steps_read" on public.recipe_steps;
create policy "recipe_steps_read" on public.recipe_steps
  for select to authenticated using (true);

-- Favourites are the user's own rows.
alter table public.recipe_favourites enable row level security;
drop policy if exists "owner_all" on public.recipe_favourites;
create policy "owner_all" on public.recipe_favourites
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- food_entries: logging a recipe
-- ---------------------------------------------------------------------------
-- A logged recipe is ONE row, not one row per ingredient. The day view stays
-- readable, the whole meal deletes in one tap, and it works even where a
-- source gives per-serving totals only. recipe_id carries the provenance so
-- the entry can link back to what was cooked.
--
-- quantity_g stays null for these rows (it has been nullable since
-- 20260825000000) and the serving count travels in food_name instead. A gram
-- weight nobody put on a scale would be a fiction.
alter table public.food_entries
  add column if not exists recipe_id text
    references public.recipes(id) on delete set null;

alter table public.food_entries drop constraint if exists food_entries_source_check;
alter table public.food_entries add constraint food_entries_source_check
  check (source in ('manual','common','off','barcode','haiku','recipe'));

comment on column public.food_entries.recipe_id is
  'Set when this entry was logged from the recipe book. Null for every other '
  'source. Nullable and unenforced against source so a recipe deleted from the '
  'book does not invalidate a log of a meal somebody genuinely ate.';

commit;
