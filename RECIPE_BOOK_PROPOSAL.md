# VIRRA Recipe Book — Design Proposal

**Written 2026-08-26 · seven decisions resolved with Emma the same day · Trello card 214**

> ### ⚠ Decisions A and D are REOPENED, 2026-08-26
> The Exceed Nutrition licence was checked against its published Terms of Service and **it does
> not permit this use.** See section 11. The schema, the matching engine, the screens and
> decisions B, C, E, F and G are unaffected and still stand; only the content source does. Read
> section 11 before acting on section 9.

The Recipes tab has been a holding page since the education library was descoped
(`app/(app)/(tabs)/recipes.tsx`), and the paywall deliberately refuses to sell it because it
"has no content model yet" (card 211). This is the content model, the read and write paths, the
screens, and the build order.

**Two things changed during the decision pass and they reshape the work:** the recipes come from
Emma's licensed **Exceed Nutrition** white-label pack rather than being authored from scratch, and
that pack carries **per-serving macro totals only, not per-ingredient**.

---

## 1. The headline

**A recipe is a `meal_combos` row with a method attached.** That is the insight the model is built
on, and it decides most of the rest.

The logging path already exists and already works. `food-search.tsx` `handleAddCombo` takes a
saved combination of foods and writes it into `food_entries`. A recipe is close to the same
object: content you supply rather than the user, carrying method steps and a photo, scaled by
servings rather than logged as-is. So the rule is **do not build a second food system** — mirror
the Get Strong programmes content model, and *Log this recipe* costs very little.

What changed is where the risk sits. The original draft called content the blocker, on the
evidence of the training plans and the articles. With Exceed supplying the recipes, **the blocker
moves from authoring to adaptation and licensing**: de-Americanising the copy, converting cups to
grams, and confirming the licence covers both redistribution in the app and use in a paid product.
That is a smaller job than writing forty recipes, but it is not a trivial one, and the licence
question is the only thing here that can stop the feature outright.

---

## 2. What the app already gives us

Everything needed to make a recipe feel personalised is already on the device.

| Signal | Where it lives | Already used for |
|---|---|---|
| Cycle phase | `cycleEngine.ts`, on-device, offline | training load, targets |
| Training load | `dailyTrainingContext.ts` | today's nutrition targets |
| Macro targets | `nutritionTargets.ts` — phase × load, 5 macros | Nutrition tab rings |
| Eaten so far today | `food_entries` via `nutrition_logs` | Nutrition tab |
| Meal slot from clock | `nutritionLog.ts` `defaultMealSlot` | quick-log |
| Dietary prefs | `user_profiles.dietary_prefs` (column exists, unpopulated) | nothing yet |

So "meals that hit your targets without needing a second thought" — the promise already on the
holding page — is a **ranking problem, not a new data problem**.

---

## 3. The data model

Four tables, following the programmes precedent: text slug primary keys, `sort_order`,
`is_active`, RLS with an authenticated-read-only policy, content seeded by migration.

```sql
recipes
  id                text primary key        -- slug, e.g. 'miso-salmon-rice-bowl'
  name              text not null
  collection        text not null           -- 'quick-dinners', 'pre-run', ...
  collection_label  text not null
  intro             text                    -- one or two sentences, VIRRA voice
  meal_types        text[] not null         -- subset of breakfast/lunch/dinner/snack
  phases            text[]  default '{}'    -- empty = suits any phase
  loads             text[]  default '{}'    -- empty = suits any training load
  dietary           text[]  default '{}'    -- 'vegetarian','vegan','gf','df','pescatarian'
  serves            int  not null default 1
  prep_minutes      int
  cook_minutes      int
  image_url         text                    -- Exceed imagery if the licence allows, else null
  min_tier          text                    -- null = included in the base subscription
  source            text not null default 'exceed'   -- provenance of the content
  -- PER-SERVING macros, AUTHORED from the Exceed pack (see 3.1)
  calories numeric not null default 0
  carbs_g  numeric not null default 0
  protein_g numeric not null default 0
  fat_g    numeric not null default 0
  fibre_g  numeric                          -- nullable: Exceed may not supply fibre
  sort_order int not null default 0
  is_active  boolean not null default true

recipe_ingredients
  id              bigint identity primary key
  recipe_id       text not null references recipes(id) on delete cascade
  position        int  not null
  group_label     text                      -- 'For the dressing', null for the main list
  food_name       text not null
  quantity        numeric                   -- null for "a pinch", "to taste"
  unit            text not null default 'g' check (unit in ('g','ml'))
  note            text                      -- 'finely sliced'
  common_food_id  text                      -- provenance into COMMON_FOODS, nullable
  -- nullable throughout: the Exceed pack has no per-ingredient breakdown, and
  -- these stay empty until a recipe is macro'd by hand. Never load-bearing.
  calories, carbs_g, protein_g, fat_g, fibre_g   numeric
  unique (recipe_id, position)

recipe_steps
  id            bigint identity primary key
  recipe_id     text not null references recipes(id) on delete cascade
  position      int  not null
  body          text not null
  timer_seconds int                          -- optional, drives a tap-to-start timer
  unique (recipe_id, position)

recipe_favourites            -- user-owned, RLS owner_all
  user_id    uuid references auth.users(id) on delete cascade
  recipe_id  text references recipes(id) on delete cascade
  created_at timestamptz default now()
  primary key (user_id, recipe_id)
```

