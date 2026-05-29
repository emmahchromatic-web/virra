# F3a — Baseline Self-Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect when a runner's logged actuals show their fitness has drifted from the plan's assumed baseline, and — on the runner's confirmation via a celebratory Fitness Update modal — move the rolling pace baseline and regenerate upcoming run sessions to match.

**Architecture:** A pure detection module (`baselineCalibration.ts`) computes a `Verdict` from completed-run samples by comparing each run's actual average pace to the phase-modulated expected pace its stored `run_structure` prescribed, backing each out to a baseline-equivalent (`current_baseline × actual / expected`), taking the median, and applying magnitude/consistency/cooldown/snooze/break gates. A confirm applies the verdict (`applyBaselineUpdate.ts`): writes the baseline, records a `fitness_assessments` row, appends history, and regenerates `run_structure` for future planned runs via the existing `generateRunStructure`. A hook (`useFitnessUpdate.ts`) fetches data and orchestrates; a Dashboard card → confirm modal are the surfaces.

**Tech Stack:** React Native 0.81, Expo SDK 54, TypeScript, Supabase (Postgres), Zustand; jest-expo + @testing-library/react-native.

**Reference spec:** `docs/superpowers/specs/2026-05-28-f3a-baseline-self-correction-design.md`

---

## Ground truth (verified against the codebase — read before starting)

- `@/` → `mobile/src/`. Expo-router screens live at `mobile/app/`. All commands run from `mobile/`:
  ```bash
  cd /Users/pauldickenson/Claude/virra/mobile
  ```
- Screen paths contain parentheses (`(app)`, `(tabs)`) — **quote them** in shell.
- `supabase` import: `'./supabase'` inside `src/lib/`; `'@/lib/supabase'` from components/stores.
- The baseline lives at `user_profiles.baseline_pace_seconds_per_km` (default `360`). It is read directly from supabase in libs, **not** from the profile store.
- Types (canonical homes):
  - `src/lib/workoutStructure.ts` — `RunWorkoutStructure { version:1; workout_type; steps: RunStep[]; total_distance_m }`, `RunStep { id; kind: 'warmup'|'work'|'rest'|'cooldown'|'repeat'; label?; target: RunStepTarget; repeat_count?; sub_steps? }`, `RunStepTarget { distance_m?; duration_s?; pace_secs_per_km?; pace_band? }`, `PaceBand`, `RunWorkoutType`. `summariseRunStructure(s): string`.
  - `src/lib/runWorkoutGenerator.ts` — `generateRunStructure(input: GenerateRunInput): RunWorkoutStructure`, `GenerateRunInput { session_label: string; baseline_pace_secs: number; distance_km: number }`, `inferWorkoutType(sessionLabel): RunWorkoutType`, `paceForBand`. **Throws** on an unrecognised workout type.
  - `src/lib/cycleModulation.ts` — `modulateRunStructure(structure, phase: CyclePhase|null, profile: CycleProfile|null): { adjusted: RunWorkoutStructure; reason: string|null }`.
  - `src/store/cycle.ts` — `CyclePhase`, `CycleProfile`.
- Cascade reality: `run_structure` is baked from the **raw baseline** via `generateRunStructure`; the goal-pace hierarchy (`getGoalPace`) only feeds the read-time *summary* pace, which recomputes on read — so the cascade only needs to regenerate stored `run_structure`.
- Migrations now use timestamp names. Latest is `20260527000000_widen_modality_check_cycle_hike.sql`; style is `-- <filename>` header, plain `alter table public.<t> ...`, no begin/commit.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `supabase/migrations/20260528000000_fitness_calibration.sql` | Two additive nullable columns | Create |
| `src/lib/baselineCalibration.ts` | **Pure** detection: samples → `Verdict \| null` (+ helpers) | Create |
| `src/lib/applyBaselineUpdate.ts` | Enact a confirmed verdict (writes + regenerate) | Create |
| `src/hooks/useFitnessUpdate.ts` | Orchestration: fetch → detect → expose verdict/confirm/snooze | Create |
| `src/components/ui/FitnessUpdateModal.tsx` | Confirm-and-celebrate modal (both directions) | Create |
| `src/components/ui/FitnessUpdateCard.tsx` | Non-interrupting Dashboard card | Create |
| `app/(app)/(tabs)/index.tsx` | Render card; wire modal/confirm/snooze | Modify |
| `__tests__/lib/baselineCalibration.test.ts` | Unit tests (pure) | Create |
| `__tests__/lib/applyBaselineUpdate.test.ts` | Unit tests (mocked supabase) | Create |
| `__tests__/components/FitnessUpdateModal.test.tsx` | Component test | Create |
| `__tests__/components/FitnessUpdateCard.test.tsx` | Component test | Create |
| `docs` + memory | Correct the Phase B overstatement | Modify |

---

## Task 1: Migration — two additive columns

**Files:**
- Create: `mobile/supabase/migrations/20260528000000_fitness_calibration.sql`

- [ ] **Step 1: Write the migration**

Create `mobile/supabase/migrations/20260528000000_fitness_calibration.sql`:

```sql
-- 20260528000000_fitness_calibration.sql
-- F3a: persist a dismissed Fitness Update suggestion (snooze) and record the
-- direction of each baseline assessment.

alter table public.user_profiles
  add column if not exists fitness_check_snoozed_until timestamptz;

alter table public.fitness_assessments
  add column if not exists direction text check (direction in ('faster','slower'));
```

- [ ] **Step 2: Apply the migration via the Supabase MCP**

Apply using the Supabase MCP `apply_migration` tool (project ref `elebuieojodsjmghwjub`), name `fitness_calibration`, with the SQL above. Then confirm with the MCP `list_tables` (or `execute_sql`: `select column_name from information_schema.columns where table_name='user_profiles' and column_name='fitness_check_snoozed_until';`).
Expected: the column exists; `fitness_assessments.direction` exists with the check constraint.

- [ ] **Step 3: Commit**

```bash
git add "supabase/migrations/20260528000000_fitness_calibration.sql"
git commit -m "feat: migration for F3a fitness calibration (snooze + direction)"
```

---

## Task 2: Pure helpers — flatten structure, expected pace, back-out

**Files:**
- Create: `mobile/src/lib/baselineCalibration.ts` (helpers first; verdict added in Task 3)
- Test: `mobile/__tests__/lib/baselineCalibration.test.ts`

- [ ] **Step 1: Write the failing test**

Create `mobile/__tests__/lib/baselineCalibration.test.ts`:

