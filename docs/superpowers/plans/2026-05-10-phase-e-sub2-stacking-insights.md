# Phase E Sub-project 2 — Plan Stacking + Insights Surfacing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire plan stacking load-balancing into the intelligence layer so a concurrent gym block reduces run km targets consistently across the WeekStrip, SessionDetailModal, and insights; surface dropped-session modality breakdowns in the Insights screen.

**Architecture:** `getWeeklyVolumePlan` gains an optional `loadScale` param applied after redistribution; `getDaySessionDetail` fetches all active blocks, computes `loadScale` via `computeBlockLoad`, and stores `base_distance_km` + `volume_adjustment_note` in `DayDetail`. `getDailyTrainingContext` applies the same stacking downgrade to the WeekStrip load-tier label. `insightMetrics.ts` adds `droppedByModality` from a one-field query extension; `insights.tsx` renders it conditionally below the adherence %.

**Tech Stack:** React Native, Supabase (PostgREST), existing `computeBlockLoad`/`getActiveBlocks` from `trainingBlocks.ts`, `VirraText`, Zustand-free (all data fetched from Supabase).

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `mobile/src/lib/volumePlan.ts` | `base_distance_km` on `RunSessionDetail`; `volume_adjustment_note` on `DayDetail`; `buildVolumeAdjustmentNote` pure fn; `loadScale` param on `getWeeklyVolumePlan`; stacking fetch + note in `getDaySessionDetail` |
| Modify | `mobile/src/lib/dailyTrainingContext.ts` | Stacking-aware load-tier downgrade after `topLoad` computed |
| Modify | `mobile/src/components/ui/SessionDetailModal.tsx` | Render `8.5 → 6.8km` + `volume_adjustment_note` |
| Modify | `mobile/src/lib/insightMetrics.ts` | Add `modality` to session query; `droppedByModality` field |
| Modify | `mobile/app/(app)/insights.tsx` | Render modality breakdown below adherence % when non-null |
| Modify | `mobile/__tests__/lib/volumePlan.test.ts` | Tests for `buildVolumeAdjustmentNote` |

---

## Task 1: `volumePlan.ts` — Interfaces + `buildVolumeAdjustmentNote` + `loadScale`

**Files:**
- Modify: `mobile/src/lib/volumePlan.ts`
- Modify: `mobile/__tests__/lib/volumePlan.test.ts`

- [ ] **Step 1: Write failing tests for `buildVolumeAdjustmentNote`**

Add to the bottom of `mobile/__tests__/lib/volumePlan.test.ts`:

```typescript
import {
  getSessionPaceTarget,
  _redistributeKm,
  distributeWeeklyKm,
  formatPace,
  buildVolumeAdjustmentNote,
  type WeekInput,
} from '@/lib/volumePlan';

// --- buildVolumeAdjustmentNote ---

test('returns null when loadScale is 1.0 and phase is follicular', () => {
  expect(buildVolumeAdjustmentNote(1.0, 'follicular')).toBeNull();
});

test('returns null when loadScale is 1.0 and phase is null', () => {
  expect(buildVolumeAdjustmentNote(1.0, null)).toBeNull();
});

test('returns gym note when loadScale < 1.0 and phase is neutral', () => {
  expect(buildVolumeAdjustmentNote(0.8, 'follicular')).toBe('Volume adjusted · gym block');
});

test('returns phase note when loadScale is 1.0 and phase is luteal', () => {
  expect(buildVolumeAdjustmentNote(1.0, 'luteal')).toBe('Volume adjusted · luteal phase');
});

test('returns combined note when gym block and luteal phase both apply', () => {
  expect(buildVolumeAdjustmentNote(0.8, 'luteal')).toBe('Volume adjusted · gym block + luteal phase');
});

test('returns phase note for menstrual phase with no gym block', () => {
  expect(buildVolumeAdjustmentNote(1.0, 'menstrual')).toBe('Volume adjusted · menstrual phase');
});

test('returns null for ovulatory phase with no gym block', () => {
  expect(buildVolumeAdjustmentNote(1.0, 'ovulatory')).toBeNull();
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx jest --no-coverage volumePlan 2>&1 | tail -10
```
Expected: FAIL — `buildVolumeAdjustmentNote` is not exported.