### 3.1 Macros are authored, and that is a deliberate downgrade

The first draft of this proposal derived each recipe's totals from its ingredient rows, so there
was exactly one source of truth. **The Exceed pack makes that impossible** — it supplies
per-serving totals and no per-ingredient breakdown. So the totals are authored onto `recipes`,
and `recipe_ingredients` becomes display text: quantities and notes the user reads while cooking,
with macro columns that exist but stay null.

Two consequences worth stating rather than discovering later:

- **A recipe's macros may disagree with what the same foods log as through search.** Exceed's
  numbers and `COMMON_FOODS` are different sources. The difference will be small and it is well
  inside the noise already present from Open Food Facts and Haiku estimates, but it is real.
- **Per-ingredient logging is permanently off the table** unless someone macros the ingredients by
  hand. This is why decisions B and F below are not merely preferable, they are forced.

### 3.2 An import sanity check, since we did not write these numbers

Because the macros arrive from outside, the seed should verify them rather than trust them. An
Atwater check catches transcription errors cheaply:

```
expected ≈ 4×carbs_g + 4×protein_g + 9×fat_g
flag any recipe where |calories − expected| > 15% of calories
```

A recipe that fails is not necessarily wrong (alcohol, fibre, rounding), but it should be looked
at before it ships. This runs as a unit test over the seeded data in PR 1.

### 3.3 Tiering

`min_tier` is nullable and unused at launch, when the whole tab sits behind the existing paywall.
It exists because Emma expects to split the book across tiers before launch, and adding a column
now is free where retrofitting one across a seeded content table is not. Gating is a single helper
consulted in two places, and browsing is gated separately from the personalised rails, so a
"browse free, personalisation paid" split stays reachable without reworking PR 2 and PR 3.

---

## 4. Decision B — one `food_entries` row per recipe

`food_name` is "Miso salmon rice bowl", macros are per-serving × servings chosen, `source` is
`'recipe'`, `recipe_id` is set. The day view stays readable and the whole meal deletes in one tap.
Per-ingredient rows, which is what combos do, would need per-ingredient macros we do not have.

```sql
alter table food_entries
  add column if not exists recipe_id text references recipes(id),
  drop constraint food_entries_source_check,
  add constraint food_entries_source_check
    check (source in ('manual','common','off','barcode','haiku','recipe'));
```

---

## 5. Decision C — what "for you today" computes

A pure function in `src/lib/recipeMatch.ts`, side-effect free and unit tested, in the same style as
`strengthProgramme.ts`. No Supabase inside it.

```
slotShare        = breakfast 25% · lunch 30% · dinner 35% · snack 10% (takes the remainder)
remaining(slot)  = targets(phase, load) × slotShare(slot) − alreadyLogged(slot)

score(recipe)    = − distance(recipe per-serving macros, remaining)
                   + phaseBonus        recipe.phases includes today's phase
                   + loadBonus         recipe.loads includes today's load
                   − overshootPenalty  calories over remaining hurt more than under

filtered by      : meal_types includes slot, dietary prefs satisfied
```

**Ranking, never hiding.** A recipe that does not fit today still appears, lower down. The tab is a
book you browse, not a prescription, and the tone rule (fuelling language only, never restriction)
argues against telling a runner a meal is unavailable to her.

