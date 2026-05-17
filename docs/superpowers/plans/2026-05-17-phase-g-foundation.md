# Phase G Sub-project Ga — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the foundation of Virra's cycle-narrated weight feature: schema, HealthKit ingestion + manual entry, baseline computation, opt-in toggle with first-run explainer, detail chart on the Cycle screen, and a silent-by-default Dashboard glance card.

**Architecture:** A Supabase migration adds `body_weights` and three columns on `user_profiles`. A small set of pure helpers (`weightBand`, `weightBaseline`) sits below the UI. HealthKit ingestion follows the existing foreground-poll-with-AsyncStorage-anchor pattern from `healthKitImport.ts` — no separate observer process. Three new UI surfaces (profile toggle row, dashboard glance card, cycle-detail chart) gate themselves on `track_weight = true`. Calibration is a single flag: `weight_baseline_kg IS NULL`.

**Tech Stack:** Expo + expo-router, React Native + react-native-svg, Zustand, Supabase (Postgres + RLS, MCP for migrations), `react-native-health` for HealthKit, jest-expo + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-05-17-phase-g-foundation-design.md`

---

## File map

**New**

| Path | Responsibility |
|---|---|
| `mobile/src/lib/weightBand.ts` | Expected-band constants per phase + `classifyReading(delta, phase)` |
| `mobile/src/lib/weightBaseline.ts` | `computeBaseline(userId)` — median of follicular readings, writes to user_profiles |
| `mobile/src/lib/healthKitWeight.ts` | Foreground HK weight import with anchor + upsert |
| `mobile/src/components/ui/WeightExplainerModal.tsx` | First-run framing card |
| `mobile/src/components/ui/AddWeightModal.tsx` | Manual entry |
| `mobile/src/components/ui/WeightGlanceCard.tsx` | Dashboard glance |
| `mobile/src/components/ui/CycleWeightChart.tsx` | SVG band + dots chart |

**Edited**

| Path | Why |
|---|---|
| `mobile/src/store/profile.ts` | Add `trackWeight`, `weightBaselineKg`, `weightExplainerDismissedAt` + setters |
| `mobile/app/(app)/(tabs)/profile.tsx` | Add BODY METRICS section with toggle row |
| `mobile/app/(app)/cycle-detail.tsx` | Replace weight scaffold card with `<CycleWeightChart />` |
| `mobile/app/(app)/(tabs)/index.tsx` | Add `<WeightGlanceCard />` between hero row and WeekStrip |
| `mobile/app/(app)/_layout.tsx` | Call `importNewWeightSamples` alongside `importNewWorkouts` |

**Migration**

| Action | Detail |
|---|---|
| Supabase migration via MCP | `add_phase_g_weight_foundation` — schema in §Task 1 |

---

## Task 1: Schema migration

**Files:**
- Migration applied via MCP: `mcp__supabase__apply_migration`

- [ ] **Step 1: List existing tables to confirm shape**

Tool call:
```
mcp__supabase__list_tables(schemas: ["public"])
```
Expected: should NOT list `body_weights`. `user_profiles` exists.

- [ ] **Step 2: Apply migration**

Tool call:
```
mcp__supabase__apply_migration(
  name: "add_phase_g_weight_foundation",
  query: <SQL below>
)
```

SQL:
```sql
alter table user_profiles
  add column track_weight                  boolean not null default false,
  add column weight_baseline_kg            numeric,
  add column weight_baseline_computed_at   timestamptz,
  add column weight_explainer_dismissed_at timestamptz;

create table body_weights (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  recorded_on         date not null,
  weight_kg           numeric not null check (weight_kg > 0 and weight_kg < 500),
  source              text not null check (source in ('healthkit','manual')),
  cycle_day_at_time   integer,
  cycle_phase_at_time text check (cycle_phase_at_time in ('menstrual','follicular','ovulatory','luteal')),
  created_at          timestamptz default now(),
  unique (user_id, recorded_on, source)
);

create index body_weights_user_recorded_idx on body_weights (user_id, recorded_on desc);

alter table body_weights enable row level security;
create policy body_weights_own on body_weights
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 3: Verify**

Tool calls:
```
mcp__supabase__list_tables(schemas: ["public"])
mcp__supabase__execute_sql(query: "select column_name from information_schema.columns where table_name = 'user_profiles' and column_name in ('track_weight','weight_baseline_kg','weight_baseline_computed_at','weight_explainer_dismissed_at') order by column_name;")
```
Expected: `body_weights` in tables; all four new user_profiles columns listed.

- [ ] **Step 4: No git commit needed**

Migrations land in Supabase via MCP — there's no `supabase/migrations/` file to add for this remote-only project. Move on.

---

## Task 2: Weight band helper

**Files:**
- Create: `mobile/src/lib/weightBand.ts`
- Test: `mobile/__tests__/lib/weightBand.test.ts`

- [ ] **Step 1: Write failing tests**

`mobile/__tests__/lib/weightBand.test.ts`:
```ts
import { EXPECTED_BAND, classifyReading } from '@/lib/weightBand';

describe('EXPECTED_BAND', () => {
  it('defines a band for every phase', () => {
    expect(EXPECTED_BAND.menstrual).toEqual({ lower: -0.3, upper: 0.6 });
    expect(EXPECTED_BAND.follicular).toEqual({ lower: -0.2, upper: 0.5 });
    expect(EXPECTED_BAND.ovulatory).toEqual({ lower:  0.0, upper: 1.0 });
    expect(EXPECTED_BAND.luteal).toEqual({ lower:  0.5, upper: 2.0 });
  });
});

describe('classifyReading', () => {
  it('returns in_band when delta is at the lower edge of the phase band', () => {
    expect(classifyReading(0.5, 'luteal')).toBe('in_band');
  });

  it('returns in_band when delta is at the upper edge of the phase band', () => {
    expect(classifyReading(2.0, 'luteal')).toBe('in_band');
  });

  it('returns below when delta is below the lower edge', () => {
    expect(classifyReading(0.4, 'luteal')).toBe('below');
  });

  it('returns above when delta exceeds the upper edge', () => {
    expect(classifyReading(2.1, 'luteal')).toBe('above');
  });

  it('uses the follicular band by default for follicular phase', () => {
    expect(classifyReading(0.3, 'follicular')).toBe('in_band');
    expect(classifyReading(-0.3, 'follicular')).toBe('below');
    expect(classifyReading(0.6, 'follicular')).toBe('above');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npm test -- __tests__/lib/weightBand.test.ts`
Expected: FAIL — `Cannot find module '@/lib/weightBand'`.

- [ ] **Step 3: Implement**

`mobile/src/lib/weightBand.ts`:
```ts
import type { CyclePhase } from '@/lib/cycleEngine';

export interface WeightBand {
  lower: number;
  upper: number;
}

export const EXPECTED_BAND: Record<CyclePhase, WeightBand> = {
  menstrual:  { lower: -0.3, upper: 0.6 },
  follicular: { lower: -0.2, upper: 0.5 },
  ovulatory:  { lower:  0.0, upper: 1.0 },
  luteal:     { lower:  0.5, upper: 2.0 },
};

export type BandPosition = 'below' | 'in_band' | 'above';

export function classifyReading(delta: number, phase: CyclePhase): BandPosition {
  const { lower, upper } = EXPECTED_BAND[phase];
  if (delta < lower) return 'below';
  if (delta > upper) return 'above';
  return 'in_band';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npm test -- __tests__/lib/weightBand.test.ts`
Expected: PASS — 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/weightBand.ts mobile/__tests__/lib/weightBand.test.ts
git commit -m "feat(weight): add expected-band defaults and classifier"
```

---

## Task 3: Baseline computation helper

**Files:**
- Create: `mobile/src/lib/weightBaseline.ts`
- Test: `mobile/__tests__/lib/weightBaseline.test.ts`

Baseline = median of the last ~70 days of follicular-phase readings, requires at least 5 to compute. Writes result to `user_profiles.weight_baseline_kg` and `weight_baseline_computed_at`.

- [ ] **Step 1: Write failing tests**

`mobile/__tests__/lib/weightBaseline.test.ts`:
```ts
import { medianFollicular, computeBaseline } from '@/lib/weightBaseline';

