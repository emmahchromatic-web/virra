# VIRRA Admin Console — Design Proposal

**Written 2026-08-30 · a local Python tool for editing app content without a code release**

> ### Scope narrowed, and BUILT — 2026-08-30
> Emma narrowed the console to **training programmes and recipes**; authored copy
> (`tips`, `articles`) is out for now, which closes decisions A and B below and shrinks the
> allowlist from ten tables to eight. Decisions C and D were taken as recommended.
> **The tool is written and tested** — see `tools/admin/` and its README. Section 3A is
> retained as the record of what was deferred and why.

Every piece of authored content in VIRRA — tips, articles, recipes, strength programmes — is
currently changed the same way: write a SQL migration, hash-verify it into the Supabase dashboard
editor, click Run against production, then verify with a `select`. That is a careful process and it
has worked, but it makes a typo in a recipe intro cost the same as a schema change, and it puts
Claude in the loop for edits that are purely Emma's judgement.

This proposes a **local-only Python web tool**, run from your Mac, that gives you create / read /
update / delete over the three content domains you named, writing straight to production Supabase.
It is not deployed, not an app, and not exposed to anyone else.

---

## 1. The headline

**The tool is a safety layer, not a form.** A generic table editor already exists — the Supabase
dashboard has one. The reason to build this is everything the dashboard cannot do:

| The dashboard lets you | The console would |
|---|---|
| Type any value into `default_tempo` | Reject anything that isn't `2-1-2-1` shape, before it saves |
| Edit `recipes.calories` freely | Compute it from the ingredients and refuse to let the two drift |
| Delete a recipe | Warn that breakfast would drop to one recipe and the rail would break |
| Edit `programmes` | Also regenerate the `plan_templates` row that is derived from it |
| Edit any of 30 tables, including user data | Physically refuse to touch anything outside 10 content tables |

The migration comment on the tempo constraint already says the quiet part out loud: *"Edited by
hand in the Table Editor and read live by the app, so a malformed value would reach every enrolled
user silently."* That is the risk this removes.

---

## 2. What it is, concretely

A small Python program in the repo at `tools/admin/`. You run one command:

```bash
python3 tools/admin/run.py
```

It starts a web server bound to `127.0.0.1` only, opens `http://127.0.0.1:8787` in your browser,
and you edit content in ordinary web forms. Close the terminal and it is gone. Nothing is deployed,
there is no login screen, and no other machine — including on your own wifi — can reach it.

**Stack:** FastAPI + Jinja templates + plain HTML forms, talking to Supabase's REST API (PostgREST)
with `httpx`. Five dependencies, no build step, no npm, no JavaScript framework.

**Why not the alternatives:**

- **Streamlit** — fastest to write, but nested content (a recipe with 12 ingredients and 8 steps in
  one screen) fights its execution model badly, and every keystroke re-runs the script.
- **A command-line script** — fine for bulk imports, hopeless for editing prose.
- **A Next.js/React admin app** — a whole second front-end to maintain, and it would want deploying,
  which is exactly what you said you don't want.
- **Just better SQL views in the dashboard** — cheap, but it does none of the five things in the
  table above.

---

## 3. Scope — the three domains

### A. Authored copy — DEFERRED 2026-08-30

| Table | Rows | Live in the app? |
|---|---|---|
| `tips` | phase × category tips shown in `TipsCarousel` | **Yes** |
| `articles` | `title`, `slug`, `body_md`, `tags[]`, `linked_feature`, `published_at` | **No** — nothing reads this table; the education library was descoped |

For `tips`: a table you can sort, toggle `active`, and edit inline. For `articles`: a markdown
editor with a live preview, and publish/unpublish as a `published_at` toggle rather than a raw
timestamp field.

> **Worth knowing before you invest here:** `articles` has a table and an RLS policy but no screen.
> Authoring articles in the console would be writing content ahead of the UI that shows it. That
> may be exactly what you want — content is the launch blocker — but it is not a shortcut to a
> shipped education library.

**A decision for you:** a lot of VIRRA's authored copy is *not* in the database — onboarding
screens, paywall copy, achievement text, the phase explainers — it is TypeScript string literals.
Those cannot be edited without a code release no matter what we build here. If "authored copy"
meant those, the honest answer is a different project: move them into a `copy` table first, then
the console edits them. See §8.

### B. Recipes

The richest screen. One page edits `recipes` plus its `recipe_ingredients` and `recipe_steps`
children together.