That gives the tab three rails: **For your phase**, **Fits what's left today**, and the collections.

---

## 6. Screens

| Route | What it is |
|---|---|
| `app/(app)/(tabs)/recipes.tsx` | replaces the holding page: the dietary prompt on first open, the two personalised rails, collection rows, search, favourites |
| `app/(app)/recipe/[slug].tsx` | hero, per-serving macro strip, servings stepper, ingredients scaled live, method steps, favourite toggle, **Log this** |
| `app/(app)/recipes/[collection].tsx` | full grid for one collection; deferred to a later card if the rails carry it |

The servings stepper scales the ingredient quantities and the macro strip together, and whatever is
on screen is exactly what gets logged. **Log this** opens the same meal-type picker the food search
uses, then writes the single row from section 4.

**Decision G — the dietary prompt.** A skippable "anything you don't eat?" card the first time the
tab is opened, writing to the existing `user_profiles.dietary_prefs` column. The question finally
has a reason to exist at the moment it matters, and the book is filtered correctly from the first
visit rather than after a dig through settings. Filter chips still exist in the tab for one-off
browsing. The onboarding diet step stays removed.

---

## 7. Decision D — photography, conditional on the licence

**If Exceed's imagery is covered by the licence, use it:** upload to a public `recipe-images`
Supabase Storage bucket (the `avatars` bucket is the working precedent) and populate `image_url`
in the seed. A recipe book without pictures is a list.

**If it is not covered, ship with `image_url` null.** The card design uses the existing
`VirraCard` treatment with a collection-tinted header and never assumes an image, so this is a
data difference rather than a design one, and photography can be added later without a migration.

Either way, no stock photography. It is the fastest way to make a good app look cheap.

---

## 8. Build order

**PR 1 — schema, import and read layer. No visible change.**
Migration creating the four tables plus the `food_entries` columns; the import script that converts
the Exceed pack into a seed migration; `src/lib/recipes.ts` (fetch, cache) and
`src/lib/recipeMatch.ts` (pure scoring) with unit tests, including the Atwater check from 3.2.
Mergeable and provable without touching the tab.

**PR 2 — the tab and the detail screen, read only.**
Holding page replaced, first-open dietary prompt, rails, search, collections, detail screen with
the servings stepper. `__tests__/app/recipes.test.tsx` gets rewritten — it currently asserts
"COMING SOON" and will fail loudly, which is correct. Device UAT before merge, per the ship rule
for substantial app features.

**PR 3 — writing, and the sell.**
*Log this* into `food_entries`, favourites, a "logged from a recipe" affordance in the Nutrition
tab, the tier gate helper, and the paywall bullet added now that the feature exists.

Migrations go to production by hand through the dashboard SQL editor, as usual.

---

## 9. The import and adaptation pipeline

Not an authoring brief any more. The Exceed pack has to be normalised before it can be seeded, and
this is the part that needs Emma's eye rather than a script.

**Mechanical, scriptable:**
- Cups, ounces and Fahrenheit into grams, millilitres and Celsius
- American ingredient names into UK ones — cilantro/coriander, scallion/spring onion,
  eggplant/aubergine, all-purpose/plain flour, broiler/grill, skillet/frying pan
- Slug generation, `position` ordering, splitting the method into `recipe_steps` rows
- The Atwater check from 3.2, flagging anything that looks mistranscribed

**Needs judgement, per recipe:**
- Which of the five collections it belongs to, and its `sort_order`
- `phases` and `loads` tags, which Exceed will not supply and which are the whole point of the
  feature. A high-carb bowl is a hard-session and luteal recipe; a high-iron one is menstrual.
- `dietary` tags, verified rather than inferred from the title
- The `intro` line rewritten in VIRRA's voice. Licensed copy will not sound like the app,
  and the intro is the most visible sentence on the card.
- Anything that reads as diet-culture framing gets rewritten or dropped. The tone rule is
  fuelling language only, and licensed nutrition copy very often is not.

Target for v1: **40 recipes across 5 collections** — Quick dinners · Pre-run and race morning ·
Recovery and high-protein · Batch and freeze · Breakfast.

---

## 10. Decisions, resolved 2026-08-26