describe('medianFollicular (pure)', () => {
  it('returns null with fewer than 5 follicular readings', () => {
    const rows = [
      { weight_kg: 60, cycle_phase_at_time: 'follicular' as const },
      { weight_kg: 61, cycle_phase_at_time: 'follicular' as const },
      { weight_kg: 60, cycle_phase_at_time: 'follicular' as const },
      { weight_kg: 62, cycle_phase_at_time: 'follicular' as const },
    ];
    expect(medianFollicular(rows)).toBeNull();
  });

  it('returns median of follicular readings, ignoring other phases', () => {
    const rows = [
      { weight_kg: 60.0, cycle_phase_at_time: 'follicular' as const },
      { weight_kg: 60.4, cycle_phase_at_time: 'follicular' as const },
      { weight_kg: 60.8, cycle_phase_at_time: 'follicular' as const }, // median
      { weight_kg: 61.2, cycle_phase_at_time: 'follicular' as const },
      { weight_kg: 61.6, cycle_phase_at_time: 'follicular' as const },
      { weight_kg: 63.0, cycle_phase_at_time: 'luteal'     as const }, // ignored
      { weight_kg: 59.0, cycle_phase_at_time: 'menstrual'  as const }, // ignored
    ];
    expect(medianFollicular(rows)).toBeCloseTo(60.8);
  });

  it('returns null when no follicular readings exist', () => {
    const rows = [
      { weight_kg: 60, cycle_phase_at_time: 'luteal' as const },
      { weight_kg: 61, cycle_phase_at_time: 'luteal' as const },
      { weight_kg: 60, cycle_phase_at_time: 'luteal' as const },
      { weight_kg: 62, cycle_phase_at_time: 'luteal' as const },
      { weight_kg: 60, cycle_phase_at_time: 'luteal' as const },
    ];
    expect(medianFollicular(rows)).toBeNull();
  });

  it('handles even number of follicular readings (average of middle two)', () => {
    const rows = [
      { weight_kg: 60, cycle_phase_at_time: 'follicular' as const },
      { weight_kg: 61, cycle_phase_at_time: 'follicular' as const },
      { weight_kg: 62, cycle_phase_at_time: 'follicular' as const },
      { weight_kg: 63, cycle_phase_at_time: 'follicular' as const },
      { weight_kg: 64, cycle_phase_at_time: 'follicular' as const },
      { weight_kg: 65, cycle_phase_at_time: 'follicular' as const },
    ];
    expect(medianFollicular(rows)).toBeCloseTo(62.5);
  });
});