- **Macros are computed, not typed.** The schema's own rule is that per-serving totals are the sum
  of the ingredients divided by `serves`. The console does that arithmetic live as you type
  ingredients, shows the computed figure next to the stored one, and blocks a save where they
  disagree without you explicitly overriding. This is the single biggest win over the SQL editor.
- **Tag pickers, not free text.** `meal_types`, `phases`, `loads` and `dietary` are all constrained
  to fixed sets by CHECK constraints. Checkboxes, so a 400 is impossible.
- **`fibre_g` gets an explicit "unknown" state.** Null means unknown and must never be typed as 0 —
  a blank number box would quietly get this wrong, so it needs a deliberate control.
- **Invariants are checked on save.** The seed migrations assert every meal slot has ≥2 active
  recipes and every cycle phase has ≥1. The console re-runs those checks after any save and warns
  you before you deactivate the last breakfast.
- Reorder within a collection by drag or by number; `is_active` to stage a recipe before it shows.

### C. Authored training programmes

**Strength (the Get Strong family)** — the real target, and the fiddliest data in the app:
`programmes` → `programme_days` → `programme_exercises`, where each day carries three complete
variants (`gym`, `dumbbells`, `bodyweight`) × three blocks × five sections. Plus the shared
`exercises` catalogue (name, description, `load_type`, `default_tempo`).

The console gives a day-at-a-glance grid: variants side by side, so you can see that the bodyweight
column is missing an accessory exercise — something no row-based table editor will ever show you.

**Two things it must do that hand-editing does not:**

1. **Re-derive the `plan_templates` row.** Strength plan templates are *generated from* `programmes`
   by migration `20260819010000` — name, description, tagline, sort order and a 12-week
   `sessions_json` built from the day focus strings. Edit a programme in the dashboard today and the
   plan picker keeps showing the old name. The console regenerates that row on every programme save.
2. **Validate tempo and slugs.** `default_tempo` must match `n-n-n-n`; `programme_days.id` must be
   `<programme_id>-d<n>`; `programme_exercises` is unique on
   `(day, variant, block, section, position)`. All enforced in the form.

**Run programmes — a deliberate near-exclusion.** This one has changed under your feet and it is
worth being straight about it. `plan_templates.sessions_json` used to be where run plans lived. As
of the generator work merged for build 13, run plans are **generated in code** from archetypes,
volume curves and pace models; the templates are a fallback. The agreed architecture stance in
`RUN_PROGRAMME_GENERATOR_SPEC.md` is explicit: *engine parameters live in code, the DB keeps only
presentation copy.*

So the console covers run programmes' **presentation only** — name, tagline, description, sort
order, `is_active`. It deliberately does **not** offer an editor for `sessions_json`, because
editing it would change something the app increasingly ignores, and the thing you'd actually want
to change (how hard week 6 is) is a TypeScript constant with a test suite around it.

---

## 4. The problem this creates, and the answer

Content is currently seeded by migration, so **the repo is the record of what's in production**.
The moment you start editing live rows, that stops being true — and worse, three of the seed
migrations are *destructive*:

```
delete from public.recipes where source = 'virra-teamfit';
delete from public.recipes where source = 'virra-authored';
delete from programmes where family = 'get_strong';
```

Anyone re-running those wipes your edits. Two things follow, and both are non-negotiable parts of
the build:

1. **Freeze the seed migrations.** Once the console is live, those files get a header saying they
   are historical and must never be re-run, and the content model's source of truth formally moves
   from the repo to the database.
2. **The console exports a snapshot.** An "Export to repo" action per domain regenerates
   `mobile/supabase/seeds/content/<domain>.sql` from the live rows — a faithful, committable dump.
   You commit it when you've finished a batch of edits. That gives you history, code review if you
   want it, and a rebuild path if the project is ever restored from scratch.

Plus a local audit log: every write appends to `tools/admin/changes/YYYY-MM-DD.jsonl` with the
before and after. Untracked, but it means "what did I change on Tuesday" is answerable.

---

## 5. Safety rails

The console uses the Supabase **`service_role`** key, because the content tables are read-only to
everyone else by RLS. That key bypasses row-level security completely — it can read and delete any
user's data. So the rails matter more than the features:

- **Table allowlist, hard-coded.** Eight tables: `recipes`, `recipe_ingredients`,
  `recipe_steps`, `programmes`, `programme_days`, `programme_exercises`, `exercises`,
  `plan_templates`. Every request is checked against it. There is no code path from this tool to
  `activities`, `cycle_logs`, `user_profiles`, `food_entries` or anything else user-owned.