- [ ] **Step 3: Add `base_distance_km` to `RunSessionDetail`**

In `mobile/src/lib/volumePlan.ts`, find `RunSessionDetail` (lines 29–39). Replace with:

```typescript
export interface RunSessionDetail {
  kind:               'run';
  planned_session_id: string;
  session_label:      string;
  distance_km:        number;         // post-stacking (actual target)
  base_distance_km:   number | null;  // pre-gym-scale; null when no stacking
  pace_target_secs:   number;
  estimated_minutes:  number;
  status:             string;
  actual_pace_secs:   number | null;
  actual_distance_km: number | null;
}
```

- [ ] **Step 4: Add `volume_adjustment_note` to `DayDetail`**

Find `DayDetail` (lines 59–66). Replace with:

```typescript
export interface DayDetail {
  date:                   string;
  sessions:               SessionDetail[];
  events:                 UserEvent[];
  phase:                  CyclePhase | null;
  phase_guidance:         string;
  volume_plan:            VolumePlanResult;
  volume_adjustment_note: string | null;
}
```

- [ ] **Step 5: Export `buildVolumeAdjustmentNote`**

Add this function after the `PHASE_GUIDANCE` constant (before `getGoalPace`). Locate `PHASE_GUIDANCE` with `grep -n "PHASE_GUIDANCE" mobile/src/lib/volumePlan.ts` to find the exact line, then add after it:

```typescript
export function buildVolumeAdjustmentNote(
  loadScale: number,
  phase: CyclePhase | null,
): string | null {
  const gymReduced   = loadScale < 1.0;
  const phaseReduced = phase === 'luteal' || phase === 'menstrual';
  if (!gymReduced && !phaseReduced) return null;
  const parts: string[] = [];
  if (gymReduced)   parts.push('gym block');
  if (phaseReduced) parts.push(`${phase} phase`);
  return `Volume adjusted · ${parts.join(' + ')}`;
}
```

- [ ] **Step 6: Add `loadScale` parameter to `getWeeklyVolumePlan`**

Find the signature at line 329. Replace:
```typescript
export async function getWeeklyVolumePlan(
  userId:     string,
  blockId:    string,
  cycleStore: { periodStart: Date | null; cycleLength: number },
): Promise<VolumePlanResult> {
```
With:
```typescript
export async function getWeeklyVolumePlan(
  userId:     string,
  blockId:    string,
  cycleStore: { periodStart: Date | null; cycleLength: number },
  loadScale   = 1.0,
): Promise<VolumePlanResult> {
```

- [ ] **Step 7: Apply `loadScale` in the weeks construction**

Find the `weeks` construction (around line 428):
```typescript
  const weeks: WeekVolumePlan[] = weekInputs.map((w, i) => ({
    week_number: w.week_number,
    original_km: w.original_km,
    adjusted_km: w.is_past ? w.original_km : adjustedKms[i],
    phase:       w.phase,
    is_current:  w.is_current,
    is_past:     w.is_past,
  }));
```

Replace with:
```typescript
  const weeks: WeekVolumePlan[] = weekInputs.map((w, i) => ({
    week_number: w.week_number,
    original_km: w.original_km,
    adjusted_km: w.is_past
      ? w.original_km
      : Math.round(adjustedKms[i] * loadScale * 10) / 10,
    phase:       w.phase,
    is_current:  w.is_current,
    is_past:     w.is_past,
  }));
```

- [ ] **Step 8: Run tests**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx jest --no-coverage volumePlan 2>&1 | tail -10
```
Expected: 22 tests pass (15 existing + 7 new `buildVolumeAdjustmentNote` tests).

- [ ] **Step 9: TypeScript check**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | head -15
```
Expected: no errors. If `base_distance_km` causes type errors in `SessionDetailModal.tsx`, they are expected — Task 4 fixes them.

