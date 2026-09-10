# VIRRA Admin Console

A local tool for editing the app's authored content — **recipes** and **strength
programmes** — without writing a migration or shipping a build.

It runs on this machine only, at `127.0.0.1`. Nothing is deployed and there is no
login, because the only thing that can reach it is this computer.

Design notes and the decisions behind it: `ADMIN_CONSOLE_PROPOSAL.md` in the repo root.

---

## Setup, once

**1. Install the dependencies.** From the repo root:

```bash
python3 -m venv tools/admin/.venv && tools/admin/.venv/bin/pip install -r tools/admin/requirements.txt
```

**2. Add the key.** Copy the `service_role` key in the Supabase dashboard
(Project Settings → API → `service_role`, the secret one below `anon`), then:

```bash
tools/admin/.venv/bin/python tools/admin/set_key.py
```

That takes the key off the clipboard, checks it really is a `service_role` key,
and writes it into `tools/admin/.env` with owner-only permissions. It never
prints the key, so it does not end up in scrollback. Paste the anon key by
mistake and it says so rather than writing it.

To do it by hand instead, copy `.env.example` to `.env` and fill in `SUPABASE_URL`
and `SUPABASE_SERVICE_ROLE_KEY` yourself.

`.env` is covered by `.gitignore`, and the console refuses to start if it ever
stops being ignored.

## Running it

```bash
tools/admin/.venv/bin/python tools/admin/run.py
```

It opens `http://127.0.0.1:8787`. Stop it with Ctrl-C.

To browse production without any chance of changing it:

```bash
ADMIN_READONLY=1 tools/admin/.venv/bin/python tools/admin/run.py
```

## Checking it still works

```bash
tools/admin/.venv/bin/python tools/admin/selftest.py
```

No network, no key needed. It covers the rules that would otherwise only fail
against production: tempo format, tag sets, macro derivation, the recipe coverage
invariants, variant gap detection, plan-template derivation, SQL escaping, and
the table allowlist.

---

## What it does that the Supabase dashboard cannot

- **Computes recipe macros from the ingredients.** Per-serving totals are the sum
  of the ingredients divided by `serves`. Those boxes are read-only and recomputed
  on save, so the stored figure and the ingredient list cannot drift.
- **Blank means unknown, not zero.** `fibre_g` stays NULL when you leave it empty.
- **Blocks activation, not saving.** A half-written recipe saves fine as staged;
  it cannot go live without an intro, ingredients, steps and macros that agree.
  Both routes that can activate one enforce this.
- **Warns on content invariants** the seed migrations assert: at least two active
  recipes per meal slot, at least one per cycle phase.
- **Shows the three programme variants side by side**, so a gym day with a missing
  bodyweight accessory is visible rather than buried in a row list.
- **Regenerates the derived `plan_templates` row** whenever a programme's identity
  or days change. Migration `20260819010000` generates that row from `programmes`;
  editing a programme by hand leaves the plan picker showing the old name.
- **Validates before writing** — tempo shape, slug shape, block and section values,
  tag membership — so you get a sentence, not a PostgREST 400.

## Safety

- **Table allowlist, hard-coded** in `admin/config.py`: eight content tables.
  Nothing user-owned — activities, cycle logs, profiles, food entries — is
  reachable from this tool at all.
- **Localhost only.**
- **Soft delete by default.** "Delete" on a list is `is_active = false`. A true
  delete needs the row id typed out.
- **Every write is logged** to `tools/admin/changes/YYYY-MM-DD.jsonl` with before
  and after. Untracked.
- **Read-back after every save**, because PostgREST has no transaction across
  tables: a recipe's children are replaced in a second request, so a partial save
  has to be visible rather than assumed away.

## Two things to know

**This writes to production.** There is no staging Supabase project. That is the
existing situation, not something this introduces, but it is why read-only mode
and the invariant checks exist.

**The seed migrations must not be re-run.** `20260826010000_seed_recipes_teamfit`,
`20260827030000_seed_recipes_authored` and `20260819000000_get_strong_programmes`
all `delete` before they insert, so re-running one wipes anything edited here.
Once content is edited in this console, the database is the source of truth and
the repo keeps a generated snapshot instead — press **Export** on the dashboard,
then commit `mobile/supabase/seeds/content/`.

## What is deliberately not here

- **Run programme schedules.** Run plans are built by the generator in code
  (`mobile/src/lib/runProgramme/`), not from stored templates. Editing
  `sessions_json` would change something the app no longer reads.
- **Users, subscriptions, support tooling.** Outside the allowlist.
- **In-app screen copy** — onboarding, paywall, achievements. Those are TypeScript
  string literals and need a code release; making them editable would mean moving
  them into a table first.
