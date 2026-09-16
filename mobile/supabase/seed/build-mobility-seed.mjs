// Builds mobile/supabase/seeds/content/mobility.sql from mobility.json, card 264.
//
// The JSON is what gets reviewed and edited until the sessions are loaded; after
// that the admin console owns them and `Export mobility.sql` regenerates the
// snapshot. So this script is for the first load, and for re-drafting before it.
//
// It refuses to write SQL that would break a rule the app depends on:
//
//   - a session's stated minutes must match what the moves add up to on the
//     clock (holds at their length, twice for "each side", breaths and reps at
//     a slow pace). The app's 30-seconds-a-move fallback is reported alongside
//     for interest, but for mat work it undercounts badly and the card shows
//     the stated minutes, not the fallback;
//   - every cycle phase needs at least one session at every length, or a
//     woman in that phase gets nothing at that duration (brief §4);
//   - every move needs a description, either here or in the exercise catalogue;
//   - phases and intensity must be values the CHECK constraints accept.
//
// Run:  node build-mobility-seed.mjs            (writes the SQL, prints a report)
//       node build-mobility-seed.mjs --check    (validate only)

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here   = dirname(fileURLToPath(import.meta.url));
const seed   = JSON.parse(readFileSync(join(here, 'mobility.json'), 'utf8'));
const strong = JSON.parse(readFileSync(join(here, 'get-strong.json'), 'utf8'));
const checkOnly = process.argv.includes('--check');

const PHASES       = ['menstrual', 'follicular', 'ovulatory', 'luteal'];
const INTENSITIES  = ['gentle', 'moderate', 'strong'];
const SECONDS_PER_MOVE = 30;   // mirrors strengthProgramme.ts
const SECONDS_PER_SET  = 45;   // mirrors strengthProgramme.ts
const FOCUS_MAX = 90;
const WALL_TOLERANCE_MIN = 2;   // how far the clock may drift from the stated minutes

const problems = [];
const notes    = [];

// --- descriptions: the JSON's own library, then the exercise catalogue --------
const catalogue = new Map(strong.exercises.map(([name, description]) => [name, description ?? null]));
const library   = new Map(Object.entries(seed.moves));

function describe(name) {
  if (library.has(name))   return { text: library.get(name),   source: 'library' };
  if (catalogue.has(name)) return { text: catalogue.get(name), source: 'catalogue' };
  return { text: null, source: null };
}

// --- the app's own estimate, and a wall-clock one for the reviewer -----------
function appEstimateMinutes(moves) {
  const seconds = moves.reduce((acc, m) => {
    const sets = m.sets ?? 1;
    const work = m.sets ? SECONDS_PER_SET : SECONDS_PER_MOVE;
    return acc + sets * work;
  }, 0);
  return Math.round(seconds / 60);
}

// Rough real time, so the reviewer can see how far a "gentle, long holds"
// session drifts from the 30-seconds-a-move rule. Not used by the app.
function wallClockSeconds(reps) {
  if (!reps) return SECONDS_PER_MOVE;
  const text = reps.replace(/–/g, '-').toLowerCase();
  const sides = /each side/.test(text) ? 2 : 1;
  const ways  = /each way/.test(text)  ? 2 : 1;
  const dur = /(\d+)\s*(?:-\s*(\d+))?\s*(s|secs?|seconds?|mins?|minutes?)\b/.exec(text);
  if (dur) {
    const scale = /^min/.test(dur[3]) ? 60 : 1;
    const low   = parseInt(dur[1], 10) * scale;
    const high  = dur[2] ? parseInt(dur[2], 10) * scale : low;
    return ((low + high) / 2) * sides + 5;
  }
  const n = parseInt((/\d+/.exec(text) ?? ['0'])[0], 10) || 1;
  if (/breath/.test(text)) return n * 5 + 5;
  const perRep = /slow/.test(text) ? 4 : 3;
  return n * perRep * sides * ways + 5;
}