- [ ] **Step 10: Commit**

```bash
git add mobile/src/lib/volumePlan.ts mobile/__tests__/lib/volumePlan.test.ts
git commit -m "feat: volumePlan stacking — base_distance_km, volume_adjustment_note, loadScale in getWeeklyVolumePlan"
```

---

## Task 2: `volumePlan.ts` — Stacking Logic in `getDaySessionDetail`

**Files:**
- Modify: `mobile/src/lib/volumePlan.ts`

- [ ] **Step 1: Add import at top of `volumePlan.ts`**

The file currently imports from `./supabase` and `./cycleEngine`. Add after line 3:

```typescript
import { getActiveBlocks, computeBlockLoad } from './trainingBlocks';
```

- [ ] **Step 2: Fetch all active blocks once before the block loop**

In `getDaySessionDetail`, find the block loop setup (around line 484):
```typescript
  // Group by block_id
  const blockGroups: Record<string, typeof daySessions> = {};
  for (const s of daySessions) {
    if (!blockGroups[s.block_id]) blockGroups[s.block_id] = [];
    blockGroups[s.block_id].push(s);
  }

  const allSessions: SessionDetail[] = [];
  let volumePlan: VolumePlanResult = EMPTY_PLAN;
```

Replace with:
```typescript
  // Group by block_id
  const blockGroups: Record<string, typeof daySessions> = {};
  for (const s of daySessions) {
    if (!blockGroups[s.block_id]) blockGroups[s.block_id] = [];
    blockGroups[s.block_id].push(s);
  }

  // Fetch all active blocks once for stacking computation
  let allActiveBlocks: Awaited<ReturnType<typeof getActiveBlocks>> = [];
  let computedBlocks: ReturnType<typeof computeBlockLoad> = [];
  try {
    allActiveBlocks = await getActiveBlocks(userId);
    computedBlocks  = computeBlockLoad(allActiveBlocks, phase ?? 'follicular');
  } catch (e) {
    console.error('[volumePlan] getDaySessionDetail getActiveBlocks:', e);
  }

  const allSessions: SessionDetail[] = [];
  let volumePlan: VolumePlanResult = EMPTY_PLAN;
  let minRunLoadScale = 1.0; // tracks minimum across all run blocks for the note
```

- [ ] **Step 3: Compute `loadScale` per run block and pass to `getWeeklyVolumePlan`**

Find the run block section inside the block loop (around line 498):
```typescript
    if (runSessions.length > 0) {
      const [goalPace, plan] = await Promise.all([
        getGoalPace(userId, blockId, phase),
        getWeeklyVolumePlan(userId, blockId, {
          periodStart: cycleStore.periodStart,
          cycleLength: cycleStore.cycleLength,
        }),
      ]);
      volumePlan = plan;
```

Replace with:
```typescript
    if (runSessions.length > 0) {
      // Compute this block's load scale from stacking
      const blockIdx = allActiveBlocks.findIndex((b) => b.id === blockId);
      const loadScale = blockIdx >= 0 && computedBlocks[blockIdx]
        ? Math.min(1.0, computedBlocks[blockIdx].effective_load / (computedBlocks[blockIdx].load_modifier || 1))
        : 1.0;
      if (loadScale < minRunLoadScale) minRunLoadScale = loadScale;

      const [goalPace, plan] = await Promise.all([
        getGoalPace(userId, blockId, phase),
        getWeeklyVolumePlan(userId, blockId, {
          periodStart: cycleStore.periodStart,
          cycleLength: cycleStore.cycleLength,
        }, loadScale),
      ]);
      volumePlan = plan;
```

- [ ] **Step 4: Add `base_distance_km` to each run session push**

Find the `allSessions.push` call inside the run session loop (around line 553):
```typescript
        allSessions.push({
          kind:               'run',
          planned_session_id: s.id,
          session_label:      s.session_label,
          distance_km,
          pace_target_secs,
          estimated_minutes,
          status:             s.status,
          actual_pace_secs,
          actual_distance_km,
        });
```

