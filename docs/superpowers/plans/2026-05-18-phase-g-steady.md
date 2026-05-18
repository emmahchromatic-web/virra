# Phase G Sub-project Gc — Steady Weight Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the non-cycle path for weight tracking (hormonal / perimenopause / menopause) — rolling 30-day median baseline, fixed ±0.5 kg steady band, new `/weight` detail screen, mode-aware first-run explainer and dashboard glance. Reuses Ga's toggle, HK observer, manual entry, and component primitives.

**Architecture:** One additive Supabase migration adds two columns to `user_profiles`. A new pure helper computes the steady baseline (median of last 30 days, ≥7 readings). A single dispatcher (`recomputeBaseline`) decides which baseline to compute based on the user's `cycleProfile` — `AddWeightModal`, `importNewWeightSamples`, and the foreground poll all call it. The glance card and explainer modal branch internally on `cycleProfile`; non-cycle users get steady framing and route to a new `weight.tsx` detail screen.

**Tech Stack:** Expo + expo-router, React Native + react-native-svg, Zustand, Supabase (Postgres + RLS, MCP for migrations), jest-expo + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-05-18-phase-g-steady-design.md`

---

## File map

**New**

| Path | Responsibility |
|---|---|
| `mobile/src/lib/weightBaselineSteady.ts` | `computeSteadyBaseline` — median of last-30-day readings, ≥7 readings |
| `mobile/src/lib/weightBaselineDispatcher.ts` | `recomputeBaseline` — branches on cycleProfile, calls Ga or Gc baseline |
| `mobile/src/components/ui/WeightSteadyChart.tsx` | SVG line + ±0.5 band chart, auto-scaled y-axis |
| `mobile/app/(app)/weight.tsx` | Sub-menu detail screen for steady users |

**Edited**

| Path | Why |
|---|---|
| `mobile/src/lib/weightBand.ts` | Add `STEADY_BAND` + `classifySteady` |
| `mobile/src/components/ui/WeightExplainerModal.tsx` | Accept `mode: 'cycle' \| 'steady'`; swap copy |
| `mobile/src/components/ui/WeightGlanceCard.tsx` | Branch on `cycleProfile`; route accordingly |
| `mobile/src/components/ui/AddWeightModal.tsx` | Call `recomputeBaseline` instead of `computeBaseline` |
| `mobile/src/lib/healthKitWeight.ts` | Call `recomputeBaseline` instead of `computeBaseline` |
| `mobile/app/(app)/(tabs)/profile.tsx` | Pass `mode` to explainer based on `cycleProfile` |
| `mobile/src/store/profile.ts` | Add steady-baseline fields |
| `mobile/app/(app)/_layout.tsx` | Register the new `weight` route in the Stack screens list |
| `mobile/__tests__/components/WeightExplainerModal.test.tsx` | Adapt to new `mode` prop |

**Migration**

| Action | Detail |
|---|---|
| Supabase migration via MCP | `add_phase_g_steady_baseline` — two new columns on `user_profiles` |

---

## Task 1: Schema migration

**Files:**
- Migration applied via MCP: `mcp__supabase__apply_migration`

- [ ] **Step 1: Confirm columns don't exist yet**

Tool call:
```
mcp__supabase__execute_sql(query:
  "select column_name from information_schema.columns
   where table_name = 'user_profiles'
     and column_name in ('weight_steady_baseline_kg','weight_steady_baseline_computed_at');"
)
```
Expected: empty result set.

- [ ] **Step 2: Apply the migration**

Tool call:
```
mcp__supabase__apply_migration(
  name: "add_phase_g_steady_baseline",
  query: <SQL below>
)
```

SQL:
```sql
alter table user_profiles
  add column weight_steady_baseline_kg          numeric,
  add column weight_steady_baseline_computed_at timestamptz;
```

- [ ] **Step 3: Verify**

Tool call:
```
mcp__supabase__execute_sql(query:
  "select column_name from information_schema.columns
   where table_name = 'user_profiles'
     and column_name in ('weight_steady_baseline_kg','weight_steady_baseline_computed_at')
   order by column_name;"
)
```
Expected: both columns listed.

- [ ] **Step 4: No git commit needed**

Migration applied directly to remote Supabase via MCP. Move on.

---

## Task 2: weightBand — add STEADY_BAND + classifySteady

**Files:**
- Modify: `mobile/src/lib/weightBand.ts`
- Modify: `mobile/__tests__/lib/weightBand.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `mobile/__tests__/lib/weightBand.test.ts`:
```ts
import { STEADY_BAND, classifySteady } from '@/lib/weightBand';

describe('STEADY_BAND', () => {
  it('is fixed at ±0.5 kg', () => {
    expect(STEADY_BAND).toEqual({ lower: -0.5, upper: 0.5 });
  });
});

describe('classifySteady', () => {
  it('returns in_band at the lower edge', () => {
    expect(classifySteady(-0.5)).toBe('in_band');
  });
  it('returns in_band at the upper edge', () => {
    expect(classifySteady(0.5)).toBe('in_band');
  });
  it('returns in_band at zero', () => {
    expect(classifySteady(0)).toBe('in_band');
  });
  it('returns below when delta is below the lower edge', () => {
    expect(classifySteady(-0.6)).toBe('below');
  });
  it('returns above when delta exceeds the upper edge', () => {
    expect(classifySteady(0.6)).toBe('above');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npm test -- __tests__/lib/weightBand.test.ts`
Expected: FAIL — `STEADY_BAND` and `classifySteady` are not exported yet.

- [ ] **Step 3: Extend the module**

Append to `mobile/src/lib/weightBand.ts`:
```ts
export const STEADY_BAND: WeightBand = { lower: -0.5, upper: 0.5 };

export function classifySteady(delta: number): BandPosition {
  if (delta < STEADY_BAND.lower) return 'below';
  if (delta > STEADY_BAND.upper) return 'above';
  return 'in_band';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npm test -- __tests__/lib/weightBand.test.ts`
Expected: PASS — all 11 tests green (6 original + 5 new + STEADY_BAND describe).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/weightBand.ts mobile/__tests__/lib/weightBand.test.ts
git commit -m "feat(weight): add steady band defaults and classifier"
```

---

## Task 3: Steady baseline helper

**Files:**
- Create: `mobile/src/lib/weightBaselineSteady.ts`
- Test: `mobile/__tests__/lib/weightBaselineSteady.test.ts`

Pure median over the last 30 days of readings, ≥7 readings required, writes to `weight_steady_baseline_kg`.

- [ ] **Step 1: Write failing tests**

`mobile/__tests__/lib/weightBaselineSteady.test.ts`:
```ts
import { medianAll, computeSteadyBaseline } from '@/lib/weightBaselineSteady';

