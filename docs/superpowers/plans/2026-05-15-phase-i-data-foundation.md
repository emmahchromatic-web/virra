# Phase I — Data Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `planned_sessions` with plan-owned workout structure JSONB for runs and strength. Build pure generators, wire them into the write path, surface them on every read path, and apply cycle modulation per step at read time. Insights' 14-day lookahead and the dashboard hero render real workout content as a result.

**Architecture:** Two JSONB columns on `planned_sessions` (`run_structure`, `strength_structure`). Pure per-modality generators produce structure from `session_label` + baseline pace + cycle phase context. `generateAndSaveSchedule` writes structure on insert. A `hydratePlannedSessionStructures` helper lazily backfills rows missing structure on first read. Cycle modulation is applied per step at read time, using *predicted* phase for the session's scheduled date.

**Tech Stack:** TypeScript, React Native, Expo, Supabase Postgres, Jest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-15-phase-i-active-workout-engine-design.md`

**Out of scope (later plans):** Pre-workout preview screen, Play CTA routing, structured run live execution, strength live screen, swap mechanics.

---

## File Structure

### Create

- `mobile/supabase/migrations/015_run_structure.sql` — add `run_structure JSONB` column
- `mobile/supabase/migrations/016_strength_structure.sql` — add `strength_structure JSONB` column
- `mobile/src/lib/workoutStructure.ts` — TypeScript types + shared helpers (`summariseRunStructure`, `summariseStrengthStructure`)
- `mobile/src/lib/runWorkoutGenerator.ts` — pure generator: `generateRunStructure(input): RunWorkoutStructure`
- `mobile/src/lib/strengthWorkoutGenerator.ts` — pure generator: `generateStrengthStructure(input): StrengthWorkoutStructure`
- `mobile/src/lib/hydratePlannedSessions.ts` — lazy backfill helper
- `mobile/__tests__/lib/runWorkoutGenerator.test.ts`
- `mobile/__tests__/lib/strengthWorkoutGenerator.test.ts`
- `mobile/__tests__/lib/workoutStructureModulation.test.ts`
- `mobile/__tests__/lib/hydratePlannedSessions.test.ts`

### Modify

- `mobile/src/lib/cycleModulation.ts` — add `modulateRunStructure(structure, phase, profile): { adjusted: RunWorkoutStructure, reason: string | null }`
- `mobile/src/lib/scheduleGenerator.ts` — `generateAndSaveSchedule` enriches rows with structure before insert; `moveSession` carries structure across
- `mobile/src/lib/volumePlan.ts` — `RunSessionDetail` and `StrengthSessionDetail` carry `structure` + `modulated_structure`
- `mobile/src/lib/todaysSession.ts` — `TodaysSession` carries `structure_summary: string | null`
- `mobile/src/components/ui/TodaysSessionHero.tsx` — render one-line `structure_summary` under the session row
- `mobile/src/components/ui/SessionDetailModal.tsx` — render step-by-step structure preview replacing the single-line distance/pace text for runs
- `mobile/app/(app)/insights.tsx` — render workout summary line per upcoming session in the lookahead
- `mobile/__tests__/lib/scheduleGenerator.test.ts` — assert generated rows carry structure
- `mobile/__tests__/lib/volumePlan.test.ts` — assert structure is exposed and modulated on read

### Files referenced but not modified in this plan

- `mobile/src/lib/cycleEngine.ts` — `getCycleInfo(periodStart, cycleLength, date)` already returns phase for any date
- `mobile/src/lib/seasonEngine.ts` — calls `generateAndSaveSchedule` internally; will benefit automatically
- `mobile/src/lib/trainingBlocks.ts` — supplies `baseline_pace_seconds_per_km` and block context

---

## Section A — Schema and Types

### Task 1: Add `run_structure` column migration

**Files:**
- Create: `mobile/supabase/migrations/015_run_structure.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 015_run_structure.sql
-- Phase I — Plan-owned run workout structure.
-- See docs/superpowers/specs/2026-05-15-phase-i-active-workout-engine-design.md

alter table public.planned_sessions
  add column if not exists run_structure jsonb;

comment on column public.planned_sessions.run_structure is
  'Plan-owned run workout structure (steps, repeats, targets). Generated at insert time by runWorkoutGenerator.ts. Null for non-run sessions or pre-Phase-I rows pending lazy backfill.';
```

- [ ] **Step 2: Apply the migration**

Run via the Supabase MCP tool (project ref `elebuieojodsjmghwjub`):

```
mcp__supabase__apply_migration with name "015_run_structure" and the SQL above
```

Expected: migration applied, returned success.

- [ ] **Step 3: Verify the column exists**

Run via Supabase MCP:

```
mcp__supabase__execute_sql with "select column_name, data_type from information_schema.columns where table_name = 'planned_sessions' and column_name = 'run_structure'"
```

Expected: one row, `data_type = 'jsonb'`.

- [ ] **Step 4: Commit**

```bash
git add mobile/supabase/migrations/015_run_structure.sql
git commit -m "feat(db): add run_structure jsonb column to planned_sessions"
```

---

### Task 2: Add `strength_structure` column migration

**Files:**
- Create: `mobile/supabase/migrations/016_strength_structure.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 016_strength_structure.sql
-- Phase I — Plan-owned strength workout structure.

alter table public.planned_sessions
  add column if not exists strength_structure jsonb;

comment on column public.planned_sessions.strength_structure is
  'Plan-owned strength workout structure (exercises, target sets/reps/weight, rest). Generated at insert time by strengthWorkoutGenerator.ts. Null for non-strength sessions or pre-Phase-I rows pending lazy backfill.';
```

- [ ] **Step 2: Apply the migration**

Run via the Supabase MCP tool:

```
mcp__supabase__apply_migration with name "016_strength_structure" and the SQL above
```

Expected: migration applied.

- [ ] **Step 3: Verify the column exists**

Same shape as Task 1, but checking `strength_structure`.

- [ ] **Step 4: Commit**

```bash
git add mobile/supabase/migrations/016_strength_structure.sql
git commit -m "feat(db): add strength_structure jsonb column to planned_sessions"
```

---

### Task 3: Define core workout structure types

**Files:**
- Create: `mobile/src/lib/workoutStructure.ts`

- [ ] **Step 1: Write the types and helper signatures**

```typescript
// mobile/src/lib/workoutStructure.ts
// Plan-owned workout structure for Phase I.
// See docs/superpowers/specs/2026-05-15-phase-i-active-workout-engine-design.md

// ---- Run ----

export type RunStepKind = 'warmup' | 'work' | 'rest' | 'cooldown' | 'repeat';

export type PaceBand =
  | 'recovery'
  | 'easy'
  | 'steady'
  | 'tempo'
  | 'threshold'
  | 'vo2';

export interface RunStepTarget {
  distance_m?:       number;
  duration_s?:       number;
  pace_secs_per_km?: number;
  pace_band?:        PaceBand;
}

export interface RunStep {
  id:            string;
  kind:          RunStepKind;
  label?:        string;
  target:        RunStepTarget;
  repeat_count?: number;
  sub_steps?:    RunStep[];
}

export type RunWorkoutType =
  | 'easy'
  | 'long'
  | 'tempo'
  | 'threshold'
  | 'intervals'
  | 'progression'
  | 'race'
  | 'recovery'
  | 'run_walk'
  | 'negative_split';

export interface RunWorkoutStructure {
  version:          1;
  workout_type:     RunWorkoutType;
  steps:            RunStep[];
  total_distance_m: number;
}

// ---- Strength ----

export interface StrengthSetTarget {
  reps:       number;
  weight_kg?: number;
  rpe?:       number;
}

export interface PlannedExercise {
  id:               string;
  name:             string;
  primary_muscles:  string[];
  target_sets:      StrengthSetTarget[];
  rest_seconds:     number;
  notes?:           string;
}

export interface StrengthWorkoutStructure {
  version:           1;
  session_type:      'lower' | 'upper' | 'general';
  exercises:         PlannedExercise[];
  estimated_minutes: number;
}

// ---- Shared helpers ----

/**
 * One-line text summary of a run structure, e.g.
 *   "4 × 800m @ 4:15/km + 1.5km warmup/cooldown"
 *   "18km long run @ 5:30/km"
 */
export function summariseRunStructure(s: RunWorkoutStructure): string {
  const totalKm = (s.total_distance_m / 1000).toFixed(s.total_distance_m % 1000 === 0 ? 0 : 1);
  if (s.workout_type === 'intervals') {
    const repeat = s.steps.find((st) => st.kind === 'repeat');
    if (repeat?.sub_steps?.length) {
      const work = repeat.sub_steps.find((ss) => ss.kind === 'work');
      const dist = work?.target.distance_m;
      const pace = work?.target.pace_secs_per_km;
      if (dist && pace) {
        const m = Math.floor(pace / 60);
        const sec = String(Math.floor(pace % 60)).padStart(2, '0');
        return `${repeat.repeat_count} × ${dist}m @ ${m}:${sec}/km · ${totalKm}km total`;
      }
    }
  }
  return `${totalKm}km ${s.workout_type.replace('_', ' ')}`;
}

/**
 * One-line text summary of a strength structure, e.g.
 *   "Lower · Romanian Deadlift, Goblet Squat, +3 more · ~45min"
 */
export function summariseStrengthStructure(s: StrengthWorkoutStructure): string {
  const head = s.exercises.slice(0, 2).map((e) => e.name).join(', ');
  const extra = s.exercises.length > 2 ? `, +${s.exercises.length - 2} more` : '';
  const session = s.session_type.charAt(0).toUpperCase() + s.session_type.slice(1);
  return `${session} · ${head}${extra} · ~${s.estimated_minutes}min`;
}
```

- [ ] **Step 2: Confirm TypeScript compiles**

Run:

```bash
cd mobile && npx tsc --noEmit
```

Expected: no errors related to this file.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/lib/workoutStructure.ts
git commit -m "feat: define workout structure types for Phase I"
```

---

## Section B — Run workout generator

### Task 4: Generator scaffold with label inference and pace-band table

**Files:**
- Create: `mobile/src/lib/runWorkoutGenerator.ts`
- Create: `mobile/__tests__/lib/runWorkoutGenerator.test.ts`

- [ ] **Step 1: Write the failing test for label inference**