Replace with:
```typescript
        const base_distance_km = loadScale < 1.0
          ? Math.round((distance_km / loadScale) * 10) / 10
          : null;

        allSessions.push({
          kind:               'run',
          planned_session_id: s.id,
          session_label:      s.session_label,
          distance_km,
          base_distance_km,
          pace_target_secs,
          estimated_minutes,
          status:             s.status,
          actual_pace_secs,
          actual_distance_km,
        });
```

- [ ] **Step 5: Add `volume_adjustment_note` to the return value**

Find the final return (around line 579):
```typescript
  return {
    date:         dateISO,
    sessions:     allSessions,
    events:       (events ?? []) as UserEvent[],
    phase,
    phase_guidance,
    volume_plan:  volumePlan,
  };
```

Replace with:
```typescript
  return {
    date:                   dateISO,
    sessions:               allSessions,
    events:                 (events ?? []) as UserEvent[],
    phase,
    phase_guidance,
    volume_plan:            volumePlan,
    volume_adjustment_note: buildVolumeAdjustmentNote(minRunLoadScale, phase),
  };
```

Also fix the early-return (no sessions) to include the new field. Find:
```typescript
  if (!daySessions?.length) {
    return {
      date: dateISO,
      sessions: [],
      events: (events ?? []) as UserEvent[],
      phase,
      phase_guidance,
      volume_plan: EMPTY_PLAN,
    };
  }
```

Replace with:
```typescript
  if (!daySessions?.length) {
    return {
      date:                   dateISO,
      sessions:               [],
      events:                 (events ?? []) as UserEvent[],
      phase,
      phase_guidance,
      volume_plan:            EMPTY_PLAN,
      volume_adjustment_note: buildVolumeAdjustmentNote(1.0, phase),
    };
  }
```

- [ ] **Step 6: TypeScript check + full test suite**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | head -20
cd /Users/pauldickenson/Claude/virra/mobile && npx jest --no-coverage 2>&1 | tail -8
```
Expected: no TS errors in `volumePlan.ts`; 22+ tests pass. (TypeScript may still complain about `SessionDetailModal.tsx` not accessing `base_distance_km` — that's fine, fixed in Task 4.)

- [ ] **Step 7: Commit**

```bash
git add mobile/src/lib/volumePlan.ts
git commit -m "feat: getDaySessionDetail — stacking load scale, base_distance_km, volume_adjustment_note"
```

---

## Task 3: `dailyTrainingContext.ts` — Stacking-Aware Load Tier

**Files:**
- Modify: `mobile/src/lib/dailyTrainingContext.ts`

- [ ] **Step 1: Read the file**

Read `mobile/src/lib/dailyTrainingContext.ts`. The function `getDailyTrainingContext` ends at line 98. The `topLoad` variable is set in the loop ending around line 89 and returned at line 91.

- [ ] **Step 2: Add import**

After line 3 (`import type { TrainingLoad } from './nutritionTargets';`), add:

```typescript
import { getActiveBlocks, computeBlockLoad } from './trainingBlocks';
```

- [ ] **Step 3: Apply stacking downgrade after the `topLoad` loop**

Find the return statement (around line 91):
```typescript
  return {
    inferred_load:    topLoad,
    planned_sessions: sessions,
    phase,
    phase_guidance:   phase ? PHASE_GUIDANCE[phase] : '',
    source_label:     topSource,
  };
