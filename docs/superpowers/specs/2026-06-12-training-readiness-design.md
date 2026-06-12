# Training Readiness Score — Design Spec
**Date:** 2026-06-12  
**Status:** Approved

---

## Overview

A 0–100 daily readiness bar in the Dashboard, derived from on-device HealthKit data and corrected for menstrual cycle phase. The bar sits between the phase hero card and the today session/rings row. Cycle correction is applied inside the HRV and RHR calculations so a normal luteal-phase dip is not misread as poor recovery.

Design principle: this is a **trend indicator**, not a precise physiological measurement. Every score carries a confidence level reflecting how much HealthKit history backed it.

---

## Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Dashboard row design | Icon · animated ticks · score inline · footer | Closest to reference; clean, no distraction |
| First-run backfill UI | In-row skeleton state | No navigation change; shimmer resolves to filled bar |
| Detail view (v1) | None — row is non-interactive | Add drill-down screen once scoring is proven |
| Colour | Score-driven: lime ≥70, amber 50–69, orange <50 | Bar communicates readiness at a glance |
| Confidence display | Footer text only; low/learning state uses muted grey | Doesn't pollute the primary score number |
| Architecture | New lib + Zustand store (Option A) | Pure scoring function is unit-testable; store pattern matches codebase |
| Persistence | AsyncStorage (on-device) | Consistent with offline-first scoring engine |
| Cycle offsets (v1) | Population priors only | Learn from real data post-launch |

---

## Files

```
mobile/src/lib/healthKitReadiness.ts    — HK query wrappers
mobile/src/lib/readinessEngine.ts       — pure scoring function (no HK dependency)
mobile/src/lib/readinessBaseline.ts     — baseline update job + AsyncStorage persistence
mobile/src/store/readiness.ts           — Zustand store
mobile/src/components/ui/ReadinessRow.tsx — dashboard row component
```

---

## Data Models

### AsyncStorage keys

| Key | Contents |
|---|---|
| `readiness_baseline_v1` | `ReadinessBaseline` JSON |
| `readiness_daily_v1` | `Record<date, DailyReadiness>` — last 14 days |
| `readiness_sleep_debt_v1` | `SleepDebt` JSON |
| `readiness_backfill_done_v1` | `"1"` once first-run backfill completed |

### TypeScript interfaces

```ts
type Confidence = 'high' | 'medium' | 'low'
type CyclePhase = 'menstrual' | 'follicular' | 'ovulatory' | 'luteal'

interface ReadinessBaseline {
  hrvMean: number
  hrvSD: number
  rhrMean: number
  rhrSD: number
  sleepNeedHours: number        // default 8.0
  chronicLoad: number           // 28-day rolling mean of daily load
  lastUpdated: string           // ISO date string
  sampleDays: number
}

interface DailyReadiness {
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

interface SleepDebt {
  hours: number
  windowDays: number            // 14
  trend: 'accruing' | 'recovering' | 'stable'
  lastUpdated: string
}

interface TodayInputs {
  hrv: number | null
  rhr: number | null
  sleepHours: number | null
  timeInBed: number | null
  deepHours: number | null
  remHours: number | null
  acuteLoad7day: number | null
  checkin: { energy: number; mood: number; sleep_quality: number } | null
}

interface SleepWindow {
  sleepHours: number
  timeInBed: number
  deepHours: number | null
  remHours: number | null
}
```

### Tuning constants (exposed, not hardcoded inline)

```ts
const READINESS_CONFIG = {
  deviationK: 15,
  weights: { hrv: 0.35, rhr: 0.20, sleep: 0.25, load: 0.20 },
  sleepWeights: { duration: 0.50, continuity: 0.25, stage: 0.25 },
  sleepWeightsFallbackNoStages: { duration: 0.65, continuity: 0.35 },
  acwrThresholds: { low: 0.8, sweet: 1.3, caution: 1.5 },
  sleepEfficiencyTarget: 0.85,
  sleepRestorativeTarget: 0.40,
  confidenceThresholds: { high: 60, medium: 21 },
}
```

### Population priors (v1 — used until per-user cycle learning ships)

```ts
const PHASE_OFFSETS: Record<CyclePhase, { hrv: number; rhr: number }> = {
  menstrual:  { hrv: -0.05, rhr: +1.0 },
  follicular: { hrv: +0.05, rhr: -1.0 },
  ovulatory:  { hrv:  0.00, rhr:  0.0 },
  luteal:     { hrv: -0.12, rhr: +3.0 },
}
```