// --- validate ----------------------------------------------------------------
const slug = (s) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
const ids = new Set();
const coverage = {}; // minutes -> phase -> count

const report = [];

for (const s of seed.sessions) {
  const where = `session '${s.id}'`;
  if (!slug(s.id))        problems.push(`${where}: id must be a lowercase slug.`);
  if (ids.has(s.id))      problems.push(`${where}: duplicate id.`);
  ids.add(s.id);
  if (!s.name)            problems.push(`${where}: name is required.`);
  if (!Number.isInteger(s.minutes) || s.minutes < 5 || s.minutes > 90)
    problems.push(`${where}: minutes must be a whole number between 5 and 90.`);
  if (!INTENSITIES.includes(s.intensity))
    problems.push(`${where}: intensity '${s.intensity}' is not one of ${INTENSITIES.join(', ')}.`);
  if (!Array.isArray(s.phases) || s.phases.length === 0)
    problems.push(`${where}: at least one phase is required, or the session is unreachable.`);
  for (const p of s.phases ?? []) {
    if (!PHASES.includes(p)) problems.push(`${where}: phase '${p}' is not one of ${PHASES.join(', ')}.`);
  }
  if (s.focus && s.focus.length > FOCUS_MAX)
    problems.push(`${where}: focus is ${s.focus.length} chars; keep it under ${FOCUS_MAX} so it fits under the name.`);
  if (!Array.isArray(s.moves) || s.moves.length === 0)
    problems.push(`${where}: has no moves. The app refuses to open an empty session.`);

  const moves = (s.moves ?? []).map((m, i) => {
    const [name, reps, cue] = Array.isArray(m) ? m : [m.name, m.reps, m.cue];
    const sets = Array.isArray(m) ? null : (m.sets ?? null);
    const d = describe(name);
    if (!d.text) problems.push(`${where}, move ${i + 1} '${name}': no description here or in the exercise catalogue.`);
    if (!reps)   problems.push(`${where}, move ${i + 1} '${name}': reps is empty. Say how long or how many.`);
    if (m.tempo || m.rest) problems.push(`${where}, move ${i + 1} '${name}': mobility moves carry no tempo or rest.`);
    return { position: i + 1, name, description: d.text, source: d.source, reps: reps ?? null, sets, cue: cue ?? null };
  });

  const est  = appEstimateMinutes(moves);
  const wall = Math.round(moves.reduce((a, m) => a + wallClockSeconds(m.reps), 0) / 60);
  // The stated minutes are what the card promises and what the workout screen
  // shows (loadMobilityStructure passes them through as estimated_minutes), so
  // they have to be honest against the clock, not against the app's
  // 30-seconds-a-move fallback. "45s each side" is 90 seconds of holding
  // whatever the fallback says, and a "gentle, long holds" session built to the
  // fallback runs twice as long as its card.
  if (Math.abs(wall - s.minutes) > WALL_TOLERANCE_MIN)
    problems.push(`${where}: says ${s.minutes} min but the moves add up to about ${wall} min on the clock (the app's own fallback would say ${est}). Shorten holds or drop moves until they agree.`);

  for (const p of s.phases ?? []) {
    coverage[s.minutes] ??= {};
    coverage[s.minutes][p] = (coverage[s.minutes][p] ?? 0) + 1;
  }

  const fromCatalogue = moves.filter((m) => m.source === 'catalogue').map((m) => m.name);
  report.push({ ...s, moves, est, wall, fromCatalogue });
}

// Brief §4: every phase at every length.
const lengths = [...new Set(seed.sessions.map((s) => s.minutes))].sort((a, b) => a - b);
for (const minutes of lengths) {
  for (const p of PHASES) {
    if (!coverage[minutes]?.[p]) problems.push(`coverage: no ${minutes}-minute session suits the ${p} phase.`);
  }
}

// Moves defined in the library but never used are probably a typo in a session.
const used = new Set(report.flatMap((s) => s.moves.map((m) => m.name)));
for (const name of library.keys()) if (!used.has(name)) notes.push(`library move '${name}' is not used by any session.`);

