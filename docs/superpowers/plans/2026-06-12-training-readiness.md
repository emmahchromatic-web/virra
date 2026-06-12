# Training Readiness Score — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a score-driven animated readiness bar to the Dashboard that reads HRV, RHR, sleep, and training load from HealthKit, applies menstrual cycle correction, and shows a 0–100 score with a colour that tracks readiness (lime = peak, orange = low).

**Architecture:** Pure scoring engine in `readinessEngine.ts` (no HK dependency, fully unit-testable) fed by HealthKit wrappers in `healthKitReadiness.ts`; a daily baseline update job in `readinessBaseline.ts` persists rolling mean/SD to AsyncStorage; a Zustand store orchestrates the pipeline and exposes the result to a `ReadinessRow` component inserted in the Dashboard between the phase hero card and the today-session row.

**Tech Stack:** React Native, expo-symbols, `react-native-health` (NativeModules.AppleHealthKit — already initialised), AsyncStorage, Zustand, existing `Shimmer` and `VirraCard` components.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `mobile/src/lib/readinessEngine.ts` | Create | Types, constants, pure scoring function |
| `mobile/__tests__/lib/readinessEngine.test.ts` | Create | Unit tests for scoring pipeline |
| `mobile/src/lib/healthKitReadiness.ts` | Create | HK query wrappers: HRV, RHR, sleep, activity load |
| `mobile/__tests__/lib/healthKitReadiness.test.ts` | Create | Unit tests for `filterToOvernightHours` |
| `mobile/src/lib/readinessBaseline.ts` | Create | Baseline update job, rolling stats, AsyncStorage persistence |
| `mobile/__tests__/lib/readinessBaseline.test.ts` | Create | Unit tests for `rollingMean` / `rollingSD` |
| `mobile/src/store/readiness.ts` | Create | Zustand store: `today`, `isLoading`, `isFirstRun`, `refresh()` |
| `mobile/src/components/ui/ReadinessRow.tsx` | Create | Dashboard row: shimmer → animated ticks → footer |
| `mobile/app/(app)/(tabs)/index.tsx` | Modify | Import `ReadinessRow`, wire `refresh()` into `loadAll()` |

---

## Task 1: Types, constants, and the scoring engine shell

**Files:**
- Create: `mobile/src/lib/readinessEngine.ts`

- [ ] **Step 1: Create `readinessEngine.ts` with types, config, and phase offsets**

```typescript
// mobile/src/lib/readinessEngine.ts

export type Confidence = 'high' | 'medium' | 'low'
export type CyclePhase = 'menstrual' | 'follicular' | 'ovulatory' | 'luteal'

export interface ReadinessBaseline {
  hrvMean: number
  hrvSD: number
  rhrMean: number
  rhrSD: number
  sleepNeedHours: number        // personalised or default 8.0
  chronicLoad: number           // 28-day rolling mean of daily active energy (kcal)
  lastUpdated: string           // YYYY-MM-DD
  sampleDays: number            // distinct days with HRV data
}

export interface DailyReadiness {
  date: string                  // YYYY-MM-DD
  score: number                 // 0–100
  confidence: Confidence
  hrvSub: number
  rhrSub: number
  sleepSub: number
  loadSub: number
  checkinSub: number | null
  phase: CyclePhase | null
  rawInputs: Record<string, unknown>
}

export interface SleepDebt {
  hours: number
  windowDays: number            // 14
  trend: 'accruing' | 'recovering' | 'stable'
  lastUpdated: string
}

export interface TodayInputs {
  hrv: number | null
  rhr: number | null
  sleepHours: number | null
  timeInBed: number | null
  deepHours: number | null      // null when watch doesn't report sleep stages
  remHours: number | null
  acuteLoad7day: number | null  // total active energy burned over last 7 days (kcal)
  checkin: { energy: number; mood: number; sleep_quality: number } | null
}

export interface SleepWindow {
  sleepHours: number
  timeInBed: number
  deepHours: number | null
  remHours: number | null
}

// All tuning constants in one place — tune on real data, never hardcode inline
export const READINESS_CONFIG = {
  deviationK: 15,               // z-score multiplier (1 SD → 65, 2 SD → 80)
  weights: { hrv: 0.35, rhr: 0.20, sleep: 0.25, load: 0.20 },
  sleepWeights: { duration: 0.50, continuity: 0.25, stage: 0.25 },
  sleepWeightsFallbackNoStages: { duration: 0.65, continuity: 0.35 },
  acwrThresholds: { low: 0.8, sweet: 1.3, caution: 1.5 },
  sleepEfficiencyRange: 0.25,   // denominator in continuity formula; maps 0.70→0.95 to 0–100
  sleepRestorativeTarget: 0.40, // fraction of sleep that should be deep+REM
  confidenceThresholds: { high: 60, medium: 21 },
} as const

// Population priors — used in v1; replaced by per-user learned offsets post-launch
export const PHASE_OFFSETS: Record<CyclePhase, { hrv: number; rhr: number }> = {
  menstrual:  { hrv: -0.05, rhr: +1.0 },
  follicular: { hrv: +0.05, rhr: -1.0 },
  ovulatory:  { hrv:  0.00, rhr:  0.0 },
  luteal:     { hrv: -0.12, rhr: +3.0 },
}
```

- [ ] **Step 2: Commit**

```bash
git add mobile/src/lib/readinessEngine.ts
git commit -m "feat(readiness): types, config constants, phase offsets"
```

---

## Task 2: Scoring engine — tests first