---

## `healthKitReadiness.ts` — Query Wrappers

Four async functions wrapping `react-native-health` callbacks in Promises. All return safely when HK is unavailable (simulator, no watch).

```ts
fetchOvernightHRV(startDate: Date, endDate: Date): Promise<number[]>
fetchRHR(startDate: Date, endDate: Date): Promise<number[]>
fetchSleepSamples(date: string): Promise<SleepWindow | null>
fetchActivityLoad(startDate: Date, endDate: Date): Promise<number[]>
```

**HRV filtering:** pull sleep samples first to get the overnight window boundary, then filter SDNN samples to that window. Daytime samples are excluded — they are noisy with activity and do not approximate the rMSSD that Oura/Whoop use.

**Permissions:** HRV (`HeartRateVariability`), RHR (`RestingHeartRate`), and `SleepAnalysis` are already in the existing permission set in `permissionsConfig.ts` — no permission changes required.

---

## `readinessEngine.ts` — Scoring Pipeline

```ts
function computeReadiness(
  inputs: TodayInputs,
  baseline: ReadinessBaseline,
  phase: CyclePhase | null,
): DailyReadiness
```

Pure function — no HealthKit dependency, no AsyncStorage. Unit-testable with fixture data.

### Pipeline (order matters — cycle-correct first)

**Step 1 — Cycle-corrected expected values**
```
expectedHRV = baseline.hrvMean × (1 + offset.hrv)
expectedRHR = baseline.rhrMean + offset.rhr
```

**Step 2 — Z-scores**
```
zHRV = (todayHRV − expectedHRV) / baseline.hrvSD
zRHR = (todayRHR − expectedRHR) / baseline.rhrSD
```

**Step 3 — Sub-scores (each clamped 0–100)**
```
hrvSub = clamp(50 + 15 × zHRV, 0, 100)   // higher HRV = better
rhrSub = clamp(50 − 15 × zRHR, 0, 100)   // lower RHR = better

// Sleep (blended, degrades gracefully):
durationScore   = clamp(100 × sleepHours / sleepNeedHours, 0, 100)
continuityScore = clamp(100 × (efficiency − 0.70) / 0.25, 0, 100)
stageScore      = clamp(100 × restorativeFrac / 0.40, 0, 100)

// Full watch data:  0.50 duration + 0.25 continuity + 0.25 stage
// No stage data:    0.65 duration + 0.35 continuity
// Duration only:    sleepSub = durationScore (caps sleep's confidence contribution)

// Load (ACWR sweet-spot curve):
acwr = acuteLoad7day / baseline.chronicLoad
loadSub =
  acwr ≤ 0.8  → 70
  acwr ≤ 1.3  → 100
  acwr ≤ 1.5  → 80
  acwr  > 1.5 → max(40, 100 − (acwr − 1.5) × 60)
```

**Step 4 — Combine**
```
raw = 0.35×hrvSub + 0.20×rhrSub + 0.25×sleepSub + 0.20×loadSub

score = checkin present
  ? round(0.8 × raw + 0.2 × checkinSub)
  : round(raw)
```

`checkinSub = (avg(energy, mood, sleep_quality) − 1) / 4 × 100`
where each value is from `symptom_logs` (1–5 scale).

**Step 5 — Confidence**
```
sampleDays ≥ 60  → high
sampleDays 21–59 → medium
sampleDays < 21  → low
```

iPhone-only users (no HRV/RHR available) → row hidden entirely; no misleading score shown.

### Graceful degradation

| Missing input | Behaviour |
|---|---|
| No HRV | `hrvSub = 50` (neutral); lowers confidence |
| No RHR | `rhrSub = 50` (neutral); lowers confidence |
| Sleep duration only | `sleepSub = durationScore`; caps confidence |
| No sleep data | `sleepSub = 50` (neutral) |
| No load data | `loadSub = 70` (mild detraining default) |
| No check-in | Pure objective score, no blending |

---

## `readinessBaseline.ts` — Baseline Update Job

```ts
updateBaseline(isFirstRun: boolean): Promise<ReadinessBaseline>
```

Runs once per day, on first app foreground. Checks `lastUpdated` date to skip if already run today.

**Standard run:**
1. Pull last 60 days of overnight HRV and RHR
2. Recompute `hrvMean/hrvSD`, `rhrMean/rhrSD`
3. Recompute `chronicLoad` (28-day mean of `fetchActivityLoad`)
4. Update `sampleDays`
5. Persist to `readiness_baseline_v1`
6. Update `SleepDebt` from last 14 days of sleep vs `sleepNeedHours`