describe('medianAll (pure)', () => {
  it('returns null with fewer than 7 readings', () => {
    const rows = [60, 60.2, 60.1, 60.0, 60.3, 60.1].map((w) => ({ weight_kg: w }));
    expect(medianAll(rows)).toBeNull();
  });

  it('returns the median of all readings (odd count)', () => {
    const rows = [60.0, 60.1, 60.2, 60.3, 60.4, 60.5, 60.6].map((w) => ({ weight_kg: w }));
    expect(medianAll(rows)).toBeCloseTo(60.3);
  });

  it('returns the average of middle two values (even count)', () => {
    const rows = [60.0, 60.1, 60.2, 60.3, 60.4, 60.5, 60.6, 60.7].map((w) => ({ weight_kg: w }));
    // sorted: 60.0 60.1 60.2 60.3 60.4 60.5 60.6 60.7 — middle two = 60.3 + 60.4 = 60.35
    expect(medianAll(rows)).toBeCloseTo(60.35);
  });

  it('handles out-of-order rows by sorting', () => {
    const rows = [61.0, 59.8, 60.0, 60.5, 60.2, 60.3, 60.1].map((w) => ({ weight_kg: w }));
    // sorted: 59.8 60.0 60.1 60.2 60.3 60.5 61.0 — median = 60.2
    expect(medianAll(rows)).toBeCloseTo(60.2);
  });
});