**Files:**
- Create: `mobile/__tests__/lib/readinessEngine.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// mobile/__tests__/lib/readinessEngine.test.ts

import { computeReadiness } from '@/lib/readinessEngine'
import type { ReadinessBaseline, TodayInputs } from '@/lib/readinessEngine'

const BASELINE: ReadinessBaseline = {
  hrvMean: 50, hrvSD: 10,
  rhrMean: 60, rhrSD: 5,
  sleepNeedHours: 8,
  chronicLoad: 400,
  lastUpdated: '2026-06-12',
  sampleDays: 60,
}

const FULL_INPUTS: TodayInputs = {
  hrv: 50, rhr: 60,
  sleepHours: 8, timeInBed: 8.5, deepHours: 1.6, remHours: 1.6,
  acuteLoad7day: 400,
  checkin: null,
}

describe('computeReadiness', () => {
  it('returns score ~72 and high confidence for at-mean inputs', () => {
    const r = computeReadiness(FULL_INPUTS, BASELINE, null)
    // hrv=50 at mean→sub=50; rhr=60 at mean→sub=50; sleep full data→sub≈99; load acwr=1→sub=100
    // raw = 0.35*50 + 0.20*50 + 0.25*99 + 0.20*100 ≈ 72
    expect(r.score).toBe(72)
    expect(r.confidence).toBe('high')
    expect(r.hrvSub).toBe(50)
    expect(r.rhrSub).toBe(50)
    expect(r.loadSub).toBe(100)
    expect(r.checkinSub).toBeNull()
  })

  it('raises hrvSub when HRV is 1 SD above mean', () => {
    const r = computeReadiness({ ...FULL_INPUTS, hrv: 60 }, BASELINE, null)
    // z = (60-50)/10 = 1 → sub = 50 + 15 = 65
    expect(r.hrvSub).toBe(65)
  })

  it('lowers rhrSub when RHR is 1 SD above mean (worse)', () => {
    const r = computeReadiness({ ...FULL_INPUTS, rhr: 65 }, BASELINE, null)
    // z = (65-60)/5 = 1 → sub = 50 - 15 = 35
    expect(r.rhrSub).toBe(35)
  })

  it('raises hrvSub in luteal phase (same HRV reads higher after correction)', () => {
    const noPhase = computeReadiness(FULL_INPUTS, BASELINE, null)
    const luteal  = computeReadiness(FULL_INPUTS, BASELINE, 'luteal')
    // luteal offset -0.12 → expectedHRV = 50*(1-0.12) = 44 → z = (50-44)/10 = 0.6 → sub = 59
    expect(luteal.hrvSub).toBe(59)
    expect(luteal.hrvSub).toBeGreaterThan(noPhase.hrvSub)
  })

  it('sets confidence based on sampleDays', () => {
    expect(computeReadiness(FULL_INPUTS, { ...BASELINE, sampleDays: 60 }, null).confidence).toBe('high')
    expect(computeReadiness(FULL_INPUTS, { ...BASELINE, sampleDays: 59 }, null).confidence).toBe('medium')
    expect(computeReadiness(FULL_INPUTS, { ...BASELINE, sampleDays: 21 }, null).confidence).toBe('medium')
    expect(computeReadiness(FULL_INPUTS, { ...BASELINE, sampleDays: 20 }, null).confidence).toBe('low')
  })

  it('blends check-in (20%) with objective score (80%)', () => {
    const r = computeReadiness(
      { ...FULL_INPUTS, checkin: { energy: 2, mood: 2, sleep_quality: 2 } },
      BASELINE,
      null,
    )
    // checkinSub = ((2+2+2)/3 - 1) / 4 * 100 = 25
    // score = round(0.8 * 72 + 0.2 * 25) = round(62.6) = 63
    expect(r.checkinSub).toBe(25)
    expect(r.score).toBe(63)
  })

  it('returns neutral sub-score (50) when HRV is null', () => {
    const r = computeReadiness({ ...FULL_INPUTS, hrv: null }, BASELINE, null)
    expect(r.hrvSub).toBe(50)
  })

  it('returns neutral sub-score (50) when RHR is null', () => {
    const r = computeReadiness({ ...FULL_INPUTS, rhr: null }, BASELINE, null)
    expect(r.rhrSub).toBe(50)
  })

  describe('loadSub ACWR curve', () => {
    it('returns 70 when under-training (acwr < 0.8)', () => {
      const r = computeReadiness({ ...FULL_INPUTS, acuteLoad7day: 300 }, BASELINE, null)
      // acwr = 300/400 = 0.75 < 0.8
      expect(r.loadSub).toBe(70)
    })

    it('returns 100 in sweet spot (0.8 ≤ acwr ≤ 1.3)', () => {
      const r = computeReadiness({ ...FULL_INPUTS, acuteLoad7day: 440 }, BASELINE, null)
      // acwr = 440/400 = 1.1
      expect(r.loadSub).toBe(100)
    })

    it('returns 80 in caution zone (1.3 < acwr ≤ 1.5)', () => {
      const r = computeReadiness({ ...FULL_INPUTS, acuteLoad7day: 560 }, BASELINE, null)
      // acwr = 560/400 = 1.4
      expect(r.loadSub).toBe(80)
    })

    it('applies overreaching penalty above 1.5', () => {
      const r = computeReadiness({ ...FULL_INPUTS, acuteLoad7day: 720 }, BASELINE, null)
      // acwr = 720/400 = 1.8 → max(40, 100 - (1.8-1.5)*60) = max(40, 82) = 82
      expect(r.loadSub).toBe(82)
    })

    it('floors loadSub at 40 in extreme overreaching', () => {
      const r = computeReadiness({ ...FULL_INPUTS, acuteLoad7day: 1600 }, BASELINE, null)
      // acwr = 4.0 → max(40, 100 - 2.5*60) = max(40, -50) = 40
      expect(r.loadSub).toBe(40)
    })
  })

  it('uses fallback weights when sleep stages are absent', () => {
    const r = computeReadiness(
      { ...FULL_INPUTS, deepHours: null, remHours: null },
      BASELINE,
      null,
    )
    // 0.65*durationScore + 0.35*continuityScore
    // durationScore=100, efficiency=8/8.5≈0.941, continuity≈96
    // sleepSub = 0.65*100 + 0.35*96 ≈ 98.6
    expect(r.sleepSub).toBeGreaterThan(95)
    expect(r.sleepSub).toBeLessThanOrEqual(100)
  })

  it('clamps score between 0 and 100', () => {
    // Extreme HRV — would push score above 100 without clamping
    const r = computeReadiness({ ...FULL_INPUTS, hrv: 200, rhr: 30 }, BASELINE, null)
    expect(r.score).toBeLessThanOrEqual(100)
    expect(r.score).toBeGreaterThanOrEqual(0)
  })

  it('returns score 70 when all inputs are null (all neutrals + detraining load default)', () => {
    const r = computeReadiness(
      { hrv: null, rhr: null, sleepHours: null, timeInBed: null,
        deepHours: null, remHours: null, acuteLoad7day: null, checkin: null },
      BASELINE,
      null,
    )
    // All subs = 50 except loadSub = 70 (null defaults to detraining)
    // raw = 0.35*50 + 0.20*50 + 0.25*50 + 0.20*70 = 17.5+10+12.5+14 = 54
    expect(r.score).toBe(54)
  })
})
```