**First-run backfill** (`readiness_backfill_done_v1` absent):
- Same job but queries from `Date.distantPast` (up to 60 days wherever available)
- `sampleDays` reflects actual available history, not assumed
- Sets `readiness_backfill_done_v1 = "1"` on completion
- Baseline update and scoring are **separate steps** — baseline is slow rolling context, scoring is today's reading against it

---

## `store/readiness.ts` — Zustand Store

```ts
interface ReadinessStore {
  today: DailyReadiness | null
  isLoading: boolean
  isFirstRun: boolean           // true until backfill_done flag is set
  refresh(phase: CyclePhase | null, checkin: TodayCheckin): Promise<void>
}
```

`refresh()` orchestration:
1. Set `isLoading = true`; check backfill flag → set `isFirstRun` if absent
2. Run `updateBaseline(isFirstRun)`
3. Fetch today's HK inputs via `healthKitReadiness.ts`
4. Call `computeReadiness()` → persist to `readiness_daily_v1` → set `today`
5. Set `isLoading = false`, `isFirstRun = false`

`refresh()` is called inside the dashboard's existing `loadAll()` callback — runs on mount and on every app foreground, consistent with other dashboard data.

---

## `ReadinessRow.tsx` — Component

### Three render states

**Loading / first-run:**
- `Shimmer` component (already in codebase) behind a grey tick strip
- Footer: `ANALYSING YOUR HEALTH HISTORY…` in muted grey

**Score ready:**
- 40 tick marks, filled left-to-right over ~600ms via `setInterval` on mount
- Tick colour and score text colour interpolated from score value:
  ```
  score ≥ 70  → lerp(#C8E820 → #D4FF26)   (yellow-green → lime)
  score 50–69 → lerp(#FF9A3D → #C8E820)   (amber → yellow-green)
  score  < 50 → lerp(#FF6B3D → #FF9A3D)   (dawn orange → amber)
  ```
- Animation: ticks styled via direct ref mutation (avoids 40 re-renders per interval tick)
- Footer: `{PHASE} PHASE · CYCLE-CORRECTED · {CONFIDENCE} CONFIDENCE` in matching colour at 30% opacity
- Low/learning confidence footer: `LEARNING YOUR BASELINE · CHECK IN TO IMPROVE ACCURACY` in neutral muted grey

**No HK data (iPhone-only):**
- Row not rendered — no misleading score shown to users without HRV/RHR

### Layout
```
[⚡] [████████████████████████░░░░░░] [82%]
LUTEAL PHASE · CYCLE-CORRECTED · HIGH CONFIDENCE
```

Row is non-interactive in v1 (no tap-through). `VirraCard` wrapper, consistent with surrounding dashboard cards.

---

## Dashboard Integration

In `app/(app)/(tabs)/index.tsx`, after the phase hero `<Pressable>` block and before `{/* 3. Today session + rings */}`:

```tsx
{/* 3. Readiness */}
<ReadinessRow />

{/* 4. Today session + rings */}
<View style={styles.heroRow}>
```

`refresh()` added to `loadAll()`:
```ts
readinessStore.refresh(cycleInfo?.phase ?? null, checkin)
```

Because `checkin` is fetched in the same `loadAll()`, readiness is called after the check-in fetch resolves.

---

## Sleep Debt (narrative output, not a score term)

`updateBaseline()` maintains a rolling `SleepDebt` accumulator persisted to `readiness_sleep_debt_v1`. This is an **output for the insight narrative engine**, not fed back into the daily score (which would double-penalise the same short night via `durationScore`). Consumed by Haiku insights generation when available — e.g. "You're carrying ~4h of sleep debt this week."

---

## Build Order

1. `healthKitReadiness.ts` — query wrappers (HRV, RHR, sleep, activity load)
2. `readinessEngine.ts` — pure scoring function + unit tests
3. `readinessBaseline.ts` — baseline update job + AsyncStorage persistence
4. `store/readiness.ts` — Zustand store + `refresh()` orchestration
5. `ReadinessRow.tsx` — shimmer → animated fill → footer; no-HK hidden state
6. Dashboard integration — slot row in, wire `refresh()` into `loadAll()`

---

## Out of Scope (v1)

- Tap-through detail screen (planned follow-on)
- Per-user learned cycle offsets — population priors used throughout v1
- Sleep debt surfaced in UI — available to Haiku insights engine only
- Android / non-HealthKit data sources