```ts
import {
  flattenRunSteps,
  expectedModulatedAvgPace,
  baselineEquivalentForRun,
} from '@/lib/baselineCalibration';
import type { RunWorkoutStructure } from '@/lib/workoutStructure';

// baseline 360 → easy band ×1.15 = 414/km over 5km, single easy step
const easy5k: RunWorkoutStructure = {
  version: 1,
  workout_type: 'easy',
  total_distance_m: 5000,
  steps: [
    { id: 'a', kind: 'work', label: 'easy', target: { distance_m: 5000, pace_band: 'easy', pace_secs_per_km: 414 } },
  ],
};

// intervals: 1km warmup easy (414) + 4×(800m vo2 @ 299 / 400m rest) + 1km cooldown
const intervals: RunWorkoutStructure = {
  version: 1,
  workout_type: 'intervals',
  total_distance_m: 1000 + 4 * 1200 + 1000,
  steps: [
    { id: 'w', kind: 'warmup', target: { distance_m: 1000, pace_band: 'easy', pace_secs_per_km: 414 } },
    {
      id: 'r', kind: 'repeat', repeat_count: 4,
      target: {},
      sub_steps: [
        { id: 'on', kind: 'work', target: { distance_m: 800, pace_band: 'vo2', pace_secs_per_km: 299 } },
        { id: 'off', kind: 'rest', target: { distance_m: 400, pace_band: 'recovery', pace_secs_per_km: 450 } },
      ],
    },
    { id: 'c', kind: 'cooldown', target: { distance_m: 1000, pace_band: 'easy', pace_secs_per_km: 414 } },
  ],
};

describe('flattenRunSteps', () => {
  it('expands repeats by repeat_count and keeps distance+pace pairs', () => {
    const flat = flattenRunSteps(intervals);
    // 1 warmup + 4*(2) + 1 cooldown = 10 leaf steps
    expect(flat).toHaveLength(10);
    expect(flat.filter((s) => s.pace_secs_per_km === 299)).toHaveLength(4);
  });

  it('ignores steps without both distance and pace', () => {
    const s: RunWorkoutStructure = {
      version: 1, workout_type: 'easy', total_distance_m: 1000,
      steps: [{ id: 'x', kind: 'work', target: { duration_s: 600, pace_secs_per_km: 400 } }],
    };
    expect(flattenRunSteps(s)).toHaveLength(0);
  });
});

describe('expectedModulatedAvgPace', () => {
  it('returns the distance-weighted average pace with no phase modulation', () => {
    // natural profile, phase null → modulateRunStructure is a no-op
    const avg = expectedModulatedAvgPace(easy5k, null, 'natural');
    expect(avg).toBe(414);
  });

  it('distance-weights across steps', () => {
    const avg = expectedModulatedAvgPace(intervals, null, 'natural');
    // weighted mean of [414×1000, 299×800×4, 450×400×4, 414×1000] / 6600
    const expected = Math.round(
      (414 * 1000 + 299 * 800 * 4 + 450 * 400 * 4 + 414 * 1000) / (1000 + 800 * 4 + 400 * 4 + 1000),
    );
    expect(avg).toBe(expected);
  });

  it('returns null when no step carries a pace+distance pair', () => {
    const s: RunWorkoutStructure = {
      version: 1, workout_type: 'easy', total_distance_m: 0, steps: [],
    };
    expect(expectedModulatedAvgPace(s, null, 'natural')).toBeNull();
  });
});

describe('baselineEquivalentForRun', () => {
  it('returns current baseline when actual matches expected', () => {
    expect(baselineEquivalentForRun(360, 414, easy5k, null, 'natural')).toBe(360);
  });

  it('scales down when the runner is faster than expected', () => {
    // ran the easy 5k at 393/km vs expected 414 → ~5% faster → baseline ~342
    expect(baselineEquivalentForRun(360, 393, easy5k, null, 'natural')).toBe(342);
  });

  it('returns null when expected pace cannot be computed', () => {
    const empty: RunWorkoutStructure = { version: 1, workout_type: 'easy', total_distance_m: 0, steps: [] };
    expect(baselineEquivalentForRun(360, 400, empty, null, 'natural')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/lib/baselineCalibration.test.ts`
Expected: FAIL — `Cannot find module '@/lib/baselineCalibration'`.

- [ ] **Step 3: Write the helpers**

Create `mobile/src/lib/baselineCalibration.ts`:

```ts
import type { RunWorkoutStructure, RunStep } from './workoutStructure';
import { modulateRunStructure } from './cycleModulation';
import type { CyclePhase, CycleProfile } from '@/store/cycle';

/** A leaf step's distance + pace, after expanding repeats. */
export interface FlatStep {
  distance_m: number;
  pace_secs_per_km: number;
}

/**
 * Flatten a run structure to its leaf (distance, pace) pairs, expanding
 * `repeat` blocks by `repeat_count`. Steps lacking either a distance or a
 * pace target are dropped (they can't contribute to a distance-weighted pace).
 */
export function flattenRunSteps(structure: RunWorkoutStructure): FlatStep[] {
  const out: FlatStep[] = [];
  function walk(step: RunStep, times: number) {
    if (step.kind === 'repeat' && step.sub_steps) {
      const n = step.repeat_count ?? 1;
      for (let i = 0; i < n * times; i++) {
        for (const sub of step.sub_steps) walk(sub, 1);
      }
      return;
    }
    const d = step.target.distance_m;
    const p = step.target.pace_secs_per_km;
    if (d != null && d > 0 && p != null && p > 0) {
      for (let i = 0; i < times; i++) out.push({ distance_m: d, pace_secs_per_km: p });
    }
  }
  for (const s of structure.steps) walk(s, 1);
  return out;
}

/**
 * The distance-weighted average target pace (s/km) of a structure AFTER
 * read-time cycle modulation — i.e. the pace the runner was actually shown
 * for that session. Returns null if no step carries a usable pace+distance.
 */
export function expectedModulatedAvgPace(
  structure: RunWorkoutStructure,
  phase: CyclePhase | null,
  profile: CycleProfile | null,
): number | null {
  const { adjusted } = modulateRunStructure(structure, phase, profile);
  const flat = flattenRunSteps(adjusted);
  if (flat.length === 0) return null;
  const totalDist = flat.reduce((a, s) => a + s.distance_m, 0);
  if (totalDist <= 0) return null;
  const weighted = flat.reduce((a, s) => a + s.pace_secs_per_km * s.distance_m, 0);
  return Math.round(weighted / totalDist);
}

/**
 * Back a single run's actual average pace out to the baseline that would have
 * produced it, given the session's structure + the phase it was run in:
 *   baseline_equivalent = current_baseline × (actual / expected_modulated)
 * Returns null if the expected pace can't be computed.
 */
export function baselineEquivalentForRun(
  currentBaseline: number,
  actualAvgPace: number,
  structure: RunWorkoutStructure,
  phase: CyclePhase | null,
  profile: CycleProfile | null,
): number | null {
  const expected = expectedModulatedAvgPace(structure, phase, profile);
  if (expected == null || expected <= 0) return null;
  return Math.round(currentBaseline * (actualAvgPace / expected));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest __tests__/lib/baselineCalibration.test.ts`
Expected: PASS — all describe blocks green.

- [ ] **Step 5: Typecheck & commit**

Run: `npx tsc --noEmit` (ignore pre-existing `supabase/functions/` Deno errors).
```bash
git add src/lib/baselineCalibration.ts "__tests__/lib/baselineCalibration.test.ts"
git commit -m "feat: baselineCalibration pure helpers (flatten, expected pace, back-out)"
```