| # | Decision | Resolution |
|---|---|---|
| **A** | Scale of v1 | ~~40 recipes via the Exceed pack~~ **REOPENED** — the licence does not permit it, section 11. |
| **B** | Log one row or one per ingredient | **One row per recipe.** Forced by per-serving-only macros, and better for the day view regardless. |
| **C** | Meal-slot macro shares | **25 / 30 / 35 / 10**, snack takes the remainder. |
| **D** | Photography in v1 | **REOPENED** with A. Falls back to `image_url` null, which the design already handles. No stock photography either way. |
| **E** | Free or paid | **Behind the paywall at launch**, with tiering expected before launch. Hence `min_tier` and a separate browse/personalisation gate, section 3.3. |
| **F** | What a recipe entry's portion says | **`quantity_g` null, servings in the name.** Does not invent a weight nobody measured. |
| **G** | Dietary preferences | **Ask once on first open of the tab**, writing to `user_profiles.dietary_prefs`. Skippable. Onboarding stays as it is. |

---

## 11. The licence question, answered: no

Checked 2026-08-26 against Exceed's published Terms of Service (v1.1, last updated 23 July 2026),
at `members.exceednutrition.com/wp-content/uploads/exceed/legal/01-terms-of-service.html`.
**The Exceed licence does not permit seeding these recipes into the VIRRA app.** Not conditionally,
not with attribution. The terms address this use directly and prohibit it.

**Clause 10.2** grants a licence that is non-exclusive, non-transferable, revocable and
*non-sublicensable*, to use and adapt the Resources "within your own coaching business and with
your own Clients", and only while the subscription is active and paid.

**Clause 2** defines a Client as a member's own end client, and **clause 4** states Exceed has no
relationship with them. A VIRRA app subscriber is not a coaching client of Emma's coaching
business; there is no engagement, intake or 1:1 relationship. So app users fall outside the only
group the licence permits delivery to.

**Clause 10.4** then rules it out four separate ways. It prohibits commercially exploiting the
Resources other than delivering them to one's own clients as part of coaching (a); repackaging
them into, or using them to build, a competing or substitutable library or platform (b);
sublicensing or transferring them to another business (c); and making them available on a public
website or marketplace, or to anyone other than one's own clients (d). Shipping them inside an App
Store subscription app is squarely (a), (b) and (d).

**Clause 10.5** adds a practical problem even if the above were survivable: the licence ends with
the subscription and copies must be deleted. Content seeded into a shipped mobile app cannot be
recalled from devices.

**Clause 10.3** permits white-labelling only for one's own Client, which is what the marketing
copy's "branded as your own" and "your clients never see our name" actually refer to. That is
coach-to-client delivery, not product distribution.

### What this changes

- **Decision A is reopened.** Its premise was that authoring could be bypassed. It cannot.
- **Decision D is reopened**, since it was conditional on the same licence.
- **Section 9 does not apply** to Exceed content and is retained only as a description of what an
  import pipeline would need to do for any licensed source.
- **Section 3.1 may revert.** "Per-serving totals only" was a fact about the Exceed pack. A
  different source may carry per-ingredient macros, in which case deriving recipe totals from
  ingredients becomes possible again and is the better design.
- **Nothing else moves.** The schema, `recipeMatch.ts`, the screens, the three-PR order and
  decisions B, C, E, F and G are all independent of where the recipes come from.

Rewriting the recipes in different words does not solve it. Clause 10.4(b) is a contractual
restriction on using the Resources to build a substitutable library, which bites regardless of how
much the wording changes.

### Routes forward, for Emma to choose

1. **Ask Exceed for a distribution licence.** A bespoke commercial licence is a normal
   conversation to have, and it is the only route that keeps the 40-recipe plan intact.
   `hello@exceednutrition.com`.
2. **Author in-house.** Back to the original recommendation of roughly 24 recipes, with content as
   the blocker again.
3. **License from a source whose terms permit app distribution**, or commission a recipe developer
   on a work-for-hire basis with rights assigned.

This is a reading of published terms, not legal advice. If the plan is to proceed on any reading
other than the one above, it should be a lawyer's reading and not mine.

---

## 12. What this does not cover

- **User-authored recipes.** The model is read-only content. Users saving their own is a natural
  sequel and would reuse `meal_combos` rather than these tables.
- **Shopping lists.** Ingredient rows make it possible; it is a separate feature.
- **Scaling by target rather than servings** ("make this hit 40 g of protein"). Not possible
  without per-ingredient macros, so it is now firmly a later idea.
