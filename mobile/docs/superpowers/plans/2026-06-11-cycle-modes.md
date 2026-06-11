# Cycle Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand cycle profile from 5 to 7 options, introduce Flow/Pack/Steady cycle modes, and add the hormonal contraception sub-picker — updating both the onboarding and settings screens.

**Architecture:** New `deriveCycleMode` pure function centralises mode logic; `modulateForCycle` and `modulateRunStructure` guard on mode rather than raw profile. A shared `HormonalSubPicker` component handles the type picker + placebo question inline on both screens. Three new `user_profiles` columns store contraception sub-data.

**Tech Stack:** React Native / Expo, TypeScript, Supabase (Postgres), Zustand, expo-symbols

**Spec:** `docs/superpowers/specs/2026-06-11-cycle-modes-design.md`

---

## File Map

| Action | Path | Purpose |
|---|---|---|
| Create | `supabase/migrations/020_cycle_modes.sql` | New columns + updated constraint |
| Modify | `src/lib/cycleEngine.ts` | New types + `deriveCycleMode` |
| Modify | `src/lib/cycleModulation.ts` | Mode-based guard, new params |
| Modify | `src/store/cycle.ts` | 3 new fields, Pack phase computation |
| Modify | `src/context/OnboardingContext.tsx` | 3 new fields |
| Create | `src/components/cycle/HormonalSubPicker.tsx` | Shared sub-picker component |
| Modify | `app/(onboarding)/cycle.tsx` | 7 options + inline expansions |
| Modify | `app/(onboarding)/diet.tsx` | Write new fields to Supabase on completion |
| Modify | `app/(app)/cycle-settings.tsx` | 7 options + inline expansions |
| Modify | `src/lib/todaysSession.ts` | Pass `hasPlaceboWeek` to modulation |
| Modify | `src/lib/volumePlan.ts` | Pass `hasPlaceboWeek` to modulation |
| Modify | `src/lib/baselineCalibration.ts` | Pass `hasPlaceboWeek` to modulation |
| Modify | `__tests__/lib/cycleEngine.test.ts` | Tests for `deriveCycleMode` |
| Modify | `__tests__/lib/cycleModulation.test.ts` | Update for new signature + Pack tests |

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/020_cycle_modes.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/020_cycle_modes.sql

-- Add contraception sub-data columns
alter table public.user_profiles
  add column if not exists contraception_type  text,
  add column if not exists has_placebo_week    boolean,
  add column if not exists current_pack_start  date;

-- Expand cycle_profile check constraint to include two new values.
-- Drop the old one (name from 004_cycle_profile.sql) and recreate.
alter table public.user_profiles
  drop constraint if exists user_profiles_cycle_profile_check;

alter table public.user_profiles
  add constraint user_profiles_cycle_profile_check
  check (cycle_profile in (
    'natural', 'hormonal', 'irregular',
    'perimenopause', 'menopause',
    'pregnant_postpartum', 'prefer_not_to_say'
  ));

-- Contraception type constraint (nullable — only set for hormonal profile)
alter table public.user_profiles
  add constraint user_profiles_contraception_type_check
  check (contraception_type in (
    'combined_pill', 'ring', 'patch',
    'mini_pill', 'hormonal_iud', 'implant',
    'injection', 'other'
  ) or contraception_type is null);
```

- [ ] **Step 2: Apply via Supabase MCP**

Use the Supabase MCP tool to run the migration SQL directly against the project (`elebuieojodsjmghwjub`). Verify no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/020_cycle_modes.sql
git commit -m "feat(db): add cycle modes columns and expand cycle_profile constraint"
```

---

## Task 2: Types and `deriveCycleMode` (TDD)

**Files:**
- Modify: `src/lib/cycleEngine.ts`
- Modify: `__tests__/lib/cycleEngine.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `__tests__/lib/cycleEngine.test.ts`:

```ts
import { getCyclePhase, deriveCycleMode } from '@/lib/cycleEngine';

// ... existing getCyclePhase tests unchanged ...