- **Localhost only.** Bound to `127.0.0.1`. Not `0.0.0.0`, ever.
- **The key never enters the repo.** It lives in `tools/admin/.env`, which `.gitignore` already
  covers (`.env` matches at any depth). The tool refuses to start if it finds the key in a tracked
  file.
- **No hard deletes by default.** Where a table has `is_active`, "delete" sets it false. A true
  delete requires typing the row's id to confirm, and is refused entirely for rows with children.
- **Read-only mode.** `ADMIN_READONLY=1` starts it with every write path disabled — the right way to
  browse production while thinking.
- **Read-back after write.** Every save re-reads the row it wrote and shows you the stored values,
  so a partial save is visible rather than assumed.

**The honest gap:** PostgREST has no transactions across tables. Saving a recipe with new
ingredients is delete-children-then-insert-children — two requests. If the second fails you get a
recipe with no ingredients, which the read-back will show you and you re-save. For a single-user
desktop tool this is an acceptable trade for not needing your database password. If it ever bites,
the fix is a Postgres function (`admin_upsert_recipe(jsonb)`) that does it in one atomic call —
noted, not built.

**There is no staging Supabase project.** Everything here writes to production. That is the
existing situation, not something this introduces, but it's the reason the read-only mode and the
invariant checks are in v1 rather than "later".

---

## 6. Build order

**All of it is built** — one change, not five PRs, once the copy domain came out.

| Piece | Where | State |
|---|---|---|
| Rails: allowlist, localhost bind, key checks, read-only mode | `admin/config.py`, `admin/db.py` | done |
| Domain rules restated from the CHECK constraints | `admin/validators.py` | done |
| Recipes: three tables on one screen, computed macros | `admin/recipes.py` | done |
| Strength programmes + the variant grid | `admin/programmes.py` | done |
| `plan_templates` re-derivation | `admin/derive.py` | done |
| Snapshot export to the repo | `admin/export.py` | done |
| Audit log | `admin/audit.py` | done |
| Checks that need no key or network | `selftest.py` — 39 assertions | passing |

Still outstanding, and only Emma can do it: **paste the `service_role` key** into
`tools/admin/.env`, then a first run against production. Everything so far was proved against an
in-memory stand-in for Supabase — 39 self-test assertions and 45 end-to-end page and save checks —
which is as far as verification goes without that key.

This is tooling, not shipping code: it does not touch the app, cannot affect a build, and lands
straight on `main` under the usual ship workflow.

---

## 7. What you need to do

1. **Get the `service_role` key.** Supabase dashboard → Project Settings → API → `service_role`
   (the secret one, not `anon`). Paste it into `tools/admin/.env` yourself — I can't handle
   credentials, and this key is the one that matters most.
2. **Optionally install a current Python.** Your Mac has 3.9.6, which is end-of-life. It will work,
   but `brew install python@3.12` takes a minute and is worth it.

That is the whole setup. No hosting, no domain, no auth to configure.

---

## 8. Open decisions

**A. RESOLVED — deferred.** Copy is out of scope for now. The original question stands for
whenever it comes back: does "authored copy" mean `tips` and `articles` are what exist in the database. If you
also meant in-app screen copy (onboarding, paywall, achievements, phase explainers), that lives in
TypeScript and would need a `copy` table built first — a separate, larger project with a real
benefit (copy changes without a TestFlight build) and a real cost (every string becomes a network
read with a fallback). Worth deciding now, because it changes whether §3A is a small screen or the
main event.

**B. RESOLVED — deferred with A.** Nothing in the app reads `articles`, so authoring into it
would be investment ahead of a UI.

**C. RESOLVED as recommended.** Saving a half-entered recipe is always allowed; activating one is
blocked until it has an intro, ingredients, steps and macros that agree with the ingredients. Both
routes that can activate a recipe enforce it — the form and the Activate button on the list.

**D. RESOLVED as recommended.** The catalogue is editable, with a "used by N programmes" count on
every row so a rename that propagates everywhere is a visible choice.

---

## 9. What this does not cover

- Users, subscriptions, or any support tooling — deliberately out of the allowlist.
- Metrics or analytics — the Growth Dashboard artifact already does that job.
- Image upload for recipe photography. `recipes.image_url` is a text field; the console will let you
  paste a URL, but hosting the image is a separate decision.
- Anything on the marketing site — that's Sanity, a different system entirely.