```

Replace with:
```typescript
  // Apply stacking downgrade: if a gym block is active, reduce run load tier
  try {
    const allBlocks    = await getActiveBlocks(userId);
    const computed     = computeBlockLoad(allBlocks, phase ?? 'follicular');
    const runIdx       = allBlocks.findIndex((b) => b.modality === 'run');
    if (runIdx >= 0 && computed[runIdx]) {
      const loadScale = Math.min(
        1.0,
        computed[runIdx].effective_load / (computed[runIdx].load_modifier || 1),
      );
      if (loadScale < 0.75) {
        if (topLoad === 'hard' || topLoad === 'moderate') topLoad = 'easy';
      } else if (loadScale < 0.85) {
        if (topLoad === 'hard') topLoad = 'moderate';
      }
    }
  } catch (e) {
    console.error('[dailyTrainingContext] stacking fetch:', e);
    // leave topLoad unchanged on error
  }

  return {
    inferred_load:    topLoad,
    planned_sessions: sessions,
    phase,
    phase_guidance:   phase ? PHASE_GUIDANCE[phase] : '',
    source_label:     topSource,
  };
```

- [ ] **Step 4: TypeScript check + full test suite**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | head -10
cd /Users/pauldickenson/Claude/virra/mobile && npx jest --no-coverage 2>&1 | tail -8
```
Expected: no errors; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/dailyTrainingContext.ts
git commit -m "feat: dailyTrainingContext stacking-aware load tier — WeekStrip label reflects gym block suppression"
```

---

## Task 4: `SessionDetailModal.tsx` — Adjustment Note + Arrow Display

**Files:**
- Modify: `mobile/src/components/ui/SessionDetailModal.tsx`

- [ ] **Step 1: Update the run detail line**

In `mobile/src/components/ui/SessionDetailModal.tsx`, find the run detail line (around line 143–148):

```typescript
        {isRun && s.status !== 'dropped' && (
          <VirraText variant="mono" size={10} color={colors.muted} style={modal.detail}>
            {s.status === 'completed' && r.actual_distance_km
              ? `${r.actual_distance_km.toFixed(1)}km · ${r.actual_pace_secs ? formatPace(r.actual_pace_secs) : '—'} · actual`
              : `${r.distance_km.toFixed(1)}km · ${formatPace(r.pace_target_secs)} · ~${r.estimated_minutes}min`}
          </VirraText>
        )}
```

Replace with:

```typescript
        {isRun && s.status !== 'dropped' && (
          <VirraText variant="mono" size={10} color={colors.muted} style={modal.detail}>
            {s.status === 'completed' && r.actual_distance_km
              ? `${r.actual_distance_km.toFixed(1)}km · ${r.actual_pace_secs ? formatPace(r.actual_pace_secs) : '—'} · actual`
              : r.base_distance_km
                ? `${r.base_distance_km.toFixed(1)} → ${r.distance_km.toFixed(1)}km · ${formatPace(r.pace_target_secs)} · ~${r.estimated_minutes}min`
                : `${r.distance_km.toFixed(1)}km · ${formatPace(r.pace_target_secs)} · ~${r.estimated_minutes}min`}
          </VirraText>
        )}
```

- [ ] **Step 2: Add adjustment note below the phase banner**

Find the loading indicator block in the return JSX (around line 240):
```tsx
      {/* Loading */}
      {loading && (
        <View style={modal.loadingWrap}>
          <ActivityIndicator color={colors.pulse} />
        </View>
      )}
```

Insert the adjustment note between the phase banner and the loading indicator:
```tsx
      {/* Volume adjustment note */}
      {!loading && detail?.volume_adjustment_note && (
        <VirraText
          variant="mono"
          size={9}
          color={colors.muted}
          style={{ marginBottom: spacing.xs }}
        >
          {detail.volume_adjustment_note}
        </VirraText>
      )}

      {/* Loading */}
      {loading && (
        <View style={modal.loadingWrap}>
          <ActivityIndicator color={colors.pulse} />
        </View>
      )}