---

## Task 3: Pure detection verdict

**Files:**
- Modify: `mobile/src/lib/baselineCalibration.ts` (add config, types, `detectBaselineDrift`)
- Test: `mobile/__tests__/lib/baselineCalibration.test.ts` (append)

- [ ] **Step 1: Append the failing tests**

Append to `mobile/__tests__/lib/baselineCalibration.test.ts`:

```ts
import { detectBaselineDrift, type CompletedRunSample } from '@/lib/baselineCalibration';

// Helper: a completed easy-5k run at a given actual pace, on a given date.
function sample(actual: number, date: string, label = 'easy'): CompletedRunSample {
  return {
    avg_pace_secs: actual,
    distance_m: 5000,
    elevation_gain_m: 10,
    phase_at_time: null,
    session_label: label,
    run_structure: {
      version: 1, workout_type: 'easy', total_distance_m: 5000,
      steps: [{ id: 'a', kind: 'work', target: { distance_m: 5000, pace_band: 'easy', pace_secs_per_km: 414 } }],
    },
    scheduled_date: date,
  };
}

const NO_GATES = {
  currentBaseline: 360,
  cycleProfile: 'natural' as const,
  today: '2026-05-28',
  lastAssessmentDate: null,
  snoozedUntil: null,
  breaks: [] as { start: string; end: string }[],
};

describe('detectBaselineDrift', () => {
  it('returns null below the minimum run count', () => {
    const samples = [sample(393, '2026-05-20'), sample(393, '2026-05-22'), sample(393, '2026-05-24')];
    expect(detectBaselineDrift({ ...NO_GATES, samples })).toBeNull();
  });

  it('fires "faster" when ≥4 consistent runs beat expected beyond threshold', () => {
    const samples = [
      sample(393, '2026-05-10'), sample(390, '2026-05-14'),
      sample(396, '2026-05-18'), sample(392, '2026-05-22'),
    ];
    const v = detectBaselineDrift({ ...NO_GATES, samples });
    expect(v?.direction).toBe('faster');
    expect(v!.proposed).toBeLessThan(360);
    expect(v!.proposed).toBeGreaterThanOrEqual(345); // ±15s/km cap
    expect(v!.wouldChangeUpcoming).toBe(false); // no upcoming-sessions info passed
  });

  it('fires "slower" symmetrically', () => {
    const samples = [
      sample(440, '2026-05-10'), sample(438, '2026-05-14'),
      sample(442, '2026-05-18'), sample(439, '2026-05-22'),
    ];
    const v = detectBaselineDrift({ ...NO_GATES, samples });
    expect(v?.direction).toBe('slower');
    expect(v!.proposed).toBeGreaterThan(360);
  });

  it('returns null when the drift is below the magnitude threshold', () => {
    // ~2s/km faster — under the 8s/km floor
    const samples = [
      sample(411, '2026-05-10'), sample(412, '2026-05-14'),
      sample(411, '2026-05-18'), sample(413, '2026-05-22'),
    ];
    expect(detectBaselineDrift({ ...NO_GATES, samples })).toBeNull();
  });

  it('rejects a single outlier among neutral runs (consistency guard)', () => {
    const samples = [
      sample(340, '2026-05-10'), // one big PR
      sample(414, '2026-05-14'), sample(414, '2026-05-18'), sample(414, '2026-05-22'),
    ];
    expect(detectBaselineDrift({ ...NO_GATES, samples })).toBeNull();
  });

  it('respects cooldown', () => {
    const samples = [
      sample(393, '2026-05-10'), sample(390, '2026-05-14'),
      sample(396, '2026-05-18'), sample(392, '2026-05-22'),
    ];
    // last assessment 5 days ago < 21-day cooldown
    expect(detectBaselineDrift({ ...NO_GATES, samples, lastAssessmentDate: '2026-05-23' })).toBeNull();
  });

  it('respects snooze', () => {
    const samples = [
      sample(393, '2026-05-10'), sample(390, '2026-05-14'),
      sample(396, '2026-05-18'), sample(392, '2026-05-22'),
    ];
    expect(detectBaselineDrift({ ...NO_GATES, samples, snoozedUntil: '2026-06-10' })).toBeNull();
  });

  it('excludes recovery runs, short runs, and hilly runs from the sample set', () => {
    const recovery = sample(393, '2026-05-10', 'recovery');
    const short = { ...sample(393, '2026-05-14'), distance_m: 1000 };
    const hilly = { ...sample(393, '2026-05-18'), elevation_gain_m: 300 };
    const ok = sample(393, '2026-05-22');
    // only 1 qualifying run → below min count → null
    expect(detectBaselineDrift({ ...NO_GATES, samples: [recovery, short, hilly, ok] })).toBeNull();
  });

  it('suppresses a DOWNWARD verdict when the window is dominated by post-break runs', () => {
    const samples = [
      sample(440, '2026-05-10'), sample(438, '2026-05-14'),
      sample(442, '2026-05-18'), sample(439, '2026-05-22'),
    ];
    // a break ending 2026-05-09 means all four runs are within the 7-day grace
    const v = detectBaselineDrift({
      ...NO_GATES, samples, breaks: [{ start: '2026-04-20', end: '2026-05-09' }],
    });
    expect(v).toBeNull();
  });

  it('sets wouldChangeUpcoming from the flag passed in', () => {
    const samples = [
      sample(393, '2026-05-10'), sample(390, '2026-05-14'),
      sample(396, '2026-05-18'), sample(392, '2026-05-22'),
    ];
    const v = detectBaselineDrift({ ...NO_GATES, samples, hasUpcomingRuns: true });
    expect(v?.wouldChangeUpcoming).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest __tests__/lib/baselineCalibration.test.ts`
Expected: FAIL — `detectBaselineDrift` / `CompletedRunSample` not exported.

- [ ] **Step 3: Implement the verdict**

Append to `mobile/src/lib/baselineCalibration.ts`:

```ts
// ---- Detection ------------------------------------------------------------

export interface CompletedRunSample {
  avg_pace_secs: number;
  distance_m: number;
  elevation_gain_m: number | null;
  phase_at_time: CyclePhase | null;
  session_label: string;
  run_structure: RunWorkoutStructure | null;
  scheduled_date: string; // ISO yyyy-mm-dd
}

export interface Verdict {
  direction: 'faster' | 'slower';
  observed: number;   // median baseline-equivalent, s/km
  proposed: number;   // damped + capped new baseline, s/km
  current: number;    // stored baseline, s/km
  evidence: string;   // human-readable, e.g. "your recent runs work out to about 5:36/km"
  nRuns: number;
  windowDays: number;
  wouldChangeUpcoming: boolean;
}

export interface DetectConfig {
  minRuns: number;            // default 4
  windowDays: number;         // default 42
  minDeltaSecs: number;       // default 8
  consistencyFraction: number;// default 0.75
  cooldownDays: number;       // default 21
  postBreakGraceDays: number; // default 7
  damping: number;            // default 0.6
  capSecs: number;            // default 15
  maxElevationGainM: number;  // default 150
  minDistanceM: number;       // default 1500
}

export const DEFAULT_DETECT_CONFIG: DetectConfig = {
  minRuns: 4, windowDays: 42, minDeltaSecs: 8, consistencyFraction: 0.75,
  cooldownDays: 21, postBreakGraceDays: 7, damping: 0.6, capSecs: 15,
  maxElevationGainM: 150, minDistanceM: 1500,
};

export interface DetectParams {
  samples: CompletedRunSample[];
  currentBaseline: number;
  cycleProfile: CycleProfile | null;
  today: string;                 // ISO yyyy-mm-dd, injected
  lastAssessmentDate: string | null;
  snoozedUntil: string | null;   // ISO timestamp or date
  breaks: { start: string; end: string }[];
  hasUpcomingRuns?: boolean;
  config?: Partial<DetectConfig>;
}

const DAY_MS = 86_400_000;
function daysBetween(aIso: string, bIso: string): number {
  return Math.round((Date.parse(aIso) - Date.parse(bIso)) / DAY_MS);
}
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}
function fmtPace(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function detectBaselineDrift(params: DetectParams): Verdict | null {
  const cfg = { ...DEFAULT_DETECT_CONFIG, ...(params.config ?? {}) };
  const { samples, currentBaseline, cycleProfile, today } = params;

  // Gate: snooze + cooldown
  if (params.snoozedUntil && Date.parse(params.snoozedUntil) > Date.parse(today)) return null;
  if (params.lastAssessmentDate && daysBetween(today, params.lastAssessmentDate) < cfg.cooldownDays) return null;

  // Window + quality filter
  const inWindow = samples.filter((s) => daysBetween(today, s.scheduled_date) <= cfg.windowDays && daysBetween(today, s.scheduled_date) >= 0);

  // Post-break grace: drop runs inside any break or within graceDays after it.
  const afterBreaks = inWindow.filter((s) => {
    for (const b of params.breaks) {
      const graceEnd = new Date(Date.parse(b.end) + cfg.postBreakGraceDays * DAY_MS)
        .toISOString().slice(0, 10);
      if (s.scheduled_date >= b.start && s.scheduled_date <= graceEnd) return false;
    }
    return true;
  });

  const qualifying = afterBreaks.filter(
    (s) =>
      s.run_structure != null &&
      s.session_label !== 'recovery' &&
      s.distance_m >= cfg.minDistanceM &&
      (s.elevation_gain_m ?? 0) <= cfg.maxElevationGainM,
  );

  if (qualifying.length < cfg.minRuns) return null;

  // Back each out to a baseline-equivalent.
  const equivs: number[] = [];
  for (const s of qualifying) {
    const eq = baselineEquivalentForRun(
      currentBaseline, s.avg_pace_secs, s.run_structure!, s.phase_at_time, cycleProfile,
    );
    if (eq != null) equivs.push(eq);
  }
  if (equivs.length < cfg.minRuns) return null;

  const observed = median(equivs);
  const delta = observed - currentBaseline; // negative = faster
  if (Math.abs(delta) < cfg.minDeltaSecs) return null;

  // Consistency guard: ≥ fraction share the median's sign.
  const sign = Math.sign(delta);
  const agreeing = equivs.filter((e) => Math.sign(e - currentBaseline) === sign).length;
  if (agreeing / equivs.length < cfg.consistencyFraction) return null;

  // Damped + capped step.
  const step = Math.max(-cfg.capSecs, Math.min(cfg.capSecs, Math.round(cfg.damping * delta)));
  const proposed = currentBaseline + step;
  if (proposed === currentBaseline) return null;

  const direction: 'faster' | 'slower' = delta < 0 ? 'faster' : 'slower';
  const evidence =
    `your recent runs work out to about ${fmtPace(observed)}/km — ` +
    `${direction === 'faster' ? 'quicker than' : 'easier than'} the ` +
    `${fmtPace(currentBaseline)} your plan assumes`;

  return {
    direction,
    observed,
    proposed,
    current: currentBaseline,
    evidence,
    nRuns: equivs.length,
    windowDays: cfg.windowDays,
    wouldChangeUpcoming: params.hasUpcomingRuns ?? false,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest __tests__/lib/baselineCalibration.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 5: Typecheck & commit**

Run: `npx tsc --noEmit` (ignore Deno errors).
```bash
git add src/lib/baselineCalibration.ts "__tests__/lib/baselineCalibration.test.ts"
git commit -m "feat: detectBaselineDrift verdict with gates and guards"
```

---

## Task 4: Apply a confirmed verdict

**Files:**
- Create: `mobile/src/lib/applyBaselineUpdate.ts`
- Test: `mobile/__tests__/lib/applyBaselineUpdate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `mobile/__tests__/lib/applyBaselineUpdate.test.ts`:

```ts
const captured: any = { updates: [], inserts: [], regenerated: [] };

jest.mock('@/lib/supabase', () => ({
  __esModule: true,
  supabase: {
    from: jest.fn((table: string) => {
      if (table === 'user_profiles') {
        return {
          update: (patch: any) => { captured.updates.push({ table, patch }); return { eq: () => Promise.resolve({ error: null }) }; },
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { assessment_history: [] }, error: null }) }) }),
        };
      }
      if (table === 'fitness_assessments') {
        return { insert: (row: any) => { captured.inserts.push({ table, row }); return Promise.resolve({ error: null }); } };
      }
      if (table === 'planned_sessions') {
        return {
          // future planned runs to regenerate
          select: () => ({ eq: () => ({ eq: () => ({ gte: () => Promise.resolve({
            data: [
              { id: 'p1', session_label: 'easy',  run_structure: { version: 1, workout_type: 'easy', total_distance_m: 5000, steps: [] } },
              { id: 'p2', session_label: 'tempo', run_structure: { version: 1, workout_type: 'tempo', total_distance_m: 8000, steps: [] } },
              { id: 'p3', session_label: 'mystery-label', run_structure: { version: 1, workout_type: 'easy', total_distance_m: 6000, steps: [] } },
            ], error: null,
          }) }) }) }),
          update: (patch: any) => ({ eq: (_c: string, id: string) => { captured.regenerated.push({ id, patch }); return Promise.resolve({ error: null }); } }),
        };
      }
      return {};
    }),
  },
}));

// generateRunStructure: succeed for known labels, throw for 'mystery-label'
jest.mock('@/lib/runWorkoutGenerator', () => ({
  __esModule: true,
  generateRunStructure: jest.fn((input: any) => {
    if (input.session_label === 'mystery-label') throw new Error('unhandled workout type');
    return { version: 1, workout_type: input.session_label, total_distance_m: input.distance_km * 1000, steps: [], __regen: input.baseline_pace_secs };
  }),
}));

import { applyBaselineUpdate } from '@/lib/applyBaselineUpdate';
import type { Verdict } from '@/lib/baselineCalibration';

const verdict: Verdict = {
  direction: 'faster', observed: 336, proposed: 348, current: 360,
  evidence: 'x', nRuns: 5, windowDays: 42, wouldChangeUpcoming: true,
};

beforeEach(() => { captured.updates = []; captured.inserts = []; captured.regenerated = []; });

describe('applyBaselineUpdate', () => {
  it('writes the new baseline to user_profiles', async () => {
    await applyBaselineUpdate('u1', verdict, '2026-05-28', 'recreational');
    const profileUpdate = captured.updates.find((u: any) => u.table === 'user_profiles');
    expect(profileUpdate.patch.baseline_pace_seconds_per_km).toBe(348);
  });

  it('appends a snapshot to assessment_history', async () => {
    await applyBaselineUpdate('u1', verdict, '2026-05-28', 'recreational');
    const profileUpdate = captured.updates.find((u: any) => u.table === 'user_profiles');
    expect(profileUpdate.patch.assessment_history).toHaveLength(1);
    expect(profileUpdate.patch.assessment_history[0]).toMatchObject({ from: 360, to: 348, direction: 'faster' });
  });

  it('inserts a fitness_assessments row with the direction', async () => {
    await applyBaselineUpdate('u1', verdict, '2026-05-28', 'recreational');
    expect(captured.inserts[0].row).toMatchObject({
      user_id: 'u1', actual_pace_seconds_per_km: 348, direction: 'faster', stated_level: 'recreational',
    });
    expect(captured.inserts[0].row.celebrated_at).toBeTruthy();
  });

  it('regenerates run_structure for generatable future runs and skips the unknown label', async () => {
    await applyBaselineUpdate('u1', verdict, '2026-05-28', 'recreational');
    const ids = captured.regenerated.map((r: any) => r.id);
    expect(ids).toEqual(['p1', 'p2']); // p3 (mystery-label) skipped, not aborted
    expect(captured.regenerated[0].patch.run_structure.__regen).toBe(348); // used new baseline
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest __tests__/lib/applyBaselineUpdate.test.ts`
Expected: FAIL — `Cannot find module '@/lib/applyBaselineUpdate'`.

- [ ] **Step 3: Implement**

Create `mobile/src/lib/applyBaselineUpdate.ts`:

```ts
import { supabase } from './supabase';
import { generateRunStructure } from './runWorkoutGenerator';
import type { Verdict } from './baselineCalibration';
import type { RunWorkoutStructure } from './workoutStructure';

/**
 * Enact a confirmed Fitness Update: write the new baseline, append history,
 * record the assessment (also the cooldown anchor), and regenerate the
 * run_structure of upcoming planned runs from the new baseline.
 *
 * `today` is injected (ISO yyyy-mm-dd) for testability; `statedLevel` is the
 * user's current fitness_level for the assessment record.
 */
export async function applyBaselineUpdate(
  userId: string,
  verdict: Verdict,
  today: string,
  statedLevel: string | null,
): Promise<void> {
  const nowIso = new Date().toISOString();

  // 1. Read existing assessment_history, then write baseline + appended snapshot.
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('assessment_history')
    .eq('id', userId)
    .single();

  const history = Array.isArray(profile?.assessment_history) ? profile!.assessment_history : [];
  history.push({
    on: today,
    from: verdict.current,
    to: verdict.proposed,
    direction: verdict.direction,
    n_runs: verdict.nRuns,
    window_days: verdict.windowDays,
  });

  await supabase
    .from('user_profiles')
    .update({ baseline_pace_seconds_per_km: verdict.proposed, assessment_history: history })
    .eq('id', userId);

  // 2. Record the assessment (cooldown anchor).
  await supabase.from('fitness_assessments').insert({
    user_id: userId,
    assessed_on: today,
    stated_level: statedLevel,
    actual_pace_seconds_per_km: verdict.proposed,
    trigger_description: verdict.evidence,
    direction: verdict.direction,
    celebrated_at: nowIso,
  });

  // 3. Regenerate run_structure for upcoming planned runs from the new baseline.
  const { data: upcoming } = await supabase
    .from('planned_sessions')
    .select('id, session_label, run_structure')
    .eq('modality', 'run')
    .eq('status', 'planned')
    .gte('scheduled_date', today);

  for (const row of (upcoming ?? []) as Array<{ id: string; session_label: string; run_structure: RunWorkoutStructure | null }>) {
    const distanceM = row.run_structure?.total_distance_m;
    if (!distanceM || distanceM <= 0) continue; // nothing to base distance on; leave as-is
    try {
      const fresh = generateRunStructure({
        session_label: row.session_label,
        baseline_pace_secs: verdict.proposed,
        distance_km: distanceM / 1000,
      });
      await supabase.from('planned_sessions').update({ run_structure: fresh }).eq('id', row.id);
    } catch {
      // Unrecognised workout type — skip this session, keep its existing structure.
    }
  }
}
```

> Note on the supabase chain: the real client filters with `.eq(...).eq(...).gte(...)`. The test mock above returns the rows from that exact chain. If the live client rejects chained `.eq` ordering, adjust the query to match — the behaviour (filter to future planned runs) is what matters.

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest __tests__/lib/applyBaselineUpdate.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Typecheck & commit**

Run: `npx tsc --noEmit` (ignore Deno errors).
```bash
git add src/lib/applyBaselineUpdate.ts "__tests__/lib/applyBaselineUpdate.test.ts"
git commit -m "feat: applyBaselineUpdate — write baseline, record assessment, regenerate upcoming runs"
```

---

## Task 5: Fitness Update modal

**Files:**
- Create: `mobile/src/components/ui/FitnessUpdateModal.tsx`
- Test: `mobile/__tests__/components/FitnessUpdateModal.test.tsx`

The modal is presentational: it receives a `Verdict` and callbacks. It uses `VirraModal`, `VirraText`, `VirraButton`, and theme tokens, mirroring `AddEventModal`.

- [ ] **Step 1: Write the failing test**