- [ ] **Step 2: Run tests to confirm they all fail**

```bash
cd mobile && npx jest __tests__/lib/readinessEngine.test.ts --no-coverage
```

Expected: `Cannot find module '@/lib/readinessEngine'` or `computeReadiness is not a function`

---

## Task 3: Scoring engine — implementation

**Files:**
- Modify: `mobile/src/lib/readinessEngine.ts`

- [ ] **Step 1: Add the `computeReadiness` implementation to `readinessEngine.ts`**

Append below the existing exports in `readinessEngine.ts`:

```typescript
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function computeHrvSub(hrv: number | null, baseline: ReadinessBaseline, phase: CyclePhase | null): number {
  if (hrv === null || baseline.hrvSD === 0) return 50
  const offset = phase ? PHASE_OFFSETS[phase].hrv : 0
  const expected = baseline.hrvMean * (1 + offset)
  const z = (hrv - expected) / baseline.hrvSD
  return clamp(50 + READINESS_CONFIG.deviationK * z, 0, 100)
}

function computeRhrSub(rhr: number | null, baseline: ReadinessBaseline, phase: CyclePhase | null): number {
  if (rhr === null || baseline.rhrSD === 0) return 50
  const offset = phase ? PHASE_OFFSETS[phase].rhr : 0
  const expected = baseline.rhrMean + offset
  const z = (rhr - expected) / baseline.rhrSD
  return clamp(50 - READINESS_CONFIG.deviationK * z, 0, 100)
}

function computeSleepSub(inputs: TodayInputs, sleepNeedHours: number): number {
  if (inputs.sleepHours === null) return 50

  const { sleepHours, timeInBed, deepHours, remHours } = inputs
  const durationScore = clamp(100 * (sleepHours / sleepNeedHours), 0, 100)

  if (timeInBed === null) return durationScore

  const efficiency = timeInBed > 0 ? sleepHours / timeInBed : 0
  const continuityScore = clamp(
    100 * (efficiency - 0.70) / READINESS_CONFIG.sleepEfficiencyRange,
    0, 100,
  )

  const hasStages = deepHours !== null && remHours !== null
  if (!hasStages) {
    const { duration, continuity } = READINESS_CONFIG.sleepWeightsFallbackNoStages
    return clamp(duration * durationScore + continuity * continuityScore, 0, 100)
  }

  const restorativeFrac = (deepHours! + remHours!) / sleepHours
  const stageScore = clamp(100 * restorativeFrac / READINESS_CONFIG.sleepRestorativeTarget, 0, 100)
  const { duration, continuity, stage } = READINESS_CONFIG.sleepWeights
  return clamp(duration * durationScore + continuity * continuityScore + stage * stageScore, 0, 100)
}

function computeLoadSub(acuteLoad7day: number | null, chronicLoad: number): number {
  if (acuteLoad7day === null || chronicLoad === 0) return 70
  const acwr = acuteLoad7day / chronicLoad
  const { low, sweet, caution } = READINESS_CONFIG.acwrThresholds
  if (acwr <= low)    return 70
  if (acwr <= sweet)  return 100
  if (acwr <= caution) return 80
  return Math.max(40, 100 - (acwr - caution) * 60)
}

function computeCheckinSub(checkin: TodayInputs['checkin']): number | null {
  if (checkin === null) return null
  const avg = (checkin.energy + checkin.mood + checkin.sleep_quality) / 3
  return clamp(((avg - 1) / 4) * 100, 0, 100)
}

function computeConfidence(sampleDays: number): Confidence {
  const { high, medium } = READINESS_CONFIG.confidenceThresholds
  if (sampleDays >= high)   return 'high'
  if (sampleDays >= medium) return 'medium'
  return 'low'
}

export function computeReadiness(
  inputs: TodayInputs,
  baseline: ReadinessBaseline,
  phase: CyclePhase | null,
): DailyReadiness {
  const date = new Date().toISOString().split('T')[0]

  const hrvSub    = computeHrvSub(inputs.hrv, baseline, phase)
  const rhrSub    = computeRhrSub(inputs.rhr, baseline, phase)
  const sleepSub  = computeSleepSub(inputs, baseline.sleepNeedHours)
  const loadSub   = computeLoadSub(inputs.acuteLoad7day, baseline.chronicLoad)
  const checkinSub = computeCheckinSub(inputs.checkin)

  const { hrv: wHrv, rhr: wRhr, sleep: wSleep, load: wLoad } = READINESS_CONFIG.weights
  const raw = wHrv * hrvSub + wRhr * rhrSub + wSleep * sleepSub + wLoad * loadSub

  const score = clamp(
    checkinSub !== null ? Math.round(0.8 * raw + 0.2 * checkinSub) : Math.round(raw),
    0, 100,
  )

  return {
    date,
    score,
    confidence: computeConfidence(baseline.sampleDays),
    hrvSub,
    rhrSub,
    sleepSub,
    loadSub,
    checkinSub,
    phase,
    rawInputs: { ...inputs },
  }
}
```