```

- [ ] **Step 3: TypeScript check + full test suite**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | head -10
cd /Users/pauldickenson/Claude/virra/mobile && npx jest --no-coverage 2>&1 | tail -5
```
Expected: no errors; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/components/ui/SessionDetailModal.tsx
git commit -m "feat: SessionDetailModal shows 8.5→6.8km arrow and volume adjustment note when stacking active"
```

---

## Task 5: `insightMetrics.ts` + `insights.tsx` — Dropped Modality Breakdown

**Files:**
- Modify: `mobile/src/lib/insightMetrics.ts`
- Modify: `mobile/app/(app)/insights.tsx`

- [ ] **Step 1: Add `modality` to the `planned_sessions` query**

In `mobile/src/lib/insightMetrics.ts`, find the `planned_sessions` query (around line 97):
```typescript
    supabase
      .from('planned_sessions')
      .select('status')
      .eq('user_id', userId)
      .gte('scheduled_date', window28ISO)
      .lte('scheduled_date', todayISO)
      .neq('status', 'moved'),
```

Replace `.select('status')` with `.select('status, modality')`:
```typescript
    supabase
      .from('planned_sessions')
      .select('status, modality')
      .eq('user_id', userId)
      .gte('scheduled_date', window28ISO)
      .lte('scheduled_date', todayISO)
      .neq('status', 'moved'),
```

- [ ] **Step 2: Add `droppedByModality` to the `InsightMetrics` interface**

Find the interface (lines 21–33):
```typescript
export interface InsightMetrics {
  streakDays:              number;
  weeklyKm:                number;
  monthlyKm:               number;
  totalKm:                 number;
  consistencyPct:          number;
  phasePaces:              PhasePace[];
  activitiesThisWeek:      number;
  trainingAdherencePct:    number | null;
  nutritionCompliancePct:  number | null;
  symptomTrend:            SymptomTrend | null;
  fuellingAlignment:       FuellingAlignment | null;
}
```

Replace with:
```typescript
export interface InsightMetrics {
  streakDays:              number;
  weeklyKm:                number;
  monthlyKm:               number;
  totalKm:                 number;
  consistencyPct:          number;
  phasePaces:              PhasePace[];
  activitiesThisWeek:      number;
  trainingAdherencePct:    number | null;
  droppedByModality:       Record<string, number> | null;
  nutritionCompliancePct:  number | null;
  symptomTrend:            SymptomTrend | null;
  fuellingAlignment:       FuellingAlignment | null;
}
```

- [ ] **Step 3: Compute `droppedByModality` after the existing `droppedSessions` line**

Find (around line 166):
```typescript
  const droppedSessions    = sessionWindow.filter((s: any) => s.status === 'dropped').length;
  const trainingAdherencePct = completedSessions + droppedSessions > 0
    ? Math.round((completedSessions / (completedSessions + droppedSessions)) * 100)
    : null;
```

Replace with:
```typescript
  const droppedSessions    = sessionWindow.filter((s: any) => s.status === 'dropped').length;
  const trainingAdherencePct = completedSessions + droppedSessions > 0
    ? Math.round((completedSessions / (completedSessions + droppedSessions)) * 100)
    : null;
  const droppedByModality: Record<string, number> | null = droppedSessions === 0
    ? null
    : (sessionWindow as any[])
        .filter((s) => s.status === 'dropped')
        .reduce((acc: Record<string, number>, s: any) => {
          acc[s.modality] = (acc[s.modality] ?? 0) + 1;
          return acc;
        }, {});
```

- [ ] **Step 4: Add `droppedByModality` to the return value of `computeInsightMetrics`**

Find the final return object in `computeInsightMetrics`. Add `droppedByModality` alongside `trainingAdherencePct`:

```typescript
    trainingAdherencePct,
    droppedByModality,
```

(It's a large return object — locate `trainingAdherencePct` in the return and add `droppedByModality` on the next line.)

- [ ] **Step 5: Render breakdown in `insights.tsx`**

In `mobile/app/(app)/insights.tsx`, find the ADHERENCE `MetricTile` block (around line 183):
```tsx
            <MetricTile
              label="ADHERENCE"
              value={loadingMetrics ? '—' : metrics?.trainingAdherencePct != null ? `${metrics.trainingAdherencePct}%` : '—'}
              sub="LAST 28 DAYS"
            />