jest.mock('@/lib/supabase', () => {
  const data: any[] = [];
  const updateEq = jest.fn().mockResolvedValue({ data: null, error: null });
  const update   = jest.fn(() => ({ eq: updateEq }));
  const select = jest.fn().mockReturnThis();
  const eq     = jest.fn().mockReturnThis();
  const gte    = jest.fn().mockReturnThis();
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

describe('computeSteadyBaseline (integration)', () => {
  beforeEach(() => {
    supabaseMock.__data.length = 0;
    supabaseMock.__from.mockClear();
    supabaseMock.__update.mockClear();
  });

  it('writes null when fewer than 7 readings exist', async () => {
    supabaseMock.__data.push(
      { weight_kg: 60.0 },
      { weight_kg: 60.1 },
      { weight_kg: 60.2 },
    );
    const baseline = await computeSteadyBaseline('user-1');
    expect(baseline).toBeNull();
    expect(supabaseMock.__update).toHaveBeenCalledWith(
      expect.objectContaining({ weight_steady_baseline_kg: null }),
    );
  });

  it('writes the median when 7+ readings exist', async () => {
    supabaseMock.__data.push(
      { weight_kg: 60.0 }, { weight_kg: 60.1 }, { weight_kg: 60.2 },
      { weight_kg: 60.3 }, { weight_kg: 60.4 }, { weight_kg: 60.5 },
      { weight_kg: 60.6 },
    );
    const baseline = await computeSteadyBaseline('user-1');
    expect(baseline).toBeCloseTo(60.3);
    expect(supabaseMock.__update).toHaveBeenCalledWith(
      expect.objectContaining({ weight_steady_baseline_kg: 60.3 }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npm test -- __tests__/lib/weightBaselineSteady.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`mobile/src/lib/weightBaselineSteady.ts`:
```ts
import { supabase } from '@/lib/supabase';

interface SteadyRow {
  weight_kg: number;
}

const MIN_READINGS = 7;
const WINDOW_DAYS  = 30;

export function medianAll(rows: SteadyRow[]): number | null {
  if (rows.length < MIN_READINGS) return null;
  const sorted = rows.map((r) => Number(r.weight_kg)).sort((a, b) => a - b);
  const n   = sorted.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) * 50) / 100 // .5 precision
    : sorted[mid];
}

export async function computeSteadyBaseline(userId: string): Promise<number | null> {
  const cutoff = new Date(Date.now() - WINDOW_DAYS * 86400000).toLocaleDateString('en-CA');

  const { data, error } = await supabase
    .from('body_weights')
    .select('weight_kg')
    .eq('user_id', userId)
    .gte('recorded_on', cutoff);

  if (error) throw new Error(error.message);

  const baseline = medianAll((data ?? []) as SteadyRow[]);

  await supabase
    .from('user_profiles')
    .update({
      weight_steady_baseline_kg:          baseline,
      weight_steady_baseline_computed_at: new Date().toISOString(),
    })
    .eq('id', userId);

  return baseline;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npm test -- __tests__/lib/weightBaselineSteady.test.ts`
Expected: PASS — 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/weightBaselineSteady.ts mobile/__tests__/lib/weightBaselineSteady.test.ts
git commit -m "feat(weight): add steady baseline computation (30-day median)"
```

---

## Task 4: Baseline dispatcher

**Files:**
- Create: `mobile/src/lib/weightBaselineDispatcher.ts`
- Test: `mobile/__tests__/lib/weightBaselineDispatcher.test.ts`

Single function that picks the right baseline based on `cycleProfile`.

- [ ] **Step 1: Write failing test**

`mobile/__tests__/lib/weightBaselineDispatcher.test.ts`:
```ts
import { recomputeBaseline } from '@/lib/weightBaselineDispatcher';

jest.mock('@/lib/weightBaseline', () => ({
  computeBaseline: jest.fn().mockResolvedValue(60.0),
}));
jest.mock('@/lib/weightBaselineSteady', () => ({
  computeSteadyBaseline: jest.fn().mockResolvedValue(60.5),
}));
jest.mock('@/store/cycle', () => {
  let profile = 'natural';
  return {
    useCycleStore: { getState: () => ({ cycleProfile: profile }) },
    __setProfile: (p: string) => { profile = p; },
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const cycleMock    = require('@/store/cycle');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cycleBaseline = require('@/lib/weightBaseline').computeBaseline;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const steadyBaseline = require('@/lib/weightBaselineSteady').computeSteadyBaseline;

describe('recomputeBaseline', () => {
  beforeEach(() => {
    cycleBaseline.mockClear();
    steadyBaseline.mockClear();
  });

  it('calls computeBaseline for cycleProfile=natural', async () => {
    cycleMock.__setProfile('natural');
    await recomputeBaseline('user-1');
    expect(cycleBaseline).toHaveBeenCalledWith('user-1');
    expect(steadyBaseline).not.toHaveBeenCalled();
  });

  it('calls computeBaseline for cycleProfile=irregular', async () => {
    cycleMock.__setProfile('irregular');
    await recomputeBaseline('user-1');
    expect(cycleBaseline).toHaveBeenCalledWith('user-1');
    expect(steadyBaseline).not.toHaveBeenCalled();
  });

  it('calls computeSteadyBaseline for cycleProfile=hormonal', async () => {
    cycleMock.__setProfile('hormonal');
    await recomputeBaseline('user-1');
    expect(steadyBaseline).toHaveBeenCalledWith('user-1');
    expect(cycleBaseline).not.toHaveBeenCalled();
  });

  it('calls computeSteadyBaseline for cycleProfile=perimenopause', async () => {
    cycleMock.__setProfile('perimenopause');
    await recomputeBaseline('user-1');
    expect(steadyBaseline).toHaveBeenCalledWith('user-1');
  });

  it('calls computeSteadyBaseline for cycleProfile=menopause', async () => {
    cycleMock.__setProfile('menopause');
    await recomputeBaseline('user-1');
    expect(steadyBaseline).toHaveBeenCalledWith('user-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npm test -- __tests__/lib/weightBaselineDispatcher.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`mobile/src/lib/weightBaselineDispatcher.ts`:
```ts
import { useCycleStore } from '@/store/cycle';
import { computeBaseline } from '@/lib/weightBaseline';
import { computeSteadyBaseline } from '@/lib/weightBaselineSteady';

export async function recomputeBaseline(userId: string): Promise<void> {
  const profile = useCycleStore.getState().cycleProfile;
  if (profile === 'natural' || profile === 'irregular') {
    await computeBaseline(userId);
  } else {
    await computeSteadyBaseline(userId);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npm test -- __tests__/lib/weightBaselineDispatcher.test.ts`
Expected: PASS — 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/weightBaselineDispatcher.ts mobile/__tests__/lib/weightBaselineDispatcher.test.ts
git commit -m "feat(weight): add baseline dispatcher (cycle vs steady)"
```

---

## Task 5: Profile store — steady baseline fields

**Files:**
- Modify: `mobile/src/store/profile.ts`

- [ ] **Step 1: Extend the ProfilePatch interface**

In `mobile/src/store/profile.ts`, find the `export interface ProfilePatch` block. Add two fields at the bottom:

```ts
weightSteadyBaselineKg?:          number | null;
weightSteadyBaselineComputedAt?:  string | null;
```

- [ ] **Step 2: Extend ProfileState interface**

In the same file, find `interface ProfileState`. After the existing `weightExplainerDismissedAt` field, add:

```ts
weightSteadyBaselineKg:          number | null;
weightSteadyBaselineComputedAt:  string | null;
```

- [ ] **Step 3: Add defaults**

In the default state object inside `create<ProfileState>((set) => ({...}))`, after `weightExplainerDismissedAt: null`, add:

```ts
weightSteadyBaselineKg:          null,
weightSteadyBaselineComputedAt:  null,
```

- [ ] **Step 4: Extend the load select**

In the `load` method, the existing select clause reads:
```ts
.select('first_name, last_name, avatar_url, steps_target, haiku_disclosure_acknowledged_at, track_weight, weight_baseline_kg, weight_explainer_dismissed_at')
```
Replace with:
```ts
.select('first_name, last_name, avatar_url, steps_target, haiku_disclosure_acknowledged_at, track_weight, weight_baseline_kg, weight_explainer_dismissed_at, weight_steady_baseline_kg, weight_steady_baseline_computed_at')
```

In the `set({...})` block after the data fetch, after `weightExplainerDismissedAt: data.weight_explainer_dismissed_at ?? null,`, add:

```ts
weightSteadyBaselineKg:          data.weight_steady_baseline_kg ?? null,
weightSteadyBaselineComputedAt:  data.weight_steady_baseline_computed_at ?? null,
```

- [ ] **Step 5: Extend the save mapping**

In the `save` method, after the existing `if (patch.weightExplainerDismissedAt ... )` line, add:

```ts
if (patch.weightSteadyBaselineKg          !== undefined) update.weight_steady_baseline_kg          = patch.weightSteadyBaselineKg;
if (patch.weightSteadyBaselineComputedAt  !== undefined) update.weight_steady_baseline_computed_at = patch.weightSteadyBaselineComputedAt;
```

In the `set((s) => ({...}))` call later in `save`, after the existing `weightExplainerDismissedAt: ...` line, add:

```ts
weightSteadyBaselineKg:          patch.weightSteadyBaselineKg          !== undefined ? patch.weightSteadyBaselineKg          : s.weightSteadyBaselineKg,
weightSteadyBaselineComputedAt:  patch.weightSteadyBaselineComputedAt  !== undefined ? patch.weightSteadyBaselineComputedAt  : s.weightSteadyBaselineComputedAt,
```

- [ ] **Step 6: Extend setLocal**

In the `setLocal` method's `set((s) => ({...}))` call, after `weightExplainerDismissedAt: ...`, add the same two lines as in step 5's set call:

```ts
weightSteadyBaselineKg:          patch.weightSteadyBaselineKg          !== undefined ? patch.weightSteadyBaselineKg          : s.weightSteadyBaselineKg,
weightSteadyBaselineComputedAt:  patch.weightSteadyBaselineComputedAt  !== undefined ? patch.weightSteadyBaselineComputedAt  : s.weightSteadyBaselineComputedAt,
```

- [ ] **Step 7: Run tests**

Run: `cd mobile && npm test`
Expected: PASS — no regressions.

- [ ] **Step 8: Commit**

```bash
git add mobile/src/store/profile.ts
git commit -m "feat(weight): add steady baseline fields to profile store"
```

---

## Task 6: Switch callers to recomputeBaseline

**Files:**
- Modify: `mobile/src/components/ui/AddWeightModal.tsx`
- Modify: `mobile/src/lib/healthKitWeight.ts`
- Modify: `mobile/__tests__/components/AddWeightModal.test.tsx`

`AddWeightModal` and `healthKitWeight.importNewWeightSamples` currently call `computeBaseline` directly. Both switch to the dispatcher.

- [ ] **Step 1: Update AddWeightModal**

In `mobile/src/components/ui/AddWeightModal.tsx`:

Replace the import line:
```ts
import { computeBaseline } from '@/lib/weightBaseline';
```
With:
```ts
import { recomputeBaseline } from '@/lib/weightBaselineDispatcher';
```

And the call site inside `handleSave`:
```ts
await computeBaseline(userId).catch(() => {});
```
With:
```ts
await recomputeBaseline(userId).catch(() => {});
```

- [ ] **Step 2: Update healthKitWeight**

In `mobile/src/lib/healthKitWeight.ts`:

Replace:
```ts
import { computeBaseline } from '@/lib/weightBaseline';
```
With:
```ts
import { recomputeBaseline } from '@/lib/weightBaselineDispatcher';
```

And inside `importNewWeightSamples`:
```ts
await computeBaseline(ctx.userId).catch((e) => {
  console.warn('[healthKitWeight] baseline recompute failed:', e.message);
});
```
With:
```ts
await recomputeBaseline(ctx.userId).catch((e) => {
  console.warn('[healthKitWeight] baseline recompute failed:', e.message);
});
```

- [ ] **Step 3: Update AddWeightModal test mock**

In `mobile/__tests__/components/AddWeightModal.test.tsx`:

Replace:
```ts
jest.mock('@/lib/weightBaseline', () => ({
  computeBaseline: jest.fn().mockResolvedValue(60.5),
}));
```
With:
```ts
jest.mock('@/lib/weightBaselineDispatcher', () => ({
  recomputeBaseline: jest.fn().mockResolvedValue(undefined),
}));
```

Replace:
```ts
const baselineMock = require('@/lib/weightBaseline');
```
With:
```ts
const baselineMock = require('@/lib/weightBaselineDispatcher');
```

Replace:
```ts
baselineMock.computeBaseline.mockClear();
```
With:
```ts
baselineMock.recomputeBaseline.mockClear();
```

Replace:
```ts
expect(baselineMock.computeBaseline).toHaveBeenCalledWith('u');
```
With:
```ts
expect(baselineMock.recomputeBaseline).toHaveBeenCalledWith('u');
```

- [ ] **Step 4: Run tests**

Run: `cd mobile && npm test -- __tests__/components/AddWeightModal.test.tsx __tests__/lib/healthKitWeight.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full suite**

Run: `cd mobile && npm test`
Expected: PASS — no regressions.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/components/ui/AddWeightModal.tsx mobile/src/lib/healthKitWeight.ts mobile/__tests__/components/AddWeightModal.test.tsx
git commit -m "feat(weight): route baseline recompute through dispatcher"
```

---

## Task 7: Mode-aware WeightExplainerModal

**Files:**
- Modify: `mobile/src/components/ui/WeightExplainerModal.tsx`
- Modify: `mobile/__tests__/components/WeightExplainerModal.test.tsx`

- [ ] **Step 1: Update tests for the new prop**

Replace the contents of `mobile/__tests__/components/WeightExplainerModal.test.tsx` with:
```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { WeightExplainerModal } from '@/components/ui/WeightExplainerModal';

describe('WeightExplainerModal', () => {
  it('does not render when visible is false', () => {
    const { queryByText } = render(
      <WeightExplainerModal visible={false} mode="cycle" onDismiss={() => {}} />
    );
    expect(queryByText(/THIS ISN'T A WEIGHT LOSS FEATURE/i)).toBeNull();
  });

  it('renders cycle copy in cycle mode', () => {
    const { getByText } = render(
      <WeightExplainerModal visible={true} mode="cycle" onDismiss={() => {}} />
    );
    expect(getByText(/THIS ISN'T A WEIGHT LOSS FEATURE/i)).toBeTruthy();
    expect(getByText(/Your weight rises and falls with your cycle/i)).toBeTruthy();
    expect(getByText(/Got it/i)).toBeTruthy();
  });

  it('renders steady copy in steady mode', () => {
    const { getByText, queryByText } = render(
      <WeightExplainerModal visible={true} mode="steady" onDismiss={() => {}} />
    );
    expect(getByText(/THIS ISN'T A WEIGHT LOSS FEATURE/i)).toBeTruthy();
    expect(getByText(/bounces day-to-day from water/i)).toBeTruthy();
    expect(queryByText(/Your weight rises and falls with your cycle/i)).toBeNull();
    expect(getByText(/Got it/i)).toBeTruthy();
  });

  it('calls onDismiss when Got it is pressed in cycle mode', () => {
    const onDismiss = jest.fn();
    const { getByText } = render(
      <WeightExplainerModal visible={true} mode="cycle" onDismiss={onDismiss} />
    );
    fireEvent.press(getByText(/Got it/i));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss when Got it is pressed in steady mode', () => {
    const onDismiss = jest.fn();
    const { getByText } = render(
      <WeightExplainerModal visible={true} mode="steady" onDismiss={onDismiss} />
    );
    fireEvent.press(getByText(/Got it/i));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npm test -- __tests__/components/WeightExplainerModal.test.tsx`
Expected: FAIL — current component signature doesn't accept `mode` and renders cycle copy unconditionally.

- [ ] **Step 3: Update the component**

Replace the contents of `mobile/src/components/ui/WeightExplainerModal.tsx`:
```tsx
import React from 'react';
import { Modal, View, StyleSheet, Pressable } from 'react-native';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from './VirraText';

export type WeightExplainerMode = 'cycle' | 'steady';

interface Props {
  visible:   boolean;
  mode:      WeightExplainerMode;
  onDismiss: () => void;
}

const COPY: Record<WeightExplainerMode, { editorial: string; body: string }> = {
  cycle: {
    editorial:
      'Your weight rises and falls with your cycle. We track the shape of that, so you can see what\'s water, what\'s normal, and when something is actually worth noticing.',
    body:
      'No goal weight. No streaks. No daily prompt.\n' +
      'Calibrating — we need ~3 cycles of readings before insights are reliable.',
  },
  steady: {
    editorial:
      'Your weight bounces day-to-day from water, food timing, and hydration. We track the trend, not the day-to-day — so you can see what\'s noise and what\'s real.',
    body:
      'No goal weight. No streaks. No daily prompt.\n' +
      'Calibrating — we need ~30 days of readings before the steady line becomes reliable.',
  },
};

export function WeightExplainerModal({ visible, mode, onDismiss }: Props) {
  const copy = COPY[mode];
  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <VirraText variant="mono" size={10} color={colors.pulse} style={styles.kicker}>
            THIS ISN'T A WEIGHT LOSS FEATURE
          </VirraText>
          <VirraText variant="serif" size={18} color={colors.breath} style={styles.editorial}>
            {copy.editorial}
          </VirraText>
          <VirraText variant="body" size={13} color={colors.muted} style={styles.body}>
            {copy.body}
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
Expected: PASS — 5 tests green.

- [ ] **Step 5: Wire the `mode` prop in profile.tsx**

In `mobile/app/(app)/(tabs)/profile.tsx`, the existing `<WeightExplainerModal>` invocation reads:
```tsx
<WeightExplainerModal visible={showExplainer} onDismiss={handleDismissExplainer} />
```

The screen already destructures `cycleProfile` from `useCycleStore`. Replace the invocation with:
```tsx
<WeightExplainerModal
  visible={showExplainer}
  mode={(cycleProfile === 'natural' || cycleProfile === 'irregular') ? 'cycle' : 'steady'}
  onDismiss={handleDismissExplainer}
/>
```

If `cycleProfile` is not currently destructured in the screen, add it:
```ts
const { cycleInfo, periodStart, cycleLength, setCycleLength, setPeriodStart, cycleProfile } = useCycleStore();
```
(Use grep to confirm — the field is referenced elsewhere in the file already via `CYCLE_PROFILE_LABEL[cycleProfile]`.)

- [ ] **Step 6: Run full test suite**

Run: `cd mobile && npm test`
Expected: PASS — no regressions.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/components/ui/WeightExplainerModal.tsx mobile/__tests__/components/WeightExplainerModal.test.tsx 'mobile/app/(app)/(tabs)/profile.tsx'
git commit -m "feat(weight): mode-aware explainer modal (cycle vs steady)"
```

---

## Task 8: WeightSteadyChart

**Files:**
- Create: `mobile/src/components/ui/WeightSteadyChart.tsx`
- Test: `mobile/__tests__/components/WeightSteadyChart.test.tsx`

SVG line chart: baseline line at delta=0, ±0.5 kg shaded band, dots for each reading, auto-scaled y-axis.

- [ ] **Step 1: Write failing test**

`mobile/__tests__/components/WeightSteadyChart.test.tsx`:
```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { WeightSteadyChart, type WeightReading } from '@/components/ui/WeightSteadyChart';

const today = new Date('2026-05-18');

function reading(daysAgo: number, weightKg: number): WeightReading {
  const d = new Date(today);
  d.setDate(today.getDate() - daysAgo);
  return { recorded_on: d.toLocaleDateString('en-CA'), weight_kg: weightKg };
}

describe('WeightSteadyChart', () => {
  it('renders the legend regardless of calibration state', () => {
    const { getByText } = render(
      <WeightSteadyChart
        baselineKg={60}
        readings={[reading(0, 60.5)]}
        today={today}
      />
    );
    expect(getByText(/STEADY LINE/i)).toBeTruthy();
    expect(getByText(/0.5 KG BAND/i)).toBeTruthy();
    expect(getByText(/READING/i)).toBeTruthy();
  });

  it('renders the calibrating ribbon when baselineKg is null', () => {
    const { getByText } = render(
      <WeightSteadyChart
        baselineKg={null}
        readings={[reading(0, 60.5)]}
        today={today}
      />
    );
    expect(getByText(/CALIBRATING/i)).toBeTruthy();
  });

  it('does not render the calibrating ribbon when baselineKg is set', () => {
    const { queryByText } = render(
      <WeightSteadyChart
        baselineKg={60}
        readings={[reading(0, 60.5)]}
        today={today}
      />
    );
    expect(queryByText(/CALIBRATING/i)).toBeNull();
  });

  it('renders without crashing with an empty readings array', () => {
    const { toJSON } = render(
      <WeightSteadyChart baselineKg={null} readings={[]} today={today} />
    );
    expect(toJSON()).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npm test -- __tests__/components/WeightSteadyChart.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`mobile/src/components/ui/WeightSteadyChart.tsx`:
```tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Line, Circle, Rect, Text as SvgText } from 'react-native-svg';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from './VirraText';

export interface WeightReading {
  recorded_on: string;
  weight_kg:   number;
}

interface Props {
  baselineKg: number | null;
  readings:   WeightReading[];
  today?:     Date;
}

const VB_W = 800, VB_H = 280;
const PAD_L = 50, PAD_R = 20, PAD_T = 30, PAD_B = 40;
const WINDOW_DAYS = 90;

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}

function autoScaleY(deltas: number[]): { min: number; max: number } {
  if (!deltas.length) return { min: -1, max: 1 };
  const lo = Math.min(...deltas, 0) - 0.3;
  const hi = Math.max(...deltas, 0) + 0.3;
  return { min: Math.min(lo, -1), max: Math.max(hi, 1) };
}

export function WeightSteadyChart({ baselineKg, readings, today = new Date() }: Props) {
  const calibrating = baselineKg === null;

  const inWindow = readings.filter((r) => daysBetween(today, new Date(r.recorded_on)) <= WINDOW_DAYS);
  const deltas   = baselineKg !== null
    ? inWindow.map((r) => r.weight_kg - baselineKg)
    : [];

  const { min: yMin, max: yMax } = autoScaleY(deltas);

  function xForDate(d: Date) {
    const usable = VB_W - PAD_L - PAD_R;
    const t = 1 - daysBetween(today, d) / WINDOW_DAYS;
    return PAD_L + Math.max(0, Math.min(1, t)) * usable;
  }
  function yForDelta(delta: number) {
    const usable = VB_H - PAD_T - PAD_B;
    const t      = (delta - yMin) / (yMax - yMin);
    return PAD_T + (1 - t) * usable;
  }

  const ySteps = [yMin, 0, yMax];

  return (
    <View>
      {calibrating && (
        <View style={styles.ribbon}>
          <VirraText variant="mono" size={9} color={colors.muted}>
            CALIBRATING — {inWindow.length}/7 READINGS LOGGED
          </VirraText>
        </View>
      )}
      <Svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" height={200}>
        {ySteps.map((y, i) => (
          <Line
            key={i}
            x1={PAD_L} y1={yForDelta(y)} x2={VB_W - PAD_R} y2={yForDelta(y)}
            stroke="rgba(244,237,224,0.05)" strokeWidth={1}
          />
        ))}
        {ySteps.map((y, i) => (
          <SvgText
            key={`label-${i}`}
            x={PAD_L - 10} y={yForDelta(y) + 4}
            fill="rgba(244,237,224,0.4)" fontSize={10} fontFamily="SpaceMono_400Regular"
            textAnchor="end"
          >{y > 0 ? `+${y.toFixed(1)}` : y.toFixed(1)}</SvgText>
        ))}
        {!calibrating && (
          <>
            <Rect
              x={PAD_L} y={yForDelta(0.5)}
              width={VB_W - PAD_L - PAD_R}
              height={yForDelta(-0.5) - yForDelta(0.5)}
              fill="rgba(212,255,38,0.18)"
              stroke="rgba(212,255,38,0.4)"
              strokeWidth={1}
            />
            <Line
              x1={PAD_L} y1={yForDelta(0)} x2={VB_W - PAD_R} y2={yForDelta(0)}
              stroke="rgba(212,255,38,0.6)" strokeWidth={1} strokeDasharray="4,4"
            />
          </>
        )}
        {inWindow.map((r, i) => {
          const date    = new Date(r.recorded_on);
          const delta   = baselineKg !== null ? r.weight_kg - baselineKg : 0;
          const ageDays = daysBetween(today, date);
          const isToday = ageDays === 0;
          const recent  = ageDays <= 7;
          return (
            <Circle
              key={i}
              cx={xForDate(date)}
              cy={calibrating ? PAD_T + (VB_H - PAD_T - PAD_B) / 2 : yForDelta(delta)}
              r={isToday ? 6 : recent ? 4 : 3}
              fill={isToday ? colors.pulse : recent ? colors.pulse : 'rgba(244,237,224,0.5)'}
              stroke={isToday ? colors.breath : undefined}
              strokeWidth={isToday ? 2 : 0}
            />
          );
        })}
      </Svg>
      <View style={styles.legend}>
        <Legend swatch={<View style={[styles.swatchLine, { backgroundColor: 'rgba(212,255,38,0.6)' }]} />} label="STEADY LINE" />
        <Legend swatch={<View style={[styles.swatchBand, { backgroundColor: 'rgba(212,255,38,0.18)', borderColor: 'rgba(212,255,38,0.4)' }]} />} label="±0.5 KG BAND" />
        <Legend swatch={<View style={[styles.swatchDot, { backgroundColor: colors.pulse }]} />} label="READING" />
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
  ribbon:      { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 4, marginBottom: spacing.xs, borderRadius: radius.full, backgroundColor: 'rgba(255, 107, 61, 0.15)' },
  legend:      { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatchLine:  { width: 10, height: 1 },
  swatchBand:  { width: 10, height: 6, borderRadius: 2, borderWidth: 1 },
  swatchDot:   { width: 8, height: 8, borderRadius: 4 },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npm test -- __tests__/components/WeightSteadyChart.test.tsx`
Expected: PASS — 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/ui/WeightSteadyChart.tsx mobile/__tests__/components/WeightSteadyChart.test.tsx
git commit -m "feat(weight): add steady weight chart (line + 0.5kg band)"
```

---

## Task 9: Glance card branching

**Files:**
- Modify: `mobile/src/components/ui/WeightGlanceCard.tsx`
- Modify: `mobile/__tests__/components/WeightGlanceCard.test.tsx`
- Create: `mobile/__tests__/components/WeightGlanceCard.steady.test.tsx`

The component branches internally on `cycleProfile`. Cycle layout unchanged; steady layout added.

- [ ] **Step 1: Add a failing test for the steady variant**

`mobile/__tests__/components/WeightGlanceCard.steady.test.tsx`:
```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { WeightGlanceCard } from '@/components/ui/WeightGlanceCard';

jest.mock('@/store/profile', () => ({
  useProfileStore: (selector: any) => selector({
    trackWeight:           true,
    weightBaselineKg:      null,
    weightSteadyBaselineKg: 60.0,
  }),
}));

jest.mock('@/store/cycle', () => ({
  useCycleStore: (selector: any) => selector({
    cycleProfile: 'hormonal',
    cycleInfo:    null,
  }),
}));

describe('WeightGlanceCard (steady)', () => {
  it('renders the steady in-band state with delta and STEADY pill', () => {
    const { getByText } = render(<WeightGlanceCard latestKg={60.2} />);
    expect(getByText(/\+0.2/)).toBeTruthy();
    expect(getByText(/STEADY/i)).toBeTruthy();
    expect(getByText(/FROM YOUR STEADY BASELINE/i)).toBeTruthy();
  });

  it('renders the above-line state when delta > 0.5', () => {
    const { getByText } = render(<WeightGlanceCard latestKg={60.8} />);
    expect(getByText(/ABOVE LINE/i)).toBeTruthy();
  });

  it('renders the below-line state when delta < -0.5', () => {
    const { getByText } = render(<WeightGlanceCard latestKg={59.3} />);
    expect(getByText(/BELOW LINE/i)).toBeTruthy();
  });
});
```

Also extend `mobile/__tests__/components/WeightGlanceCard.calibrating.test.tsx` mock to add `weightSteadyBaselineKg: null` alongside `weightBaselineKg: null` — the steady-mode cycleProfile users now have two baseline columns.

Replace the existing `WeightGlanceCard.calibrating.test.tsx` profile mock:
```ts
jest.mock('@/store/profile', () => ({
  useProfileStore: (selector: any) => selector({
    trackWeight:      true,
    weightBaselineKg: null,
  }),
}));
```
With:
```ts
jest.mock('@/store/profile', () => ({
  useProfileStore: (selector: any) => selector({
    trackWeight:            true,
    weightBaselineKg:       null,
    weightSteadyBaselineKg: null,
  }),
}));
```

Add the cycleProfile to the cycle mock in that file:
```ts
jest.mock('@/store/cycle', () => ({
  useCycleStore: (selector: any) => selector({
    cycleProfile: 'natural',
    cycleInfo: { phase: 'follicular', dayOfCycle: 9, daysUntilNextPeriod: 19, cycleLength: 28 },
  }),
}));
```

Update `mobile/__tests__/components/WeightGlanceCard.test.tsx` mocks. Replace:
```ts
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
```
With:
```ts
jest.mock('@/store/profile', () => ({
  useProfileStore: (selector: any) => selector({
    trackWeight:            true,
    weightBaselineKg:       60.0,
    weightSteadyBaselineKg: null,
  }),
}));

jest.mock('@/store/cycle', () => ({
  useCycleStore: (selector: any) => selector({
    cycleProfile: 'natural',
    cycleInfo: { phase: 'luteal', dayOfCycle: 24, daysUntilNextPeriod: 5, cycleLength: 28 },
  }),
}));
```

Update `mobile/__tests__/components/WeightGlanceCard.off.test.tsx` mocks. Replace:
```ts
jest.mock('@/store/profile', () => ({
  useProfileStore: (selector: any) => selector({
    trackWeight:      false,
    weightBaselineKg: null,
  }),
}));

jest.mock('@/store/cycle', () => ({
  useCycleStore: (selector: any) => selector({ cycleInfo: null }),
}));
```
With:
```ts
jest.mock('@/store/profile', () => ({
  useProfileStore: (selector: any) => selector({
    trackWeight:            false,
    weightBaselineKg:       null,
    weightSteadyBaselineKg: null,
  }),
}));

jest.mock('@/store/cycle', () => ({
  useCycleStore: (selector: any) => selector({ cycleProfile: 'natural', cycleInfo: null }),
}));
```

- [ ] **Step 2: Run new test to verify it fails**

Run: `cd mobile && npm test -- __tests__/components/WeightGlanceCard.steady.test.tsx`
Expected: FAIL — current card renders cycle copy (`FROM YOUR FOLLICULAR BASELINE`) regardless of profile.

- [ ] **Step 3: Update the component**

Replace `mobile/src/components/ui/WeightGlanceCard.tsx` contents:
```tsx
import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from './VirraText';
import { VirraCard } from './VirraCard';
import { useProfileStore } from '@/store/profile';
import { useCycleStore } from '@/store/cycle';
import {
  EXPECTED_BAND, STEADY_BAND,
  classifyReading, classifySteady,
  type BandPosition,
} from '@/lib/weightBand';
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

const STEADY_COPY: Record<BandPosition, string> = {
  in_band: 'Within your usual daily range.',
  above:   'A touch above your steady line. One day isn\'t a trend — water, salt, or food timing can do this.',
  below:   'A touch below your steady line. If training has been heavy, check fuelling.',
};

const PHASE_LABEL: Record<CyclePhase, string> = {
  menstrual: 'MENSTRUAL', follicular: 'FOLLICULAR', ovulatory: 'OVULATORY', luteal: 'LUTEAL',
};

function cycleCopyFor(position: BandPosition, phase: CyclePhase): string {
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

function CycleMiniBand({ phase, delta }: { phase: CyclePhase; delta: number }) {
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

function SteadyMiniBand({ delta }: { delta: number }) {
  const min = -1.5, max = 1.5;
  const pct = (v: number) => Math.max(0, Math.min(1, (v - min) / (max - min)));
  const { lower, upper } = STEADY_BAND;
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
  const trackWeight       = useProfileStore((s) => s.trackWeight);
  const cycleBaseline     = useProfileStore((s) => s.weightBaselineKg);
  const steadyBaseline    = useProfileStore((s) => s.weightSteadyBaselineKg);
  const cycleProfile      = useCycleStore((s) => s.cycleProfile);
  const cycleInfo         = useCycleStore((s) => s.cycleInfo);

  if (!trackWeight) return null;
  if (latestKg === null) return null;

  const isCycleMode = cycleProfile === 'natural' || cycleProfile === 'irregular';

  if (isCycleMode) {
    const phase    = cycleInfo?.phase ?? 'follicular';
    const route    = '/(app)/cycle-detail';
    const baseline = cycleBaseline;
    if (baseline === null) {
      return (
        <Pressable onPress={() => router.push(route as any)}>
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
    const delta       = Math.round((latestKg - baseline) * 10) / 10;
    const position    = classifyReading(delta, phase);
    const statusLabel = position === 'in_band' ? 'IN BAND' : position === 'above' ? 'ABOVE BAND' : 'BELOW BAND';
    return (
      <Pressable onPress={() => router.push(route as any)}>
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
            <CycleMiniBand phase={phase} delta={delta} />
            <View style={styles.bandAxis}>
              <VirraText variant="mono" size={9} color={colors.muted}>-1 kg</VirraText>
              <VirraText variant="mono" size={9} color={colors.muted}>+3 kg</VirraText>
            </View>
          </View>
          <VirraText variant="body" size={14} color={colors.breath}>{cycleCopyFor(position, phase)}</VirraText>
        </VirraCard>
      </Pressable>
    );
  }

  // Steady mode
  const route    = '/(app)/weight';
  const baseline = steadyBaseline;
  if (baseline === null) {
    return (
      <Pressable onPress={() => router.push(route as any)}>
        <VirraCard>
          <View style={styles.row}>
            <VirraText variant="mono" size={10} color={colors.muted} style={styles.kicker}>
              WEIGHT · TODAY
            </VirraText>
            <View style={[styles.pill, { borderColor: colors.muted }]}>
              <VirraText variant="mono" size={10} color={colors.muted}>CALIBRATING</VirraText>
            </View>
          </View>
          <VirraText variant="display" size={28} color={colors.breath}>{latestKg.toFixed(1)} kg</VirraText>
          <VirraText variant="body" size={13} color={colors.muted}>
            We need ~30 days of readings before the steady line becomes reliable.
          </VirraText>
        </VirraCard>
      </Pressable>
    );
  }
  const delta       = Math.round((latestKg - baseline) * 10) / 10;
  const position    = classifySteady(delta);
  const statusLabel = position === 'in_band' ? 'STEADY' : position === 'above' ? 'ABOVE LINE' : 'BELOW LINE';
  return (
    <Pressable onPress={() => router.push(route as any)}>
      <VirraCard>
        <View style={styles.row}>
          <VirraText variant="mono" size={10} color={colors.muted} style={styles.kicker}>
            WEIGHT · TODAY
          </VirraText>
          <View style={[styles.pill, { borderColor: pillColor(position) }]}>
            <VirraText variant="mono" size={10} color={pillColor(position)}>{statusLabel}</VirraText>
          </View>
        </View>
        <VirraText variant="display" size={32} color={colors.pulse}>{formatDelta(delta)}</VirraText>
        <VirraText variant="mono" size={10} color={colors.muted} style={{ letterSpacing: 1.5 }}>
          FROM YOUR STEADY BASELINE
        </VirraText>
        <View style={styles.bandWrap}>
          <SteadyMiniBand delta={delta} />
          <View style={styles.bandAxis}>
            <VirraText variant="mono" size={9} color={colors.muted}>-1.5 kg</VirraText>
            <VirraText variant="mono" size={9} color={colors.muted}>+1.5 kg</VirraText>
          </View>
        </View>
        <VirraText variant="body" size={14} color={colors.breath}>{STEADY_COPY[position]}</VirraText>
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

- [ ] **Step 4: Run all glance tests**

Run: `cd mobile && npm test -- __tests__/components/WeightGlanceCard`
Expected: PASS — all variants green (cycle, calibrating, off, steady).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/ui/WeightGlanceCard.tsx mobile/__tests__/components/WeightGlanceCard*.test.tsx
git commit -m "feat(weight): branch glance card on cycle profile (cycle vs steady)"
```

---

## Task 10: Weight detail screen

**Files:**
- Create: `mobile/app/(app)/weight.tsx`
- Modify: `mobile/app/(app)/_layout.tsx`

Sub-menu screen for steady users, following CLAUDE.md's pattern.

- [ ] **Step 1: Create the screen**

`mobile/app/(app)/weight.tsx`:
```tsx
import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, SafeAreaView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useAuthStore } from '@/store/auth';
import { useProfileStore } from '@/store/profile';
import { supabase } from '@/lib/supabase';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { WeightSteadyChart, type WeightReading } from '@/components/ui/WeightSteadyChart';
import { AddWeightModal } from '@/components/ui/AddWeightModal';
import { classifySteady, STEADY_BAND, type BandPosition } from '@/lib/weightBand';

const REASONING: Record<BandPosition, string> = {
  in_band: 'Day-to-day weight bounces from water, food timing, and hydration. Yours is moving inside the noise band — exactly what a healthy line looks like.',
  above:   'A touch above your steady line. This happens — sodium, alcohol, GI fullness, a harder week of training. Watch what happens over the next few days.',
  below:   'A touch below your steady line. If training has been heavy, check fuelling: every 1g of glycogen stores 3g of water, so a single hard session can show as a 1+ kg dip.',
};

function formatDelta(d: number): string {
  const sign = d >= 0 ? '+' : '−';
  return `${sign}${Math.abs(d).toFixed(1)} kg`;
}

function statusLabel(pos: BandPosition): string {
  return pos === 'in_band' ? 'STEADY' : pos === 'above' ? 'ABOVE LINE' : 'BELOW LINE';
}

function pillColor(pos: BandPosition): string {
  return pos === 'in_band' ? colors.pulse : colors.dawn;
}

export default function WeightScreen() {
  const { session } = useAuthStore();
  const trackWeight    = useProfileStore((s) => s.trackWeight);
  const steadyBaseline = useProfileStore((s) => s.weightSteadyBaselineKg);

  const [readings, setReadings] = useState<WeightReading[]>([]);
  const [addOpen,  setAddOpen]  = useState(false);
  const [howOpen,  setHowOpen]  = useState(false);

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

  const latest = readings.length ? readings[readings.length - 1] : null;
  const latestKg = latest?.weight_kg ?? null;

  const calibrating = steadyBaseline === null;
  const delta = !calibrating && latestKg !== null
    ? Math.round((latestKg - steadyBaseline) * 10) / 10
    : null;
  const position = delta !== null ? classifySteady(delta) : null;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable
          style={styles.headerBtn}
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <SymbolView name="chevron.left" size={18} tintColor={colors.muted} />
        </Pressable>
        <VirraText variant="display" size={24} color={colors.pulse}>Your Weight</VirraText>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!trackWeight ? (
          <VirraCard>
            <VirraText variant="body" size={14} color={colors.breath}>
              Weight tracking is off. Turn it on in Profile → Body Metrics.
            </VirraText>
          </VirraCard>
        ) : (
          <>
            {/* Hero card */}
            <VirraCard>
              <View style={styles.row}>
                <VirraText variant="mono" size={10} color={colors.muted} style={styles.kicker}>
                  TODAY
                </VirraText>
                {position && (
                  <View style={[styles.pill, { borderColor: pillColor(position) }]}>
                    <VirraText variant="mono" size={10} color={pillColor(position)}>{statusLabel(position)}</VirraText>
                  </View>
                )}
                {!position && (
                  <View style={[styles.pill, { borderColor: colors.muted }]}>
                    <VirraText variant="mono" size={10} color={colors.muted}>CALIBRATING</VirraText>
                  </View>
                )}
              </View>
              <VirraText variant="display" size={32} color={colors.breath}>
                {latestKg !== null ? `${latestKg.toFixed(1)} kg` : '—'}
              </VirraText>
              {delta !== null && (
                <>
                  <VirraText variant="display" size={28} color={colors.pulse}>{formatDelta(delta)}</VirraText>
                  <VirraText variant="mono" size={10} color={colors.muted} style={{ letterSpacing: 1.5 }}>
                    FROM YOUR STEADY BASELINE
                  </VirraText>
                </>
              )}
            </VirraCard>

            {/* Chart card */}
            <VirraCard>
              <View style={[styles.row, { marginBottom: spacing.xs }]}>
                <VirraText variant="mono" size={10} color={colors.muted} style={styles.kicker}>
                  WEIGHT · KG FROM BASELINE
                </VirraText>
                <Pressable onPress={() => setAddOpen(true)} hitSlop={8} accessibilityRole="button">
                  <VirraText variant="mono" size={10} color={colors.pulse}>+ ADD WEIGHT</VirraText>
                </Pressable>
              </View>
              <WeightSteadyChart baselineKg={steadyBaseline} readings={readings} />
            </VirraCard>

            {/* Reasoning */}
            {position && (
              <VirraCard>
                <VirraText variant="mono" size={10} color={colors.muted} style={styles.kicker}>
                  WHAT TO EXPECT
                </VirraText>
                <VirraText variant="body" size={14} color={colors.breath} style={{ marginTop: spacing.xs }}>
                  {REASONING[position]}
                </VirraText>
              </VirraCard>
            )}

            {/* How this works */}
            <Pressable onPress={() => setHowOpen((v) => !v)} accessibilityRole="button">
              <VirraCard>
                <View style={styles.row}>
                  <VirraText variant="mono" size={10} color={colors.muted} style={styles.kicker}>
                    HOW THIS WORKS
                  </VirraText>
                  <SymbolView name={howOpen ? 'chevron.up' : 'chevron.down'} size={14} tintColor={colors.muted} />
                </View>
                {howOpen && (
                  <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
                    <VirraText variant="body" size={13} color={colors.breath}>• Your steady line is the median of your last 30 days of readings.</VirraText>
                    <VirraText variant="body" size={13} color={colors.breath}>• Daily fluctuation of ±{STEADY_BAND.upper.toFixed(1)} kg is normal noise.</VirraText>
                    <VirraText variant="body" size={13} color={colors.breath}>• Beyond the band? Look at the last few days, not just one.</VirraText>
                    <VirraText variant="body" size={13} color={colors.breath}>• We don't track streaks, goal weight, or progress towards a target.</VirraText>
                  </View>
                )}
              </VirraCard>
            </Pressable>
          </>
        )}
      </ScrollView>

      {session && (
        <AddWeightModal
          visible={addOpen}
          userId={session.user.id}
          onClose={() => setAddOpen(false)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: colors.mile },
  header:    { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  headerBtn: { width: 18, height: 32, alignItems: 'flex-start', justifyContent: 'center' },
  content:   { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  row:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker:    { letterSpacing: 1.5 },
  pill:      { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full, borderWidth: 1 },
});
```

- [ ] **Step 2: Register the route**

In `mobile/app/(app)/_layout.tsx`, find the list of `<Stack.Screen>` entries and add `weight` alongside the others (place it next to `cycle-settings` for visual grouping):

```tsx
<Stack.Screen name="weight"          options={{ presentation: 'card'  }} />
```

- [ ] **Step 3: Run tests + type check**

Run:
```bash
cd mobile && npm test && npx tsc --noEmit 2>&1 | grep -E "^(app|src|__tests__)/" | head -10
```
Expected: tests PASS, no app/src TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add 'mobile/app/(app)/weight.tsx' 'mobile/app/(app)/_layout.tsx'
git commit -m "feat(weight): add Your Weight detail screen for steady users"
```

---

## Task 11: Manual smoke test

Type checks + unit tests verify code correctness, not feature correctness. Walk the flow on the simulator.

- [ ] **Step 1: Switch Emma's cycleProfile to a non-cycle value for testing**

In the app, Profile → Cycle settings → switch to Hormonal contraception → Save. Return to Dashboard.

- [ ] **Step 2: Verify the activation flow**

- Profile → BODY METRICS toggle is OFF (Emma's was ON for the Ga test; toggle it back ON to fire the explainer fresh — note: explainer won't fire again because `weight_explainer_dismissed_at` is set from Ga testing. To re-test the explainer, run via MCP:
  ```sql
  update user_profiles set weight_explainer_dismissed_at = null
   where id = '986d6744-fb9c-4e96-aae1-b1c8a6432b5b';
  ```
- Toggle OFF → ON → explainer fires with **steady copy** ("Your weight bounces day-to-day from water…")
- "Got it" → dismisses, `weight_explainer_dismissed_at` set

- [ ] **Step 3: Verify the dashboard glance (steady mode)**

- Glance card sits below cycle hero (cycle hero will be empty/non-cycle for hormonal profile — that's correct)
- Kicker reads `WEIGHT · TODAY`
- The previously-seeded Ga readings are still in `body_weights`, so:
  - If the steady baseline was computed (after foreground), pill is `STEADY` / `ABOVE LINE` / `BELOW LINE` based on the latest reading vs steady baseline
  - If not yet computed (open the app first), pill is `CALIBRATING` with copy "We need ~30 days of readings before the steady line becomes reliable."
- Tap glance → routes to `/weight` (NOT `/cycle-detail`)

- [ ] **Step 4: Verify the weight detail screen**

- Header "Your Weight" with chevron back
- Hero card: today's reading absolute kg + delta + STEADY/ABOVE/BELOW pill (or CALIBRATING)
- Chart card: line chart with baseline line, ±0.5 kg band, dots; `+ ADD WEIGHT` link top-right
- Reasoning card with phase-keyed copy
- "How this works" tap to expand → bullet list

- [ ] **Step 5: Verify mode swap**

- Profile → Cycle settings → switch back to Regular cycle
- Dashboard glance immediately swaps to cycle framing (kicker shows phase, pill shows IN BAND/etc, copy mentions cycle)
- Tap glance → routes to `/cycle-detail`

- [ ] **Step 6: Commit any fixes**

If issues surfaced, fix and commit each as a separate small commit.

---

## Spec coverage check

| Spec section | Implementing task |
|---|---|
| 1 Architectural principles | All — opt-in / silence / delta defaults inherited from Ga; steady framing encoded in tasks 7, 9, 10 |
| 2 Out of scope | None implemented — correct |
| 3 Activation rules | Task 9 (glance branching), Task 7 (explainer mode picked by cycleProfile) |
| 4 Schema | Task 1 |
| 5 Steady baseline computation | Task 3 |
| 6 Steady band | Task 2 |
| 7 Baseline dispatcher | Task 4 |
| 8 Glance card | Task 9 |
| 9 Detail screen | Task 10 |
| 10 WeightSteadyChart | Task 8 |
| 11 First-run explainer | Task 7 |
| 12 Profile store | Task 5 |
| 13 Component branching summary | Tasks 6, 7, 9 — all callers routed via dispatcher; glance + explainer branch on profile |
| 14 Files touched | All tasks |
| 15 Data flow | Tasks 6 (dispatcher in modal + HK), 9 (glance fetches latest), 10 (detail fetches readings) |
| 16 Error handling | Tasks 3, 4 (errors propagate as before) |
| 17 Testing | Tasks 2, 3, 4, 7, 8, 9 (unit + component); Task 11 (manual) |
| 18 Risks | Task 11 (mode swap test); per-user variance / cyclic pill deferred (not in plan) |