```typescript
// mobile/__tests__/lib/runWorkoutGenerator.test.ts
import { inferWorkoutType } from '@/lib/runWorkoutGenerator';

describe('inferWorkoutType', () => {
  test('maps "easy" to easy', () => {
    expect(inferWorkoutType('easy')).toBe('easy');
  });
  test('maps "long run" to long', () => {
    expect(inferWorkoutType('long run')).toBe('long');
  });
  test('maps "tempo" to tempo', () => {
    expect(inferWorkoutType('tempo')).toBe('tempo');
  });
  test('maps "threshold" to threshold', () => {
    expect(inferWorkoutType('threshold')).toBe('threshold');
  });
  test('maps "intervals" or "vo2" to intervals', () => {
    expect(inferWorkoutType('intervals')).toBe('intervals');
    expect(inferWorkoutType('vo2 max')).toBe('intervals');
  });
  test('maps "progression" to progression', () => {
    expect(inferWorkoutType('progression run')).toBe('progression');
  });
  test('maps "race" to race', () => {
    expect(inferWorkoutType('race day')).toBe('race');
  });
  test('maps "recovery" to recovery', () => {
    expect(inferWorkoutType('recovery jog')).toBe('recovery');
  });
  test('falls back to easy', () => {
    expect(inferWorkoutType('shakeout')).toBe('easy');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd mobile && npx jest __tests__/lib/runWorkoutGenerator.test.ts
```

Expected: FAIL — `inferWorkoutType is not defined`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// mobile/src/lib/runWorkoutGenerator.ts
import type {
  RunWorkoutStructure, RunWorkoutType, RunStep, PaceBand,
} from './workoutStructure';

export function inferWorkoutType(sessionLabel: string): RunWorkoutType {
  const L = sessionLabel.toLowerCase();
  if (L.includes('long'))                            return 'long';
  if (L.includes('tempo'))                           return 'tempo';
  if (L.includes('threshold'))                       return 'threshold';
  if (L.includes('interval') || L.includes('vo2'))   return 'intervals';
  if (L.includes('progression'))                     return 'progression';
  if (L.includes('race'))                            return 'race';
  if (L.includes('recovery'))                        return 'recovery';
  if (L.includes('run_walk') || L.includes('walk'))  return 'run_walk';
  if (L.includes('negative'))                        return 'negative_split';
  return 'easy';
}

/**
 * Multipliers applied to baseline pace (sec/km). Higher = slower.
 * Baseline pace ≈ comfortable steady; threshold is just below it.
 */
const PACE_MULT: Record<PaceBand, number> = {
  recovery:  1.25,
  easy:      1.15,
  steady:    1.05,
  tempo:     0.95,
  threshold: 0.90,
  vo2:       0.83,
};

export function paceForBand(baselineSecsPerKm: number, band: PaceBand): number {
  return Math.round(baselineSecsPerKm * PACE_MULT[band]);
}

// Stable id generator — counter scoped per generate call ensures determinism in tests.
function makeIdFactory(): () => string {
  let i = 0;
  return () => `s${++i}`;
}

export interface GenerateRunInput {
  session_label:      string;
  baseline_pace_secs: number;
  distance_km:        number;   // total target distance for the session
}