Create `mobile/__tests__/components/FitnessUpdateModal.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { FitnessUpdateModal } from '@/components/ui/FitnessUpdateModal';
import type { Verdict } from '@/lib/baselineCalibration';

const faster: Verdict = {
  direction: 'faster', observed: 336, proposed: 348, current: 360,
  evidence: 'your recent runs work out to about 5:36/km — quicker than the 6:00 your plan assumes',
  nRuns: 6, windowDays: 42, wouldChangeUpcoming: true,
};
const slower: Verdict = { ...faster, direction: 'slower', observed: 384, proposed: 372, evidence: 'easier copy' };

describe('FitnessUpdateModal', () => {
  it('renders nothing meaningful when hidden', () => {
    const { queryByText } = render(
      <FitnessUpdateModal visible={false} verdict={faster} onConfirm={() => {}} onSnooze={() => {}} />,
    );
    expect(queryByText(/getting faster/i)).toBeNull();
  });

  it('renders the faster headline, old→new paces, and the cascade promise', () => {
    const { getByText } = render(
      <FitnessUpdateModal visible verdict={faster} onConfirm={() => {}} onSnooze={() => {}} />,
    );
    expect(getByText(/getting faster/i)).toBeTruthy();
    expect(getByText(/6:00/)).toBeTruthy();
    expect(getByText(/5:48|5:36/)).toBeTruthy();
    expect(getByText(/refresh your upcoming sessions/i)).toBeTruthy();
  });

  it('uses recalibrate copy for the slower direction', () => {
    const { getByText } = render(
      <FitnessUpdateModal visible verdict={slower} onConfirm={() => {}} onSnooze={() => {}} />,
    );
    expect(getByText(/recalibrate/i)).toBeTruthy();
  });

  it('softens the cascade promise when nothing upcoming would change', () => {
    const { getByText, queryByText } = render(
      <FitnessUpdateModal visible verdict={{ ...faster, wouldChangeUpcoming: false }} onConfirm={() => {}} onSnooze={() => {}} />,
    );
    expect(queryByText(/refresh your upcoming sessions/i)).toBeNull();
    expect(getByText(/next plan/i)).toBeTruthy();
  });

  it('fires onConfirm and onSnooze', () => {
    const onConfirm = jest.fn();
    const onSnooze = jest.fn();
    const { getByText } = render(
      <FitnessUpdateModal visible verdict={faster} onConfirm={onConfirm} onSnooze={onSnooze} />,
    );
    fireEvent.press(getByText(/update my baseline/i));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.press(getByText(/not yet/i));
    expect(onSnooze).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest __tests__/components/FitnessUpdateModal.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `mobile/src/components/ui/FitnessUpdateModal.tsx`:

```tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { VirraModal } from './VirraModal';
import { VirraText } from './VirraText';
import { VirraButton } from './VirraButton';
import { colors, spacing } from '@/constants/theme';
import type { Verdict } from '@/lib/baselineCalibration';

interface Props {
  visible: boolean;
  verdict: Verdict | null;
  onConfirm: () => void;
  onSnooze: () => void;
}

function fmtPace(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function FitnessUpdateModal({ visible, verdict, onConfirm, onSnooze }: Props) {
  if (!verdict) return null;
  const faster = verdict.direction === 'faster';
  const accent = faster ? colors.pulse : colors.dawn;

  const title = faster ? 'You’re getting faster.' : 'Let’s recalibrate.';
  const body = faster
    ? `Your recent runs work out to about ${fmtPace(verdict.observed)}/km — quicker than the ${fmtPace(verdict.current)} your plan assumes.`
    : `Your last few weeks have been tougher than your plan assumed — no problem. Let’s bring your targets to where you are now so every run feels achievable.`;
  const cascade = verdict.wouldChangeUpcoming
    ? (faster ? 'We’ll refresh your upcoming sessions to match.' : 'We’ll ease your upcoming sessions to match.')
    : 'We’ll use this for your next plan.';
  const confirmLabel = faster ? 'Update my baseline' : 'Update my targets';
  const dismissLabel = faster ? 'Not yet' : 'Keep as is';

  return (
    <VirraModal visible={visible} onClose={onSnooze} title="Fitness Update">
      <View style={s.body}>
        <VirraText variant="serif" size={22} color={colors.breath} style={s.title}>{title}</VirraText>
        <VirraText variant="body" size={14} color="rgba(244,237,224,0.8)" style={s.copy}>{body}</VirraText>

        <View style={s.paceRow}>
          <VirraText variant="display" size={32} color={colors.muted}>{fmtPace(verdict.current)}</VirraText>
          <VirraText variant="display" size={24} color={accent} style={s.arrow}>{'→'}</VirraText>
          <VirraText variant="display" size={32} color={accent}>{fmtPace(verdict.proposed)}</VirraText>
          <VirraText variant="mono" size={11} color={colors.muted} style={s.unit}>/km</VirraText>
        </View>

        <VirraText variant="mono" size={11} color={colors.muted} style={s.cascade}>{cascade}</VirraText>

        <VirraButton label={confirmLabel} onPress={onConfirm} style={{ marginTop: spacing.lg }} />
        <VirraButton label={dismissLabel} onPress={onSnooze} variant="ghost" style={{ marginTop: spacing.sm }} />
      </View>
    </VirraModal>
  );
}

const s = StyleSheet.create({
  body:    { gap: spacing.sm },
  title:   { lineHeight: 28 },
  copy:    { lineHeight: 22 },
  paceRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: spacing.sm, marginVertical: spacing.md },
  arrow:   { marginHorizontal: spacing.xs },
  unit:    { marginLeft: 2 },
  cascade: { textAlign: 'center', letterSpacing: 1 },
});
```

> Before implementing, open `src/components/ui/VirraModal.tsx`, `VirraButton.tsx`, and `AddEventModal.tsx` to confirm exact prop names (`title`/`onClose` on VirraModal; `label`/`onPress`/`variant`/`style` on VirraButton). Adjust the JSX to the real props if they differ — the test asserts behaviour (text + presses), not internal structure.

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest __tests__/components/FitnessUpdateModal.test.tsx`
Expected: PASS — 5 tests.

- [ ] **Step 5: Typecheck & commit**

Run: `npx tsc --noEmit` (ignore Deno errors).
```bash
git add src/components/ui/FitnessUpdateModal.tsx "__tests__/components/FitnessUpdateModal.test.tsx"
git commit -m "feat: FitnessUpdateModal (confirm-and-celebrate, both directions)"
```

---

## Task 6: Fitness Update card

**Files:**
- Create: `mobile/src/components/ui/FitnessUpdateCard.tsx`
- Test: `mobile/__tests__/components/FitnessUpdateCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `mobile/__tests__/components/FitnessUpdateCard.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { FitnessUpdateCard } from '@/components/ui/FitnessUpdateCard';
import type { Verdict } from '@/lib/baselineCalibration';

const faster: Verdict = {
  direction: 'faster', observed: 336, proposed: 348, current: 360,
  evidence: 'x', nRuns: 6, windowDays: 42, wouldChangeUpcoming: true,
};

