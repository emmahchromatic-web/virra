// Generates the Get Strong programmes migration (schema + seed) from get-strong.json.
//
// The seed JSON is the source of truth, exported from Emma's "VIRRA - Workout Plans v2"
// Google Sheet (the 6 programme tabs; the "All exercises" tab is intentionally ignored).
// Bodyweight descriptions in the 4/5-Day tabs were auto-healed against the other tabs
// (the sheet had loaded-variant descriptions pasted onto bodyweight names) — see
// the strong-runner-programmes memory note.
//
// Re-run after editing get-strong.json:  node build-get-strong-migration.mjs
// It rewrites ../migrations/20260819000000_get_strong_programmes.sql

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(readFileSync(join(here, 'get-strong.json'), 'utf8'));

const q = (v) => (v === null || v === undefined || v === '') ? 'null' : `'${String(v).replace(/'/g, "''")}'`;
const qi = (v) => (v === null || v === undefined || v === '') ? 'null' : String(Number(v));

// --- exercise slugs (stable text ids), deduped ---
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const exSlug = [];
const seen = new Map();
seed.exercises.forEach(([name], i) => {
  let base = slugify(name) || `exercise-${i}`;
  let s = base, n = 2;
  while (seen.has(s)) s = `${base}-${n++}`;
  seen.set(s, true);
  exSlug[i] = s;
});

const out = [];
out.push(`-- Get Strong strength programmes: content model + seed.`);
out.push(`-- GENERATED from supabase/seed/get-strong.json by build-get-strong-migration.mjs — do not edit by hand.`);
out.push(`-- Source: "VIRRA - Workout Plans v2" sheet (6 programme tabs). ${seed.exercises.length} exercises, ${seed.programmes.length} programmes.`);
out.push(``);
out.push(`begin;`);
out.push(``);

// ---------------- schema ----------------
out.push(`create table if not exists exercises (
  id          text primary key,
  name        text not null unique,
  description text,
  created_at  timestamptz not null default now()
);`);
out.push(``);
out.push(`create table if not exists programmes (
  id                text primary key,          -- slug
  family            text not null,             -- e.g. 'get_strong'
  family_label      text not null,             -- e.g. 'Get Strong'
  name              text not null,             -- workout name, e.g. 'Push / Pull / Legs (3-Day)'
  sport_type        text not null default 'strength',
  days_per_week     int  not null,
  duration_weeks    int  not null default 12,
  short_description text,
  full_description  text,
  deload_note       text,
  sort_order        int  not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);`);
out.push(``);
out.push(`create table if not exists programme_days (
  id            text primary key,              -- programme_id || '-d' || day_index
  programme_id  text not null references programmes(id) on delete cascade,
  day_index     int  not null,
  focus         text not null,
  sort_order    int  not null default 0,
  unique (programme_id, day_index)
);`);
out.push(``);
out.push(`create table if not exists programme_exercises (
  id                bigint generated always as identity primary key,
  programme_day_id  text not null references programme_days(id) on delete cascade,
  variant           text not null check (variant in ('gym','dumbbells','bodyweight')),
  block             int  not null check (block between 1 and 3),
  section           text not null check (section in ('mobility','activation','strength','power_core','accessory')),
  position          int  not null,             -- order within (day, variant, block, section)
  exercise_id       text not null references exercises(id),
  sets              int,
  reps              text,
  tempo             text,                       -- 4-part, e.g. '3-1-1-0'
  rest              text,
  unique (programme_day_id, variant, block, section, position)
);`);
out.push(``);
out.push(`create index if not exists programme_days_programme_idx on programme_days(programme_id);`);
out.push(`create index if not exists programme_exercises_day_idx on programme_exercises(programme_day_id, variant, block);`);
out.push(``);

// ---------------- RLS: authenticated read-only (content managed via migrations) ----------------
for (const t of ['exercises', 'programmes', 'programme_days', 'programme_exercises']) {
  out.push(`alter table ${t} enable row level security;`);
  out.push(`drop policy if exists "${t}_read" on ${t};`);
  out.push(`create policy "${t}_read" on ${t} for select to authenticated using (true);`);
}
out.push(``);

// ---------------- reseed (idempotent): clear this family, keep exercises upserted ----------------
out.push(`delete from programmes where family = ${q(seed.family)};`);
out.push(``);

// exercises (global, upsert)
out.push(`insert into exercises (id, name, description) values`);
const exRows = seed.exercises.map(([name, desc], i) => `  (${q(exSlug[i])}, ${q(name)}, ${q(desc)})`);
out.push(exRows.join(',\n') + `\non conflict (id) do update set name = excluded.name, description = excluded.description;`);
out.push(``);

// programmes
out.push(`insert into programmes (id, family, family_label, name, sport_type, days_per_week, duration_weeks, short_description, full_description, deload_note, sort_order) values`);
const progRows = seed.programmes.map((p) =>
  `  (${q(p.slug)}, ${q(seed.family)}, ${q(seed.family_label)}, ${q(p.name)}, ${q(seed.sport_type)}, ${qi(p.days_per_week)}, ${qi(seed.duration_weeks)}, ${q(p.short_description)}, ${q(p.full_description)}, ${q(seed.deload_note)}, ${qi(p.sort_order)})`
);
out.push(progRows.join(',\n') + `;`);
out.push(``);

// programme_days
const dayRows = [];
const exerciseRows = [];
for (const p of seed.programmes) {
  for (const day of p.days) {
    const dayId = `${p.slug}-d${day.i}`;
    dayRows.push(`  (${q(dayId)}, ${q(p.slug)}, ${qi(day.i)}, ${q(day.focus)}, ${qi(day.i)})`);
    // position resets per (variant, block, section)
    const posKey = {};
    for (const [vCode, block, secCode, exId, sets, reps, tempo, rest] of day.items) {
      const variant = seed.variant_codes[vCode];
      const section = seed.section_codes[secCode];
      const key = `${variant}|${block}|${section}`;
      posKey[key] = (posKey[key] || 0) + 1;
      const setsInt = (typeof sets === 'number') ? sets : (sets == null ? null : parseInt(sets, 10));
      exerciseRows.push(
        `  (${q(dayId)}, ${q(variant)}, ${qi(block)}, ${q(section)}, ${qi(posKey[key])}, ${q(exSlug[exId])}, ${qi(setsInt)}, ${q(reps)}, ${q(tempo)}, ${q(rest)})`
      );
    }
  }
}
out.push(`insert into programme_days (id, programme_id, day_index, focus, sort_order) values`);
out.push(dayRows.join(',\n') + `;`);
out.push(``);

out.push(`insert into programme_exercises (programme_day_id, variant, block, section, position, exercise_id, sets, reps, tempo, rest) values`);
out.push(exerciseRows.join(',\n') + `;`);
out.push(``);
out.push(`commit;`);
out.push(``);

const sql = out.join('\n');
const target = join(here, '..', 'migrations', '20260819000000_get_strong_programmes.sql');
writeFileSync(target, sql);
console.log(`Wrote ${target}`);
console.log(`  exercises=${seed.exercises.length} programmes=${seed.programmes.length} days=${dayRows.length} exercise_rows=${exerciseRows.length} bytes=${sql.length}`);