describe('deriveCycleMode', () => {
  test('natural → flow', () => {
    expect(deriveCycleMode('natural', null)).toBe('flow');
  });
  test('irregular → flow', () => {
    expect(deriveCycleMode('irregular', null)).toBe('flow');
  });
  test('hormonal + has_placebo_week true → pack', () => {
    expect(deriveCycleMode('hormonal', true)).toBe('pack');
  });
  test('hormonal + has_placebo_week false → steady', () => {
    expect(deriveCycleMode('hormonal', false)).toBe('steady');
  });
  test('hormonal + has_placebo_week null → steady', () => {
    expect(deriveCycleMode('hormonal', null)).toBe('steady');
  });
  test('perimenopause → steady', () => {
    expect(deriveCycleMode('perimenopause', null)).toBe('steady');
  });
  test('menopause → steady', () => {
    expect(deriveCycleMode('menopause', null)).toBe('steady');
  });
  test('pregnant_postpartum → steady', () => {
    expect(deriveCycleMode('pregnant_postpartum', null)).toBe('steady');
  });
  test('prefer_not_to_say → steady', () => {
    expect(deriveCycleMode('prefer_not_to_say', null)).toBe('steady');
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd mobile && npx jest __tests__/lib/cycleEngine.test.ts --no-coverage
```

Expected: FAIL — `deriveCycleMode is not a function`

- [ ] **Step 3: Update `src/lib/cycleEngine.ts`**

Replace the entire file:

```ts
export type CyclePhase = 'menstrual' | 'follicular' | 'ovulatory' | 'luteal';

export type CycleProfile =
  | 'natural' | 'hormonal' | 'irregular'
  | 'perimenopause' | 'menopause'
  | 'pregnant_postpartum' | 'prefer_not_to_say';

export type CycleMode = 'flow' | 'pack' | 'steady';

export type ContraceptionType =
  | 'combined_pill' | 'ring' | 'patch'
  | 'mini_pill' | 'hormonal_iud' | 'implant'
  | 'injection' | 'other';

export interface CycleInfo {
  phase:               CyclePhase;
  dayOfCycle:          number;
  daysUntilNextPeriod: number;
  cycleLength:         number;
}

const MENSTRUAL_DAYS   = 5;
const OVULATORY_WINDOW = 1;
const MS_PER_DAY       = 1000 * 60 * 60 * 24;

function toMidnight(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function getCycleInfo(
  periodStart: Date,
  cycleLength: number,
  today: Date = new Date(),
): CycleInfo {
  const start      = toMidnight(periodStart);
  const now        = toMidnight(today);
  const elapsed    = Math.floor((now.getTime() - start.getTime()) / MS_PER_DAY);
  const dayOfCycle = (elapsed % cycleLength) + 1;
  const ovulation  = cycleLength - 14;

  let phase: CyclePhase;
  if (dayOfCycle <= MENSTRUAL_DAYS) {
    phase = 'menstrual';
  } else if (dayOfCycle >= ovulation - OVULATORY_WINDOW && dayOfCycle <= ovulation + OVULATORY_WINDOW) {
    phase = 'ovulatory';
  } else if (dayOfCycle < ovulation - OVULATORY_WINDOW) {
    phase = 'follicular';
  } else {
    phase = 'luteal';
  }

  return {
    phase,
    dayOfCycle,
    daysUntilNextPeriod: cycleLength - dayOfCycle + 1,
    cycleLength,
  };
}

export function getCyclePhase(
  periodStart: Date,
  cycleLength: number,
  today: Date = new Date(),
): CyclePhase {
  return getCycleInfo(periodStart, cycleLength, today).phase;
}

export function deriveCycleMode(
  profile: CycleProfile,
  hasPlaceboWeek: boolean | null,
): CycleMode {
  if (profile === 'natural' || profile === 'irregular') return 'flow';
  if (profile === 'hormonal' && hasPlaceboWeek === true) return 'pack';
  return 'steady';
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx jest __tests__/lib/cycleEngine.test.ts --no-coverage
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/cycleEngine.ts __tests__/lib/cycleEngine.test.ts
git commit -m "feat(cycle): add CycleMode, ContraceptionType, deriveCycleMode"
```

---

## Task 3: Update `cycleModulation` for mode-based guard (TDD)

**Files:**
- Modify: `src/lib/cycleModulation.ts`
- Modify: `__tests__/lib/cycleModulation.test.ts`

- [ ] **Step 1: Update failing tests**

In `__tests__/lib/cycleModulation.test.ts`, update the existing `modulateForCycle` tests to pass the new `hasPlaceboWeek` parameter, and add Pack mode tests:

```ts
import { modulateForCycle, anchorKeySession } from '@/lib/cycleModulation';

const baseTempo = { pace_seconds_per_km: 275, intensity_label: 'Threshold' };

describe('modulateForCycle', () => {
  test('tempo in luteal slows the pace and surfaces a reason', () => {
    const r = modulateForCycle(baseTempo, 'tempo', 'luteal', 'natural', null);
    expect(r.adjusted_target.pace_seconds_per_km).toBeGreaterThan(275);
    expect(r.adjusted_target.pace_seconds_per_km).toBeLessThan(295);
    expect(r.reason).toContain('Luteal');
    expect(r.source_cycle_phase).toBe('luteal');
  });

  test('tempo in follicular is baseline (no modulation)', () => {
    const r = modulateForCycle(baseTempo, 'tempo', 'follicular', 'natural', null);
    expect(r.adjusted_target.pace_seconds_per_km).toBe(275);
    expect(r.reason).toBeNull();
    expect(r.source_cycle_phase).toBe('follicular');
  });

  test('tempo in ovulatory speeds up slightly (peak power)', () => {
    const r = modulateForCycle(baseTempo, 'tempo', 'ovulatory', 'natural', null);
    expect(r.adjusted_target.pace_seconds_per_km).toBeLessThan(275);
    expect(r.reason).toContain('peak power');
  });

  test('hormonal + no placebo week → steady, bypasses modulation', () => {
    const r = modulateForCycle(baseTempo, 'tempo', 'luteal', 'hormonal', false);
    expect(r.adjusted_target.pace_seconds_per_km).toBe(275);
    expect(r.reason).toBeNull();
    expect(r.source_cycle_phase).toBeNull();
  });

  test('hormonal + null placebo week → steady (legacy / unanswered)', () => {
    const r = modulateForCycle(baseTempo, 'tempo', 'luteal', 'hormonal', null);
    expect(r.adjusted_target.pace_seconds_per_km).toBe(275);
    expect(r.reason).toBeNull();
  });

  test('hormonal + has_placebo_week true → pack, applies full modulation', () => {
    const r = modulateForCycle(baseTempo, 'tempo', 'luteal', 'hormonal', true);
    expect(r.adjusted_target.pace_seconds_per_km).toBeGreaterThan(275);
    expect(r.reason).toContain('Luteal');
    expect(r.source_cycle_phase).toBe('luteal');
  });

  test('pregnant_postpartum → steady, bypasses modulation', () => {
    const r = modulateForCycle(baseTempo, 'tempo', 'luteal', 'pregnant_postpartum', null);
    expect(r.adjusted_target.pace_seconds_per_km).toBe(275);
    expect(r.reason).toBeNull();
  });

  test('prefer_not_to_say → steady, bypasses modulation', () => {
    const r = modulateForCycle(baseTempo, 'tempo', 'luteal', 'prefer_not_to_say', null);
    expect(r.adjusted_target.pace_seconds_per_km).toBe(275);
    expect(r.reason).toBeNull();
  });

  test('menopause → steady, bypasses modulation entirely', () => {
    const r = modulateForCycle(baseTempo, 'tempo', 'luteal', 'menopause', null);
    expect(r.reason).toBeNull();
  });

  test('irregular cycle profile uses conservative half-magnitude modifiers', () => {
    const luteal_natural   = modulateForCycle(baseTempo, 'tempo', 'luteal', 'natural', null);
    const luteal_irregular = modulateForCycle(baseTempo, 'tempo', 'luteal', 'irregular', null);
    const natural_delta    = luteal_natural.adjusted_target.pace_seconds_per_km!   - 275;
    const irregular_delta  = luteal_irregular.adjusted_target.pace_seconds_per_km! - 275;
    expect(irregular_delta).toBeLessThan(natural_delta);
    expect(irregular_delta).toBeGreaterThan(0);
    expect(luteal_irregular.reason).toContain('estimated');
  });

  test('long run in menstrual gets walk-friendly slower pace', () => {
    const baseLong = { pace_seconds_per_km: 330, intensity_label: 'Easy long' };
    const r = modulateForCycle(baseLong, 'long', 'menstrual', 'natural', null);
    expect(r.adjusted_target.pace_seconds_per_km).toBeGreaterThan(330);
    expect(r.reason).toContain('walk');
  });
});
```

Keep the `anchorKeySession` tests unchanged (no signature change).

- [ ] **Step 2: Run tests — expect failure**

```bash
npx jest __tests__/lib/cycleModulation.test.ts --no-coverage
```

Expected: FAIL — wrong number of arguments

- [ ] **Step 3: Update `src/lib/cycleModulation.ts`**

Replace only the `modulateForCycle` and `modulateRunStructure` function signatures and their guards. The MATRIX, `applyModifier`, `conservativeReason`, `anchorKeySession`, `shouldAnchorKeySession`, and `ANCHOR_RANK` are unchanged.

At the top of the file, add the import:
```ts
import { deriveCycleMode, type CyclePhase, type CycleProfile } from './cycleEngine';
```
(Remove the old `type CyclePhase, type CycleProfile` import from `@/store/cycle` if present — cycleEngine is now the canonical source.)

Replace `modulateForCycle`:
```ts
export function modulateForCycle(
  base_target:      SessionPaceTarget,
  session_type:     SessionType,
  cycle_phase:      CyclePhase | null,
  cycle_profile:    CycleProfile,
  has_placebo_week: boolean | null = null,
): ModulationResult {
  const mode = deriveCycleMode(cycle_profile, has_placebo_week);
  if (mode === 'steady') {
    return { adjusted_target: base_target, reason: null, source_cycle_phase: null };
  }
  if (!cycle_phase) {
    return { adjusted_target: base_target, reason: null, source_cycle_phase: null };
  }

  const mod = MATRIX[session_type]?.[cycle_phase];
  if (!mod) {
    return { adjusted_target: base_target, reason: null, source_cycle_phase: cycle_phase };
  }

  const effectiveMod: PaceModifier = cycle_profile === 'irregular'
    ? {
        ...mod,
        pace_delta_pct:      mod.pace_delta_pct      !== undefined ? mod.pace_delta_pct      / 2 : undefined,
        intensity_delta_pct: mod.intensity_delta_pct !== undefined ? mod.intensity_delta_pct / 2 : undefined,
        reason:              conservativeReason(mod.reason),
      }
    : mod;

  const adjusted = applyModifier(base_target, effectiveMod);

  return {
    adjusted_target:    adjusted,
    reason:             effectiveMod.reason,
    source_cycle_phase: cycle_phase,
  };
}
```

Replace `modulateRunStructure` signature only (body unchanged):
```ts
export function modulateRunStructure(
  structure:        RunWorkoutStructure,
  phase:            CyclePhase | null,
  profile:          CycleProfile | null,
  hasPlaceboWeek:   boolean | null = null,
): { adjusted: RunWorkoutStructure; reason: string | null } {
  let firstReason: string | null = null;
  const effectiveProfile: CycleProfile = profile ?? 'natural';
  // ... rest of body unchanged, but update the internal modulateForCycle call:
  // was: modulateForCycle({ pace_seconds_per_km: pace, ... }, sessionType, phase, effectiveProfile)
  // now: modulateForCycle({ pace_seconds_per_km: pace, ... }, sessionType, phase, effectiveProfile, hasPlaceboWeek)
```

Inside `modulateRunStructure`, find the internal call to `modulateForCycle` and add `hasPlaceboWeek` as the last argument:
```ts
    const r = modulateForCycle(
      { pace_seconds_per_km: pace, intensity_label: step.label ?? step.kind },
      sessionType,
      phase,
      effectiveProfile,
      hasPlaceboWeek,
    );
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx jest __tests__/lib/cycleModulation.test.ts --no-coverage
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/cycleModulation.ts __tests__/lib/cycleModulation.test.ts
git commit -m "feat(cycle): mode-based modulation guard, Pack mode full modulation"
```

---

## Task 4: Update Zustand cycle store

**Files:**
- Modify: `src/store/cycle.ts`

- [ ] **Step 1: Replace `src/store/cycle.ts`**

```ts
import { create } from 'zustand';
import {
  getCycleInfo,
  deriveCycleMode,
  type CyclePhase,
  type CycleInfo,
  type CycleProfile,
  type CycleMode,
  type ContraceptionType,
} from '@/lib/cycleEngine';
import { supabase } from '@/lib/supabase';

interface CycleState {
  cycleProfile:     CycleProfile;
  periodStart:      Date | null;
  cycleLength:      number;
  cycleInfo:        CycleInfo | null;
  cycleMode:        CycleMode;
  contraceptionType: ContraceptionType | null;
  hasPlaceboWeek:   boolean | null;
  currentPackStart: Date | null;
  setCycleProfile:      (profile: CycleProfile) => void;
  setPeriodStart:       (date: Date, today?: Date) => void;
  setCycleLength:       (length: number, today?: Date) => void;
  setHormonalSubData:   (patch: { contraceptionType: ContraceptionType; hasPlaceboWeek: boolean | null; currentPackStart: Date | null }) => void;
  refreshPhase:         (today?: Date) => void;
  loadFromSupabase:     (userId: string, today?: Date) => Promise<void>;
}

function computeForProfile(
  profile:         CycleProfile,
  hasPlaceboWeek:  boolean | null,
  periodStart:     Date | null,
  currentPackStart: Date | null,
  cycleLength:     number,
  today:           Date,
): CycleInfo | null {
  const mode = deriveCycleMode(profile, hasPlaceboWeek);
  if (mode === 'pack') {
    if (!currentPackStart) return null;
    return getCycleInfo(currentPackStart, cycleLength, today);
  }
  if (mode === 'flow') {
    if (!periodStart) return null;
    return getCycleInfo(periodStart, cycleLength, today);
  }
  return null; // steady
}

export const useCycleStore = create<CycleState>((set, get) => ({
  cycleProfile:      'natural',
  periodStart:       null,
  cycleLength:       28,
  cycleInfo:         null,
  cycleMode:         'flow',
  contraceptionType: null,
  hasPlaceboWeek:    null,
  currentPackStart:  null,

  setCycleProfile: (profile) =>
    set((s) => {
      const mode = deriveCycleMode(profile, s.hasPlaceboWeek);
      // Clear hormonal sub-data when switching away from hormonal
      const clearSub = profile !== 'hormonal'
        ? { contraceptionType: null as ContraceptionType | null, hasPlaceboWeek: null as boolean | null, currentPackStart: null as Date | null }
        : {};
      const cycleInfo = computeForProfile(
        profile,
        profile === 'hormonal' ? s.hasPlaceboWeek : null,
        s.periodStart,
        profile === 'hormonal' ? s.currentPackStart : null,
        s.cycleLength,
        new Date(),
      );
      return { cycleProfile: profile, cycleMode: mode, cycleInfo, ...clearSub };
    }),

  setHormonalSubData: ({ contraceptionType, hasPlaceboWeek, currentPackStart }) =>
    set((s) => {
      const mode = deriveCycleMode(s.cycleProfile, hasPlaceboWeek);
      const cycleInfo = computeForProfile(s.cycleProfile, hasPlaceboWeek, s.periodStart, currentPackStart, s.cycleLength, new Date());
      return { contraceptionType, hasPlaceboWeek, currentPackStart, cycleMode: mode, cycleInfo };
    }),

  setPeriodStart: (date, today = new Date()) =>
    set((s) => ({
      periodStart: date,
      cycleInfo:   computeForProfile(s.cycleProfile, s.hasPlaceboWeek, date, s.currentPackStart, s.cycleLength, today),
    })),

  setCycleLength: (length, today = new Date()) =>
    set((s) => ({
      cycleLength: length,
      cycleInfo:   computeForProfile(s.cycleProfile, s.hasPlaceboWeek, s.periodStart, s.currentPackStart, length, today),
    })),

  refreshPhase: (today = new Date()) =>
    set((s) => ({
      cycleInfo: computeForProfile(s.cycleProfile, s.hasPlaceboWeek, s.periodStart, s.currentPackStart, s.cycleLength, today),
    })),

  loadFromSupabase: async (userId, today = new Date()) => {
    const [cycleRes, profileRes] = await Promise.all([
      supabase
        .from('cycle_logs')
        .select('period_start, cycle_length_days')
        .eq('user_id', userId)
        .order('period_start', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('user_profiles')
        .select('cycle_profile, contraception_type, has_placebo_week, current_pack_start')
        .eq('id', userId)
        .maybeSingle(),
    ]);

    const cycleProfile      = (profileRes.data?.cycle_profile      as CycleProfile      | undefined) ?? 'natural';
    const contraceptionType = (profileRes.data?.contraception_type as ContraceptionType | undefined) ?? null;
    const hasPlaceboWeek    = profileRes.data?.has_placebo_week   ?? null;
    const currentPackStart  = profileRes.data?.current_pack_start
      ? new Date(profileRes.data.current_pack_start)
      : null;

    const cycleMode = deriveCycleMode(cycleProfile, hasPlaceboWeek);

    const periodStart = cycleRes.data ? new Date(cycleRes.data.period_start) : null;
    const cycleLength = cycleRes.data?.cycle_length_days ?? 28;

    const cycleInfo = computeForProfile(cycleProfile, hasPlaceboWeek, periodStart, currentPackStart, cycleLength, today);

    set({ cycleProfile, contraceptionType, hasPlaceboWeek, currentPackStart, cycleMode, periodStart, cycleLength, cycleInfo });
  },
}));

export type { CyclePhase, CycleInfo, CycleProfile, CycleMode, ContraceptionType };
```

- [ ] **Step 2: Run existing cycle store tests**

```bash
npx jest __tests__/store/cycle.test.ts --no-coverage
```

Expected: PASS (the tests use `natural` profile; `computeForProfile` returns the same result as before for Flow mode).

If any test fails, check whether it directly called `setCycleProfile` and verify the new `clearSub` logic doesn't affect the tested scenario.

- [ ] **Step 3: Commit**

```bash
git add src/store/cycle.ts
git commit -m "feat(store): cycle store — three new hormonal sub-fields, Pack phase computation"
```

---

## Task 5: Update call sites for `hasPlaceboWeek`

**Files:**
- Modify: `src/lib/todaysSession.ts`
- Modify: `src/lib/volumePlan.ts`
- Modify: `src/lib/baselineCalibration.ts`

- [ ] **Step 1: Update `src/lib/todaysSession.ts`**

At line ~151, add `hasPlaceboWeek` alongside the existing `cycleProfile` read:

```ts
const cycleState     = useCycleStore.getState();
const cyclePhase     = cycleState.cycleInfo?.phase ?? null;
const cycleProfile   = cycleState.cycleProfile;
const hasPlaceboWeek = cycleState.hasPlaceboWeek;  // add this line
```

Then update the three `modulateForCycle` / `modulateRunStructure` calls in the same file to pass `hasPlaceboWeek`:

```ts
// ~line 171
const result = modulateForCycle(baseTarget, sessionType, cyclePhase, cycleProfile, hasPlaceboWeek);

// ~line 187
const result = modulateForCycle(baseTarget, sessionType, cyclePhase, cycleProfile, hasPlaceboWeek);

// ~line 198
const modulated = modulateRunStructure(hydratedRun, cyclePhase, cycleProfile, hasPlaceboWeek).adjusted;
```

- [ ] **Step 2: Update `src/lib/volumePlan.ts`**

`getDaySessionDetail` at ~line 481 — add `has_placebo_week` to its parameter list:

```ts
export async function getDaySessionDetail(
  userId:           string,
  dateISO:          string,
  cycleStore:       { periodStart: Date | null; cycleLength: number; phase: CyclePhase | null },
  cycle_profile:    CycleProfile = 'natural',
  has_placebo_week: boolean | null = null,
): Promise<DayDetail> {
```

Then update the two `modulateForCycle` calls in this function (~lines 664 and 705) and the `modulateRunStructure` call (~line 677) to pass `has_placebo_week`:

```ts
const cycle_modulation = modulateForCycle(
  run_base_target,
  run_session_type,
  phaseForDate,
  cycle_profile,
  has_placebo_week,
);
```

```ts
? modulateRunStructure(structure, phaseForDate, cycle_profile, has_placebo_week).adjusted
```

The only caller is `src/components/ui/SessionDetailModal.tsx` (lines 85 and 98). In that file, add `hasPlaceboWeek` alongside the existing `cycleProfile` selector:

```ts
// SessionDetailModal.tsx — add this line next to the existing cycleProfile selector (~line 81):
const cycleProfile   = useCycleStore((s) => s.cycleProfile);
const hasPlaceboWeek = useCycleStore((s) => s.hasPlaceboWeek);  // add

// Then update both call sites (~lines 85 and 98):
getDaySessionDetail(userId, date, cycleStore, cycleProfile, hasPlaceboWeek)
```

- [ ] **Step 3: Update `src/lib/baselineCalibration.ts`**

Add `hasPlaceboWeek` to `DetectParams`:

```ts
export interface DetectParams {
  samples:             CompletedRunSample[];
  currentBaseline:     number;
  cycleProfile:        CycleProfile | null;
  hasPlaceboWeek:      boolean | null;      // add this line
  today:               string;
  lastAssessmentDate:  string | null;
  snoozedUntil:        string | null;
  breaks:              { start: string; end: string }[];
  hasUpcomingRuns?:    boolean;
  config?:             Partial<DetectConfig>;
}
```

In the body of the detection function, find the `modulateRunStructure` call (~line 46) and pass `hasPlaceboWeek`:

```ts
const { adjusted } = modulateRunStructure(structure, phase, profile, params.hasPlaceboWeek ?? null);
```

The caller is `src/hooks/useFitnessUpdate.ts` (~line 109). In that file, add `hasPlaceboWeek` alongside `cycleProfile`:

```ts
// useFitnessUpdate.ts — add next to existing cycleProfile selector (~line 17):
const cycleProfile   = useCycleStore((s) => s.cycleProfile);
const hasPlaceboWeek = useCycleStore((s) => s.hasPlaceboWeek);  // add

// Then add to the params object (~line 109):
cycleProfile,
hasPlaceboWeek,   // add
```

- [ ] **Step 4: Run all tests**

```bash
npx jest --no-coverage
```

Expected: all PASS. Fix any TypeScript errors surfaced by the signature changes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/todaysSession.ts src/lib/volumePlan.ts src/lib/baselineCalibration.ts src/hooks/useFitnessUpdate.ts src/components/ui/SessionDetailModal.tsx
git commit -m "feat(cycle): thread hasPlaceboWeek through all modulation call sites"
```

---

## Task 6: `HormonalSubPicker` component

**Files:**
- Create: `src/components/cycle/HormonalSubPicker.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/cycle/HormonalSubPicker.tsx
import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import type { ContraceptionType } from '@/lib/cycleEngine';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const CONTRACEPTION_TYPES: { value: ContraceptionType; label: string; sub: string }[] = [
  { value: 'combined_pill', label: 'Combined pill',    sub: 'Estrogen + progestin'        },
  { value: 'ring',          label: 'Vaginal ring',     sub: 'NuvaRing, Annovera'          },
  { value: 'patch',         label: 'Patch',            sub: 'Evra / transdermal'          },
  { value: 'mini_pill',     label: 'Mini-pill',        sub: 'Progestin-only (POP)'        },
  { value: 'hormonal_iud',  label: 'Hormonal IUD',     sub: 'Mirena, Kyleena, Jaydess'   },
  { value: 'implant',       label: 'Implant',          sub: 'Nexplanon, Implanon'         },
  { value: 'injection',     label: 'Injection',        sub: 'Depo-Provera'               },
  { value: 'other',         label: 'Other or not sure', sub: 'We\'ll keep your guidance general' },
];

const PLACEBO_TYPES: ContraceptionType[] = ['combined_pill', 'ring', 'patch'];

function formatDate(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

interface Props {
  contraceptionType:  ContraceptionType | null;
  hasPlaceboWeek:     boolean | null;
  currentPackStart:   Date | null;
  onCopperIUDEscape:  () => void;
  onChange: (patch: {
    contraceptionType: ContraceptionType;
    hasPlaceboWeek:    boolean | null;
    currentPackStart:  Date | null;
  }) => void;
}

export function HormonalSubPicker({
  contraceptionType,
  hasPlaceboWeek,
  currentPackStart,
  onCopperIUDEscape,
  onChange,
}: Props) {
  const showsPlacebo = contraceptionType != null && PLACEBO_TYPES.includes(contraceptionType);

  function selectType(type: ContraceptionType) {
    const needsPlacebo = PLACEBO_TYPES.includes(type);
    onChange({
      contraceptionType: type,
      hasPlaceboWeek:    needsPlacebo ? hasPlaceboWeek : null,
      currentPackStart:  needsPlacebo && hasPlaceboWeek ? (currentPackStart ?? new Date(Date.now() - 14 * MS_PER_DAY)) : null,
    });
  }

  function selectPlacebo(value: boolean) {
    const defaultStart = new Date(Date.now() - 14 * MS_PER_DAY);
    onChange({
      contraceptionType: contraceptionType!,
      hasPlaceboWeek:    value,
      currentPackStart:  value ? (currentPackStart ?? defaultStart) : null,
    });
  }

  function shiftPackDate(days: number) {
    const base = currentPackStart ?? new Date(Date.now() - 14 * MS_PER_DAY);
    const next = new Date(base.getTime() + days * MS_PER_DAY);
    if (next > new Date()) return;
    onChange({ contraceptionType: contraceptionType!, hasPlaceboWeek: true, currentPackStart: next });
  }

  return (
    <View style={s.container}>
      <VirraText variant="mono" size={9} color={colors.pulse} style={s.sectionLabel}>
        WHICH TYPE?
      </VirraText>

      {CONTRACEPTION_TYPES.map((opt) => {
        const active = contraceptionType === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => selectType(opt.value)}
            style={[s.typeOption, active && s.typeOptionActive]}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
          >
            <VirraText variant="bodyMedium" size={13} color={active ? colors.pulse : colors.breath}>
              {opt.label}
            </VirraText>
            <VirraText variant="body" size={10} color="rgba(244,237,224,0.4)">
              {opt.sub}
            </VirraText>
          </Pressable>
        );
      })}

      {showsPlacebo && (
        <View style={s.subSection}>
          <View style={s.divider} />
          <VirraText variant="bodyMedium" size={13} color={colors.breath} style={s.placeboQ}>
            Do you take a pill-free week each cycle?
          </VirraText>
          {[
            { value: true,  label: 'Yes — I take a break each cycle' },
            { value: false, label: 'No, I take it continuously'       },
          ].map((opt) => {
            const active = hasPlaceboWeek === opt.value;
            return (
              <Pressable
                key={String(opt.value)}
                onPress={() => selectPlacebo(opt.value)}
                style={[s.typeOption, active && s.typeOptionActive]}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <VirraText variant="bodyMedium" size={13} color={active ? colors.pulse : colors.breath}>
                  {opt.label}
                </VirraText>
              </Pressable>
            );
          })}

          {hasPlaceboWeek === true && (
            <View style={s.packDateSection}>
              <VirraText variant="mono" size={9} color="rgba(212,255,38,0.6)" style={s.sectionLabel}>
                CURRENT PACK START DATE
              </VirraText>
              <View style={s.datePicker}>
                <Pressable onPress={() => shiftPackDate(-1)} style={s.dateBtn} hitSlop={12}>
                  <VirraText variant="display" size={22} color={colors.breath}>←</VirraText>
                </Pressable>
                <VirraText variant="bodyMedium" size={15} color={colors.breath} style={s.dateText}>
                  {formatDate(currentPackStart ?? new Date(Date.now() - 14 * MS_PER_DAY))}
                </VirraText>
                <Pressable onPress={() => shiftPackDate(1)} style={s.dateBtn} hitSlop={12}>
                  <VirraText variant="display" size={22} color={colors.breath}>→</VirraText>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      )}

      <Pressable onPress={onCopperIUDEscape} style={s.copperLink} hitSlop={8}>
        <VirraText variant="body" size={11} color="rgba(244,237,224,0.35)" style={s.copperText}>
          Actually, I have a copper IUD →
        </VirraText>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  container:       { gap: spacing.sm, padding: spacing.sm, backgroundColor: 'rgba(212,255,38,0.05)', borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(212,255,38,0.18)' },
  sectionLabel:    { letterSpacing: 2, marginBottom: 2 },
  typeOption:      { padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mist, gap: 2 },
  typeOptionActive:{ borderColor: colors.pulse, backgroundColor: 'rgba(212,255,38,0.08)' },
  subSection:      { gap: spacing.sm },
  divider:         { height: 1, backgroundColor: 'rgba(244,237,224,0.07)' },
  placeboQ:        { lineHeight: 20 },
  packDateSection: { gap: spacing.xs },
  datePicker:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.mist, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  dateBtn:         { width: 36, alignItems: 'center' },
  dateText:        { flex: 1, textAlign: 'center' },
  copperLink:      { alignItems: 'center', paddingTop: spacing.xs },
  copperText:      { textDecorationLine: 'underline' },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/components/cycle/HormonalSubPicker.tsx
git commit -m "feat(ui): HormonalSubPicker — type picker, placebo question, pack start date"
```

---

## Task 7: Update `OnboardingContext`

**Files:**
- Modify: `src/context/OnboardingContext.tsx`

- [ ] **Step 1: Update the file**

```tsx
import React, { createContext, useContext, useState } from 'react';
import type { FitnessLevel, WeeklyMileageBracket } from '@/lib/healthKitOnboarding';
import type { CycleProfile, ContraceptionType } from '@/lib/cycleEngine';

export type RunningGoal = '5k' | '10k' | 'half_marathon' | 'marathon' | 'general';

interface OnboardingData {
  firstName:         string;
  lastName:          string;
  localAvatarUri:    string | null;
  fitnessLevel:      FitnessLevel | null;
  weeklyMileage:     WeeklyMileageBracket | null;
  fiveKTime:         string;
  runningGoal:       RunningGoal | null;
  cycleProfile:      CycleProfile;
  periodStart:       Date | null;
  cycleLength:       number;
  contraceptionType: ContraceptionType | null;
  hasPlaceboWeek:    boolean | null;
  currentPackStart:  Date | null;
}

interface OnboardingContextValue {
  currentStep: number;
  setStep:     (step: number) => void;
  data:        OnboardingData;
  setData:     (patch: Partial<OnboardingData>) => void;
}

const defaultData: OnboardingData = {
  firstName:         '',
  lastName:          '',
  localAvatarUri:    null,
  fitnessLevel:      null,
  weeklyMileage:     null,
  fiveKTime:         '',
  runningGoal:       null,
  cycleProfile:      'natural',
  periodStart:       null,
  cycleLength:       28,
  contraceptionType: null,
  hasPlaceboWeek:    null,
  currentPackStart:  null,
};

const OnboardingContext = createContext<OnboardingContextValue>({
  currentStep: 1,
  setStep:     () => {},
  data:        defaultData,
  setData:     () => {},
});

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [currentStep, setStep] = useState(1);
  const [data, setDataState]   = useState<OnboardingData>(defaultData);

  function setData(patch: Partial<OnboardingData>) {
    setDataState((prev) => ({ ...prev, ...patch }));
  }

  return (
    <OnboardingContext.Provider value={{ currentStep, setStep, data, setData }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  return useContext(OnboardingContext);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/context/OnboardingContext.tsx
git commit -m "feat(onboarding): add contraceptionType, hasPlaceboWeek, currentPackStart to context"
```

---

## Task 8: Update onboarding cycle screen

**Files:**
- Modify: `app/(onboarding)/cycle.tsx`

- [ ] **Step 1: Replace `app/(onboarding)/cycle.tsx`**

```tsx
import React, { useState, useEffect } from 'react';
import { View, Pressable, StyleSheet, ScrollView, Linking } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { HormonalSubPicker } from '@/components/cycle/HormonalSubPicker';
import { useOnboarding } from '@/context/OnboardingContext';
import { fetchHKCycleData } from '@/lib/healthKitOnboarding';
import type { CycleProfile, ContraceptionType } from '@/lib/cycleEngine';

const MS_PER_DAY    = 24 * 60 * 60 * 1000;
const DEFAULT_CYCLE = 28;

function defaultPeriodStart() {
  return new Date(Date.now() - DEFAULT_CYCLE * MS_PER_DAY);
}

function formatDate(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

const CYCLE_PROFILES: { value: CycleProfile; label: string; sub: string; redsLink?: boolean }[] = [
  { value: 'natural',             label: 'Regular cycle',           sub: 'I can roughly predict it'                },
  { value: 'hormonal',            label: 'Hormonal contraception',  sub: 'Pill, IUD, implant, patch'              },
  { value: 'irregular',           label: 'Irregular cycle',         sub: 'Unpredictable or recently changed', redsLink: true },
  { value: 'pregnant_postpartum', label: 'Pregnant or postpartum',  sub: 'In the last 12 months'                 },
  { value: 'perimenopause',       label: 'Perimenopause',           sub: 'Cycles changing or stopping'           },
  { value: 'menopause',           label: 'Menopause',               sub: 'No period for 12+ months'              },
  { value: 'prefer_not_to_say',   label: 'Prefer not to say',       sub: 'Set this up later'                     },
];

const STEADY_NOTE: Partial<Record<CycleProfile, string>> = {
  hormonal:           'Your targets are based on training load — the same science, without cycle phase modulation.',
  perimenopause:      'Your targets are based on training load. Symptom logging is available throughout.',
  menopause:          'Your targets are based on training load. Symptom logging is available throughout.',
  prefer_not_to_say:  'Your targets are based on training load. You can update this at any time in your profile.',
};

const REDS_URL = 'https://virra.app/advice/reds'; // update to real article slug when published

export default function CycleScreen() {
  const { setStep, setData } = useOnboarding();
  useFocusEffect(React.useCallback(() => { setStep(6); }, [setStep]));

  const [cycleProfile,      setCycleProfile]      = useState<CycleProfile>('natural');
  const [periodStart,       setPeriodStart]        = useState<Date>(defaultPeriodStart);
  const [cycleLength,       setCycleLength]        = useState(DEFAULT_CYCLE);
  const [contraceptionType, setContraceptionType]  = useState<ContraceptionType | null>(null);
  const [hasPlaceboWeek,    setHasPlaceboWeek]     = useState<boolean | null>(null);
  const [currentPackStart,  setCurrentPackStart]   = useState<Date | null>(null);
  const [hkBadges,          setHkBadges]           = useState<Set<string>>(new Set());

  const showDatePickers = cycleProfile === 'natural' || cycleProfile === 'irregular';

  useEffect(() => {
    fetchHKCycleData().then((hk) => {
      const badges = new Set<string>();
      if (hk.lastPeriodStart)      { setPeriodStart(hk.lastPeriodStart); badges.add('date'); }
      if (hk.estimatedCycleLength) { setCycleLength(hk.estimatedCycleLength); badges.add('length'); }
      setHkBadges(badges);
    });
  }, []);

  function shiftDate(days: number) {
    setPeriodStart((prev) => {
      const next = new Date(prev.getTime() + days * MS_PER_DAY);
      return next > new Date() ? prev : next;
    });
  }

  function handleCopperIUDEscape() {
    setCycleProfile('natural');
    setContraceptionType(null);
    setHasPlaceboWeek(null);
    setCurrentPackStart(null);
  }

  function handleContinue() {
    setData({
      cycleProfile,
      periodStart:       showDatePickers ? periodStart : null,
      cycleLength:       showDatePickers ? cycleLength : DEFAULT_CYCLE,
      contraceptionType: cycleProfile === 'hormonal' ? contraceptionType : null,
      hasPlaceboWeek:    cycleProfile === 'hormonal' ? hasPlaceboWeek : null,
      currentPackStart:  cycleProfile === 'hormonal' && hasPlaceboWeek ? currentPackStart : null,
    });
    router.push('/(onboarding)/diet');
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <VirraText variant="display" size={28} color={colors.breath} style={styles.title}>
        Tell us about your cycle
      </VirraText>
      <VirraText variant="body" color="rgba(244,237,224,0.6)" style={styles.sub}>
        This personalises your training and nutrition targets.
      </VirraText>

      <View style={styles.section}>
        {CYCLE_PROFILES.map((opt) => {
          const active = cycleProfile === opt.value;
          return (
            <React.Fragment key={opt.value}>
              <Pressable
                onPress={() => setCycleProfile(opt.value)}
                style={[styles.profileOption, active && styles.profileOptionActive]}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <VirraText variant="bodyMedium" size={15} color={active ? colors.mile : colors.breath}>
                  {opt.label}
                </VirraText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                  <VirraText variant="body" size={12} color={active ? 'rgba(10,10,15,0.6)' : 'rgba(244,237,224,0.45)'}>
                    {opt.sub}
                  </VirraText>
                  {opt.redsLink && (
                    <Pressable onPress={() => Linking.openURL(REDS_URL)} hitSlop={8}>
                      <VirraText variant="body" size={12} color={colors.dawn} style={{ textDecorationLine: 'underline' }}>
                        · Learn about RED-S
                      </VirraText>
                    </Pressable>
                  )}
                </View>
              </Pressable>

              {/* Hormonal sub-picker */}
              {active && opt.value === 'hormonal' && (
                <HormonalSubPicker
                  contraceptionType={contraceptionType}
                  hasPlaceboWeek={hasPlaceboWeek}
                  currentPackStart={currentPackStart}
                  onCopperIUDEscape={handleCopperIUDEscape}
                  onChange={({ contraceptionType: ct, hasPlaceboWeek: hpw, currentPackStart: cps }) => {
                    setContraceptionType(ct);
                    setHasPlaceboWeek(hpw);
                    setCurrentPackStart(cps);
                  }}
                />
              )}

              {/* Pregnancy / postpartum disclaimer */}
              {active && opt.value === 'pregnant_postpartum' && (
                <View style={styles.disclaimerCard}>
                  <VirraText variant="bodyMedium" size={13} color={colors.dawn} style={styles.disclaimerTitle}>
                    Pregnancy and postpartum aren't a fitness question — they're a healing one.
                  </VirraText>
                  <VirraText variant="body" size={12} color="rgba(244,237,224,0.5)" style={styles.disclaimerBody}>
                    Before we build you a training plan, get cleared to exercise by your midwife, GP, or a women's health physio.
                  </VirraText>
                  <VirraText variant="body" size={11} color="rgba(244,237,224,0.3)" style={styles.disclaimerConfirm}>
                    Continuing confirms you've had that conversation.
                  </VirraText>
                </View>
              )}
            </React.Fragment>
          );
        })}
      </View>

      {/* Date pickers — natural and irregular only */}
      {showDatePickers && (
        <>
          <View style={styles.section}>
            <View style={styles.fieldRow}>
              <VirraText variant="mono" size={10} color={colors.pulse} style={styles.fieldLabel}>
                {cycleProfile === 'irregular' ? 'ROUGHLY WHEN DID YOUR LAST PERIOD START?' : 'LAST PERIOD START'}
              </VirraText>
              {hkBadges.has('date') && (
                <VirraText variant="mono" size={10} color="rgba(212,255,38,0.5)">
                  {' '}· From Apple Health
                </VirraText>
              )}
            </View>
            <View style={styles.datePicker}>
              <Pressable onPress={() => shiftDate(-1)} style={styles.dateBtn} hitSlop={12}>
                <VirraText variant="display" size={22} color={colors.breath}>←</VirraText>
              </Pressable>
              <VirraText variant="bodyMedium" size={16} color={colors.breath} style={styles.dateText}>
                {formatDate(periodStart)}
              </VirraText>
              <Pressable onPress={() => shiftDate(1)} style={styles.dateBtn} hitSlop={12}>
                <VirraText variant="display" size={22} color={colors.breath}>→</VirraText>
              </Pressable>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.fieldRow}>
              <VirraText variant="mono" size={10} color={colors.pulse} style={styles.fieldLabel}>
                AVERAGE CYCLE LENGTH
              </VirraText>
              {hkBadges.has('length') && (
                <VirraText variant="mono" size={10} color="rgba(212,255,38,0.5)">
                  {' '}· From Apple Health
                </VirraText>
              )}
            </View>
            <View style={styles.stepper}>
              <Pressable onPress={() => setCycleLength((n) => Math.max(21, n - 1))} style={styles.stepBtn} hitSlop={12}>
                <VirraText variant="display" size={28} color={colors.breath}>−</VirraText>
              </Pressable>
              <View style={styles.stepCenter}>
                <VirraText variant="display" size={36} color={colors.pulse}>{cycleLength}</VirraText>
                <VirraText variant="mono" size={10} color="rgba(244,237,224,0.4)">days</VirraText>
              </View>
              <Pressable onPress={() => setCycleLength((n) => Math.min(40, n + 1))} style={styles.stepBtn} hitSlop={12}>
                <VirraText variant="display" size={28} color={colors.breath}>+</VirraText>
              </Pressable>
            </View>
            <VirraText variant="body" size={12} color="rgba(244,237,224,0.4)" style={styles.stepHint}>
              Range: 21–40 days
            </VirraText>
          </View>
        </>
      )}

      {/* Steady note for non-flow profiles (not hormonal — that has its own sub-picker) */}
      {!showDatePickers && cycleProfile !== 'hormonal' && STEADY_NOTE[cycleProfile] && (
        <View style={styles.note}>
          <VirraText variant="body" size={14} color="rgba(244,237,224,0.55)" style={styles.noteText}>
            {STEADY_NOTE[cycleProfile]}
          </VirraText>
        </View>
      )}

      <VirraButton label="CONTINUE" onPress={handleContinue} style={styles.cta} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:               { flex: 1 },
  container:            { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xl },
  title:                { lineHeight: 34 },
  sub:                  { lineHeight: 22, marginTop: -spacing.md },
  section:              { gap: spacing.sm },
  profileOption:        { padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mist, gap: 3 },
  profileOptionActive:  { backgroundColor: colors.pulse, borderColor: colors.pulse },
  fieldRow:             { flexDirection: 'row', alignItems: 'center' },
  fieldLabel:           { letterSpacing: 2 },
  datePicker:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.mist, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  dateBtn:              { width: 36, alignItems: 'center' },
  dateText:             { flex: 1, textAlign: 'center' },
  stepper:              { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.mist, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  stepBtn:              { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepCenter:           { alignItems: 'center', gap: 2 },
  stepHint:             { textAlign: 'center' },
  note:                 { backgroundColor: colors.mist, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  noteText:             { lineHeight: 22 },
  disclaimerCard:       { padding: spacing.md, backgroundColor: 'rgba(255,107,61,0.07)', borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(255,107,61,0.22)', gap: spacing.sm },
  disclaimerTitle:      { lineHeight: 20 },
  disclaimerBody:       { lineHeight: 20 },
  disclaimerConfirm:    { fontStyle: 'italic' },
  cta:                  { marginTop: spacing.sm },
});
```

- [ ] **Step 2: Commit**

```bash
git add app/\(onboarding\)/cycle.tsx
git commit -m "feat(onboarding): cycle screen — 7 profiles, hormonal sub-picker, postpartum disclaimer"
```

---

## Task 9: Update onboarding `diet.tsx` to save new fields

**Files:**
- Modify: `app/(onboarding)/diet.tsx`

- [ ] **Step 1: Update the `handleContinue` function**

In the `supabase.from('user_profiles').upsert(...)` call, add the three new fields:

```ts
const { error: profileError } = await supabase.from('user_profiles').upsert({
  id:                  userId,
  first_name:          data.firstName   || null,
  last_name:           data.lastName    || null,
  ...(avatarUrl != null && { avatar_url: avatarUrl }),
  fitness_level:       data.fitnessLevel,
  running_goal:        data.runningGoal,
  dietary_prefs:       Array.from(selected),
  cycle_profile:       data.cycleProfile,
  contraception_type:  data.contraceptionType  ?? null,
  has_placebo_week:    data.hasPlaceboWeek     ?? null,
  current_pack_start:  data.currentPackStart
    ? data.currentPackStart.toISOString().split('T')[0]
    : null,
  onboarding_complete: true,
});
```

Then update the Zustand hydration at the bottom of `handleContinue` to also call `setHormonalSubData` when the profile is hormonal:

```ts
const { setCycleProfile, setPeriodStart, setHormonalSubData } = useCycleStore.getState();
setCycleProfile(data.cycleProfile);
if (data.periodStart) {
  setPeriodStart(data.periodStart);
}
if (data.cycleProfile === 'hormonal' && data.contraceptionType) {
  setHormonalSubData({
    contraceptionType: data.contraceptionType,
    hasPlaceboWeek:    data.hasPlaceboWeek,
    currentPackStart:  data.currentPackStart,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(onboarding\)/diet.tsx
git commit -m "feat(onboarding): persist contraception sub-data to Supabase on completion"
```

---

## Task 10: Update cycle settings screen

**Files:**
- Modify: `app/(app)/cycle-settings.tsx`

- [ ] **Step 1: Replace `app/(app)/cycle-settings.tsx`**

Mirror the onboarding cycle screen changes but adapted for the settings context — reads from and saves to Zustand + Supabase directly (no `OnboardingContext`).

```tsx
import React, { useState } from 'react';
import { View, Pressable, StyleSheet, ScrollView, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useCycleStore } from '@/store/cycle';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from '@/components/ui/VirraText';
import { VirraButton } from '@/components/ui/VirraButton';
import { HormonalSubPicker } from '@/components/cycle/HormonalSubPicker';
import type { CycleProfile, ContraceptionType } from '@/lib/cycleEngine';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function formatDate(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

const CYCLE_PROFILES: { value: CycleProfile; label: string; sub: string; redsLink?: boolean }[] = [
  { value: 'natural',             label: 'Regular cycle',           sub: 'I can roughly predict it'                },
  { value: 'hormonal',            label: 'Hormonal contraception',  sub: 'Pill, IUD, implant, patch'              },
  { value: 'irregular',           label: 'Irregular cycle',         sub: 'Unpredictable or recently changed', redsLink: true },
  { value: 'pregnant_postpartum', label: 'Pregnant or postpartum',  sub: 'In the last 12 months'                 },
  { value: 'perimenopause',       label: 'Perimenopause',           sub: 'Cycles changing or stopping'           },
  { value: 'menopause',           label: 'Menopause',               sub: 'No period for 12+ months'              },
  { value: 'prefer_not_to_say',   label: 'Prefer not to say',       sub: 'Set this up later'                     },
];

const STEADY_NOTE: Partial<Record<CycleProfile, string>> = {
  perimenopause:     'Your targets are based on training load. Symptom logging is available throughout.',
  menopause:         'Your targets are based on training load. Symptom logging is available throughout.',
  prefer_not_to_say: 'Your targets are based on training load. You can update this at any time.',
};

const REDS_URL = 'https://virra.app/advice/reds';

export default function CycleSettingsScreen() {
  const { session } = useAuthStore();
  const store = useCycleStore();

  const [selectedProfile,    setSelectedProfile]    = useState<CycleProfile>(store.cycleProfile);
  const [periodStart,        setPeriodStartLocal]    = useState<Date>(store.periodStart ?? new Date(Date.now() - 28 * MS_PER_DAY));
  const [cycleLength,        setCycleLengthLocal]    = useState(store.cycleLength);
  const [contraceptionType,  setContraceptionType]   = useState<ContraceptionType | null>(store.contraceptionType);
  const [hasPlaceboWeek,     setHasPlaceboWeek]      = useState<boolean | null>(store.hasPlaceboWeek);
  const [currentPackStart,   setCurrentPackStart]    = useState<Date | null>(store.currentPackStart);
  const [saving,             setSaving]              = useState(false);

  const showDatePickers = selectedProfile === 'natural' || selectedProfile === 'irregular';

  function shiftDate(days: number) {
    setPeriodStartLocal((prev) => {
      const next = new Date(prev.getTime() + days * MS_PER_DAY);
      return next > new Date() ? prev : next;
    });
  }

  function handleCopperIUDEscape() {
    setSelectedProfile('natural');
    setContraceptionType(null);
    setHasPlaceboWeek(null);
    setCurrentPackStart(null);
  }

  async function handleSave() {
    if (!session) return;
    setSaving(true);
    try {
      const update: Record<string, unknown> = {
        cycle_profile:      selectedProfile,
        contraception_type: selectedProfile === 'hormonal' ? (contraceptionType ?? null) : null,
        has_placebo_week:   selectedProfile === 'hormonal' ? (hasPlaceboWeek ?? null) : null,
        current_pack_start: selectedProfile === 'hormonal' && hasPlaceboWeek && currentPackStart
          ? currentPackStart.toISOString().split('T')[0]
          : null,
      };

      const { error: profileError } = await supabase
        .from('user_profiles')
        .update(update)
        .eq('id', session.user.id);
      if (profileError) throw profileError;

      if (showDatePickers) {
        const periodStr = periodStart.toISOString().split('T')[0];
        const { data: existing } = await supabase
          .from('cycle_logs')
          .select('id')
          .eq('user_id', session.user.id)
          .order('period_start', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('cycle_logs')
            .update({ period_start: periodStr, cycle_length_days: cycleLength })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('cycle_logs')
            .insert({ user_id: session.user.id, period_start: periodStr, cycle_length_days: cycleLength });
        }
      }

      // Update Zustand store
      store.setCycleProfile(selectedProfile);
      if (showDatePickers) {
        store.setPeriodStart(periodStart);
        store.setCycleLength(cycleLength);
        try {
          const { logPeriodStartToHealth } = await import('@/modules/menstrual-health');
          await logPeriodStartToHealth(periodStart.toISOString().split('T')[0]);
        } catch { /* permission not granted */ }
      }
      if (selectedProfile === 'hormonal' && contraceptionType) {
        store.setHormonalSubData({ contraceptionType, hasPlaceboWeek, currentPackStart });
      }

      router.back();
    } catch (e) {
      Alert.alert('Could not save', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Pressable style={s.headerBtn} onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
          <SymbolView name="chevron.left" size={18} tintColor={colors.muted} />
        </Pressable>
        <VirraText variant="display" size={24} color={colors.pulse}>Cycle</VirraText>
        <View style={s.headerBtn} />
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.container}>
        <View style={s.section}>
          <VirraText variant="mono" size={10} color={colors.muted} style={s.sectionLabel}>
            CYCLE PROFILE
          </VirraText>

          {CYCLE_PROFILES.map((opt) => {
            const active = selectedProfile === opt.value;
            return (
              <React.Fragment key={opt.value}>
                <Pressable
                  onPress={() => setSelectedProfile(opt.value)}
                  style={[s.profileOption, active && s.profileOptionActive]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  <VirraText variant="bodyMedium" size={15} color={active ? colors.mile : colors.breath}>
                    {opt.label}
                  </VirraText>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                    <VirraText variant="body" size={12} color={active ? 'rgba(10,10,15,0.6)' : 'rgba(244,237,224,0.45)'}>
                      {opt.sub}
                    </VirraText>
                    {opt.redsLink && (
                      <Pressable onPress={() => Linking.openURL(REDS_URL)} hitSlop={8}>
                        <VirraText variant="body" size={12} color={colors.dawn} style={{ textDecorationLine: 'underline' }}>
                          · Learn about RED-S
                        </VirraText>
                      </Pressable>
                    )}
                  </View>
                </Pressable>

                {active && opt.value === 'hormonal' && (
                  <HormonalSubPicker
                    contraceptionType={contraceptionType}
                    hasPlaceboWeek={hasPlaceboWeek}
                    currentPackStart={currentPackStart}
                    onCopperIUDEscape={handleCopperIUDEscape}
                    onChange={({ contraceptionType: ct, hasPlaceboWeek: hpw, currentPackStart: cps }) => {
                      setContraceptionType(ct);
                      setHasPlaceboWeek(hpw);
                      setCurrentPackStart(cps);
                    }}
                  />
                )}

                {active && opt.value === 'pregnant_postpartum' && (
                  <View style={s.disclaimerCard}>
                    <VirraText variant="bodyMedium" size={13} color={colors.dawn} style={s.disclaimerTitle}>
                      Pregnancy and postpartum aren't a fitness question — they're a healing one.
                    </VirraText>
                    <VirraText variant="body" size={12} color="rgba(244,237,224,0.5)" style={s.disclaimerBody}>
                      Before we build you a training plan, get cleared to exercise by your midwife, GP, or a women's health physio.
                    </VirraText>
                    <VirraText variant="body" size={11} color="rgba(244,237,224,0.3)" style={s.disclaimerConfirm}>
                      Saving confirms you've had that conversation.
                    </VirraText>
                  </View>
                )}
              </React.Fragment>
            );
          })}
        </View>

        {showDatePickers && (
          <>
            <View style={s.section}>
              <VirraText variant="mono" size={10} color={colors.pulse} style={s.sectionLabel}>
                {selectedProfile === 'irregular' ? 'ROUGHLY WHEN DID YOUR LAST PERIOD START?' : 'LAST PERIOD START'}
              </VirraText>
              <View style={s.datePicker}>
                <Pressable onPress={() => shiftDate(-1)} style={s.dateBtn} hitSlop={12}>
                  <VirraText variant="display" size={22} color={colors.breath}>←</VirraText>
                </Pressable>
                <VirraText variant="bodyMedium" size={16} color={colors.breath} style={s.dateText}>
                  {formatDate(periodStart)}
                </VirraText>
                <Pressable onPress={() => shiftDate(1)} style={s.dateBtn} hitSlop={12}>
                  <VirraText variant="display" size={22} color={colors.breath}>→</VirraText>
                </Pressable>
              </View>
            </View>

            <View style={s.section}>
              <VirraText variant="mono" size={10} color={colors.pulse} style={s.sectionLabel}>
                AVERAGE CYCLE LENGTH
              </VirraText>
              <View style={s.stepper}>
                <Pressable onPress={() => setCycleLengthLocal((n) => Math.max(21, n - 1))} style={s.stepBtn} hitSlop={12}>
                  <VirraText variant="display" size={28} color={colors.breath}>−</VirraText>
                </Pressable>
                <View style={s.stepCenter}>
                  <VirraText variant="display" size={36} color={colors.pulse}>{cycleLength}</VirraText>
                  <VirraText variant="mono" size={10} color="rgba(244,237,224,0.4)">days</VirraText>
                </View>
                <Pressable onPress={() => setCycleLengthLocal((n) => Math.min(40, n + 1))} style={s.stepBtn} hitSlop={12}>
                  <VirraText variant="display" size={28} color={colors.breath}>+</VirraText>
                </Pressable>
              </View>
              <VirraText variant="body" size={12} color="rgba(244,237,224,0.4)" style={s.stepHint}>
                Range: 21–40 days
              </VirraText>
            </View>
          </>
        )}

        {!showDatePickers && selectedProfile !== 'hormonal' && STEADY_NOTE[selectedProfile] && (
          <View style={s.note}>
            <VirraText variant="body" size={14} color="rgba(244,237,224,0.55)" style={s.noteText}>
              {STEADY_NOTE[selectedProfile]}
            </VirraText>
          </View>
        )}

        <VirraButton label="SAVE" onPress={handleSave} loading={saving} style={s.cta} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:              { flex: 1, backgroundColor: colors.mile },
  header:            { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  headerBtn:         { width: 18, height: 32, alignItems: 'flex-start', justifyContent: 'center' },
  scroll:            { flex: 1 },
  container:         { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xl },
  section:           { gap: spacing.sm },
  sectionLabel:      { letterSpacing: 2, marginBottom: spacing.xs },
  profileOption:     { padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mist, gap: 3 },
  profileOptionActive: { backgroundColor: colors.pulse, borderColor: colors.pulse },
  datePicker:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.mist, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  dateBtn:           { width: 36, alignItems: 'center' },
  dateText:          { flex: 1, textAlign: 'center' },
  stepper:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.mist, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  stepBtn:           { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepCenter:        { alignItems: 'center', gap: 2 },
  stepHint:          { textAlign: 'center' },
  note:              { backgroundColor: colors.mist, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  noteText:          { lineHeight: 22 },
  disclaimerCard:    { padding: spacing.md, backgroundColor: 'rgba(255,107,61,0.07)', borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(255,107,61,0.22)', gap: spacing.sm },
  disclaimerTitle:   { lineHeight: 20 },
  disclaimerBody:    { lineHeight: 20 },
  disclaimerConfirm: { fontStyle: 'italic' },
  cta:               { marginTop: spacing.sm },
});
```

- [ ] **Step 2: Run all tests**

```bash
npx jest --no-coverage
```

Expected: all PASS

- [ ] **Step 3: Final commit**

```bash
git add app/\(app\)/cycle-settings.tsx
git commit -m "feat(settings): cycle settings — 7 profiles, hormonal sub-picker, postpartum disclaimer"
```