```

The metrics grid is inside a `VirraCard`. After the closing `</View>` of the `metricsGrid` and before the closing `</VirraCard>` (around line 196), add:

```tsx
          {metrics?.droppedByModality && (
            <VirraText
              variant="mono"
              size={9}
              color={colors.muted}
              style={{ paddingHorizontal: spacing.sm, paddingBottom: spacing.xs }}
            >
              {Object.entries(metrics.droppedByModality)
                .map(([mod, count]) => `${count} ${mod}`)
                .join(' · ')}{' dropped'}
            </VirraText>
          )}
```

- [ ] **Step 6: TypeScript check + full test suite**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | head -20
cd /Users/pauldickenson/Claude/virra/mobile && npx jest --no-coverage 2>&1 | tail -8
```
Expected: no errors; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/lib/insightMetrics.ts "mobile/app/(app)/insights.tsx"
git commit -m "feat: insights — dropped session modality breakdown below adherence %, only shown when drops > 0"
```

---

## Verification (end-to-end)

1. **No gym block:** Tap a session day → `SessionDetailModal` shows `"6.8km · 5:12/km · ~42min"` (no arrow). WeekStrip load label unchanged.

2. **Gym block active:** Tap a run session day when a strength block is also active → modal shows `"8.5 → 6.8km · 5:12/km · ~42min"` + `"Volume adjusted · gym block"` note below phase banner. WeekStrip label for that day shows `MOD` instead of `HARD` if `loadScale < 0.85`.

3. **Gym block + luteal phase:** Note reads `"Volume adjusted · gym block + luteal phase"`.

4. **Luteal only:** Note reads `"Volume adjusted · luteal phase"`. No arrow (km is not split from gym suppression).

5. **Completed run:** `"6.8km · actual"` shown (actuals), not planned — `base_distance_km` ignored, no arrow.

6. **Adherence breakdown:** Drop a strength session and an easy run session → Insights screen shows `"1 strength · 1 run dropped"` below the adherence %. If nothing dropped: no sub-line.

---

## Self-Review

**Spec coverage:**
- ✅ `RunSessionDetail.base_distance_km` — Task 1
- ✅ `DayDetail.volume_adjustment_note` — Task 1
- ✅ `buildVolumeAdjustmentNote` pure fn (gym/phase/both/null) — Task 1
- ✅ `loadScale` param in `getWeeklyVolumePlan`, applied after redistribution — Task 1
- ✅ `getActiveBlocks` called once before block loop — Task 2
- ✅ `loadScale` per block via index matching, passed to `getWeeklyVolumePlan` — Task 2
- ✅ `base_distance_km = distance_km / loadScale` when scale < 1.0 — Task 2
- ✅ `minRunLoadScale` tracks minimum across all run blocks for the note — Task 2
- ✅ `getDailyTrainingContext` applies stacking downgrade — Task 3
- ✅ Error fallback in `getDailyTrainingContext` (leave `topLoad` unchanged) — Task 3
- ✅ `8.5 → 6.8km` arrow in `SessionDetailModal` — Task 4
- ✅ Adjustment note below phase banner — Task 4
- ✅ `modality` in `planned_sessions` query — Task 5
- ✅ `droppedByModality` null when zero drops — Task 5
- ✅ Breakdown sub-line in insights only when non-null — Task 5

**Placeholder scan:** None. All steps show exact code.

**Type consistency:**
- `RunSessionDetail.base_distance_km: number | null` defined in Task 1, accessed as `r.base_distance_km` in Task 4 ✓
- `DayDetail.volume_adjustment_note: string | null` defined in Task 1, accessed in Task 4 ✓
- `buildVolumeAdjustmentNote` exported in Task 1, called in Task 2 ✓
- `InsightMetrics.droppedByModality` added in Task 5 Step 2, returned in Task 5 Step 4, read in Task 5 Step 5 ✓
- `loadScale` default `= 1.0` (not `?: number`) — safe default without needing `?? 1.0` at call sites ✓