jest.mock('@/lib/supabase', () => {
  const data: any[] = [];
  const select = jest.fn().mockReturnThis();
  const eq     = jest.fn().mockReturnThis();
  const gte    = jest.fn().mockReturnThis();
  const update = jest.fn().mockResolvedValue({ data: null, error: null });
  const single = jest.fn();
  const builder: any = {
    select, eq, gte, update,
    then: (cb: any) => cb({ data, error: null }),
  };
  const from = jest.fn(() => builder);
  return {
    supabase: { from },
    __from: from,
    __data: data,
    __update: update,
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const supabaseMock = require('@/lib/supabase');

describe('computeBaseline (integration)', () => {
  beforeEach(() => {
    supabaseMock.__data.length = 0;
    supabaseMock.__from.mockClear();
    supabaseMock.__update.mockClear();
  });

  it('writes null when not enough follicular data', async () => {
    supabaseMock.__data.push(
      { weight_kg: 60, cycle_phase_at_time: 'follicular' },
      { weight_kg: 61, cycle_phase_at_time: 'follicular' },
    );
    const baseline = await computeBaseline('user-1');
    expect(baseline).toBeNull();
    expect(supabaseMock.__update).toHaveBeenCalledWith(expect.objectContaining({ weight_baseline_kg: null }));
  });

  it('writes the median when enough follicular data', async () => {
    supabaseMock.__data.push(
      { weight_kg: 60.0, cycle_phase_at_time: 'follicular' },
      { weight_kg: 60.4, cycle_phase_at_time: 'follicular' },
      { weight_kg: 60.8, cycle_phase_at_time: 'follicular' },
      { weight_kg: 61.2, cycle_phase_at_time: 'follicular' },
      { weight_kg: 61.6, cycle_phase_at_time: 'follicular' },
    );
    const baseline = await computeBaseline('user-1');
    expect(baseline).toBeCloseTo(60.8);
    expect(supabaseMock.__update).toHaveBeenCalledWith(expect.objectContaining({
      weight_baseline_kg: 60.8,
    }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npm test -- __tests__/lib/weightBaseline.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`mobile/src/lib/weightBaseline.ts`:
```ts
import { supabase } from '@/lib/supabase';

interface BaselineRow {
  weight_kg:           number;
  cycle_phase_at_time: 'menstrual' | 'follicular' | 'ovulatory' | 'luteal' | null;
}

export function medianFollicular(rows: BaselineRow[]): number | null {
  const follicular = rows
    .filter((r) => r.cycle_phase_at_time === 'follicular')
    .map((r) => Number(r.weight_kg))
    .sort((a, b) => a - b);
  if (follicular.length < 5) return null;
  const n   = follicular.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 0
    ? (follicular[mid - 1] + follicular[mid]) / 2
    : follicular[mid];
}

const WINDOW_DAYS = 70;

export async function computeBaseline(userId: string): Promise<number | null> {
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 86400000).toLocaleDateString('en-CA');

  const { data, error } = await supabase
    .from('body_weights')
    .select('weight_kg, cycle_phase_at_time')
    .eq('user_id', userId)
    .gte('recorded_on', cutoff);

  if (error) throw new Error(error.message);

  const baseline = medianFollicular((data ?? []) as BaselineRow[]);

  await supabase
    .from('user_profiles')
    .update({
      weight_baseline_kg:          baseline,
      weight_baseline_computed_at: new Date().toISOString(),
    })
    .eq('id', userId);

  return baseline;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npm test -- __tests__/lib/weightBaseline.test.ts`
Expected: PASS — 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/weightBaseline.ts mobile/__tests__/lib/weightBaseline.test.ts
git commit -m "feat(weight): add baseline computation (median of follicular readings)"
```

---

## Task 4: Profile store fields

**Files:**
- Modify: `mobile/src/store/profile.ts`

Add three fields and extend `load` / `save`. Existing `save` signature uses a `patch` object — we extend that.

- [ ] **Step 1: Update the store**

In `mobile/src/store/profile.ts`, find the `interface ProfileState` block and the existing `useProfileStore` body. Replace the file with:

```ts
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

export interface ProfilePatch {
  firstName?:                   string;
  lastName?:                    string;
  avatarUrl?:                   string | null;
  stepsTarget?:                 number;
  trackWeight?:                 boolean;
  weightBaselineKg?:            number | null;
  weightExplainerDismissedAt?:  string | null;
}

interface ProfileState {
  firstName:                       string;
  lastName:                        string;
  avatarUrl:                       string | null;
  stepsTarget:                     number;
  haikuDisclosureAcknowledgedAt:   string | null;
  trackWeight:                     boolean;
  weightBaselineKg:                number | null;
  weightExplainerDismissedAt:      string | null;
  isLoaded:                        boolean;
  load:                            (userId: string) => Promise<void>;
  save:                            (userId: string, patch: ProfilePatch) => Promise<void>;
  setLocal:                        (patch: ProfilePatch) => void;
  acknowledgeHaikuDisclosure:      (userId: string) => Promise<void>;
}

export const useProfileStore = create<ProfileState>((set) => ({
  firstName:                     '',
  lastName:                      '',
  avatarUrl:                     null,
  stepsTarget:                   8000,
  haikuDisclosureAcknowledgedAt: null,
  trackWeight:                   false,
  weightBaselineKg:              null,
  weightExplainerDismissedAt:    null,
  isLoaded:                      false,

  load: async (userId) => {
    const { data } = await supabase
      .from('user_profiles')
      .select('first_name, last_name, avatar_url, steps_target, haiku_disclosure_acknowledged_at, track_weight, weight_baseline_kg, weight_explainer_dismissed_at')
      .eq('id', userId)
      .maybeSingle();
    if (data) {
      set({
        firstName:                     data.first_name   ?? '',
        lastName:                      data.last_name    ?? '',
        avatarUrl:                     data.avatar_url   ?? null,
        stepsTarget:                   data.steps_target ?? 8000,
        haikuDisclosureAcknowledgedAt: data.haiku_disclosure_acknowledged_at ?? null,
        trackWeight:                   data.track_weight ?? false,
        weightBaselineKg:              data.weight_baseline_kg ?? null,
        weightExplainerDismissedAt:    data.weight_explainer_dismissed_at ?? null,
        isLoaded:                      true,
      });
    } else {
      set({ isLoaded: true });
    }
  },

  save: async (userId, patch) => {
    const update: Record<string, string | number | boolean | null> = {};
    if (patch.firstName                  !== undefined) update.first_name                    = patch.firstName;
    if (patch.lastName                   !== undefined) update.last_name                     = patch.lastName;
    if (patch.avatarUrl                  !== undefined) update.avatar_url                    = patch.avatarUrl;
    if (patch.stepsTarget                !== undefined) update.steps_target                  = patch.stepsTarget;
    if (patch.trackWeight                !== undefined) update.track_weight                  = patch.trackWeight;
    if (patch.weightBaselineKg           !== undefined) update.weight_baseline_kg            = patch.weightBaselineKg;
    if (patch.weightExplainerDismissedAt !== undefined) update.weight_explainer_dismissed_at = patch.weightExplainerDismissedAt;

    const { error } = await supabase
      .from('user_profiles')
      .update(update)
      .eq('id', userId);

    if (error) throw new Error(error.message);

    set((s) => ({
      firstName:                  patch.firstName                  ?? s.firstName,
      lastName:                   patch.lastName                   ?? s.lastName,
      avatarUrl:                  patch.avatarUrl                  !== undefined ? patch.avatarUrl                  : s.avatarUrl,
      stepsTarget:                patch.stepsTarget                ?? s.stepsTarget,
      trackWeight:                patch.trackWeight                ?? s.trackWeight,
      weightBaselineKg:           patch.weightBaselineKg           !== undefined ? patch.weightBaselineKg           : s.weightBaselineKg,
      weightExplainerDismissedAt: patch.weightExplainerDismissedAt !== undefined ? patch.weightExplainerDismissedAt : s.weightExplainerDismissedAt,
    }));
  },

  setLocal: (patch) => set((s) => ({
    firstName:                  patch.firstName                  ?? s.firstName,
    lastName:                   patch.lastName                   ?? s.lastName,
    avatarUrl:                  patch.avatarUrl                  !== undefined ? patch.avatarUrl                  : s.avatarUrl,
    stepsTarget:                patch.stepsTarget                ?? s.stepsTarget,
    trackWeight:                patch.trackWeight                ?? s.trackWeight,
    weightBaselineKg:           patch.weightBaselineKg           !== undefined ? patch.weightBaselineKg           : s.weightBaselineKg,
    weightExplainerDismissedAt: patch.weightExplainerDismissedAt !== undefined ? patch.weightExplainerDismissedAt : s.weightExplainerDismissedAt,
  })),

  acknowledgeHaikuDisclosure: async (userId) => {
    const now = new Date().toISOString();
    set({ haikuDisclosureAcknowledgedAt: now });
    const { error } = await supabase
      .from('user_profiles')
      .update({ haiku_disclosure_acknowledged_at: now })
      .eq('id', userId);
    if (error) {
      console.warn('[profile] haiku disclosure persist failed:', error.message);
    }
  },
}));
```

Note: the file already contained a final `acknowledgeHaikuDisclosure` body that ended with a Read offset (lines beyond what we saw). The block above is the full canonical file content for the new shape. Verify by reading the existing file once before pasting.

- [ ] **Step 2: Run the test suite to confirm no regressions**

Run: `cd mobile && npm test`
Expected: PASS — all existing tests still green.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/store/profile.ts
git commit -m "feat(weight): extend profile store with track_weight + baseline fields"
```

---

## Task 5: HealthKit weight import helper

**Files:**
- Create: `mobile/src/lib/healthKitWeight.ts`
- Test: `mobile/__tests__/lib/healthKitWeight.test.ts`

We follow the pattern in `healthKitImport.ts`: foreground poll using `getWeightSamples` with an AsyncStorage anchor, upsert into `body_weights`, attach cycle phase at write time. Pure helper functions are unit-tested; the native HK call wrapper is exercised manually.

- [ ] **Step 1: Write failing tests for the pure pieces**

`mobile/__tests__/lib/healthKitWeight.test.ts`:
```ts
import { gramsToKg, sampleToRow } from '@/lib/healthKitWeight';

describe('gramsToKg', () => {
  it('converts grams to kilograms with one decimal precision', () => {
    expect(gramsToKg(60000)).toBe(60.0);
    expect(gramsToKg(60450)).toBe(60.5);
    expect(gramsToKg(60444)).toBe(60.4);
  });

  it('returns null for non-positive values', () => {
    expect(gramsToKg(0)).toBeNull();
    expect(gramsToKg(-1)).toBeNull();
  });
});

describe('sampleToRow', () => {
  const periodStart = new Date('2025-01-01');
  const sample = {
    value:     60500,   // grams
    startDate: '2025-01-08T08:00:00.000Z',
    endDate:   '2025-01-08T08:00:00.000Z',
  };

  it('builds an upsert row with cycle metadata for a follicular date', () => {
    const row = sampleToRow('user-1', sample, periodStart, 28);
    expect(row).toEqual({
      user_id:             'user-1',
      recorded_on:         '2025-01-08',
      weight_kg:           60.5,
      source:              'healthkit',
      cycle_day_at_time:   8,
      cycle_phase_at_time: 'follicular',
    });
  });

  it('returns null when value is zero or negative', () => {
    expect(sampleToRow('u', { ...sample, value: 0 }, periodStart, 28)).toBeNull();
  });

  it('omits cycle metadata when periodStart is null', () => {
    const row = sampleToRow('user-1', sample, null, 28);
    expect(row).toEqual({
      user_id:             'user-1',
      recorded_on:         '2025-01-08',
      weight_kg:           60.5,
      source:              'healthkit',
      cycle_day_at_time:   null,
      cycle_phase_at_time: null,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npm test -- __tests__/lib/healthKitWeight.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`mobile/src/lib/healthKitWeight.ts`:
```ts
import { NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { getCycleInfo } from '@/lib/cycleEngine';
import { computeBaseline } from '@/lib/weightBaseline';

const ANCHOR_KEY = 'hk_weight_anchor_v1';

export function gramsToKg(grams: number): number | null {
  if (grams <= 0) return null;
  return Math.round(grams / 100) / 10;
}

export interface RawWeightSample {
  value:     number;  // grams
  startDate: string;
  endDate:   string;
}

export interface BodyWeightRow {
  user_id:             string;
  recorded_on:         string;
  weight_kg:           number;
  source:              'healthkit' | 'manual';
  cycle_day_at_time:   number | null;
  cycle_phase_at_time: 'menstrual' | 'follicular' | 'ovulatory' | 'luteal' | null;
}

export function sampleToRow(
  userId:      string,
  sample:      RawWeightSample,
  periodStart: Date | null,
  cycleLength: number,
): BodyWeightRow | null {
  const kg = gramsToKg(sample.value);
  if (kg === null) return null;
  const date       = new Date(sample.startDate);
  const recordedOn = date.toLocaleDateString('en-CA');

  let cycleDay:   number | null = null;
  let cyclePhase: BodyWeightRow['cycle_phase_at_time'] = null;
  if (periodStart) {
    const info = getCycleInfo(periodStart, cycleLength, date);
    cycleDay   = info.dayOfCycle;
    cyclePhase = info.phase;
  }

  return {
    user_id:             userId,
    recorded_on:         recordedOn,
    weight_kg:           kg,
    source:              'healthkit',
    cycle_day_at_time:   cycleDay,
    cycle_phase_at_time: cyclePhase,
  };
}

interface ImportContext {
  userId:      string;
  periodStart: Date | null;
  cycleLength: number;
}

export async function importNewWeightSamples(ctx: ImportContext): Promise<number> {
  const HK = NativeModules.AppleHealthKit;
  if (!HK?.getWeightSamples) return 0;

  let Constants: any;
  try {
    Constants = require('react-native-health').Constants;
  } catch {
    return 0;
  }

  const anchorISO = await AsyncStorage.getItem(ANCHOR_KEY);
  const startDate = anchorISO ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

  const samples: RawWeightSample[] = await new Promise((resolve) => {
    HK.getWeightSamples(
      { unit: Constants.Units.gram, startDate, ascending: true },
      (err: string, results: RawWeightSample[]) => {
        if (err || !Array.isArray(results)) return resolve([]);
        resolve(results);
      },
    );
  });

  if (!samples.length) return 0;

  const rows = samples
    .map((s) => sampleToRow(ctx.userId, s, ctx.periodStart, ctx.cycleLength))
    .filter((r): r is BodyWeightRow => r !== null);

  if (!rows.length) return 0;

  const { error } = await supabase
    .from('body_weights')
    .upsert(rows, { onConflict: 'user_id,recorded_on,source', ignoreDuplicates: false });

  if (error) {
    console.warn('[healthKitWeight] upsert failed:', error.message);
    return 0;
  }

  const newest = samples[samples.length - 1].endDate;
  await AsyncStorage.setItem(ANCHOR_KEY, newest);

  await computeBaseline(ctx.userId).catch((e) => {
    console.warn('[healthKitWeight] baseline recompute failed:', e.message);
  });

  return rows.length;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npm test -- __tests__/lib/healthKitWeight.test.ts`
Expected: PASS — 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/healthKitWeight.ts mobile/__tests__/lib/healthKitWeight.test.ts
git commit -m "feat(weight): HealthKit weight sample import with anchor + cycle tagging"
```

---

## Task 6: WeightExplainerModal

**Files:**
- Create: `mobile/src/components/ui/WeightExplainerModal.tsx`
- Test: `mobile/__tests__/components/WeightExplainerModal.test.tsx`

A one-shot pulse-bordered modal shown when the user first toggles weight tracking on.

- [ ] **Step 1: Write failing test**

`mobile/__tests__/components/WeightExplainerModal.test.tsx`:
```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { WeightExplainerModal } from '@/components/ui/WeightExplainerModal';

describe('WeightExplainerModal', () => {
  it('does not render when visible is false', () => {
    const { queryByText } = render(
      <WeightExplainerModal visible={false} onDismiss={() => {}} />
    );
    expect(queryByText(/THIS ISN'T A WEIGHT LOSS FEATURE/i)).toBeNull();
  });

  it('renders the framing copy when visible is true', () => {
    const { getByText } = render(
      <WeightExplainerModal visible={true} onDismiss={() => {}} />
    );
    expect(getByText(/THIS ISN'T A WEIGHT LOSS FEATURE/i)).toBeTruthy();
    expect(getByText(/Got it/i)).toBeTruthy();
  });

  it('calls onDismiss when the Got it button is pressed', () => {
    const onDismiss = jest.fn();
    const { getByText } = render(
      <WeightExplainerModal visible={true} onDismiss={onDismiss} />
    );
    fireEvent.press(getByText(/Got it/i));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npm test -- __tests__/components/WeightExplainerModal.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`mobile/src/components/ui/WeightExplainerModal.tsx`:
```tsx
import React from 'react';
import { Modal, View, StyleSheet, Pressable } from 'react-native';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from './VirraText';

interface Props {
  visible:   boolean;
  onDismiss: () => void;
}

export function WeightExplainerModal({ visible, onDismiss }: Props) {
  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <VirraText variant="mono" size={10} color={colors.pulse} style={styles.kicker}>
            THIS ISN'T A WEIGHT LOSS FEATURE
          </VirraText>
          <VirraText variant="serif" size={18} color={colors.breath} style={styles.editorial}>
            Your weight rises and falls with your cycle. We track the shape of that,
            so you can see what's water, what's normal, and when something is actually
            worth noticing.
          </VirraText>
          <VirraText variant="body" size={13} color={colors.muted} style={styles.body}>
            No goal weight. No streaks. No daily prompt.{'\n'}
            Calibrating — we need ~3 cycles of readings before insights are reliable.
          </VirraText>
          <Pressable style={styles.button} onPress={onDismiss} accessibilityRole="button">
            <VirraText variant="mono" size={12} color={colors.mile}>Got it</VirraText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card:     { backgroundColor: colors.mist, borderRadius: radius.md, borderWidth: 1, borderColor: colors.pulse, padding: spacing.lg, gap: spacing.sm, width: '100%', maxWidth: 380 },
  kicker:   { letterSpacing: 1.5 },
  editorial:{ fontStyle: 'italic' },
  body:     { lineHeight: 20 },
  button:   { marginTop: spacing.md, backgroundColor: colors.pulse, paddingVertical: spacing.md, borderRadius: radius.sm, alignItems: 'center' },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npm test -- __tests__/components/WeightExplainerModal.test.tsx`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/ui/WeightExplainerModal.tsx mobile/__tests__/components/WeightExplainerModal.test.tsx
git commit -m "feat(weight): add first-run explainer modal"
```

---

## Task 7: AddWeightModal

**Files:**
- Create: `mobile/src/components/ui/AddWeightModal.tsx`
- Test: `mobile/__tests__/components/AddWeightModal.test.tsx`

Numeric input, defaults to today, writes a `body_weights` row with `source = 'manual'`, then triggers baseline recompute.

- [ ] **Step 1: Write failing test**

`mobile/__tests__/components/AddWeightModal.test.tsx`:
```tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { AddWeightModal } from '@/components/ui/AddWeightModal';

jest.mock('@/lib/supabase', () => {
  const insert = jest.fn().mockResolvedValue({ data: null, error: null });
  return {
    supabase: { from: jest.fn(() => ({ insert })) },
    __insert: insert,
  };
});

jest.mock('@/lib/weightBaseline', () => ({
  computeBaseline: jest.fn().mockResolvedValue(60.5),
}));

jest.mock('@/store/cycle', () => ({
  useCycleStore: { getState: () => ({ periodStart: new Date('2025-01-01'), cycleLength: 28 }) },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const supabaseMock = require('@/lib/supabase');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const baselineMock = require('@/lib/weightBaseline');

describe('AddWeightModal', () => {
  beforeEach(() => {
    supabaseMock.__insert.mockClear();
    baselineMock.computeBaseline.mockClear();
  });

  it('renders nothing when visible is false', () => {
    const { queryByText } = render(
      <AddWeightModal visible={false} userId="u" onClose={() => {}} />
    );
    expect(queryByText(/Save/i)).toBeNull();
  });

  it('inserts a row and calls computeBaseline on Save', async () => {
    const onClose = jest.fn();
    const { getByPlaceholderText, getByText } = render(
      <AddWeightModal visible={true} userId="u" onClose={onClose} />
    );
    fireEvent.changeText(getByPlaceholderText('kg'), '60.5');
    fireEvent.press(getByText(/Save/i));
    await waitFor(() => expect(supabaseMock.__insert).toHaveBeenCalled());
    const [[row]] = supabaseMock.__insert.mock.calls;
    expect(row.user_id).toBe('u');
    expect(row.weight_kg).toBeCloseTo(60.5);
    expect(row.source).toBe('manual');
    expect(baselineMock.computeBaseline).toHaveBeenCalledWith('u');
    expect(onClose).toHaveBeenCalled();
  });

  it('disables Save when the input is invalid', () => {
    const { getByPlaceholderText, getByText } = render(
      <AddWeightModal visible={true} userId="u" onClose={() => {}} />
    );
    fireEvent.changeText(getByPlaceholderText('kg'), '');
    fireEvent.press(getByText(/Save/i));
    expect(supabaseMock.__insert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npm test -- __tests__/components/AddWeightModal.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`mobile/src/components/ui/AddWeightModal.tsx`:
```tsx
import React, { useState } from 'react';
import { Modal, View, TextInput, StyleSheet, Pressable, Alert } from 'react-native';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from './VirraText';
import { supabase } from '@/lib/supabase';
import { useCycleStore } from '@/store/cycle';
import { getCycleInfo, type CyclePhase } from '@/lib/cycleEngine';
import { computeBaseline } from '@/lib/weightBaseline';

interface Props {
  visible: boolean;
  userId:  string;
  onClose: () => void;
}

export function AddWeightModal({ visible, userId, onClose }: Props) {
  const [value,  setValue]  = useState('');
  const [saving, setSaving] = useState(false);

  function isValid(): boolean {
    const n = parseFloat(value);
    return Number.isFinite(n) && n > 0 && n < 500;
  }

  async function handleSave() {
    if (!isValid() || saving) return;
    setSaving(true);
    const kg            = Math.round(parseFloat(value) * 10) / 10;
    const today         = new Date();
    const recordedOn    = today.toLocaleDateString('en-CA');
    const { periodStart, cycleLength } = useCycleStore.getState();

    let cycleDay:   number | null = null;
    let cyclePhase: CyclePhase | null = null;
    if (periodStart) {
      const info = getCycleInfo(periodStart, cycleLength, today);
      cycleDay   = info.dayOfCycle;
      cyclePhase = info.phase;
    }

    const { error } = await supabase.from('body_weights').insert({
      user_id:             userId,
      recorded_on:         recordedOn,
      weight_kg:           kg,
      source:              'manual',
      cycle_day_at_time:   cycleDay,
      cycle_phase_at_time: cyclePhase,
    });

    setSaving(false);

    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }

    await computeBaseline(userId).catch(() => {});
    setValue('');
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <VirraText variant="mono" size={10} color={colors.muted} style={styles.kicker}>
            ADD WEIGHT
          </VirraText>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              placeholder="kg"
              placeholderTextColor={colors.muted}
              value={value}
              onChangeText={setValue}
              autoFocus
            />
            <VirraText variant="mono" size={14} color={colors.muted}>KG</VirraText>
          </View>
          <View style={styles.actionRow}>
            <Pressable style={styles.cancel} onPress={onClose} accessibilityRole="button">
              <VirraText variant="mono" size={12} color={colors.breath}>Cancel</VirraText>
            </Pressable>
            <Pressable
              style={[styles.save, !isValid() && styles.disabled]}
              onPress={handleSave}
              accessibilityRole="button"
            >
              <VirraText variant="mono" size={12} color={colors.mile}>Save</VirraText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  card:     { backgroundColor: colors.mist, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  kicker:   { letterSpacing: 1.5 },
  inputRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.sm },
  input:    { flex: 1, color: colors.breath, fontFamily: 'BigShouldersDisplay_900Black', fontSize: 36 },
  actionRow:{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, height: 52 },
  cancel:   { flex: 1, backgroundColor: colors.mile, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  save:     { flex: 2, backgroundColor: colors.pulse, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npm test -- __tests__/components/AddWeightModal.test.tsx`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/ui/AddWeightModal.tsx mobile/__tests__/components/AddWeightModal.test.tsx
git commit -m "feat(weight): add manual entry modal"
```

---

## Task 8: WeightGlanceCard

**Files:**
- Create: `mobile/src/components/ui/WeightGlanceCard.tsx`
- Test: `mobile/__tests__/components/WeightGlanceCard.test.tsx`

Renders nothing when `track_weight` is false. Renders calibrating when `weightBaselineKg` is null. Otherwise renders the band + delta + copy.

- [ ] **Step 1: Write failing test**

`mobile/__tests__/components/WeightGlanceCard.test.tsx`:
```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { WeightGlanceCard } from '@/components/ui/WeightGlanceCard';

jest.mock('@/store/profile', () => ({
  useProfileStore: (selector: any) => selector({
    trackWeight:      true,
    weightBaselineKg: 60.0,
  }),
}));

jest.mock('@/store/cycle', () => ({
  useCycleStore: (selector: any) => selector({
    cycleInfo: { phase: 'luteal', dayOfCycle: 24, daysUntilNextPeriod: 5, cycleLength: 28 },
  }),
}));

describe('WeightGlanceCard', () => {
  it('returns null when no latest reading is provided', () => {
    const { toJSON } = render(<WeightGlanceCard latestKg={null} />);
    expect(toJSON()).toBeNull();
  });

  it('renders the in-band state with delta and phase pill', () => {
    const { getByText } = render(<WeightGlanceCard latestKg={61.5} />);
    expect(getByText(/\+1.5/)).toBeTruthy();
    expect(getByText(/LUTEAL/i)).toBeTruthy();
  });

  it('renders an above-band state when the delta exceeds the band upper', () => {
    const { getByText } = render(<WeightGlanceCard latestKg={62.5} />);
    expect(getByText(/ABOVE BAND/i)).toBeTruthy();
  });
});
```

`mobile/__tests__/components/WeightGlanceCard.calibrating.test.tsx`:
```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { WeightGlanceCard } from '@/components/ui/WeightGlanceCard';

jest.mock('@/store/profile', () => ({
  useProfileStore: (selector: any) => selector({
    trackWeight:      true,
    weightBaselineKg: null,
  }),
}));

jest.mock('@/store/cycle', () => ({
  useCycleStore: (selector: any) => selector({
    cycleInfo: { phase: 'follicular', dayOfCycle: 9, daysUntilNextPeriod: 19, cycleLength: 28 },
  }),
}));

describe('WeightGlanceCard (calibrating)', () => {
  it('renders the calibrating state when baseline is null', () => {
    const { getByText } = render(<WeightGlanceCard latestKg={60.0} />);
    expect(getByText(/CALIBRATING/i)).toBeTruthy();
  });
});
```

`mobile/__tests__/components/WeightGlanceCard.off.test.tsx`:
```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { WeightGlanceCard } from '@/components/ui/WeightGlanceCard';

jest.mock('@/store/profile', () => ({
  useProfileStore: (selector: any) => selector({
    trackWeight:      false,
    weightBaselineKg: null,
  }),
}));

jest.mock('@/store/cycle', () => ({
  useCycleStore: (selector: any) => selector({ cycleInfo: null }),
}));

describe('WeightGlanceCard (off)', () => {
  it('returns null when trackWeight is false', () => {
    const { toJSON } = render(<WeightGlanceCard latestKg={60} />);
    expect(toJSON()).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mobile && npm test -- __tests__/components/WeightGlanceCard`
Expected: FAIL — module not found across all three.

- [ ] **Step 3: Implement**

`mobile/src/components/ui/WeightGlanceCard.tsx`:
```tsx
import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from './VirraText';
import { VirraCard } from './VirraCard';
import { useProfileStore } from '@/store/profile';
import { useCycleStore } from '@/store/cycle';
import { EXPECTED_BAND, classifyReading, type BandPosition } from '@/lib/weightBand';
import type { CyclePhase } from '@/lib/cycleEngine';

interface Props {
  latestKg: number | null;
}

const IN_BAND: Record<CyclePhase, string> = {
  menstrual:  'Right where your body wants to be today.',
  follicular: 'This is your body\'s natural floor — the number to anchor to.',
  ovulatory:  'A small lift around ovulation is normal hormonal water.',
  luteal:     'Right where your body wants to be today. This is water, not fat. It\'ll resolve in 5–7 days.',
};

const ABOVE_BAND: Record<CyclePhase, string> = {
  menstrual:  'A touch higher than usual for a bleed day. Worth a glance, not an alarm.',
  follicular: 'Slightly above your follicular baseline. Salt, alcohol, or a hard session can do this.',
  ovulatory:  'Ovulatory days can run high on water retention. Resolves in a few days.',
  luteal:     'A touch above the typical luteal peak. Watch what happens after your period.',
};

const BELOW_BAND: Record<CyclePhase, string> = {
  menstrual:  'Below the usual bleed-day range. If training\'s been heavy, check fuelling.',
  follicular: 'Below your follicular floor. If this persists, take a look at your fuelling.',
  ovulatory:  'Below the typical ovulatory range. Check intake against training load.',
  luteal:     'Below the typical luteal range. If training is high, you may need more carbs.',
};

const PHASE_LABEL: Record<CyclePhase, string> = {
  menstrual: 'MENSTRUAL', follicular: 'FOLLICULAR', ovulatory: 'OVULATORY', luteal: 'LUTEAL',
};

function copyFor(position: BandPosition, phase: CyclePhase): string {
  if (position === 'above') return ABOVE_BAND[phase];
  if (position === 'below') return BELOW_BAND[phase];
  return IN_BAND[phase];
}

function pillColor(position: BandPosition): string {
  return position === 'in_band' ? colors.pulse : colors.dawn;
}

function formatDelta(d: number): string {
  const sign = d >= 0 ? '+' : '−';
  return `${sign}${Math.abs(d).toFixed(1)} kg`;
}

function MiniBand({ phase, delta }: { phase: CyclePhase; delta: number }) {
  const min = -1, max = 3;
  const pct = (v: number) => Math.max(0, Math.min(1, (v - min) / (max - min)));
  const { lower, upper } = EXPECTED_BAND[phase];
  return (
    <View style={mini.track}>
      <View style={[mini.band, { left: `${pct(lower) * 100}%`, right: `${(1 - pct(upper)) * 100}%` }]} />
      <View style={[mini.marker, { left: `${pct(delta) * 100}%` }]} />
    </View>
  );
}

const mini = StyleSheet.create({
  track:  { height: 6, backgroundColor: colors.border, borderRadius: radius.full, position: 'relative', overflow: 'visible' },
  band:   { position: 'absolute', top: 0, height: 6, backgroundColor: colors.pulse, opacity: 0.35, borderRadius: radius.full },
  marker: { position: 'absolute', top: -3, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.breath, marginLeft: -6 },
});

export function WeightGlanceCard({ latestKg }: Props) {
  const trackWeight = useProfileStore((s) => s.trackWeight);
  const baseline    = useProfileStore((s) => s.weightBaselineKg);
  const cycleInfo   = useCycleStore((s) => s.cycleInfo);

  if (!trackWeight) return null;
  if (latestKg === null) return null;

  const phase = cycleInfo?.phase ?? 'follicular';

  if (baseline === null) {
    return (
      <Pressable onPress={() => router.push('/(app)/cycle-detail' as any)}>
        <VirraCard>
          <View style={styles.row}>
            <VirraText variant="mono" size={10} color={colors.muted} style={styles.kicker}>
              WEIGHT · {PHASE_LABEL[phase]}
            </VirraText>
            <View style={[styles.pill, { borderColor: colors.muted }]}>
              <VirraText variant="mono" size={10} color={colors.muted}>CALIBRATING</VirraText>
            </View>
          </View>
          <VirraText variant="display" size={28} color={colors.breath}>{latestKg.toFixed(1)} kg</VirraText>
          <VirraText variant="body" size={13} color={colors.muted}>
            We need a few more cycles before the band becomes reliable.
          </VirraText>
        </VirraCard>
      </Pressable>
    );
  }

  const delta    = Math.round((latestKg - baseline) * 10) / 10;
  const position = classifyReading(delta, phase);
  const statusLabel = position === 'in_band' ? 'IN BAND' : position === 'above' ? 'ABOVE BAND' : 'BELOW BAND';

  return (
    <Pressable onPress={() => router.push('/(app)/cycle-detail' as any)}>
      <VirraCard>
        <View style={styles.row}>
          <VirraText variant="mono" size={10} color={colors.muted} style={styles.kicker}>
            WEIGHT · {PHASE_LABEL[phase]}
          </VirraText>
          <View style={[styles.pill, { borderColor: pillColor(position) }]}>
            <VirraText variant="mono" size={10} color={pillColor(position)}>{statusLabel}</VirraText>
          </View>
        </View>
        <VirraText variant="display" size={32} color={colors.pulse}>{formatDelta(delta)}</VirraText>
        <VirraText variant="mono" size={10} color={colors.muted} style={{ letterSpacing: 1.5 }}>
          FROM YOUR FOLLICULAR BASELINE
        </VirraText>
        <View style={styles.bandWrap}>
          <MiniBand phase={phase} delta={delta} />
          <View style={styles.bandAxis}>
            <VirraText variant="mono" size={9} color={colors.muted}>-1 kg</VirraText>
            <VirraText variant="mono" size={9} color={colors.muted}>+3 kg</VirraText>
          </View>
        </View>
        <VirraText variant="body" size={14} color={colors.breath}>{copyFor(position, phase)}</VirraText>
      </VirraCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker:    { letterSpacing: 1.5 },
  pill:      { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full, borderWidth: 1 },
  bandWrap:  { marginTop: spacing.xs, gap: 4 },
  bandAxis:  { flexDirection: 'row', justifyContent: 'space-between' },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mobile && npm test -- __tests__/components/WeightGlanceCard`
Expected: PASS — 5 tests across the three files.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/ui/WeightGlanceCard.tsx mobile/__tests__/components/WeightGlanceCard*.test.tsx
git commit -m "feat(weight): add dashboard glance card with band states"
```

---

## Task 9: CycleWeightChart

**Files:**
- Create: `mobile/src/components/ui/CycleWeightChart.tsx`
- Test: `mobile/__tests__/components/CycleWeightChart.test.tsx`

SVG chart that renders the expected band, three cycles of dots, today's marker, and the legend. Calibrating state hides the band but renders dots.

The chart is read-only — props in, SVG out. Data fetching lives in `cycle-detail.tsx` and is passed down so the component is testable.

- [ ] **Step 1: Write failing test**

`mobile/__tests__/components/CycleWeightChart.test.tsx`:
```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { CycleWeightChart, type WeightReading } from '@/components/ui/CycleWeightChart';

const periodStart = new Date('2025-01-01');

function reading(day: number, weightKg: number, cycleOffset: 0 | -1 | -2 = 0): WeightReading {
  const d = new Date(periodStart);
  d.setDate(periodStart.getDate() + day - 1 + cycleOffset * 28);
  return { recorded_on: d.toLocaleDateString('en-CA'), weight_kg: weightKg };
}

describe('CycleWeightChart', () => {
  it('renders the legend regardless of calibration state', () => {
    const { getByText } = render(
      <CycleWeightChart
        baselineKg={60}
        readings={[reading(5, 60), reading(8, 60.1)]}
        periodStart={periodStart}
        cycleLength={28}
        today={new Date(periodStart)}
      />
    );
    expect(getByText(/EXPECTED BAND/i)).toBeTruthy();
    expect(getByText(/CURRENT CYCLE/i)).toBeTruthy();
    expect(getByText(/PRIOR CYCLES/i)).toBeTruthy();
  });

  it('renders the calibrating ribbon when baselineKg is null', () => {
    const { getByText } = render(
      <CycleWeightChart
        baselineKg={null}
        readings={[reading(5, 60)]}
        periodStart={periodStart}
        cycleLength={28}
        today={new Date(periodStart)}
      />
    );
    expect(getByText(/CALIBRATING/i)).toBeTruthy();
  });

  it('does not render the calibrating ribbon when baselineKg is set', () => {
    const { queryByText } = render(
      <CycleWeightChart
        baselineKg={60}
        readings={[reading(5, 60)]}
        periodStart={periodStart}
        cycleLength={28}
        today={new Date(periodStart)}
      />
    );
    expect(queryByText(/CALIBRATING/i)).toBeNull();
  });

  it('renders the today day-of-cycle label', () => {
    const today = new Date(periodStart);
    today.setDate(periodStart.getDate() + 23); // day 24
    const { getByText } = render(
      <CycleWeightChart
        baselineKg={60}
        readings={[reading(24, 61.5)]}
        periodStart={periodStart}
        cycleLength={28}
        today={today}
      />
    );
    expect(getByText(/D24/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npm test -- __tests__/components/CycleWeightChart.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`mobile/src/components/ui/CycleWeightChart.tsx`:
```tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Rect, Line, Text as SvgText, Circle, Path } from 'react-native-svg';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from './VirraText';
import { EXPECTED_BAND } from '@/lib/weightBand';
import type { CyclePhase } from '@/lib/cycleEngine';

export interface WeightReading {
  recorded_on: string;
  weight_kg:   number;
}

interface Props {
  baselineKg:  number | null;
  readings:    WeightReading[];
  periodStart: Date;
  cycleLength: number;
  today?:      Date;
}

// Chart coordinate space
const VB_W = 800, VB_H = 320;
const PAD_L = 50, PAD_R = 20, PAD_T = 50, PAD_B = 60;
const Y_MIN = -1, Y_MAX = 3;

function xForDay(day: number, cycleLength: number) {
  const usable = VB_W - PAD_L - PAD_R;
  return PAD_L + ((day - 1) / (cycleLength - 1)) * usable;
}

function yForDelta(delta: number) {
  const usable = VB_H - PAD_T - PAD_B;
  const t = (delta - Y_MIN) / (Y_MAX - Y_MIN); // 0..1, low → top? need flip
  return PAD_T + (1 - t) * usable;
}

function dayOfCycleFor(date: Date, periodStart: Date, cycleLength: number): { day: number; cycleOffset: number } {
  const ms = date.getTime() - periodStart.getTime();
  const elapsed = Math.floor(ms / 86400000);
  const cycleOffset = Math.floor(elapsed / cycleLength);
  const day = ((elapsed % cycleLength) + cycleLength) % cycleLength + 1;
  return { day, cycleOffset };
}

function phaseForDay(day: number, cycleLength: number): CyclePhase {
  if (day <= 5) return 'menstrual';
  const ov = cycleLength - 14;
  if (day >= ov - 1 && day <= ov + 1) return 'ovulatory';
  if (day < ov - 1) return 'follicular';
  return 'luteal';
}

function bandPath(cycleLength: number): string {
  // Upper boundary across the cycle days, then lower boundary in reverse.
  const days = Array.from({ length: cycleLength }, (_, i) => i + 1);
  const upper = days.map((d) => `${xForDay(d, cycleLength)},${yForDelta(EXPECTED_BAND[phaseForDay(d, cycleLength)].upper)}`);
  const lower = days.map((d) => `${xForDay(d, cycleLength)},${yForDelta(EXPECTED_BAND[phaseForDay(d, cycleLength)].lower)}`).reverse();
  return `M ${upper.join(' L ')} L ${lower.join(' L ')} Z`;
}

export function CycleWeightChart({ baselineKg, readings, periodStart, cycleLength, today = new Date() }: Props) {
  const todayInfo = dayOfCycleFor(today, periodStart, cycleLength);
  const calibrating = baselineKg === null;

  const buckets: Record<number, WeightReading[]> = { 0: [], [-1]: [], [-2]: [] };
  for (const r of readings) {
    const info = dayOfCycleFor(new Date(r.recorded_on), periodStart, cycleLength);
    if (info.cycleOffset <= 0 && info.cycleOffset >= -2) {
      buckets[info.cycleOffset].push(r);
    }
  }

  function dotColor(offset: number): string {
    if (offset === 0)  return colors.pulse;
    if (offset === -1) return 'rgba(244, 237, 224, 0.55)';
    return 'rgba(244, 237, 224, 0.35)';
  }

  return (
    <View>
      {calibrating && (
        <View style={styles.ribbon}>
          <VirraText variant="mono" size={9} color={colors.muted}>
            CALIBRATING — KEEP LOGGING, BAND APPEARS AFTER ~3 CYCLES
          </VirraText>
        </View>
      )}
      <Svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" height={220}>
        {/* Y gridlines */}
        {[-1, 0, 1, 2, 3].map((y) => (
          <Line
            key={y}
            x1={PAD_L} y1={yForDelta(y)} x2={VB_W - PAD_R} y2={yForDelta(y)}
            stroke={y === 0 ? 'rgba(244,237,224,0.15)' : 'rgba(244,237,224,0.05)'}
            strokeWidth={1}
            strokeDasharray={y === 0 ? '4,4' : undefined}
          />
        ))}
        {/* Y labels */}
        {[-1, 0, 1, 2, 3].map((y) => (
          <SvgText
            key={`label-${y}`}
            x={PAD_L - 10} y={yForDelta(y) + 4}
            fill="rgba(244,237,224,0.4)" fontSize={10} fontFamily="SpaceMono_400Regular"
            textAnchor="end"
          >{y >= 0 ? `+${y}` : String(y)}</SvgText>
        ))}
        {/* Expected band */}
        {!calibrating && (
          <Path d={bandPath(cycleLength)} fill="rgba(212,255,38,0.18)" stroke="rgba(212,255,38,0.4)" strokeWidth={1} />
        )}
        {/* Today marker */}
        {todayInfo.cycleOffset === 0 && (
          <>
            <Line
              x1={xForDay(todayInfo.day, cycleLength)} y1={PAD_T}
              x2={xForDay(todayInfo.day, cycleLength)} y2={VB_H - PAD_B}
              stroke="rgba(212,255,38,0.6)" strokeWidth={1} strokeDasharray="3,3"
            />
            <SvgText
              x={xForDay(todayInfo.day, cycleLength)} y={PAD_T - 10}
              fill={colors.pulse} fontSize={9} fontFamily="SpaceMono_400Regular"
              textAnchor="middle"
            >TODAY · D{todayInfo.day}</SvgText>
          </>
        )}
        {/* Dots, oldest → newest so current cycle paints on top */}
        {([-2, -1, 0] as const).map((offset) =>
          buckets[offset].map((r, i) => {
            const info  = dayOfCycleFor(new Date(r.recorded_on), periodStart, cycleLength);
            const delta = baselineKg !== null ? r.weight_kg - baselineKg : 0;
            const isToday = offset === 0 && info.day === todayInfo.day;
            return (
              <Circle
                key={`${offset}-${i}`}
                cx={xForDay(info.day, cycleLength)}
                cy={yForDelta(delta)}
                r={isToday ? 6 : offset === 0 ? 4 : 3}
                fill={dotColor(offset)}
                stroke={isToday ? colors.breath : undefined}
                strokeWidth={isToday ? 2 : 0}
              />
            );
          })
        )}
        {/* X axis day labels */}
        {[1, 6, 14, 17, cycleLength].map((d) => (
          <SvgText
            key={`x-${d}`}
            x={xForDay(d, cycleLength)} y={VB_H - PAD_B + 16}
            fill="rgba(244,237,224,0.3)" fontSize={9} fontFamily="SpaceMono_400Regular"
            textAnchor="middle"
          >{d}</SvgText>
        ))}
      </Svg>
      <View style={styles.legend}>
        <Legend swatch={<View style={[styles.swatchSquare, { backgroundColor: 'rgba(212,255,38,0.4)', borderColor: 'rgba(212,255,38,0.6)' }]} />} label="EXPECTED BAND" />
        <Legend swatch={<View style={[styles.swatchDot, { backgroundColor: colors.pulse }]} />} label="CURRENT CYCLE" />
        <Legend swatch={<View style={[styles.swatchDot, { backgroundColor: 'rgba(244,237,224,0.5)' }]} />} label="PRIOR CYCLES" />
      </View>
    </View>
  );
}

function Legend({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <View style={styles.legendItem}>
      {swatch}
      <VirraText variant="mono" size={9} color={colors.muted}>{label}</VirraText>
    </View>
  );
}

const styles = StyleSheet.create({
  ribbon:       { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 4, marginBottom: spacing.xs, borderRadius: radius.full, backgroundColor: 'rgba(255, 107, 61, 0.15)' },
  legend:       { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  legendItem:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatchSquare: { width: 10, height: 6, borderRadius: 2, borderWidth: 1 },
  swatchDot:    { width: 8, height: 8, borderRadius: 4 },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npm test -- __tests__/components/CycleWeightChart.test.tsx`
Expected: PASS — 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/ui/CycleWeightChart.tsx mobile/__tests__/components/CycleWeightChart.test.tsx
git commit -m "feat(weight): add cycle band chart with three cycles overlay"
```

---

## Task 10: Profile screen BODY METRICS section

**Files:**
- Modify: `mobile/app/(app)/(tabs)/profile.tsx`

Add a section with a single toggle row. Toggling ON triggers the explainer modal on first activation. Permission request defers to the simulator/device run.

- [ ] **Step 1: Identify the insertion point**

`mobile/app/(app)/(tabs)/profile.tsx` already contains a stack of `<VirraCard style={styles.card}>` sections (`ACCOUNT`, `SUBSCRIPTION`, `CYCLE`, …). Insert the new BODY METRICS card directly after the `SUBSCRIPTION` card and before the `CYCLE` card. Use the existing `styles.card` and `styles.cardLabel` so visual rhythm matches.

- [ ] **Step 2: Add the section**

Add these imports at the top of the file (alongside existing ones):
```ts
import { Switch } from 'react-native';
import { useState } from 'react';
import { WeightExplainerModal } from '@/components/ui/WeightExplainerModal';
import { useProfileStore } from '@/store/profile';
```
(`Switch` and `useState` may already exist — only add what's missing.)

Inside the screen component, before the return statement, add:
```ts
const [showExplainer, setShowExplainer] = useState(false);
const trackWeight                 = useProfileStore((s) => s.trackWeight);
const weightExplainerDismissedAt  = useProfileStore((s) => s.weightExplainerDismissedAt);
const saveProfile                 = useProfileStore((s) => s.save);

async function handleToggleWeight(next: boolean) {
  if (!session) return;
  if (next && !weightExplainerDismissedAt) setShowExplainer(true);
  await saveProfile(session.user.id, { trackWeight: next });
}

async function handleDismissExplainer() {
  if (!session) return;
  setShowExplainer(false);
  await saveProfile(session.user.id, { weightExplainerDismissedAt: new Date().toISOString() });
}
```
(`session` should already be in scope from an existing `useAuthStore` call; if not, add `const { session } = useAuthStore();`.)

In the JSX, add this section directly after the `SUBSCRIPTION` `<VirraCard>...</VirraCard>` and before the `CYCLE` `<VirraCard>...</VirraCard>`:
```tsx
<VirraCard style={styles.card}>
  <VirraText variant="mono" size={11} color={colors.muted} style={styles.cardLabel}>BODY METRICS</VirraText>
  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
    <View style={{ flex: 1, paddingRight: spacing.md }}>
      <VirraText variant="body" size={15} color={colors.breath}>Track weight</VirraText>
      <VirraText variant="body" size={12} color={colors.muted}>
        {trackWeight ? 'Synced from Apple Health' : 'Off — no weight data syncs or displays'}
      </VirraText>
    </View>
    <Switch
      value={trackWeight}
      onValueChange={handleToggleWeight}
      trackColor={{ true: colors.pulse, false: colors.border }}
      thumbColor={colors.breath}
    />
  </View>
</VirraCard>

<WeightExplainerModal visible={showExplainer} onDismiss={handleDismissExplainer} />
```

(Existing imports for `VirraCard`, `VirraText`, `View`, `colors`, `spacing` should already be present; add what's missing.)

- [ ] **Step 3: Run tests**

Run: `cd mobile && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add 'mobile/app/(app)/(tabs)/profile.tsx'
git commit -m "feat(weight): add Body Metrics toggle on profile screen"
```

---

## Task 11: Wire CycleWeightChart into cycle-detail.tsx

**Files:**
- Modify: `mobile/app/(app)/cycle-detail.tsx`

Replace the scaffold `WEIGHT` card with a fetch-then-render of `CycleWeightChart`, gated on `trackWeight`. Add an inline "Add weight" affordance that opens `AddWeightModal`.

- [ ] **Step 1: Add imports + state**

At the top of `mobile/app/(app)/cycle-detail.tsx`, add to the existing imports:
```ts
import { useEffect } from 'react';
import { useProfileStore } from '@/store/profile';
import { CycleWeightChart, type WeightReading } from '@/components/ui/CycleWeightChart';
import { AddWeightModal } from '@/components/ui/AddWeightModal';
import { supabase } from '@/lib/supabase';
```

Inside the component body, after the existing `useState(resetting)`:
```ts
const trackWeight      = useProfileStore((s) => s.trackWeight);
const weightBaselineKg = useProfileStore((s) => s.weightBaselineKg);
const [readings,    setReadings]    = useState<WeightReading[]>([]);
const [addOpen,     setAddOpen]     = useState(false);

useEffect(() => {
  if (!session || !trackWeight) { setReadings([]); return; }
  let cancelled = false;
  (async () => {
    const cutoff = new Date(Date.now() - 90 * 86400000).toLocaleDateString('en-CA');
    const { data } = await supabase
      .from('body_weights')
      .select('recorded_on, weight_kg')
      .eq('user_id', session.user.id)
      .gte('recorded_on', cutoff)
      .order('recorded_on', { ascending: true });
    if (!cancelled) setReadings((data ?? []) as WeightReading[]);
  })();
  return () => { cancelled = true; };
}, [session?.user.id, trackWeight, addOpen]);
```

The `addOpen` dependency forces a refetch when the modal closes (toggle from true → false on Save).

- [ ] **Step 2: Replace the weight scaffold card**

Locate the existing card block that contains the `WEIGHT` kicker (the placeholder copy "Weight tracking is off..."). Replace the entire `<VirraCard>...</VirraCard>` block for that scaffold card with:

```tsx
{trackWeight && periodStart && (
  <VirraCard>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <VirraText variant="mono" size={10} color={colors.muted} style={styles.cardLabel}>
        WEIGHT · KG FROM BASELINE
      </VirraText>
      <Pressable onPress={() => setAddOpen(true)} hitSlop={8} accessibilityRole="button">
        <VirraText variant="mono" size={10} color={colors.pulse}>+ ADD WEIGHT</VirraText>
      </Pressable>
    </View>
    <CycleWeightChart
      baselineKg={weightBaselineKg}
      readings={readings}
      periodStart={periodStart}
      cycleLength={cycleLength}
    />
  </VirraCard>
)}
```

Leave the WHAT TO EXPECT card immediately below it untouched — it remains a phase-keyed reasoning surface in Ga and is upgraded by Gb.

- [ ] **Step 3: Add the AddWeightModal at the end of the screen**

Inside the `<SafeAreaView>...</SafeAreaView>` but after the `<ScrollView>` closes, add:
```tsx
{session && (
  <AddWeightModal
    visible={addOpen}
    userId={session.user.id}
    onClose={() => setAddOpen(false)}
  />
)}
```

- [ ] **Step 4: Run tests + type check**

Run:
```bash
cd mobile && npm test && npx tsc --noEmit 2>&1 | grep -E "^(app|src|__tests__)/" | head -10
```
Expected: tests PASS, no app/src TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add 'mobile/app/(app)/cycle-detail.tsx'
git commit -m "feat(weight): wire CycleWeightChart + AddWeightModal into cycle detail"
```

---

## Task 12: Wire WeightGlanceCard into the dashboard

**Files:**
- Modify: `mobile/app/(app)/(tabs)/index.tsx`

Insert the glance card between the cycle hero row (`<View style={styles.heroRow}>...</View>`) and the WeekStrip `<VirraCard>` that immediately follows it. Latest reading is fetched alongside cycle/auth state.

- [ ] **Step 1: Add imports + state**

At the top of `mobile/app/(app)/(tabs)/index.tsx`, alongside existing imports:
```ts
import { WeightGlanceCard } from '@/components/ui/WeightGlanceCard';
```

The file already uses `useState`, `useEffect`, `supabase`, and `useProfileStore` patterns elsewhere; reuse them. Inside the screen component, near the other state declarations:
```ts
const trackWeight        = useProfileStore((s) => s.trackWeight);
const [latestKg, setLatestKg] = useState<number | null>(null);

useEffect(() => {
  if (!session || !trackWeight) { setLatestKg(null); return; }
  let cancelled = false;
  (async () => {
    const { data } = await supabase
      .from('body_weights')
      .select('weight_kg')
      .eq('user_id', session.user.id)
      .order('recorded_on', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!cancelled) setLatestKg(data?.weight_kg ?? null);
  })();
  return () => { cancelled = true; };
}, [session?.user.id, trackWeight]);
```

- [ ] **Step 2: Insert the glance card**

In the JSX, locate the closing `</View>` of `<View style={styles.heroRow}>...</View>` (the row holding the cycle card + rings card). Immediately after that closing tag, insert:
```tsx
<WeightGlanceCard latestKg={latestKg} />
```

The glance card returns null when `trackWeight === false`, so this is a no-op for users who haven't opted in. No conditional needed in the parent.

- [ ] **Step 3: Run tests + type check**

Run:
```bash
cd mobile && npm test && npx tsc --noEmit 2>&1 | grep -E "^(app|src|__tests__)/" | head -10
```
Expected: tests PASS, no app/src TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add 'mobile/app/(app)/(tabs)/index.tsx'
git commit -m "feat(weight): add dashboard glance between hero and WeekStrip"
```

---

## Task 13: Wire weight import into the foreground poll

**Files:**
- Modify: `mobile/app/(app)/_layout.tsx`

The existing `runImport()` inside `_layout.tsx` calls `importNewWorkouts`. We add a second call to `importNewWeightSamples`, gated on `trackWeight`.

- [ ] **Step 1: Add import**

Alongside existing imports near the top of `mobile/app/(app)/_layout.tsx`:
```ts
import { importNewWeightSamples } from '@/lib/healthKitWeight';
```

Pull `trackWeight` from the profile store. Find the existing `const { load: loadProfile } = useProfileStore();` and replace with:
```ts
const { load: loadProfile, trackWeight } = useProfileStore();
```

- [ ] **Step 2: Extend `runImport`**

Locate the `function runImport() { ... }` block. Replace it with:
```ts
function runImport() {
  importNewWorkouts({
    userId:      session!.user.id,
    periodStart: periodStart ?? null,
    cycleLength: cycleLength ?? 28,
  });
  if (trackWeight) {
    importNewWeightSamples({
      userId:      session!.user.id,
      periodStart: periodStart ?? null,
      cycleLength: cycleLength ?? 28,
    });
  }
}
```

- [ ] **Step 3: Add `trackWeight` to the effect's dependency array**

Find the `useEffect` whose body contains `runImport` and `appState`. Its dependency array currently reads `[session?.user.id, periodStart, cycleLength]`. Replace with `[session?.user.id, periodStart, cycleLength, trackWeight]` so flipping the toggle ON triggers an immediate poll.

- [ ] **Step 4: Run tests + type check**

Run:
```bash
cd mobile && npm test && npx tsc --noEmit 2>&1 | grep -E "^(app|src|__tests__)/" | head -10
```
Expected: tests PASS, no app/src TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add 'mobile/app/(app)/_layout.tsx'
git commit -m "feat(weight): poll HealthKit weight on foreground when track_weight is on"
```

---

## Task 14: Manual smoke test on the simulator

Type checks + unit tests verify correctness, not feature behaviour. Walk the flow.

- [ ] **Step 1: Boot the dev server**

Run: `cd mobile && npx expo start --ios` (or the usual dev workflow).

- [ ] **Step 2: Walk the activation flow**

- Open the app, log in, navigate to Profile.
- BODY METRICS card present, toggle OFF, copy "Off — no weight data syncs or displays".
- Tap toggle → explainer modal appears with pulse border + "THIS ISN'T A WEIGHT LOSS FEATURE" copy.
- Tap "Got it" → modal dismisses, toggle remains ON, copy switches to "Synced from Apple Health".
- Go back to Dashboard. The glance card appears below the cycle hero (CALIBRATING state if no readings yet, or empty if no `body_weights` rows).

- [ ] **Step 3: Walk the manual entry flow**

- Open Dashboard → tap the cycle hero → Cycle screen opens.
- The WEIGHT card now shows the CycleWeightChart instead of the scaffold. With no readings + no baseline, the chart shows the calibrating ribbon and an empty grid.
- Tap `+ ADD WEIGHT` in the card header → AddWeightModal slides up.
- Enter `60.5`, tap Save → modal dismisses, chart re-fetches and shows a single dot near day-of-cycle today, baseline still null (need 5 follicular readings).
- Return to Dashboard → glance card shows the calibrating state with `60.5 kg`.

- [ ] **Step 4: Walk the HK ingestion flow (if Apple Health has weight data)**

- Background the app, write a Weight sample in Apple Health (Health app → Browse → Body Measurements → Weight → Add Data).
- Foreground Virra → within a few seconds, the new reading appears in the chart and in the glance card. Re-runs the baseline; if 5+ follicular readings exist, the band renders and the glance card switches from CALIBRATING to IN BAND / ABOVE / BELOW.

- [ ] **Step 5: Walk the off flow**

- Go to Profile → toggle Body Metrics OFF.
- Glance card vanishes from Dashboard. Cycle screen no longer shows the weight card.
- Underlying `body_weights` rows are preserved in the DB.

- [ ] **Step 6: Walk the calibration end flow (optional, hard to fake on device)**

- If 5+ follicular-phase readings already exist via HK, after the next foreground the baseline computes. Glance card transitions from CALIBRATING to a band state. The detail chart's calibrating ribbon disappears and the expected band appears.

- [ ] **Step 7: Commit any fixes from this pass**

If issues surfaced, fix and commit each as its own small commit.

---

## Spec coverage check

| Spec section | Implementing task |
|---|---|
| 1 Architectural principles | All — encoded in gating logic across tasks |
| 2 Out of scope | Hard-deferred. No tasks. |
| 3 Schema | Task 1 |
| 4 Expected-band defaults | Task 2 |
| 5 Baseline computation | Task 3 |
| 6 Calibration gate | Tasks 8, 9 (gate is `weightBaselineKg === null`) |
| 7 HealthKit ingestion | Tasks 5, 13 |
| 8 Manual entry | Task 7 |
| 9 Profile toggle + first-run explainer | Tasks 6, 10 |
| 10 Detail chart | Tasks 9, 11 |
| 11 Dashboard glance card | Tasks 8, 12 |
| 12 Files touched | All tasks |
| 13 Data flow | Tasks 11 (refetch on modal close), 13 (foreground poll), 8/9 (silent until data) |
| 14 Error handling | Tasks 3, 5, 7 (try/catch around Supabase) |
| 15 Testing | Tasks 2, 3, 5, 6, 7, 8, 9 (unit + component); Task 14 (manual) |
| 16 Risks | Task 14 step 4 (HK observer reliability), Task 9 (band path interpolation visible at smoke) |