export function generateRunStructure(input: GenerateRunInput): RunWorkoutStructure {
  // Filled in by later tasks. Throw for now so type-only consumers don't crash silently.
  throw new Error('generateRunStructure not yet implemented for ' + input.session_label);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd mobile && npx jest __tests__/lib/runWorkoutGenerator.test.ts
```

Expected: PASS (all 9 `inferWorkoutType` tests).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/runWorkoutGenerator.ts mobile/__tests__/lib/runWorkoutGenerator.test.ts
git commit -m "feat: run workout generator scaffold with label inference"
```

---

### Task 5: Generate easy, long, recovery, race workouts (warmup + block + cooldown)

**Files:**
- Modify: `mobile/src/lib/runWorkoutGenerator.ts`
- Modify: `mobile/__tests__/lib/runWorkoutGenerator.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/lib/runWorkoutGenerator.test.ts`:

```typescript
import { generateRunStructure } from '@/lib/runWorkoutGenerator';

describe('generateRunStructure — simple workouts', () => {
  test('easy 5km has warmup + steady + cooldown summing to 5km', () => {
    const s = generateRunStructure({
      session_label: 'easy', baseline_pace_secs: 360, distance_km: 5,
    });
    expect(s.workout_type).toBe('easy');
    expect(s.total_distance_m).toBe(5000);
    expect(s.steps.map((st) => st.kind)).toEqual(['warmup', 'work', 'cooldown']);
    const sum = s.steps.reduce((acc, st) => acc + (st.target.distance_m ?? 0), 0);
    expect(sum).toBe(5000);
  });

  test('long 18km uses long pace band', () => {
    const s = generateRunStructure({
      session_label: 'long', baseline_pace_secs: 360, distance_km: 18,
    });
    expect(s.workout_type).toBe('long');
    expect(s.total_distance_m).toBe(18000);
    const work = s.steps.find((st) => st.kind === 'work');
    // long runs at "easy" band
    expect(work?.target.pace_band).toBe('easy');
  });

  test('recovery 4km uses recovery band', () => {
    const s = generateRunStructure({
      session_label: 'recovery', baseline_pace_secs: 360, distance_km: 4,
    });
    expect(s.workout_type).toBe('recovery');
    const work = s.steps.find((st) => st.kind === 'work');
    expect(work?.target.pace_band).toBe('recovery');
  });

  test('race 10km is a single steady step without warmup/cooldown', () => {
    const s = generateRunStructure({
      session_label: 'race', baseline_pace_secs: 360, distance_km: 10,
    });
    expect(s.workout_type).toBe('race');
    expect(s.steps).toHaveLength(1);
    expect(s.steps[0].kind).toBe('work');
    expect(s.steps[0].target.distance_m).toBe(10000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd mobile && npx jest __tests__/lib/runWorkoutGenerator.test.ts
```

Expected: FAIL — `generateRunStructure not yet implemented for easy` etc.

- [ ] **Step 3: Implement simple-workout branch in `generateRunStructure`**

Replace the throwing stub in `mobile/src/lib/runWorkoutGenerator.ts` with:

```typescript
const WARMUP_M  = 1500;
const COOLDOWN_M = 1300;

function bandForType(t: RunWorkoutType): PaceBand {
  switch (t) {
    case 'easy':            return 'easy';
    case 'long':            return 'easy';
    case 'recovery':        return 'recovery';
    case 'tempo':           return 'tempo';
    case 'threshold':       return 'threshold';
    case 'intervals':       return 'vo2';
    case 'progression':     return 'steady';
    case 'race':            return 'threshold';
    case 'run_walk':        return 'easy';
    case 'negative_split':  return 'steady';
  }
}

export function generateRunStructure(input: GenerateRunInput): RunWorkoutStructure {
  const id = makeIdFactory();
  const type = inferWorkoutType(input.session_label);
  const totalM = Math.round(input.distance_km * 1000);

  // Race: single block, no warmup/cooldown
  if (type === 'race') {
    return {
      version: 1,
      workout_type: 'race',
      total_distance_m: totalM,
      steps: [{
        id: id(),
        kind: 'work',
        label: 'race effort',
        target: {
          distance_m: totalM,
          pace_band: bandForType('race'),
          pace_secs_per_km: paceForBand(input.baseline_pace_secs, bandForType('race')),
        },
      }],
    };
  }

  // Simple shape: warmup + work + cooldown
  if (type === 'easy' || type === 'long' || type === 'recovery') {
    // Recovery and short sessions skip the formal warmup/cooldown
    const useFrame = totalM >= 4000 && type !== 'recovery';
    const wu = useFrame ? Math.min(WARMUP_M,  Math.floor(totalM * 0.15)) : 0;
    const cd = useFrame ? Math.min(COOLDOWN_M, Math.floor(totalM * 0.15)) : 0;
    const workM = totalM - wu - cd;
    const band = bandForType(type);
    const steps: RunStep[] = [];
    if (wu > 0) {
      steps.push({
        id: id(), kind: 'warmup', label: 'warmup',
        target: { distance_m: wu, pace_band: 'easy',
                  pace_secs_per_km: paceForBand(input.baseline_pace_secs, 'easy') },
      });
    }
    steps.push({
      id: id(), kind: 'work', label: type === 'long' ? 'long run' : type,
      target: { distance_m: workM, pace_band: band,
                pace_secs_per_km: paceForBand(input.baseline_pace_secs, band) },
    });
    if (cd > 0) {
      steps.push({
        id: id(), kind: 'cooldown', label: 'cooldown',
        target: { distance_m: cd, pace_band: 'easy',
                  pace_secs_per_km: paceForBand(input.baseline_pace_secs, 'easy') },
      });
    }
    return {
      version: 1, workout_type: type, total_distance_m: totalM, steps,
    };
  }

  throw new Error('generateRunStructure not yet implemented for ' + type);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd mobile && npx jest __tests__/lib/runWorkoutGenerator.test.ts
```

Expected: PASS (all simple-workout tests).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/runWorkoutGenerator.ts mobile/__tests__/lib/runWorkoutGenerator.test.ts
git commit -m "feat: run generator handles easy/long/recovery/race"
```

---

### Task 6: Generate tempo and threshold workouts

**Files:**
- Modify: `mobile/src/lib/runWorkoutGenerator.ts`
- Modify: `mobile/__tests__/lib/runWorkoutGenerator.test.ts`

- [ ] **Step 1: Write the failing tests**

Append:

```typescript
describe('generateRunStructure — tempo and threshold', () => {
  test('tempo 8km is warmup + tempo block + cooldown', () => {
    const s = generateRunStructure({
      session_label: 'tempo', baseline_pace_secs: 360, distance_km: 8,
    });
    expect(s.workout_type).toBe('tempo');
    expect(s.steps.map((st) => st.kind)).toEqual(['warmup', 'work', 'cooldown']);
    const work = s.steps.find((st) => st.kind === 'work');
    expect(work?.target.pace_band).toBe('tempo');
    // Tempo pace is faster than easy
    expect(work?.target.pace_secs_per_km).toBeLessThan(360);
  });

  test('threshold 8km uses threshold pace band', () => {
    const s = generateRunStructure({
      session_label: 'threshold', baseline_pace_secs: 360, distance_km: 8,
    });
    const work = s.steps.find((st) => st.kind === 'work');
    expect(work?.target.pace_band).toBe('threshold');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Expected: FAIL — `generateRunStructure not yet implemented for tempo`.

- [ ] **Step 3: Extend `generateRunStructure`**

Add this branch *before* the final `throw` in `generateRunStructure`:

```typescript
  // Tempo and threshold share the simple frame with their own band
  if (type === 'tempo' || type === 'threshold') {
    const wu = Math.min(WARMUP_M,  Math.floor(totalM * 0.18));
    const cd = Math.min(COOLDOWN_M, Math.floor(totalM * 0.16));
    const workM = totalM - wu - cd;
    const band = bandForType(type);
    return {
      version: 1, workout_type: type, total_distance_m: totalM,
      steps: [
        { id: id(), kind: 'warmup',   label: 'warmup',
          target: { distance_m: wu, pace_band: 'easy',
                    pace_secs_per_km: paceForBand(input.baseline_pace_secs, 'easy') } },
        { id: id(), kind: 'work',     label: type,
          target: { distance_m: workM, pace_band: band,
                    pace_secs_per_km: paceForBand(input.baseline_pace_secs, band) } },
        { id: id(), kind: 'cooldown', label: 'cooldown',
          target: { distance_m: cd, pace_band: 'easy',
                    pace_secs_per_km: paceForBand(input.baseline_pace_secs, 'easy') } },
      ],
    };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd mobile && npx jest __tests__/lib/runWorkoutGenerator.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/runWorkoutGenerator.ts mobile/__tests__/lib/runWorkoutGenerator.test.ts
git commit -m "feat: run generator handles tempo and threshold"
```

---

### Task 7: Generate interval workouts with repeat structure

**Files:**
- Modify: `mobile/src/lib/runWorkoutGenerator.ts`
- Modify: `mobile/__tests__/lib/runWorkoutGenerator.test.ts`

- [ ] **Step 1: Write the failing tests**

Append:

```typescript
describe('generateRunStructure — intervals', () => {
  test('intervals 8km produces a repeat with work/rest sub-steps', () => {
    const s = generateRunStructure({
      session_label: 'intervals', baseline_pace_secs: 360, distance_km: 8,
    });
    expect(s.workout_type).toBe('intervals');

    const repeat = s.steps.find((st) => st.kind === 'repeat');
    expect(repeat).toBeDefined();
    expect(repeat!.repeat_count).toBeGreaterThanOrEqual(3);
    expect(repeat!.sub_steps).toHaveLength(2);
    expect(repeat!.sub_steps![0].kind).toBe('work');
    expect(repeat!.sub_steps![1].kind).toBe('rest');
  });

  test('intervals work step uses vo2 pace band', () => {
    const s = generateRunStructure({
      session_label: 'intervals', baseline_pace_secs: 360, distance_km: 8,
    });
    const repeat = s.steps.find((st) => st.kind === 'repeat')!;
    expect(repeat.sub_steps![0].target.pace_band).toBe('vo2');
  });

  test('intervals rest step uses recovery pace band', () => {
    const s = generateRunStructure({
      session_label: 'intervals', baseline_pace_secs: 360, distance_km: 8,
    });
    const repeat = s.steps.find((st) => st.kind === 'repeat')!;
    expect(repeat.sub_steps![1].target.pace_band).toBe('recovery');
  });

  test('intervals structure is wrapped by warmup + cooldown', () => {
    const s = generateRunStructure({
      session_label: 'intervals', baseline_pace_secs: 360, distance_km: 8,
    });
    expect(s.steps[0].kind).toBe('warmup');
    expect(s.steps[s.steps.length - 1].kind).toBe('cooldown');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Expected: FAIL — `generateRunStructure not yet implemented for intervals`.

- [ ] **Step 3: Extend `generateRunStructure`**

Add this branch before the final `throw`:

```typescript
  if (type === 'intervals') {
    // After warmup+cooldown there should be ~50% of total distance for the work block.
    // Typical session: 1.5km wu, 4 × 800m work + 4 × 200m rest = 4km repeats, 1.3km cd.
    const wu = WARMUP_M;
    const cd = COOLDOWN_M;
    const remaining = Math.max(2000, totalM - wu - cd);
    // Aim for 800m work reps. Pick repeat count that fits.
    const workRep = 800;
    const restRep = 200;
    const repCount = Math.max(3, Math.min(8, Math.round(remaining / (workRep + restRep))));
    const repeatStep: RunStep = {
      id: id(), kind: 'repeat', repeat_count: repCount,
      target: {},
      sub_steps: [
        { id: id(), kind: 'work', label: `${workRep}m`,
          target: { distance_m: workRep, pace_band: 'vo2',
                    pace_secs_per_km: paceForBand(input.baseline_pace_secs, 'vo2') } },
        { id: id(), kind: 'rest', label: 'float',
          target: { distance_m: restRep, pace_band: 'recovery',
                    pace_secs_per_km: paceForBand(input.baseline_pace_secs, 'recovery') } },
      ],
    };
    const repeatDistance = repCount * (workRep + restRep);
    return {
      version: 1, workout_type: 'intervals',
      total_distance_m: wu + repeatDistance + cd,
      steps: [
        { id: id(), kind: 'warmup', label: 'warmup',
          target: { distance_m: wu, pace_band: 'easy',
                    pace_secs_per_km: paceForBand(input.baseline_pace_secs, 'easy') } },
        repeatStep,
        { id: id(), kind: 'cooldown', label: 'cooldown',
          target: { distance_m: cd, pace_band: 'easy',
                    pace_secs_per_km: paceForBand(input.baseline_pace_secs, 'easy') } },
      ],
    };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd mobile && npx jest __tests__/lib/runWorkoutGenerator.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/runWorkoutGenerator.ts mobile/__tests__/lib/runWorkoutGenerator.test.ts
git commit -m "feat: run generator handles intervals with repeat structure"
```

---

### Task 8: Generate progression and negative-split workouts

**Files:**
- Modify: `mobile/src/lib/runWorkoutGenerator.ts`
- Modify: `mobile/__tests__/lib/runWorkoutGenerator.test.ts`

- [ ] **Step 1: Write the failing tests**

Append:

```typescript
describe('generateRunStructure — progression / negative_split', () => {
  test('progression 9km has three increasing-pace work segments', () => {
    const s = generateRunStructure({
      session_label: 'progression', baseline_pace_secs: 360, distance_km: 9,
    });
    expect(s.workout_type).toBe('progression');
    const works = s.steps.filter((st) => st.kind === 'work');
    expect(works).toHaveLength(3);
    // Each subsequent work step is faster (lower pace_secs)
    const paces = works.map((w) => w.target.pace_secs_per_km!);
    expect(paces[1]).toBeLessThan(paces[0]);
    expect(paces[2]).toBeLessThan(paces[1]);
  });

  test('negative_split 12km has two halves, second faster than first', () => {
    const s = generateRunStructure({
      session_label: 'negative splits', baseline_pace_secs: 360, distance_km: 12,
    });
    expect(s.workout_type).toBe('negative_split');
    const works = s.steps.filter((st) => st.kind === 'work');
    expect(works).toHaveLength(2);
    expect(works[1].target.pace_secs_per_km!).toBeLessThan(works[0].target.pace_secs_per_km!);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Expected: FAIL.

- [ ] **Step 3: Extend `generateRunStructure`**

Add before the final `throw`:

```typescript
  if (type === 'progression') {
    const wu = Math.min(WARMUP_M, Math.floor(totalM * 0.15));
    const cd = Math.min(COOLDOWN_M, Math.floor(totalM * 0.15));
    const workTotal = totalM - wu - cd;
    const seg = Math.floor(workTotal / 3);
    const bands: PaceBand[] = ['easy', 'steady', 'tempo'];
    const workSteps: RunStep[] = bands.map((b, i) => ({
      id: id(), kind: 'work', label: `segment ${i + 1}`,
      target: { distance_m: i === 2 ? workTotal - seg * 2 : seg,
                pace_band: b,
                pace_secs_per_km: paceForBand(input.baseline_pace_secs, b) },
    }));
    return {
      version: 1, workout_type: 'progression', total_distance_m: totalM,
      steps: [
        { id: id(), kind: 'warmup', label: 'warmup',
          target: { distance_m: wu, pace_band: 'easy',
                    pace_secs_per_km: paceForBand(input.baseline_pace_secs, 'easy') } },
        ...workSteps,
        { id: id(), kind: 'cooldown', label: 'cooldown',
          target: { distance_m: cd, pace_band: 'easy',
                    pace_secs_per_km: paceForBand(input.baseline_pace_secs, 'easy') } },
      ],
    };
  }

  if (type === 'negative_split') {
    const wu = Math.min(WARMUP_M, Math.floor(totalM * 0.12));
    const cd = Math.min(COOLDOWN_M, Math.floor(totalM * 0.12));
    const workTotal = totalM - wu - cd;
    const half = Math.floor(workTotal / 2);
    return {
      version: 1, workout_type: 'negative_split', total_distance_m: totalM,
      steps: [
        { id: id(), kind: 'warmup', label: 'warmup',
          target: { distance_m: wu, pace_band: 'easy',
                    pace_secs_per_km: paceForBand(input.baseline_pace_secs, 'easy') } },
        { id: id(), kind: 'work', label: 'first half',
          target: { distance_m: half, pace_band: 'easy',
                    pace_secs_per_km: paceForBand(input.baseline_pace_secs, 'easy') } },
        { id: id(), kind: 'work', label: 'second half',
          target: { distance_m: workTotal - half, pace_band: 'tempo',
                    pace_secs_per_km: paceForBand(input.baseline_pace_secs, 'tempo') } },
        { id: id(), kind: 'cooldown', label: 'cooldown',
          target: { distance_m: cd, pace_band: 'easy',
                    pace_secs_per_km: paceForBand(input.baseline_pace_secs, 'easy') } },
      ],
    };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd mobile && npx jest __tests__/lib/runWorkoutGenerator.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/runWorkoutGenerator.ts mobile/__tests__/lib/runWorkoutGenerator.test.ts
git commit -m "feat: run generator handles progression and negative split"
```

---

### Task 9: Generate run-walk workouts with alternating segments

**Files:**
- Modify: `mobile/src/lib/runWorkoutGenerator.ts`
- Modify: `mobile/__tests__/lib/runWorkoutGenerator.test.ts`

- [ ] **Step 1: Write the failing tests**

Append:

```typescript
describe('generateRunStructure — run_walk', () => {
  test('run_walk produces a repeat with run + walk sub-steps', () => {
    const s = generateRunStructure({
      session_label: 'run_walk', baseline_pace_secs: 360, distance_km: 5,
    });
    expect(s.workout_type).toBe('run_walk');
    const repeat = s.steps.find((st) => st.kind === 'repeat');
    expect(repeat).toBeDefined();
    expect(repeat!.repeat_count).toBeGreaterThanOrEqual(3);
    expect(repeat!.sub_steps).toHaveLength(2);
    // Run sub-step uses easy band, walk sub-step uses recovery
    expect(repeat!.sub_steps![0].target.pace_band).toBe('easy');
    expect(repeat!.sub_steps![1].target.pace_band).toBe('recovery');
    // Walk sub-step is duration-based, not distance
    expect(repeat!.sub_steps![1].target.duration_s).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Expected: FAIL.

- [ ] **Step 3: Extend `generateRunStructure`**

Add before the final `throw`:

```typescript
  if (type === 'run_walk') {
    // 4 min run / 1 min walk pattern, repeats fill the total distance budget.
    // Use easy pace for the run leg to estimate distance per cycle.
    const easyPace = paceForBand(input.baseline_pace_secs, 'easy');
    const runDurS = 4 * 60;
    const walkDurS = 60;
    const runMperRep = (runDurS / easyPace) * 1000;
    const reps = Math.max(3, Math.round(totalM / runMperRep));
    const repeatStep: RunStep = {
      id: id(), kind: 'repeat', repeat_count: reps,
      target: {},
      sub_steps: [
        { id: id(), kind: 'work', label: 'run',
          target: { duration_s: runDurS, pace_band: 'easy', pace_secs_per_km: easyPace } },
        { id: id(), kind: 'rest', label: 'walk',
          target: { duration_s: walkDurS, pace_band: 'recovery',
                    pace_secs_per_km: paceForBand(input.baseline_pace_secs, 'recovery') } },
      ],
    };
    return {
      version: 1, workout_type: 'run_walk',
      total_distance_m: Math.round(runMperRep * reps),
      steps: [repeatStep],
    };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd mobile && npx jest __tests__/lib/runWorkoutGenerator.test.ts
```

Expected: PASS.

- [ ] **Step 5: Remove the final `throw` line**

In `runWorkoutGenerator.ts`, all branches are covered. Replace the final `throw new Error(...)` with:

```typescript
  // Unreachable — all RunWorkoutType cases handled above.
  throw new Error(`generateRunStructure: unhandled workout_type ${type}`);
```

This keeps the compiler exhaustiveness happy.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/lib/runWorkoutGenerator.ts mobile/__tests__/lib/runWorkoutGenerator.test.ts
git commit -m "feat: run generator handles run_walk"
```

---

## Section C — Strength workout generator

### Task 10: Strength generator — pick exercises by session type

**Files:**
- Create: `mobile/src/lib/strengthWorkoutGenerator.ts`
- Create: `mobile/__tests__/lib/strengthWorkoutGenerator.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// mobile/__tests__/lib/strengthWorkoutGenerator.test.ts
import { generateStrengthStructure } from '@/lib/strengthWorkoutGenerator';

describe('generateStrengthStructure', () => {
  test('lower session picks ~5-6 lower-body exercises', () => {
    const s = generateStrengthStructure({
      session_type: 'lower',
      phase: 'follicular',
      recent_primary_muscles: [],
    });
    expect(s.session_type).toBe('lower');
    expect(s.exercises.length).toBeGreaterThanOrEqual(5);
    expect(s.exercises.length).toBeLessThanOrEqual(6);
    // Every exercise has at least one lower-body muscle in primary_muscles
    const LOWER_MUSCLES = ['glutes', 'quads', 'hamstrings', 'calves', 'adductors',
                           'hip abductors', 'lower back'];
    for (const ex of s.exercises) {
      expect(ex.primary_muscles.some((m) => LOWER_MUSCLES.includes(m))).toBe(true);
    }
  });

  test('upper session picks ~5-6 upper-body exercises', () => {
    const s = generateStrengthStructure({
      session_type: 'upper',
      phase: 'follicular',
      recent_primary_muscles: [],
    });
    expect(s.session_type).toBe('upper');
    expect(s.exercises.length).toBeGreaterThanOrEqual(5);
    expect(s.exercises.length).toBeLessThanOrEqual(6);
  });

  test('general session mixes compound lifts', () => {
    const s = generateStrengthStructure({
      session_type: 'general',
      phase: 'follicular',
      recent_primary_muscles: [],
    });
    expect(s.session_type).toBe('general');
    expect(s.exercises.length).toBeGreaterThanOrEqual(5);
  });

  test('every exercise has target_sets and rest_seconds', () => {
    const s = generateStrengthStructure({
      session_type: 'lower',
      phase: 'follicular',
      recent_primary_muscles: [],
    });
    for (const ex of s.exercises) {
      expect(ex.target_sets.length).toBeGreaterThan(0);
      expect(ex.rest_seconds).toBeGreaterThan(0);
      for (const set of ex.target_sets) {
        expect(set.reps).toBeGreaterThan(0);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd mobile && npx jest __tests__/lib/strengthWorkoutGenerator.test.ts
```

Expected: FAIL — `generateStrengthStructure is not defined`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// mobile/src/lib/strengthWorkoutGenerator.ts
import { EXERCISE_LIBRARY } from './exerciseLibrary';
import type { SessionType } from './strengthTypes';
import type {
  StrengthWorkoutStructure, PlannedExercise, StrengthSetTarget,
} from './workoutStructure';
import type { CyclePhase } from './cycleEngine';

export interface GenerateStrengthInput {
  session_type:           SessionType;
  phase:                  CyclePhase | null;
  recent_primary_muscles: string[]; // primary_muscles from the previous strength session
}

const SESSION_SIZE = 5;     // exercises per session

function makeIdFactory(): () => string {
  let i = 0;
  return () => `e${++i}`;
}

/**
 * Phase-aware set/rep targets.
 * - Follicular/ovulatory: heavier, fewer reps, longer rest (strength + power window)
 * - Luteal/menstrual: RPE-driven, moderate reps, shorter rest
 */
function setsForPhase(phase: CyclePhase | null): { sets: StrengthSetTarget[]; rest_seconds: number } {
  switch (phase) {
    case 'follicular':
    case 'ovulatory':
      return {
        sets: [
          { reps: 5, rpe: 7 },
          { reps: 5, rpe: 8 },
          { reps: 5, rpe: 8 },
          { reps: 5, rpe: 9 },
        ],
        rest_seconds: 120,
      };
    case 'luteal':
    case 'menstrual':
      return {
        sets: [
          { reps: 10, rpe: 6 },
          { reps: 10, rpe: 7 },
          { reps: 8,  rpe: 8 },
        ],
        rest_seconds: 90,
      };
    default:
      return {
        sets: [
          { reps: 8, rpe: 7 },
          { reps: 8, rpe: 7 },
          { reps: 8, rpe: 8 },
        ],
        rest_seconds: 90,
      };
  }
}

export function generateStrengthStructure(input: GenerateStrengthInput): StrengthWorkoutStructure {
  const id = makeIdFactory();
  const pool = EXERCISE_LIBRARY[input.session_type];
  if (!pool || pool.length === 0) {
    throw new Error(`No exercises in library for session_type ${input.session_type}`);
  }

  // Score each exercise: lower score if its primary muscles overlap with recent session.
  const scored = pool.map((ex, i) => {
    const overlap = ex.primaryMuscles.filter((m) => input.recent_primary_muscles.includes(m)).length;
    return { ex, score: overlap, idx: i };
  });
  // Sort: prefer low overlap, then library order
  scored.sort((a, b) => a.score - b.score || a.idx - b.idx);

  const chosen = scored.slice(0, SESSION_SIZE).map((s) => s.ex);
  const setsConfig = setsForPhase(input.phase);

  const exercises: PlannedExercise[] = chosen.map((ex) => ({
    id: id(),
    name: ex.name,
    primary_muscles: ex.primaryMuscles,
    target_sets: setsConfig.sets.map((s) => ({ ...s })),
    rest_seconds: setsConfig.rest_seconds,
  }));

  const estMinutes = Math.round(
    exercises.reduce((acc, ex) => {
      const setTime = ex.target_sets.length * (45 + ex.rest_seconds);
      return acc + setTime;
    }, 0) / 60,
  );

  return {
    version: 1,
    session_type: input.session_type,
    exercises,
    estimated_minutes: estMinutes,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd mobile && npx jest __tests__/lib/strengthWorkoutGenerator.test.ts
```

Expected: PASS (all 4 tests).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/strengthWorkoutGenerator.ts mobile/__tests__/lib/strengthWorkoutGenerator.test.ts
git commit -m "feat: strength workout generator picks exercises by session type"
```

---

### Task 11: Strength generator — avoid repeating primary muscles two sessions in a row

**Files:**
- Modify: `mobile/__tests__/lib/strengthWorkoutGenerator.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```typescript
describe('generateStrengthStructure — repeat avoidance', () => {
  test('exercises chosen have lower overlap with recent muscles than the alternative', () => {
    // Recent session hit glutes + hamstrings hard.
    const sRecent = generateStrengthStructure({
      session_type: 'lower',
      phase: 'follicular',
      recent_primary_muscles: ['glutes', 'hamstrings'],
    });
    // Run again with no history
    const sFresh = generateStrengthStructure({
      session_type: 'lower',
      phase: 'follicular',
      recent_primary_muscles: [],
    });
    const countGlutesHams = (xs: typeof sRecent.exercises) =>
      xs.filter((ex) => ex.primary_muscles.some(
        (m) => m === 'glutes' || m === 'hamstrings')).length;
    expect(countGlutesHams(sRecent.exercises))
      .toBeLessThanOrEqual(countGlutesHams(sFresh.exercises));
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

The Task 10 implementation already scores by overlap, so this should pass without further changes.

```bash
cd mobile && npx jest __tests__/lib/strengthWorkoutGenerator.test.ts
```

Expected: PASS.

- [ ] **Step 3: If it fails, fix the scoring**

If the test fails (`recent` muscles overlap is not strictly lower), inspect the scored output and tighten the sort criterion. The expected outcome is that the fresh session may pick the same muscles by default order, but the recent-aware one should bias away.

- [ ] **Step 4: Commit**

```bash
git add mobile/__tests__/lib/strengthWorkoutGenerator.test.ts
git commit -m "test: verify strength generator avoids repeating recent primary muscles"
```

---

## Section D — Cycle modulation per step

### Task 12: `modulateRunStructure` for non-repeat structures

**Files:**
- Modify: `mobile/src/lib/cycleModulation.ts`
- Create: `mobile/__tests__/lib/workoutStructureModulation.test.ts`

- [ ] **Step 1: Inspect the existing `modulateForCycle` to understand its return shape**

Read `mobile/src/lib/cycleModulation.ts` to confirm the existing `modulateForCycle(target, sessionType, phase, profile)` signature. The new function will call it per step.

- [ ] **Step 2: Write the failing test**

```typescript
// mobile/__tests__/lib/workoutStructureModulation.test.ts
import { modulateRunStructure } from '@/lib/cycleModulation';
import type { RunWorkoutStructure } from '@/lib/workoutStructure';

const baseStructure: RunWorkoutStructure = {
  version: 1,
  workout_type: 'tempo',
  total_distance_m: 8000,
  steps: [
    { id: 'a', kind: 'warmup', target: { distance_m: 1500, pace_secs_per_km: 414, pace_band: 'easy' } },
    { id: 'b', kind: 'work',   target: { distance_m: 5200, pace_secs_per_km: 342, pace_band: 'tempo' } },
    { id: 'c', kind: 'cooldown', target: { distance_m: 1300, pace_secs_per_km: 414, pace_band: 'easy' } },
  ],
};

describe('modulateRunStructure', () => {
  test('returns adjusted structure with same step ids and shape', () => {
    const out = modulateRunStructure(baseStructure, 'follicular', { cycle_length: 28, period_start: null });
    expect(out.adjusted.steps.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(out.adjusted.workout_type).toBe('tempo');
  });

  test('follicular phase makes work step faster (lower secs/km)', () => {
    const out = modulateRunStructure(baseStructure, 'follicular', { cycle_length: 28, period_start: null });
    const work = out.adjusted.steps.find((s) => s.kind === 'work')!;
    expect(work.target.pace_secs_per_km!).toBeLessThan(342);
  });

  test('luteal phase makes work step slower (higher secs/km)', () => {
    const out = modulateRunStructure(baseStructure, 'luteal', { cycle_length: 28, period_start: null });
    const work = out.adjusted.steps.find((s) => s.kind === 'work')!;
    expect(work.target.pace_secs_per_km!).toBeGreaterThan(342);
  });

  test('null phase leaves the structure unchanged and reason null', () => {
    const out = modulateRunStructure(baseStructure, null, null);
    expect(out.reason).toBeNull();
    expect(out.adjusted.steps.find((s) => s.kind === 'work')!.target.pace_secs_per_km).toBe(342);
  });

  test('reason summarises across steps when any step is modulated', () => {
    const out = modulateRunStructure(baseStructure, 'follicular', { cycle_length: 28, period_start: null });
    expect(typeof out.reason).toBe('string');
    expect(out.reason!.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd mobile && npx jest __tests__/lib/workoutStructureModulation.test.ts
```

Expected: FAIL — `modulateRunStructure is not defined`.

- [ ] **Step 4: Implement `modulateRunStructure`**

Append to `mobile/src/lib/cycleModulation.ts`:

```typescript
import type { RunWorkoutStructure, RunStep } from './workoutStructure';

/**
 * Apply cycle modulation to every pace target in a run structure.
 * Recurses into `repeat.sub_steps`. Steps without a `pace_secs_per_km`
 * target (e.g. duration-only walk segments) pass through unchanged.
 */
export function modulateRunStructure(
  structure: RunWorkoutStructure,
  phase:     CyclePhase | null,
  profile:   CycleProfile | null,
): { adjusted: RunWorkoutStructure; reason: string | null } {
  let firstReason: string | null = null;

  function modulateStep(step: RunStep): RunStep {
    if (step.kind === 'repeat' && step.sub_steps) {
      return { ...step, sub_steps: step.sub_steps.map(modulateStep) };
    }
    const pace = step.target.pace_secs_per_km;
    if (pace == null) return step;
    const sessionType =
      step.kind === 'work' && step.target.pace_band === 'vo2'        ? 'intervals'
      : step.kind === 'work' && step.target.pace_band === 'tempo'    ? 'tempo'
      : step.kind === 'work' && step.target.pace_band === 'threshold' ? 'tempo'
      : step.target.pace_band === 'recovery'                          ? 'easy'
      : 'easy';
    const r = modulateForCycle(
      { pace_seconds_per_km: pace, intensity_label: step.label ?? step.kind },
      sessionType,
      phase,
      profile,
    );
    if (r.reason && !firstReason) firstReason = r.reason;
    const newPace = r.adjusted_target.pace_seconds_per_km;
    return { ...step, target: { ...step.target, pace_secs_per_km: newPace ?? pace } };
  }

  return {
    adjusted: { ...structure, steps: structure.steps.map(modulateStep) },
    reason:   firstReason,
  };
}
```

(Note: `CyclePhase` and `CycleProfile` types and `modulateForCycle` are already imported in this file. Use the existing imports.)

- [ ] **Step 5: Run test to verify it passes**

```bash
cd mobile && npx jest __tests__/lib/workoutStructureModulation.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/lib/cycleModulation.ts mobile/__tests__/lib/workoutStructureModulation.test.ts
git commit -m "feat: modulateRunStructure applies cycle modulation per step"
```

---

### Task 13: `modulateRunStructure` recurses into repeat structures

**Files:**
- Modify: `mobile/__tests__/lib/workoutStructureModulation.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```typescript
describe('modulateRunStructure — repeat structures', () => {
  test('repeat sub_steps are modulated', () => {
    const intervalStructure: RunWorkoutStructure = {
      version: 1, workout_type: 'intervals', total_distance_m: 6800,
      steps: [
        { id: 'wu', kind: 'warmup', target: { distance_m: 1500, pace_secs_per_km: 414, pace_band: 'easy' } },
        { id: 'r1', kind: 'repeat', repeat_count: 4, target: {}, sub_steps: [
          { id: 'work1', kind: 'work', target: { distance_m: 800, pace_secs_per_km: 298, pace_band: 'vo2' } },
          { id: 'rest1', kind: 'rest', target: { distance_m: 200, pace_secs_per_km: 450, pace_band: 'recovery' } },
        ]},
        { id: 'cd', kind: 'cooldown', target: { distance_m: 1300, pace_secs_per_km: 414, pace_band: 'easy' } },
      ],
    };

    const out = modulateRunStructure(intervalStructure, 'luteal', { cycle_length: 28, period_start: null });
    const repeat = out.adjusted.steps.find((s) => s.id === 'r1')!;
    expect(repeat.sub_steps).toHaveLength(2);
    const work = repeat.sub_steps!.find((s) => s.kind === 'work')!;
    // Luteal slows work step
    expect(work.target.pace_secs_per_km!).toBeGreaterThan(298);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

The implementation in Task 12 already recurses into `sub_steps`. Run:

```bash
cd mobile && npx jest __tests__/lib/workoutStructureModulation.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add mobile/__tests__/lib/workoutStructureModulation.test.ts
git commit -m "test: modulateRunStructure handles nested repeat sub_steps"
```

---

## Section E — Write path — scheduleGenerator wiring

### Task 14: `generateSchedule` returns rows with structure for runs and strength

**Files:**
- Modify: `mobile/src/lib/scheduleGenerator.ts`
- Modify: `mobile/__tests__/lib/scheduleGenerator.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `__tests__/lib/scheduleGenerator.test.ts`:

```typescript
import { generateSchedule } from '@/lib/scheduleGenerator';

describe('generateSchedule — structure attachment', () => {
  test('run rows include run_structure when context provided', () => {
    const rows = generateSchedule(
      'u', 'b', 'run', '2026-05-11',
      [{ week: 1, km: 3, label: 'Base', sessions: ['easy', 'tempo', 'long'] }],
      undefined,
      undefined,
      { baseline_pace_secs: 360, weekly_km: 30 }, // new context arg
    );
    for (const r of rows) {
      expect(r.run_structure).toBeDefined();
      expect(r.run_structure!.version).toBe(1);
      expect(r.run_structure!.total_distance_m).toBeGreaterThan(0);
    }
    expect(rows.find((r) => r.session_label === 'tempo')!.run_structure!.workout_type).toBe('tempo');
    expect(rows.find((r) => r.session_label === 'long')!.run_structure!.workout_type).toBe('long');
  });

  test('strength rows include strength_structure when context provided', () => {
    const rows = generateSchedule(
      'u', 'b', 'strength', '2026-05-11',
      [{ week: 1, km: 2, label: 'Base', sessions: ['lower', 'upper'] }],
      undefined,
      undefined,
      { baseline_pace_secs: 360, weekly_km: 30 },
    );
    for (const r of rows) {
      expect(r.strength_structure).toBeDefined();
      expect(r.strength_structure!.exercises.length).toBeGreaterThanOrEqual(5);
    }
    expect(rows.find((r) => r.session_label === 'lower')!.strength_structure!.session_type).toBe('lower');
    expect(rows.find((r) => r.session_label === 'upper')!.strength_structure!.session_type).toBe('upper');
  });

  test('rows omit structure when no context provided (backwards-compatible)', () => {
    const rows = generateSchedule(
      'u', 'b', 'run', '2026-05-11',
      [{ week: 1, km: 3, label: 'Base', sessions: ['easy'] }],
    );
    expect(rows[0].run_structure).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd mobile && npx jest __tests__/lib/scheduleGenerator.test.ts
```

Expected: FAIL — `r.run_structure is undefined`.

- [ ] **Step 3: Extend the `PlannedSessionInsert` type and `generateSchedule` signature**

In `mobile/src/lib/scheduleGenerator.ts`:

1. Add new imports at the top:

```typescript
import { generateRunStructure } from './runWorkoutGenerator';
import { generateStrengthStructure } from './strengthWorkoutGenerator';
import type { RunWorkoutStructure, StrengthWorkoutStructure } from './workoutStructure';
import type { SessionType } from './strengthTypes';
import type { CyclePhase } from './cycleEngine';
```

2. Extend the `PlannedSessionInsert` interface (currently around line 60):

```typescript
interface PlannedSessionInsert {
  user_id:        string;
  block_id:       string;
  scheduled_date: string;
  week_number:    number;
  day_of_week:    number;
  modality:       string;
  session_label:  string;
  status:         'planned';
  run_structure?:      RunWorkoutStructure;
  strength_structure?: StrengthWorkoutStructure;
}
```

3. Add a new `GenerateContext` interface and extend the `generateSchedule` signature:

```typescript
export interface GenerateContext {
  baseline_pace_secs: number;
  weekly_km:          number; // used to estimate per-session distance
}

export function generateSchedule(
  userId:           string,
  blockId:          string,
  modality:         string,
  startsOn:         string,
  sessionsJson:     WeekSession[],
  slotAssignments?: SessionSlot[],
  maxWeeks?:        number,
  context?:         GenerateContext,
): PlannedSessionInsert[] {
  // ...existing code...
}
```

4. Inside `generateSchedule`, in the `slots.forEach(...)` block, after building the base `row`, attach structure if context is provided:

```typescript
    slots.forEach((slot) => {
      const row: PlannedSessionInsert = {
        user_id:        userId,
        block_id:       blockId,
        scheduled_date: toISO(addDays(origin, weekIndex * 7 + slot.day)),
        week_number:    week.week,
        day_of_week:    slot.day,
        modality,
        session_label:  slot.label,
        status:         'planned',
      };

      if (context) {
        if (modality === 'run') {
          // Estimate this session's distance: weekly_km divided by run-session count this week
          const runCount = week.sessions.filter((s) => !['lower', 'upper', 'general'].includes(s)).length || 1;
          const sessionKm = context.weekly_km / runCount;
          // Slight bias for long runs: long takes ~35%, others split the rest
          const longShare = week.sessions.includes('long');
          const distance_km = slot.label === 'long' && longShare
            ? Math.round(context.weekly_km * 0.35 * 10) / 10
            : Math.max(3, Math.round((context.weekly_km - (longShare ? context.weekly_km * 0.35 : 0)) / Math.max(1, runCount - (longShare ? 1 : 0)) * 10) / 10);
          row.run_structure = generateRunStructure({
            session_label:      slot.label,
            baseline_pace_secs: context.baseline_pace_secs,
            distance_km,
          });
        } else if (modality === 'strength') {
          row.strength_structure = generateStrengthStructure({
            session_type:           slot.label as SessionType,
            phase:                  null,  // phase resolved at insert time in generateAndSaveSchedule
            recent_primary_muscles: [],
          });
        }
      }

      rows.push(row);
    });
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd mobile && npx jest __tests__/lib/scheduleGenerator.test.ts
```

Expected: PASS — including the existing tests still passing.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/scheduleGenerator.ts mobile/__tests__/lib/scheduleGenerator.test.ts
git commit -m "feat(schedule): attach run_structure and strength_structure on insert"
```

---

### Task 15: `generateAndSaveSchedule` forwards context and persists structure

**Files:**
- Modify: `mobile/src/lib/scheduleGenerator.ts`

- [ ] **Step 1: Extend `generateAndSaveSchedule` signature**

Update the function around line 110:

```typescript
export async function generateAndSaveSchedule(
  userId:           string,
  blockId:          string,
  modality:         string,
  startsOn:         string,
  sessionsJson:     WeekSession[],
  slotAssignments?: SessionSlot[],
  maxWeeks?:        number,
  phaseSegments?:   PhaseSegment[],
  context?:         GenerateContext,
): Promise<void> {
  if (!sessionsJson.length) return;
  const rows = generateSchedule(
    userId, blockId, modality, startsOn, sessionsJson, slotAssignments, maxWeeks, context,
  );
  // ...rest unchanged
}
```

- [ ] **Step 2: Find all callers of `generateAndSaveSchedule` and pass context**

Run:

```bash
cd mobile && grep -rn "generateAndSaveSchedule" src app
```

For each caller, pass a `context` argument constructed from the user's `baseline_pace_seconds_per_km` and the block's `weekly_km`. The likely callers are in `mobile/src/lib/seasonEngine.ts` and `mobile/src/lib/trainingBlocks.ts`. For each, read the function, locate where `generateAndSaveSchedule` is called, and append:

```typescript
{ baseline_pace_secs: <baseline>, weekly_km: <weeklyKm> }
```

Where the engineer can read both values from the existing variables in scope (or fetch them inline from `user_profiles` / block row if needed).

- [ ] **Step 3: Run the existing test suite to confirm nothing is broken**

```bash
cd mobile && npx jest
```

Expected: all existing tests still pass.

- [ ] **Step 4: Manually trigger a schedule generation against a test user**

Using the Supabase MCP:

```
mcp__supabase__execute_sql with "select id, run_structure, strength_structure from planned_sessions where created_at > now() - interval '1 hour' limit 5"
```

(After re-running an onboarding flow or `recomputeSeasonForUser` for a test user.)

Expected: at least one row with non-null `run_structure` or `strength_structure`.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/scheduleGenerator.ts mobile/src/lib/seasonEngine.ts mobile/src/lib/trainingBlocks.ts
git commit -m "feat(schedule): persist generated workout structure for new sessions"
```

---

### Task 16: `moveSession` carries structure to the new row

**Files:**
- Modify: `mobile/src/lib/scheduleGenerator.ts`
- Modify: `mobile/__tests__/lib/scheduleGenerator.test.ts`

- [ ] **Step 1: Extend `moveSession` to fetch and carry `run_structure` + `strength_structure`**

Find `moveSession` (around line 150 in `scheduleGenerator.ts`). Update the fetch selection and the insert payload:

```typescript
  const { data: orig, error: fetchErr } = await supabase
    .from('planned_sessions')
    .select('week_number, modality, session_label, block_id, run_structure, strength_structure')
    .eq('id', sessionId)
    .single();
  if (fetchErr || !orig) throw new Error(fetchErr?.message ?? 'Session not found');

  // ...existing newDate/newDow computation...

  const { data: newRow, error: insertErr } = await supabase
    .from('planned_sessions')
    .insert({
      user_id:            userId,
      block_id:           orig.block_id,
      scheduled_date:     newDate,
      week_number:        orig.week_number,
      day_of_week:        newDow,
      modality:           orig.modality,
      session_label:      orig.session_label,
      status:             'planned',
      run_structure:      orig.run_structure,
      strength_structure: orig.strength_structure,
    })
    .select('id')
    .single();
```

- [ ] **Step 2: Add an integration-style unit test using a mocked supabase client**

Since `moveSession` hits Supabase directly, this test inspects the insert payload via a jest mock. Append to `__tests__/lib/scheduleGenerator.test.ts`:

```typescript
import { moveSession } from '@/lib/scheduleGenerator';

jest.mock('@/lib/supabase', () => {
  const captured: any = { insertPayload: null };
  return {
    __esModule: true,
    captured,
    supabase: {
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            week_number: 2, modality: 'run', session_label: 'tempo',
            block_id: 'b1',
            run_structure: { version: 1, workout_type: 'tempo', total_distance_m: 8000, steps: [] },
            strength_structure: null,
          },
          error: null,
        }),
        insert: jest.fn((payload: any) => {
          captured.insertPayload = payload;
          return {
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null }),
          };
        }),
        update: jest.fn().mockReturnThis(),
      })),
    },
  };
});

test('moveSession carries run_structure to the new row', async () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { captured } = require('@/lib/supabase');
  await moveSession('orig-id', '2026-05-20', 'user-id');
  expect(captured.insertPayload.run_structure).toBeDefined();
  expect(captured.insertPayload.run_structure.workout_type).toBe('tempo');
});
```

- [ ] **Step 3: Run tests to verify they pass**

```bash
cd mobile && npx jest __tests__/lib/scheduleGenerator.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/lib/scheduleGenerator.ts mobile/__tests__/lib/scheduleGenerator.test.ts
git commit -m "feat(schedule): moveSession preserves workout structure across move"
```

---

## Section F — Lazy backfill for legacy rows

### Task 17: `hydratePlannedSessionStructures` helper

**Files:**
- Create: `mobile/src/lib/hydratePlannedSessions.ts`
- Create: `mobile/__tests__/lib/hydratePlannedSessions.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// mobile/__tests__/lib/hydratePlannedSessions.test.ts
import { hydratePlannedSessionStructures } from '@/lib/hydratePlannedSessions';

describe('hydratePlannedSessionStructures', () => {
  test('run row missing structure gets one generated', () => {
    const rows = [
      { id: 's1', modality: 'run', session_label: 'tempo',
        run_structure: null, strength_structure: null },
    ];
    const out = hydratePlannedSessionStructures(rows, {
      baseline_pace_secs: 360, weekly_km: 30,
    });
    expect(out[0].run_structure).toBeDefined();
    expect(out[0].run_structure!.workout_type).toBe('tempo');
  });

  test('strength row missing structure gets one generated', () => {
    const rows = [
      { id: 's2', modality: 'strength', session_label: 'lower',
        run_structure: null, strength_structure: null },
    ];
    const out = hydratePlannedSessionStructures(rows, {
      baseline_pace_secs: 360, weekly_km: 30,
    });
    expect(out[0].strength_structure).toBeDefined();
    expect(out[0].strength_structure!.session_type).toBe('lower');
  });

  test('row that already has structure is passed through unchanged', () => {
    const existing = {
      version: 1 as const, workout_type: 'easy' as const,
      total_distance_m: 5000, steps: [],
    };
    const rows = [
      { id: 's3', modality: 'run', session_label: 'easy',
        run_structure: existing, strength_structure: null },
    ];
    const out = hydratePlannedSessionStructures(rows, {
      baseline_pace_secs: 360, weekly_km: 30,
    });
    expect(out[0].run_structure).toBe(existing);
  });

  test('reports which rows needed backfill via the returned changed flag', () => {
    const rows = [
      { id: 's1', modality: 'run', session_label: 'easy', run_structure: null,        strength_structure: null },
      { id: 's2', modality: 'run', session_label: 'easy', run_structure: { version: 1, workout_type: 'easy', total_distance_m: 5000, steps: [] }, strength_structure: null },
    ];
    const out = hydratePlannedSessionStructures(rows, {
      baseline_pace_secs: 360, weekly_km: 30,
    });
    expect(out[0].__hydrated).toBe(true);
    expect(out[1].__hydrated).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd mobile && npx jest __tests__/lib/hydratePlannedSessions.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the helper**

```typescript
// mobile/src/lib/hydratePlannedSessions.ts
import { generateRunStructure } from './runWorkoutGenerator';
import { generateStrengthStructure } from './strengthWorkoutGenerator';
import type { RunWorkoutStructure, StrengthWorkoutStructure } from './workoutStructure';
import type { SessionType } from './strengthTypes';

export interface HydrateContext {
  baseline_pace_secs: number;
  weekly_km:          number;
}

export interface HydrateInput {
  id:                  string;
  modality:            string;
  session_label:       string;
  run_structure:       RunWorkoutStructure | null;
  strength_structure:  StrengthWorkoutStructure | null;
}

export interface HydrateOutput extends HydrateInput {
  __hydrated?: boolean;
}

export function hydratePlannedSessionStructures(
  rows:    HydrateInput[],
  context: HydrateContext,
): HydrateOutput[] {
  return rows.map((row) => {
    if (row.modality === 'run' && !row.run_structure) {
      // Cheap heuristic for legacy rows: assume single-session-equivalent distance
      const distance_km = Math.max(3, Math.round(context.weekly_km / 3));
      const run_structure = generateRunStructure({
        session_label:      row.session_label,
        baseline_pace_secs: context.baseline_pace_secs,
        distance_km,
      });
      return { ...row, run_structure, __hydrated: true };
    }
    if (row.modality === 'strength' && !row.strength_structure) {
      const strength_structure = generateStrengthStructure({
        session_type:           row.session_label as SessionType,
        phase:                  null,
        recent_primary_muscles: [],
      });
      return { ...row, strength_structure, __hydrated: true };
    }
    return row;
  });
}

/**
 * Persist hydrated rows back to Supabase. Fire-and-forget — callers should
 * not block UI rendering on this. Failures are logged, not thrown.
 */
export async function persistHydratedRows(
  rows: HydrateOutput[],
  supabaseClient: { from: (table: string) => any },
): Promise<void> {
  const hydrated = rows.filter((r) => r.__hydrated);
  if (!hydrated.length) return;
  for (const row of hydrated) {
    const patch: any = {};
    if (row.run_structure)      patch.run_structure      = row.run_structure;
    if (row.strength_structure) patch.strength_structure = row.strength_structure;
    const { error } = await supabaseClient
      .from('planned_sessions')
      .update(patch)
      .eq('id', row.id);
    if (error) console.warn('[hydratePlannedSessions] persist failed', row.id, error.message);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd mobile && npx jest __tests__/lib/hydratePlannedSessions.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/hydratePlannedSessions.ts mobile/__tests__/lib/hydratePlannedSessions.test.ts
git commit -m "feat: lazy backfill helper for planned-session workout structures"
```

---

## Section G — Read paths surface structure

### Task 18: `volumePlan` exposes structure on `RunSessionDetail` and `StrengthSessionDetail`

**Files:**
- Modify: `mobile/src/lib/volumePlan.ts`
- Modify: `mobile/__tests__/lib/volumePlan.test.ts`

- [ ] **Step 1: Read current volumePlan.ts to find `getDaySessionDetail` and the session detail builders**

```bash
cd mobile && grep -n "RunSessionDetail\|StrengthSessionDetail\|getDaySessionDetail" src/lib/volumePlan.ts
```

- [ ] **Step 2: Extend the `RunSessionDetail` and `StrengthSessionDetail` interfaces**

In `mobile/src/lib/volumePlan.ts`, locate the `RunSessionDetail` interface (around line 33). Add two new fields:

```typescript
export interface RunSessionDetail {
  kind:               'run';
  planned_session_id: string;
  session_label:      string;
  distance_km:        number;
  base_distance_km:   number | null;
  pace_target_secs:   number;
  estimated_minutes:  number;
  status:             string;
  actual_pace_secs:   number | null;
  actual_distance_km: number | null;
  cycle_modulation:   ModulationResult | null;
  // NEW — Phase I
  structure:           import('./workoutStructure').RunWorkoutStructure | null;
  modulated_structure: import('./workoutStructure').RunWorkoutStructure | null;
}

export interface StrengthSessionDetail {
  kind:               'strength';
  planned_session_id: string;
  session_label:      string;
  estimated_minutes:  number;
  status:             string;
  cycle_modulation:   ModulationResult | null;
  // NEW — Phase I
  structure:          import('./workoutStructure').StrengthWorkoutStructure | null;
}
```

- [ ] **Step 3: Update `getDaySessionDetail` to read and modulate structure**

Find the place inside `getDaySessionDetail` (or its helper) that builds `RunSessionDetail`/`StrengthSessionDetail` objects. Update the Supabase select to include `run_structure, strength_structure`, then attach them:

```typescript
// In the supabase select for planned_sessions, include:
.select('id, session_label, modality, status, activity_id, run_structure, strength_structure, ...')

// In the per-session map, for run sessions:
import { modulateRunStructure } from './cycleModulation';
// ...
const phaseForDate = cycleStore.periodStart
  ? getCycleInfo(cycleStore.periodStart, cycleStore.cycleLength, new Date(`${date}T00:00:00`)).phase
  : null;

const structure = row.run_structure ?? null;
const modulated = structure
  ? modulateRunStructure(structure, phaseForDate, cycleProfile).adjusted
  : null;

return {
  // ...existing fields,
  structure,
  modulated_structure: modulated,
};

// For strength sessions:
return {
  // ...existing fields,
  structure: row.strength_structure ?? null,
};
```

- [ ] **Step 4: Write the test**

Append to `__tests__/lib/volumePlan.test.ts`:

```typescript
// This test uses the supabase mock pattern; if volumePlan.test.ts already
// mocks supabase, extend the existing mock with run_structure data. Otherwise
// the read path is integration-tested via `getDaySessionDetail`.

import { modulateRunStructure } from '@/lib/cycleModulation';
import type { RunWorkoutStructure } from '@/lib/workoutStructure';

test('modulateRunStructure applied to read-time structure produces faster work step in follicular', () => {
  const structure: RunWorkoutStructure = {
    version: 1, workout_type: 'tempo', total_distance_m: 8000,
    steps: [
      { id: 'a', kind: 'work', target: { distance_m: 5200, pace_secs_per_km: 342, pace_band: 'tempo' } },
    ],
  };
  const { adjusted } = modulateRunStructure(structure, 'follicular', { cycle_length: 28, period_start: null });
  expect(adjusted.steps[0].target.pace_secs_per_km!).toBeLessThan(342);
});
```

- [ ] **Step 5: Run tests to verify all pass**

```bash
cd mobile && npx jest __tests__/lib/volumePlan.test.ts __tests__/lib/workoutStructureModulation.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/lib/volumePlan.ts mobile/__tests__/lib/volumePlan.test.ts
git commit -m "feat: volumePlan exposes run_structure and modulated_structure on read"
```

---

### Task 19: `todaysSession` surfaces a one-line structure summary

**Files:**
- Modify: `mobile/src/lib/todaysSession.ts`

- [ ] **Step 1: Extend the `TodaysSession` interface**

Add a new field:

```typescript
export interface TodaysSession {
  id:             string;
  modality:       'run' | 'strength' | 'swim' | 'yoga' | 'other';
  session_label:  string;
  status:         'planned' | 'completed' | 'dropped' | 'moved';
  activity_id:    string | null;
  actual_distance_m?:  number | null;
  actual_duration_s?:  number | null;
  actual_activity_type?: string | null;
  cycle_adjusted_pace_secs: number | null;
  cycle_reason_short:       string | null;
  cycle_pace_arrow:         '↑' | '↓' | null;
  // NEW — Phase I
  structure_summary: string | null;
}
```

- [ ] **Step 2: Extend `getTodaysSessions` to read structure and build the summary**

In the Supabase select, add `run_structure, strength_structure`:

```typescript
const { data: planned, error } = await supabase
  .from('planned_sessions')
  .select('id, modality, session_label, status, activity_id, run_structure, strength_structure')
  .eq('user_id', userId)
  .eq('scheduled_date', today)
  .neq('status', 'moved')
  .neq('status', 'dropped')
  .order('created_at');
```

Update the `PlannedSessionRow` interface to include those fields.

After the existing modulation logic, build the summary:

```typescript
import { summariseRunStructure, summariseStrengthStructure } from './workoutStructure';
import { modulateRunStructure } from './cycleModulation';

// inside the .map((r) => ... :
let structure_summary: string | null = null;
if (r.modality === 'run' && r.run_structure) {
  const modulated = modulateRunStructure(r.run_structure, cyclePhase, cycleProfile).adjusted;
  structure_summary = summariseRunStructure(modulated);
} else if (r.modality === 'strength' && r.strength_structure) {
  structure_summary = summariseStrengthStructure(r.strength_structure);
}

return {
  // ...existing fields,
  structure_summary,
};
```

- [ ] **Step 3: Run the existing `todaysSession`-related tests**

```bash
cd mobile && npx jest
```

Expected: existing tests still pass (the new field is additive).

- [ ] **Step 4: Commit**

```bash
git add mobile/src/lib/todaysSession.ts
git commit -m "feat: todaysSession surfaces structure summary line"
```

---

## Section H — UI surfaces

### Task 20: `TodaysSessionHero` renders the structure summary

**Files:**
- Modify: `mobile/src/components/ui/TodaysSessionHero.tsx`

- [ ] **Step 1: Add a summary line under the modality row**

In `TodaysSessionHero.tsx`, within the `sessions.map(...)` JSX (around line 75-100), after the cycle reason `<VirraText>` block, add:

```tsx
{s.structure_summary && (
  <VirraText variant="mono" size={11} color={colors.muted} style={{ marginTop: 2 }}>
    {s.structure_summary}
  </VirraText>
)}
```

- [ ] **Step 2: Visually verify in the dev simulator**

Start the dev server:

```bash
cd mobile && npx expo start
```

Log in as a test user with planned sessions today. The dashboard hero should now show the workout summary line (e.g. "4 × 800m @ 4:15/km · 6.8km total" for an interval day).

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/ui/TodaysSessionHero.tsx
git commit -m "feat(ui): dashboard hero shows workout structure summary"
```

---

### Task 21: `SessionDetailModal` renders step-by-step run structure

**Files:**
- Modify: `mobile/src/components/ui/SessionDetailModal.tsx`

- [ ] **Step 1: Replace the single-line distance/pace block with a structure preview when structure is present**

Locate the run rendering block in `SessionDetailModal.tsx` (around line 158, where `isRun && s.status !== 'dropped'` is handled). Replace the existing single-line VirraText with a conditional:

```tsx
{isRun && s.status !== 'dropped' && (
  <>
    {/* Step-by-step preview when structure is present */}
    {(s as any).modulated_structure ? (
      <View style={modal.stepList}>
        {(s as any).modulated_structure.steps.map((step: any) => renderStep(step))}
      </View>
    ) : (
      <VirraText variant="mono" size={10} color={colors.muted} style={modal.detail}>
        {s.status === 'completed' && r.actual_distance_km
          ? `${r.actual_distance_km.toFixed(1)}km · ${r.actual_pace_secs ? formatPace(r.actual_pace_secs) : '—'} · actual`
          : r.base_distance_km
            ? `${r.base_distance_km.toFixed(1)} → ${r.distance_km.toFixed(1)}km · ${formatPace(displayPaceSecs)} · ~${r.estimated_minutes}min`
            : `${r.distance_km.toFixed(1)}km · ${formatPace(displayPaceSecs)} · ~${r.estimated_minutes}min`}
      </VirraText>
    )}
    {/* existing "ADJUSTED FROM" line continues here */}
  </>
)}
```

Add a `renderStep` helper at the bottom of the component (or inline as a local function inside `renderSessionCard`):

```tsx
function renderStep(step: any, depth: number = 0): React.ReactNode {
  if (step.kind === 'repeat') {
    return (
      <View key={step.id} style={[modal.stepRow, { paddingLeft: depth * 12 }]}>
        <VirraText variant="mono" size={11} color={colors.pulse}>
          {step.repeat_count} ×
        </VirraText>
        <View style={{ flex: 1, gap: 2 }}>
          {step.sub_steps?.map((ss: any) => renderStep(ss, depth + 1))}
        </View>
      </View>
    );
  }
  const distM = step.target.distance_m;
  const durS = step.target.duration_s;
  const pace = step.target.pace_secs_per_km;
  const distText = distM
    ? distM >= 1000 ? `${(distM / 1000).toFixed(1)}km` : `${distM}m`
    : durS ? `${Math.round(durS / 60)}min` : '';
  const paceText = pace ? ` @ ${formatPace(pace)}/km` : '';
  return (
    <View key={step.id} style={[modal.stepRow, { paddingLeft: depth * 12 }]}>
      <VirraText variant="mono" size={11} color={colors.muted} style={{ width: 70 }}>
        {step.kind.toUpperCase()}
      </VirraText>
      <VirraText variant="body" size={13} color={colors.breath}>
        {step.label ? `${step.label} · ` : ''}{distText}{paceText}
      </VirraText>
    </View>
  );
}
```

Add the styles to the `modal` StyleSheet at the bottom of the file:

```ts
stepList: { gap: 2, marginTop: spacing.xs },
stepRow:  { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 3 },
```

- [ ] **Step 2: Visually verify in the dev simulator**

Open the MonthCalendar in Training tab, tap an upcoming run with structure. The modal should show step-by-step layout instead of the single line.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/ui/SessionDetailModal.tsx
git commit -m "feat(ui): SessionDetailModal shows step-by-step run structure"
```

---

### Task 22: Insights 14-day lookahead renders workout summary per session

**Files:**
- Modify: `mobile/app/(app)/insights.tsx`

- [ ] **Step 1: Locate the upcoming-sessions list in `insights.tsx`**

Run:

```bash
cd mobile && grep -n "upcoming\|14.day\|lookahead\|planned_sessions" app/\(app\)/insights.tsx
```

Find the JSX block that renders each upcoming session row.

- [ ] **Step 2: Pass structure-derived summary into the row**

The fetch that powers Insights is likely already selecting from `planned_sessions`. Extend the select to include `run_structure, strength_structure`. Then derive the summary text inline:

```typescript
import { summariseRunStructure, summariseStrengthStructure } from '@/lib/workoutStructure';
import { modulateRunStructure } from '@/lib/cycleModulation';
import { getCycleInfo } from '@/lib/cycleEngine';

// for each upcoming row, compute predicted phase for its date and build summary:
function summaryFor(row: any, phaseForDate: any, cycleProfile: any): string | null {
  if (row.modality === 'run' && row.run_structure) {
    const modulated = modulateRunStructure(row.run_structure, phaseForDate, cycleProfile).adjusted;
    return summariseRunStructure(modulated);
  }
  if (row.modality === 'strength' && row.strength_structure) {
    return summariseStrengthStructure(row.strength_structure);
  }
  return null;
}
```

Render the summary line under the existing label inside each session row:

```tsx
<View style={styles.sessionRow}>
  <VirraText variant="display" size={14} color={colors.breath}>{labelCase(row.session_label)}</VirraText>
  {summary && (
    <VirraText variant="mono" size={10} color={colors.muted}>{summary}</VirraText>
  )}
</View>
```

- [ ] **Step 3: Visually verify in the dev simulator**

Open Insights tab, scroll to the upcoming 14-day section. Each session row should now show a workout-shape summary line.

- [ ] **Step 4: Commit**

```bash
git add mobile/app/\(app\)/insights.tsx
git commit -m "feat(ui): Insights lookahead shows workout summary per session"
```

---

## Section I — Final integration

### Task 23: Plumb hydration into the read paths so legacy rows backfill on demand

**Files:**
- Modify: `mobile/src/lib/todaysSession.ts`
- Modify: `mobile/src/lib/volumePlan.ts`

- [ ] **Step 1: Call `hydratePlannedSessionStructures` after fetching planned sessions**

In `getTodaysSessions` (todaysSession.ts), after the Supabase select for `planned`:

```typescript
import { hydratePlannedSessionStructures, persistHydratedRows } from './hydratePlannedSessions';

// existing:
//   const { data: planned, error } = await supabase.from('planned_sessions').select(...)

// Add:
const baselinePaceSecs = profileResult.data?.baseline_pace_seconds_per_km ?? 360;
const weeklyKm = profileResult.data?.weekly_mileage_km ?? 30;

const hydrated = hydratePlannedSessionStructures(
  (planned ?? []) as any,
  { baseline_pace_secs: baselinePaceSecs, weekly_km: weeklyKm },
);

// Fire-and-forget persistence
persistHydratedRows(hydrated, supabase).catch(() => {});

// use `hydrated` instead of `planned` going forward
```

Do the same in `getDaySessionDetail` (volumePlan.ts) — after fetching the planned rows for the day, call `hydratePlannedSessionStructures` with context, then proceed.

- [ ] **Step 2: Run all tests**

```bash
cd mobile && npx jest
```

Expected: all tests pass.

- [ ] **Step 3: Manually verify legacy rows backfill**

In Supabase MCP:

```
mcp__supabase__execute_sql with "select count(*) from planned_sessions where modality = 'run' and run_structure is null"
```

Note the count, then open the dashboard for a user with such legacy rows. After opening, re-run the count — it should have decreased.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/lib/todaysSession.ts mobile/src/lib/volumePlan.ts
git commit -m "feat: hydrate legacy planned_sessions with workout structure on first read"
```

---

### Task 24: Full test sweep and final verification

**Files:** none

- [ ] **Step 1: Run the entire test suite**

```bash
cd mobile && npx jest
```

Expected: all tests pass (existing + new).

- [ ] **Step 2: TypeScript typecheck**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Smoke test in the simulator**

Start dev server, sign in as a test user, and verify each surface:
- Dashboard hero shows a `structure_summary` line for today's session
- `SessionDetailModal` (long-press a session in MonthCalendar) shows step-by-step structure for runs with structure
- Insights tab shows workout summary lines in the upcoming-14-days list
- Generating a new schedule (e.g. via onboarding or `recomputeSeasonForUser`) writes structure to all new `planned_sessions` rows (verify via Supabase MCP)
- Moving a session preserves its structure (verify via Supabase MCP after a move)

- [ ] **Step 4: Update CLAUDE.md Phase I marker**

Add to the build sequence section under Phase D or as a new entry:

```markdown
### Phase I — Active Workout Engine (in progress)
- ✅ Sub-project 1 (Data Foundation): plan-owned `run_structure` and `strength_structure` JSONB on `planned_sessions`, per-modality pure generators, lazy backfill, cycle modulation per step at read time, structure summaries surfaced on dashboard hero / SessionDetailModal / Insights lookahead
- [ ] Sub-project 2: pre-workout preview screen, Play CTA routing (Ia), structured run live execution (Ib live), strength live screen (Ic)
- [ ] Sub-project 3: workout substitution (Id)
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: mark Phase I data foundation complete in CLAUDE.md"
```

---

## Self-Review

**Spec coverage:**
- ✅ Plan-owned architecture (Section A, E, F)
- ✅ Run structure schema + JSONB column (Tasks 1, 3)
- ✅ Strength structure schema + JSONB column (Tasks 2, 3)
- ✅ Run generator covering all 10 workout types (Tasks 4–9)
- ✅ Strength generator with phase-aware set/rep targets and repeat avoidance (Tasks 10–11)
- ✅ Cycle modulation per step at read time (Tasks 12–13)
- ✅ Schedule generator writes structure on insert (Task 14)
- ✅ `generateAndSaveSchedule` plumbs context (Task 15)
- ✅ `moveSession` preserves structure (Task 16)
- ✅ Lazy backfill for legacy rows (Tasks 17, 23)
- ✅ `volumePlan` exposes structure + modulated_structure (Task 18)
- ✅ `todaysSession` exposes summary (Task 19)
- ✅ Dashboard hero renders summary (Task 20)
- ✅ SessionDetailModal renders step-by-step (Task 21)
- ✅ Insights lookahead renders summary with predicted-phase modulation (Task 22)
- ✅ Predicted-phase modulation for future dates (Tasks 18, 22 — `phaseForDate` derived from `getCycleInfo` with the session's scheduled date)

**Out-of-scope items confirmed deferred:**
- Pre-workout preview screen — Plan 2
- Play CTA routing — Plan 2
- Live execution UIs — Plan 2
- Swap mechanics — Plan 3

**Type consistency check:**
- `RunWorkoutStructure`, `RunStep`, `RunStepTarget`, `PaceBand` all defined in Task 3, used consistently in Tasks 4–9, 12–13, 14, 17, 18, 19, 21, 22 ✓
- `StrengthWorkoutStructure`, `PlannedExercise`, `StrengthSetTarget` defined in Task 3, used in Tasks 10–11, 14, 17, 18, 19, 22 ✓
- `GenerateRunInput` from Task 4, `GenerateStrengthInput` from Task 10, `GenerateContext` from Task 14, `HydrateContext` from Task 17 — all referenced consistently ✓
- `modulateRunStructure` defined in Task 12, used in Tasks 18, 19, 22 ✓
- `summariseRunStructure` / `summariseStrengthStructure` defined in Task 3, used in Tasks 19, 22 ✓
- `hydratePlannedSessionStructures` defined in Task 17, used in Task 23 ✓