describe('FitnessUpdateCard', () => {
  it('shows the faster prompt and opens on press', () => {
    const onOpen = jest.fn();
    const { getByText } = render(
      <FitnessUpdateCard verdict={faster} onOpen={onOpen} onDismiss={() => {}} />,
    );
    expect(getByText(/getting faster/i)).toBeTruthy();
    fireEvent.press(getByText(/getting faster/i));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('shows the recalibrate prompt for slower', () => {
    const { getByText } = render(
      <FitnessUpdateCard verdict={{ ...faster, direction: 'slower' }} onOpen={() => {}} onDismiss={() => {}} />,
    );
    expect(getByText(/recalibrate/i)).toBeTruthy();
  });

  it('fires onDismiss from the dismiss control', () => {
    const onDismiss = jest.fn();
    const { getByLabelText } = render(
      <FitnessUpdateCard verdict={faster} onOpen={() => {}} onDismiss={onDismiss} />,
    );
    fireEvent.press(getByLabelText(/dismiss/i));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest __tests__/components/FitnessUpdateCard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `mobile/src/components/ui/FitnessUpdateCard.tsx`:

```tsx
import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { VirraText } from './VirraText';
import { VirraCard } from './VirraCard';
import { colors, spacing } from '@/constants/theme';
import type { Verdict } from '@/lib/baselineCalibration';

interface Props {
  verdict: Verdict;
  onOpen: () => void;
  onDismiss: () => void;
}

export function FitnessUpdateCard({ verdict, onOpen, onDismiss }: Props) {
  const faster = verdict.direction === 'faster';
  const accent = faster ? colors.pulse : colors.dawn;
  const title = faster ? 'You’re getting faster 🔥' : 'Let’s recalibrate';
  const sub = faster
    ? 'Your recent runs say your baseline’s moved. Tap to see.'
    : 'Your last few weeks suggest easing your targets so runs feel right. Tap to review.';

  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel="Open Fitness Update">
      <VirraCard style={[s.card, { borderColor: `${accent}55` }]}>
        <View style={s.row}>
          <SymbolView name="bolt.heart" size={22} tintColor={accent} />
          <View style={s.text}>
            <VirraText variant="mono" size={11} color={accent} style={s.title}>{title.toUpperCase()}</VirraText>
            <VirraText variant="body" size={13} color="rgba(244,237,224,0.75)" style={s.sub}>{sub}</VirraText>
          </View>
          <Pressable onPress={onDismiss} hitSlop={12} accessibilityRole="button" accessibilityLabel="Dismiss Fitness Update">
            <SymbolView name="xmark" size={14} tintColor={colors.muted} />
          </Pressable>
        </View>
      </VirraCard>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card:  { borderWidth: 1.5 },
  row:   { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text:  { flex: 1, gap: 2 },
  title: { letterSpacing: 1.5 },
  sub:   { lineHeight: 18 },
});
```

> `SymbolView` requires a valid SF Symbol name. Confirm `bolt.heart` renders on the simulator; if not, fall back to `figure.run` (faster) and `arrow.down.heart` / `heart` (slower). Project rule: SF Symbols only, never emoji as icons — the 🔥 in the title text is decorative copy, not an icon, which is acceptable, but if you prefer, drop it.

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest __tests__/components/FitnessUpdateCard.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 5: Typecheck & commit**

Run: `npx tsc --noEmit` (ignore Deno errors).
```bash
git add src/components/ui/FitnessUpdateCard.tsx "__tests__/components/FitnessUpdateCard.test.tsx"
git commit -m "feat: FitnessUpdateCard dashboard surface"
```

---

## Task 7: Orchestration hook

**Files:**
- Create: `mobile/src/hooks/useFitnessUpdate.ts`

This hook fetches the data `detectBaselineDrift` needs, runs detection, and exposes `{ verdict, confirm, snooze, refresh }`. It is thin glue; verified by the manual E2E checklist (Task 9) plus the pure tests already covering the logic. First read an existing hook (e.g. `src/hooks/useDateRangeSessions.ts`) to match the house style.

- [ ] **Step 1: Implement the hook**

Create `mobile/src/hooks/useFitnessUpdate.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCycleStore } from '@/store/cycle';
import {
  detectBaselineDrift, type Verdict, type CompletedRunSample,
} from '@/lib/baselineCalibration';
import { applyBaselineUpdate } from '@/lib/applyBaselineUpdate';
import type { RunWorkoutStructure } from '@/lib/workoutStructure';

const DEFAULT_PACE = 360;
const SNOOZE_DAYS = 21;
const WINDOW_DAYS = 42;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function useFitnessUpdate(userId: string | null) {
  const cycleProfile = useCycleStore((s) => s.cycleProfile);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [statedLevel, setStatedLevel] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) { setVerdict(null); return; }
    const today = todayIso();
    const windowStart = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);

    const [profileRes, assessRes, snoozeRes, breaksRes, sessRes, upcomingRes] = await Promise.all([
      supabase.from('user_profiles').select('baseline_pace_seconds_per_km, fitness_level, fitness_check_snoozed_until').eq('id', userId).single(),
      supabase.from('fitness_assessments').select('assessed_on').eq('user_id', userId).order('assessed_on', { ascending: false }).limit(1).maybeSingle(),
      // snooze read folded into profileRes above; kept for clarity if split later
      Promise.resolve(null),
      supabase.from('training_breaks').select('starts_on, ends_on').eq('user_id', userId),
      supabase
        .from('planned_sessions')
        .select('session_label, run_structure, scheduled_date, status, activity_id, activities:activity_id(distance_meters, phase_at_time, run_details(avg_pace_seconds_per_km, elevation_gain_meters))')
        .eq('user_id', userId)
        .eq('modality', 'run')
        .eq('status', 'completed')
        .gte('scheduled_date', windowStart),
      supabase
        .from('planned_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('modality', 'run')
        .eq('status', 'planned')
        .gte('scheduled_date', today),
    ]);

    const baseline = profileRes.data?.baseline_pace_seconds_per_km ?? DEFAULT_PACE;
    setStatedLevel(profileRes.data?.fitness_level ?? null);

    const samples: CompletedRunSample[] = (sessRes.data ?? []).map((row: any) => {
      const act = Array.isArray(row.activities) ? row.activities[0] : row.activities;
      const rd = act?.run_details ? (Array.isArray(act.run_details) ? act.run_details[0] : act.run_details) : null;
      return {
        avg_pace_secs: rd?.avg_pace_seconds_per_km ?? 0,
        distance_m: act?.distance_meters ?? 0,
        elevation_gain_m: rd?.elevation_gain_meters ?? null,
        phase_at_time: act?.phase_at_time ?? null,
        session_label: row.session_label,
        run_structure: row.run_structure as RunWorkoutStructure | null,
        scheduled_date: row.scheduled_date,
      };
    }).filter((s: CompletedRunSample) => s.avg_pace_secs > 0);

    const v = detectBaselineDrift({
      samples,
      currentBaseline: baseline,
      cycleProfile,
      today,
      lastAssessmentDate: assessRes.data?.assessed_on ?? null,
      snoozedUntil: profileRes.data?.fitness_check_snoozed_until ?? null,
      breaks: (breaksRes.data ?? []).map((b: any) => ({ start: b.starts_on, end: b.ends_on })),
      hasUpcomingRuns: (upcomingRes.count ?? 0) > 0,
    });
    setVerdict(v);
  }, [userId, cycleProfile]);

  useEffect(() => { refresh(); }, [refresh]);

  const confirm = useCallback(async () => {
    if (!userId || !verdict) return;
    await applyBaselineUpdate(userId, verdict, todayIso(), statedLevel);
    setVerdict(null);
  }, [userId, verdict, statedLevel]);

  const snooze = useCallback(async () => {
    if (!userId) return;
    const until = new Date(Date.now() + SNOOZE_DAYS * 86_400_000).toISOString();
    await supabase.from('user_profiles').update({ fitness_check_snoozed_until: until }).eq('id', userId);
    setVerdict(null);
  }, [userId]);

  return { verdict, confirm, snooze, refresh };
}
```

> The supabase relational select (`activities:activity_id(...)` with nested `run_details(...)`) must match the actual FK names. Verify against an existing nested select in the codebase (`insightMetrics.ts` does `run_details` nesting — copy its exact join syntax). The `training_breaks` columns are `starts_on` / `ends_on` (per migration `012_training_breaks.sql`) — confirm.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` (ignore Deno errors).
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useFitnessUpdate.ts
git commit -m "feat: useFitnessUpdate hook (fetch + detect + confirm/snooze)"
```

---

## Task 8: Dashboard wiring

**Files:**
- Modify: `mobile/app/(app)/(tabs)/index.tsx`

- [ ] **Step 1: Add imports**

In the import block, add after the existing component imports:
```tsx
import { FitnessUpdateCard } from '@/components/ui/FitnessUpdateCard';
import { FitnessUpdateModal } from '@/components/ui/FitnessUpdateModal';
import { useFitnessUpdate } from '@/hooks/useFitnessUpdate';
```

- [ ] **Step 2: Use the hook + local modal state**

Inside `DashboardScreen`, after the existing state hooks (e.g. near `const { session } = useAuthStore();`), add:
```tsx
  const { verdict, confirm, snooze } = useFitnessUpdate(session?.user.id ?? null);
  const [showFitnessModal, setShowFitnessModal] = useState(false);
```
(If `useState` is already imported — it is — no import change needed.)

- [ ] **Step 3: Render the card in the session fragment**

Inside the `session && (...)` / `cycleInfo && meta` block, immediately above the `<GuidanceCard title="Training" ... />`, add:
```tsx
            {verdict && (
              <FitnessUpdateCard
                verdict={verdict}
                onOpen={() => setShowFitnessModal(true)}
                onDismiss={snooze}
              />
            )}
```

- [ ] **Step 4: Render the modal near the bottom of the screen tree**

Just before the final closing tag of the screen's root (mirroring where other screens mount modals — e.g. after the `</ScrollView>`), add:
```tsx
      <FitnessUpdateModal
        visible={showFitnessModal}
        verdict={verdict}
        onConfirm={async () => { await confirm(); setShowFitnessModal(false); }}
        onSnooze={async () => { await snooze(); setShowFitnessModal(false); }}
      />
```

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit` (ignore Deno errors) — no new errors.
Run: `npx jest` — all suites pass, no new failures.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/(tabs)/index.tsx"
git commit -m "feat: wire Fitness Update card + modal into Dashboard"
```

---

## Task 9: Docs correction + end-to-end verification

**Files:**
- Modify: `CLAUDE.md` (Phase B line), `/Users/pauldickenson/.claude/projects/-Users-pauldickenson-Claude-virra/memory/` (new memory + index line)

- [ ] **Step 1: Correct the project guide**

In `CLAUDE.md`, Phase B, change the line `- ✅ Fitness assessment dynamic logic` to:
```
- ✅ Fitness assessment (onboarding self-report + schema). Dynamic baseline self-correction shipped in Phase F3a (2026-05-28) — the Fitness Update detection + modal were not built in Phase B despite this line's earlier ✅.
```

- [ ] **Step 2: Record a memory**

Write `/Users/pauldickenson/.claude/projects/-Users-pauldickenson-Claude-virra/memory/project_f3a_baseline_selfcorrection.md` with frontmatter (`type: project`) summarising: F3a shipped the baseline self-correction loop (detection in `baselineCalibration.ts`, apply in `applyBaselineUpdate.ts`, surfaces `FitnessUpdateCard`/`FitnessUpdateModal`); the baseline now moves from actuals on confirm; F3b (RPE capture) and F3c (race prediction / personal_bests) remain its deferred siblings. Add a one-line pointer to `MEMORY.md`.

- [ ] **Step 3: Automated gates**

Run: `npx tsc --noEmit` (ignore `supabase/functions/` Deno errors) — clean.
Run: `npx jest` — all suites pass.

- [ ] **Step 4: Manual E2E checklist (simulator + a test account)**

Start with `npx expo start --clear` (new hook + component files were added).
1. **Faster path:** seed (or log) ≥4 completed run sessions, linked to planned sessions, whose actual paces are ~5% faster than their `run_structure` targets, within the last 42 days, none in a break window. Open Dashboard → the pulse Fitness Update card appears → tap → modal shows old→new paces and "refresh your upcoming sessions" → tap Update → confirm an upcoming run's `run_structure` paces are now faster; a completed session is untouched; `user_profiles.baseline_pace_seconds_per_km` changed; a `fitness_assessments` row exists with `direction='faster'`.
2. **Slower path:** seed ≥4 runs ~5% slower → dawn card → "recalibrate" copy → Update eases upcoming targets.
3. **Snooze:** dismiss the card (×) or "Not yet" → card disappears → it stays gone on reload (snooze persisted) until cooldown.
4. **Cooldown:** with a `fitness_assessments` row dated <21 days ago, confirm no card appears even with qualifying runs.
5. **Break suppression:** with a `training_breaks` row ending in the last few days, confirm a downward trend does not surface.

- [ ] **Step 5: Commit docs**

```bash
git add CLAUDE.md
git commit -m "docs: correct Phase B fitness-assessment status; F3a ships the loop"
```
(The memory files live outside the repo working tree's tracked docs — write them with the Write tool; they are not committed.)

---

## Self-Review Notes

- **Spec coverage:** detection signal + qualifying rules + trigger defaults (Tasks 2–3); confirm-and-celebrate card→modal, both directions, tone, soften-when-nothing-changes (Tasks 5–6, 8); cascade write + assessment + history + regenerate-from-baseline + skip-on-throw (Task 4); guardrails — cooldown, snooze, break grace, outlier/consistency, min data (Task 3); schema two columns (Task 1); orchestration + suppression wiring (Task 7); docs correction (Task 9); test plan (every task is TDD where pure). All spec sections map to a task.
- **Type consistency:** `Verdict` (fields `direction/observed/proposed/current/evidence/nRuns/windowDays/wouldChangeUpcoming`) is defined in Task 3 and consumed identically in Tasks 4–8. `CompletedRunSample`, `DetectConfig`, `detectBaselineDrift`, `applyBaselineUpdate(userId, verdict, today, statedLevel)`, `useFitnessUpdate(userId)` signatures are consistent across tasks and tests.
- **Reality checks deferred to implementation (flagged inline):** exact `VirraModal`/`VirraButton` props (Task 5); the supabase relational join syntax for nested `run_details` and the `.eq().eq().gte()` chain (Tasks 4, 7); `training_breaks` column names; SF Symbol name validity (Task 6). Each task tells the implementer to verify against a named existing file rather than guess.