- [ ] **Step 2: Run tests — all should pass**

```bash
cd mobile && npx jest __tests__/lib/readinessEngine.test.ts --no-coverage
```

Expected: all 12 tests pass.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/lib/readinessEngine.ts mobile/__tests__/lib/readinessEngine.test.ts
git commit -m "feat(readiness): pure scoring engine with full test coverage"
```

---

## Task 4: HealthKit query wrappers

**Files:**
- Create: `mobile/src/lib/healthKitReadiness.ts`
- Create: `mobile/__tests__/lib/healthKitReadiness.test.ts`

- [ ] **Step 1: Write tests for the pure `filterToOvernightHours` helper**

```typescript
// mobile/__tests__/lib/healthKitReadiness.test.ts

import { filterToOvernightHours } from '@/lib/healthKitReadiness'

describe('filterToOvernightHours', () => {
  it('keeps samples at 9pm, midnight, 2am, and 9:59am', () => {
    const samples = [
      { value: 45, startDate: '2026-06-11T21:30:00' },   // 9:30pm — keep
      { value: 38, startDate: '2026-06-12T00:00:00' },   // midnight — keep
      { value: 52, startDate: '2026-06-12T02:00:00' },   // 2am — keep
      { value: 51, startDate: '2026-06-12T09:59:00' },   // 9:59am — keep
    ]
    expect(filterToOvernightHours(samples)).toEqual([45, 38, 52, 51])
  })

  it('excludes samples at 10am and later', () => {
    const samples = [
      { value: 44, startDate: '2026-06-12T10:00:00' },   // 10am — exclude
      { value: 39, startDate: '2026-06-12T14:00:00' },   // 2pm — exclude
      { value: 48, startDate: '2026-06-12T20:59:00' },   // 8:59pm — exclude
    ]
    expect(filterToOvernightHours(samples)).toEqual([])
  })

  it('returns empty array for empty input', () => {
    expect(filterToOvernightHours([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd mobile && npx jest __tests__/lib/healthKitReadiness.test.ts --no-coverage
```

Expected: `Cannot find module '@/lib/healthKitReadiness'`

- [ ] **Step 3: Create `healthKitReadiness.ts`**

```typescript
// mobile/src/lib/healthKitReadiness.ts

import { NativeModules } from 'react-native'
import type { SleepWindow } from './readinessEngine'

function hk(): any {
  return NativeModules.AppleHealthKit
}

// Pure helper — filter SDNN samples to overnight hours (9pm–10am) to exclude
// noisy daytime readings. Uses local hours so it matches the user's sleep schedule.
export function filterToOvernightHours(
  samples: Array<{ value: number; startDate: string }>,
): number[] {
  return samples
    .filter(s => {
      const h = new Date(s.startDate).getHours()
      return h >= 21 || h < 10
    })
    .map(s => s.value)
}

// Returns mean of values, or 0 for empty array
export function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((s, v) => s + v, 0) / values.length
}

// Overnight SDNN samples filtered to 9pm–10am window across the date range.
// Returns { values, sampleDays } where sampleDays is the count of distinct dates.
export async function fetchOvernightHRV(
  startDate: Date,
  endDate: Date,
): Promise<{ values: number[]; sampleDays: number }> {
  const HK = hk()
  if (!HK?.getHeartRateVariabilitySamples) return { values: [], sampleDays: 0 }

  return new Promise(resolve => {
    HK.getHeartRateVariabilitySamples(
      { startDate: startDate.toISOString(), endDate: endDate.toISOString(), ascending: true },
      (err: unknown, results: Array<{ value: number; startDate: string }>) => {
        if (err || !Array.isArray(results)) {
          resolve({ values: [], sampleDays: 0 })
          return
        }
        const overnight = results.filter(s => {
          const h = new Date(s.startDate).getHours()
          return h >= 21 || h < 10
        })
        const distinctDates = new Set(overnight.map(s => s.startDate.split('T')[0]))
        resolve({ values: overnight.map(s => s.value), sampleDays: distinctDates.size })
      },
    )
  })
}

// Daily resting heart rate samples across the date range (Apple writes one per day).
export async function fetchRHR(startDate: Date, endDate: Date): Promise<number[]> {
  const HK = hk()
  if (!HK?.getRestingHeartRateSamples) return []

  return new Promise(resolve => {
    HK.getRestingHeartRateSamples(
      { startDate: startDate.toISOString(), endDate: endDate.toISOString(), ascending: true },
      (err: unknown, results: Array<{ value: number }>) => {
        if (err || !Array.isArray(results)) { resolve([]); return }
        resolve(results.map(r => r.value))
      },
    )
  })
}

// Sleep analysis for a single night identified by date string (YYYY-MM-DD).
// Queries 6pm the day before to 2pm on the given date to capture the full night.
export async function fetchSleepSamples(date: string): Promise<SleepWindow | null> {
  const HK = hk()
  if (!HK?.getSleepSamples) return null

  const prevDay = new Date(date)
  prevDay.setDate(prevDay.getDate() - 1)
  const windowStart = new Date(prevDay)
  windowStart.setHours(18, 0, 0, 0)

  const windowEnd = new Date(date)
  windowEnd.setHours(14, 0, 0, 0)

  return new Promise(resolve => {
    HK.getSleepSamples(
      { startDate: windowStart.toISOString(), endDate: windowEnd.toISOString(), ascending: true },
      (err: unknown, results: Array<{ value: string; startDate: string; endDate: string }>) => {
        if (err || !Array.isArray(results) || results.length === 0) { resolve(null); return }

        const asleepValues = new Set(['ASLEEP', 'ASLEEPCORE', 'ASLEEPDEEP', 'ASLEEPREM'])

        let sleepHours = 0, inBedHours = 0, deepHours = 0, remHours = 0
        let hasStages = false

        for (const s of results) {
          const dur = (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 3_600_000
          if (s.value === 'INBED')        { inBedHours += dur; continue }
          if (asleepValues.has(s.value))    sleepHours += dur
          if (s.value === 'ASLEEPDEEP')   { deepHours += dur; hasStages = true }
          if (s.value === 'ASLEEPREM')    { remHours  += dur; hasStages = true }
        }

        if (sleepHours === 0) { resolve(null); return }

        resolve({
          sleepHours,
          timeInBed:  inBedHours > 0 ? inBedHours : sleepHours,
          deepHours:  hasStages ? deepHours : null,
          remHours:   hasStages ? remHours  : null,
        })
      },
    )
  })
}

// Total active energy per day across the date range, as an array of per-day sums.
// Uses getActivitySummary which returns one entry per day.
export async function fetchActivityLoad(startDate: Date, endDate: Date): Promise<number[]> {
  const HK = hk()
  if (!HK?.getActivitySummary) return []

  return new Promise(resolve => {
    HK.getActivitySummary(
      { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
      (err: unknown, results: unknown) => {
        if (err || !Array.isArray(results)) { resolve([]); return }
        const loads = (results as Array<{ activeEnergyBurned?: number }>)
          .map(d => d.activeEnergyBurned ?? 0)
          .filter(v => v > 0)
        resolve(loads)
      },
    )
  })
}
```

- [ ] **Step 4: Run `filterToOvernightHours` tests — should pass**

```bash
cd mobile && npx jest __tests__/lib/healthKitReadiness.test.ts --no-coverage
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/healthKitReadiness.ts mobile/__tests__/lib/healthKitReadiness.test.ts
git commit -m "feat(readiness): HealthKit query wrappers with overnight HRV filter"
```

---

## Task 5: Baseline update job

**Files:**
- Create: `mobile/src/lib/readinessBaseline.ts`
- Create: `mobile/__tests__/lib/readinessBaseline.test.ts`

- [ ] **Step 1: Write tests for the pure rolling-stats helpers**

```typescript
// mobile/__tests__/lib/readinessBaseline.test.ts

import { rollingMean, rollingSD } from '@/lib/readinessBaseline'

describe('rollingMean', () => {
  it('returns the mean of an array', () => {
    expect(rollingMean([10, 20, 30])).toBe(20)
    expect(rollingMean([50])).toBe(50)
  })

  it('returns 0 for an empty array', () => {
    expect(rollingMean([])).toBe(0)
  })
})

describe('rollingSD', () => {
  it('returns the population SD', () => {
    // values [2, 4, 4, 4, 5, 5, 7, 9], mean = 5, variance = 4, SD = 2
    expect(rollingSD([2, 4, 4, 4, 5, 5, 7, 9], 5)).toBe(2)
  })

  it('returns 1 for a single value to avoid division by zero', () => {
    expect(rollingSD([50], 50)).toBe(1)
  })

  it('returns 1 for an empty array', () => {
    expect(rollingSD([], 0)).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd mobile && npx jest __tests__/lib/readinessBaseline.test.ts --no-coverage
```

Expected: `Cannot find module '@/lib/readinessBaseline'`

- [ ] **Step 3: Create `readinessBaseline.ts`**

```typescript
// mobile/src/lib/readinessBaseline.ts

import AsyncStorage from '@react-native-async-storage/async-storage'
import { fetchOvernightHRV, fetchRHR, fetchActivityLoad } from './healthKitReadiness'
import type { ReadinessBaseline, SleepDebt } from './readinessEngine'

const BASELINE_KEY = 'readiness_baseline_v1'
const DEBT_KEY     = 'readiness_sleep_debt_v1'
export const BACKFILL_KEY = 'readiness_backfill_done_v1'

// Population SD floor so z-scores never blow up on short history
const SD_FLOOR = 1

export function rollingMean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((s, v) => s + v, 0) / values.length
}

export function rollingSD(values: number[], mean: number): number {
  if (values.length < 2) return SD_FLOOR
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance) || SD_FLOOR
}

export async function isBackfillDone(): Promise<boolean> {
  return (await AsyncStorage.getItem(BACKFILL_KEY)) === '1'
}

export async function loadBaseline(): Promise<ReadinessBaseline | null> {
  const raw = await AsyncStorage.getItem(BASELINE_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as ReadinessBaseline } catch { return null }
}

async function saveBaseline(b: ReadinessBaseline): Promise<void> {
  await AsyncStorage.setItem(BASELINE_KEY, JSON.stringify(b))
}

// Returns default baseline seeded with population norms.
// Used as fallback when HealthKit returns no data.
function defaultBaseline(today: string): ReadinessBaseline {
  return {
    hrvMean: 50, hrvSD: 10,
    rhrMean: 60, rhrSD: 5,
    sleepNeedHours: 8,
    chronicLoad: 300,
    lastUpdated: today,
    sampleDays: 0,
  }
}

// Runs once per day on first app foreground.
// isFirstRun = true → queries up to 2 years of history (backfill).
// isFirstRun = false → standard 60-day rolling window, skipped if already ran today.
export async function updateBaseline(isFirstRun: boolean): Promise<ReadinessBaseline> {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const existing = await loadBaseline()

  // Skip if we already ran today (standard path only)
  if (!isFirstRun && existing?.lastUpdated === todayStr) return existing

  // Query window: 60 days standard, up to 2 years on first run
  const windowDays = isFirstRun ? 730 : 60
  const windowStart = new Date(today)
  windowStart.setDate(windowStart.getDate() - windowDays)

  try {
    const [hrvResult, rhrValues, loadValues] = await Promise.all([
      fetchOvernightHRV(windowStart, today),
      fetchRHR(windowStart, today),
      fetchActivityLoad(windowStart, today),
    ])

    const { values: hrvValues, sampleDays } = hrvResult
    const hrvMean = rollingMean(hrvValues) || existing?.hrvMean || 50
    const rhrMean = rollingMean(rhrValues) || existing?.rhrMean || 60

    // Chronic load = 28-day mean of daily load values
    const recentLoad = loadValues.slice(-28)
    const chronicLoad = rollingMean(recentLoad) || existing?.chronicLoad || 300

    const baseline: ReadinessBaseline = {
      hrvMean,
      hrvSD:    rollingSD(hrvValues, hrvMean) || existing?.hrvSD || 10,
      rhrMean,
      rhrSD:    rollingSD(rhrValues, rhrMean) || existing?.rhrSD || 5,
      sleepNeedHours: existing?.sleepNeedHours ?? 8.0,
      chronicLoad,
      lastUpdated: todayStr,
      sampleDays: Math.min(sampleDays, 60),
    }

    await saveBaseline(baseline)
    if (isFirstRun) await AsyncStorage.setItem(BACKFILL_KEY, '1')

    return baseline
  } catch {
    // If HK fails (simulator, permissions revoked), return existing or default
    if (existing) return existing
    return defaultBaseline(todayStr)
  }
}

// Rolling sleep-debt accumulator. Primary consumer is the Haiku insights engine,
// not the daily score (which already penalises short sleep via sleepSub).
export async function updateSleepDebt(
  sleepHours: number,
  sleepNeedHours: number,
): Promise<SleepDebt> {
  const raw = await AsyncStorage.getItem(DEBT_KEY)
  const existing: SleepDebt | null = raw ? JSON.parse(raw) : null

  const dailyDeficit = Math.max(0, sleepNeedHours - sleepHours)
  const prevHours = existing?.hours ?? 0
  // Exponential decay approximation over a 14-day window
  const decayFactor = (14 - 1) / 14
  const newHours = parseFloat((prevHours * decayFactor + dailyDeficit).toFixed(1))

  const trend: SleepDebt['trend'] =
    newHours > prevHours ? 'accruing' :
    newHours < prevHours ? 'recovering' : 'stable'

  const debt: SleepDebt = {
    hours: newHours,
    windowDays: 14,
    trend,
    lastUpdated: new Date().toISOString().split('T')[0],
  }

  await AsyncStorage.setItem(DEBT_KEY, JSON.stringify(debt))
  return debt
}
```

- [ ] **Step 4: Run tests — all pass**

```bash
cd mobile && npx jest __tests__/lib/readinessBaseline.test.ts --no-coverage
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/readinessBaseline.ts mobile/__tests__/lib/readinessBaseline.test.ts
git commit -m "feat(readiness): baseline update job with rolling stats and AsyncStorage persistence"
```

---

## Task 6: Zustand store

**Files:**
- Create: `mobile/src/store/readiness.ts`

- [ ] **Step 1: Create `readiness.ts`**

```typescript
// mobile/src/store/readiness.ts

import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { computeReadiness } from '@/lib/readinessEngine'
import type { DailyReadiness, CyclePhase } from '@/lib/readinessEngine'
import { updateBaseline, isBackfillDone } from '@/lib/readinessBaseline'
import {
  fetchOvernightHRV, fetchRHR, fetchSleepSamples,
  fetchActivityLoad, mean,
} from '@/lib/healthKitReadiness'
import type { TodayCheckin } from '@/lib/dashboardData'

const DAILY_KEY = 'readiness_daily_v1'

interface ReadinessState {
  today:      DailyReadiness | null
  isLoading:  boolean
  isFirstRun: boolean   // true until first-run backfill completes; drives shimmer state
  refresh(phase: CyclePhase | null, checkin: TodayCheckin): Promise<void>
}

export const useReadinessStore = create<ReadinessState>((set) => ({
  today:      null,
  isLoading:  false,
  isFirstRun: false,

  async refresh(phase, checkin) {
    set({ isLoading: true })

    try {
      const firstRun = !(await isBackfillDone())
      if (firstRun) set({ isFirstRun: true })

      const baseline = await updateBaseline(firstRun)

      const today = new Date()
      const todayStr = today.toISOString().split('T')[0]

      const sevenDaysAgo = new Date(today)
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)

      const [{ values: hrvValues }, rhrValues, sleep, loadValues] = await Promise.all([
        fetchOvernightHRV(yesterday, today),
        fetchRHR(yesterday, today),
        fetchSleepSamples(todayStr),
        fetchActivityLoad(sevenDaysAgo, today),
      ])

      // TodayCheckin.sleep maps to sleep_quality in TodayInputs
      const checkinInput =
        checkin.done && checkin.energy && checkin.mood && checkin.sleep
          ? { energy: checkin.energy, mood: checkin.mood, sleep_quality: checkin.sleep }
          : null

      const readiness = computeReadiness(
        {
          hrv:           hrvValues.length ? mean(hrvValues) : null,
          rhr:           rhrValues.length ? mean(rhrValues) : null,
          sleepHours:    sleep?.sleepHours  ?? null,
          timeInBed:     sleep?.timeInBed   ?? null,
          deepHours:     sleep?.deepHours   ?? null,
          remHours:      sleep?.remHours    ?? null,
          acuteLoad7day: loadValues.length  ? loadValues.reduce((s, v) => s + v, 0) : null,
          checkin:       checkinInput,
        },
        baseline,
        phase,
      )

      // Persist to daily cache; evict entries older than 14 days
      const raw = await AsyncStorage.getItem(DAILY_KEY)
      const cache: Record<string, DailyReadiness> = raw ? JSON.parse(raw) : {}
      const cutoff = new Date(today)
      cutoff.setDate(cutoff.getDate() - 14)
      const cutoffStr = cutoff.toISOString().split('T')[0]
      Object.keys(cache).forEach(k => { if (k < cutoffStr) delete cache[k] })
      cache[todayStr] = readiness
      await AsyncStorage.setItem(DAILY_KEY, JSON.stringify(cache))

      set({ today: readiness, isLoading: false, isFirstRun: false })
    } catch (e) {
      console.warn('[readiness] refresh error:', e instanceof Error ? e.message : String(e))
      set({ isLoading: false, isFirstRun: false })
    }
  },
}))
```

- [ ] **Step 2: Typecheck**

```bash
cd mobile && npx tsc --noEmit 2>&1 | grep readiness
```

Expected: no errors on readiness files.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/store/readiness.ts
git commit -m "feat(readiness): Zustand store with refresh orchestration"
```

---

## Task 7: ReadinessRow component

**Files:**
- Create: `mobile/src/components/ui/ReadinessRow.tsx`

- [ ] **Step 1: Create `ReadinessRow.tsx`**

```typescript
// mobile/src/components/ui/ReadinessRow.tsx

import React, { useEffect, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { SymbolView } from 'expo-symbols'
import { VirraCard } from './VirraCard'
import { VirraText } from './VirraText'
import { Shimmer } from './Shimmer'
import { useReadinessStore } from '@/store/readiness'
import { colors, spacing } from '@/constants/theme'
import type { Confidence, CyclePhase } from '@/lib/readinessEngine'

const TICK_COUNT = 40
const ANIM_DURATION_MS = 600

// Interpolates between two hex colours by fraction t (0–1)
function lerpHex(a: string, b: string, t: number): string {
  const parse = (h: string, pos: number) => parseInt(h.slice(pos, pos + 2), 16)
  const r = Math.round(parse(a, 1) + (parse(b, 1) - parse(a, 1)) * t).toString(16).padStart(2, '0')
  const g = Math.round(parse(a, 3) + (parse(b, 3) - parse(a, 3)) * t).toString(16).padStart(2, '0')
  const bl = Math.round(parse(a, 5) + (parse(b, 5) - parse(a, 5)) * t).toString(16).padStart(2, '0')
  return `#${r}${g}${bl}`
}

// Score-driven colour: lime at peak, amber in mid-range, dawn orange when low
function scoreToColor(score: number): string {
  if (score >= 70) return lerpHex('#C8E820', '#D4FF26', (score - 70) / 30)
  if (score >= 50) return lerpHex('#FF9A3D', '#C8E820', (score - 50) / 20)
  return lerpHex('#FF6B3D', '#FF9A3D', score / 50)
}

function footerText(phase: CyclePhase | null, confidence: Confidence): string {
  if (confidence === 'low') {
    return 'LEARNING YOUR BASELINE · CHECK IN TO IMPROVE ACCURACY'
  }
  const confLabel = confidence === 'high' ? 'HIGH CONFIDENCE' : 'MEDIUM CONFIDENCE'
  if (!phase) return confLabel
  const phaseLabel = phase.toUpperCase()
  return `${phaseLabel} PHASE · CYCLE-CORRECTED · ${confLabel}`
}

export function ReadinessRow() {
  const { today, isLoading, isFirstRun } = useReadinessStore()
  const [filledCount, setFilledCount] = useState(0)

  // Animate tick fill whenever a new score arrives
  useEffect(() => {
    if (!today) return
    setFilledCount(0)
    const target = Math.round((today.score / 100) * TICK_COUNT)
    if (target === 0) return

    const intervalMs = ANIM_DURATION_MS / target
    let i = 0
    const timer = setInterval(() => {
      i += 1
      setFilledCount(i)
      if (i >= target) clearInterval(timer)
    }, intervalMs)

    return () => clearInterval(timer)
  }, [today?.score])

  // Show shimmer during first-run backfill or loading
  if (isLoading || isFirstRun) {
    return (
      <VirraCard>
        <View style={s.barRow}>
          <SymbolView name="bolt.fill" size={17} tintColor={colors.muted} />
          <Shimmer height={20} style={{ flex: 1 }} />
          <VirraText variant="mono" size={15} color={colors.muted} style={s.score}>—</VirraText>
        </View>
        <VirraText variant="mono" size={8} color={colors.muted} style={s.footer}>
          ANALYSING YOUR HEALTH HISTORY…
        </VirraText>
      </VirraCard>
    )
  }

  // Hide entirely when no HK data available (iPhone-only, no HRV/RHR)
  if (!today) return null

  const color = scoreToColor(today.score)
  const footerColor = today.confidence === 'low' ? colors.muted : `${color}4D`

  return (
    <VirraCard>
      <View style={s.barRow}>
        <SymbolView name="bolt.fill" size={17} tintColor={color} />
        <View style={s.ticks}>
          {Array.from({ length: TICK_COUNT }).map((_, i) => (
            <View
              key={i}
              style={[s.tick, i < filledCount ? { backgroundColor: color } : s.tickEmpty]}
            />
          ))}
        </View>
        <VirraText variant="mono" size={15} color={color} style={s.score}>
          {today.score}%
        </VirraText>
      </View>
      <VirraText variant="mono" size={8} style={[s.footer, { color: footerColor }]}>
        {footerText(today.phase, today.confidence)}
      </VirraText>
    </VirraCard>
  )
}

const s = StyleSheet.create({
  barRow:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ticks:     { flex: 1, flexDirection: 'row', gap: 1.5 },
  tick:      { flex: 1, height: 20, borderRadius: 1.5 },
  tickEmpty: { backgroundColor: 'rgba(255,255,255,0.07)' },
  score:     { minWidth: 40, textAlign: 'right' },
  footer:    { marginTop: spacing.xs, letterSpacing: 1.2 },
})
```

- [ ] **Step 2: Typecheck**

```bash
cd mobile && npx tsc --noEmit 2>&1 | grep -i readiness
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/ui/ReadinessRow.tsx
git commit -m "feat(readiness): ReadinessRow component with shimmer and animated fill"
```

---

## Task 8: Dashboard integration

**Files:**
- Modify: `mobile/app/(app)/(tabs)/index.tsx`

- [ ] **Step 1: Add import at the top of `index.tsx`**

Add to the existing import block (after the `WeekStrip` import, for example):

```typescript
import { ReadinessRow } from '@/components/ui/ReadinessRow'
import { useReadinessStore } from '@/store/readiness'
```

- [ ] **Step 2: Wire `refresh()` into `loadAll()`**

In `DashboardScreen`, add:

```typescript
const refreshReadiness = useReadinessStore((s) => s.refresh)
```

Inside `loadAll()`, after the `checkin` fetch resolves (it's inside the `Promise.all`), add a `readiness` refresh call. The `Promise.all` already fetches `ci` (the check-in), so chain readiness after:

Replace the existing `Promise.all` block:

```typescript
    try {
      const [monthly, nutr, ci] = await Promise.all([
        getMonthlyStats(session.user.id, today),
        getTodayNutritionTotals(session.user.id, today, cycleInfo?.phase ?? null, resolvedLoad),
        getTodayCheckin(session.user.id, today),
      ]);
      setMonthlyStats(monthly);
      setNutrition(nutr);
      setCheckin(ci);
      // Readiness refresh runs after check-in resolves so it can include today's subjective score
      refreshReadiness(cycleInfo?.phase ?? null, ci).catch(() => {});
    } catch { /* no-op */ }
```

- [ ] **Step 3: Insert `ReadinessRow` between phase hero and today-session row**

Find this comment in the JSX:

```typescript
        {/* 3. Today session + rings */}
```

Insert the readiness row immediately before it:

```typescript
        {/* 3. Readiness */}
        <ReadinessRow />

        {/* 4. Today session + rings */}
```

Also renumber the existing comments in sequence:

```
/* 4. Today session + rings */   (was 3)
/* 5. Nutrition arc */           (was 4)
/* 6. Quick log */               (was 5)
/* 7. Week strip */              (was 6)
/* 8. Phase tips */              (was 7)
/* 9. Fitness update card */     (was 8)
/* 10. Action tiles */           (was 9)
```

- [ ] **Step 4: Full typecheck**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 5: Run full test suite**

```bash
cd mobile && npx jest --no-coverage
```

Expected: all tests pass (no regressions).

- [ ] **Step 6: Start dev server and verify**

```bash
cd mobile && npx expo start --clear
```

Open on device/simulator. Verify:
- Readiness row appears between the phase hero card and the today-session row
- Shimmer shows while loading (visible briefly on first run)
- Ticks animate left-to-right in ~600ms
- Tick and score colour matches readiness level (lime for high, orange for low)
- Footer text shows phase and confidence
- Row hides entirely on iPhone Simulator (no HRV/RHR data) — score will be null

- [ ] **Step 7: Commit**

```bash
git add mobile/app/(app)/(tabs)/index.tsx
git commit -m "feat(readiness): wire ReadinessRow into Dashboard"
```