// --- report ------------------------------------------------------------------
console.log(`\n${seed.sessions.length} sessions, ${report.reduce((a, s) => a + s.moves.length, 0)} moves, ${used.size} distinct moves\n`);
console.log('id                        min  app  ~real  moves  intensity  phases');
for (const s of report) {
  console.log(
    `${s.id.padEnd(25)} ${String(s.minutes).padStart(3)}  ${String(s.est).padStart(3)}  ${String(s.wall).padStart(5)}  ${String(s.moves.length).padStart(5)}  ${s.intensity.padEnd(9)}  ${s.phases.join(', ')}`,
  );
}
console.log('\ncoverage (sessions per phase at each length)');
for (const minutes of lengths) {
  console.log(`  ${String(minutes).padStart(2)} min  ` + PHASES.map((p) => `${p}=${coverage[minutes]?.[p] ?? 0}`).join('  '));
}
const catalogueNames = [...new Set(report.flatMap((s) => s.fromCatalogue))];
if (catalogueNames.length) console.log(`\ndescriptions inherited from the exercise catalogue: ${catalogueNames.join(', ')}`);
for (const n of notes) console.log(`note: ${n}`);

if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('\nok: every rule holds');
if (checkOnly) process.exit(0);

// --- SQL ---------------------------------------------------------------------
const q  = (v) => (v === null || v === undefined || v === '') ? 'null' : `'${String(v).replace(/'/g, "''")}'`;
const qi = (v) => (v === null || v === undefined || v === '') ? 'null' : String(Number(v));
const qarr = (arr) => `array[${arr.map(q).join(',')}]::text[]`;

const out = [];
out.push(`-- Mobility sessions: first load of the authored content. Card 264.`);
out.push(`-- GENERATED from mobile/supabase/seed/mobility.json by build-mobility-seed.mjs.`);
out.push(`--`);
out.push(`-- Safe to run once the 20260913000000_mobility_sessions migration is in.`);
out.push(`-- Sessions are upserted by id and each listed session's moves are replaced,`);
out.push(`-- so re-running it OVERWRITES any admin-console edit to these ${seed.sessions.length} sessions.`);
out.push(`-- Once Emma is editing them in the console, export from there instead.`);
out.push(``);
out.push(`begin;`);
out.push(``);
out.push(`insert into mobility_sessions (id, name, focus, minutes, intensity, phases, is_active, position)`);
out.push(`values`);
out.push(report.map((s, i) =>
  `  (${q(s.id)}, ${q(s.name)}, ${q(s.focus)}, ${qi(s.minutes)}, ${q(s.intensity)}, ${qarr(s.phases)}, true, ${i + 1})`,
).join(',\n') + '\non conflict (id) do update set');
out.push(`  name = excluded.name,`);
out.push(`  focus = excluded.focus,`);
out.push(`  minutes = excluded.minutes,`);
out.push(`  intensity = excluded.intensity,`);
out.push(`  phases = excluded.phases,`);
out.push(`  position = excluded.position;`);
out.push(``);
out.push(`delete from mobility_session_moves where session_id in (${report.map((s) => q(s.id)).join(', ')});`);
out.push(``);
out.push(`insert into mobility_session_moves (session_id, position, name, description, reps, sets, cue)`);
out.push(`values`);
out.push(report.flatMap((s) => s.moves.map((m) =>
  `  (${q(s.id)}, ${m.position}, ${q(m.name)}, ${q(m.description)}, ${q(m.reps)}, ${qi(m.sets)}, ${q(m.cue)})`,
)).join(',\n') + ';');
out.push(``);
out.push(`commit;`);
out.push(``);
out.push(`notify pgrst, 'reload schema';`);
out.push(``);

const target = join(here, '..', 'seeds', 'content', 'mobility.sql');
writeFileSync(target, out.join('\n'));
console.log(`wrote ${target}`);
