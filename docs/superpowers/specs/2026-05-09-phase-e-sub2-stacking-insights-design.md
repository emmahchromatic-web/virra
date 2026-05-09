# Phase E Sub-project 2 — Plan Stacking Load-Balancing + Insights Surfacing

## Context

Phase E sub-project 1 shipped `volumePlan.ts` (pace resolution, per-day session detail, volume redistribution) and `SessionDetailModal` (computed distance, pace, deficit coaching). Two gaps remain before the intelligence layer is complete:

1. **Plan stacking** — `computeBlockLoad` in `trainingBlocks.ts` already scales run volume when a gym block is active, but `volumePlan.ts` ignores it. Every run km target is computed as if the user had no other commitments.

2. **Insights surfacing** — `insightMetrics.ts` computes `droppedSessions` but only selects `status` (no modality). The count feeds `trainingAdherencePct` but the breakdown (which block is slipping) is never shown.

Both features touch existing data — no schema changes required.

---

## Scope

Two deliverables:

1. **Plan stacking load-balancing** — wire `computeBlockLoad` into `volumePlan.ts`; show `8.5 → 6.8km` in `SessionDetailModal` when a gym block suppresses run volume; show a combined adjustment note covering gym block + cycle phase factors.

2. **Insights surfacing** — add `modality` to the session query; surface `droppedByModality` breakdown below `trainingAdherencePct` in the Insights screen; only shown when sessions were actually dropped.

---

## Deliverable 1: Plan Stacking Load-Balancing

### 1a. `RunSessionDetail` — new field

```typescript
export interface RunSessionDetail {
  kind:               'run';
  planned_session_id: string;
  session_label:      string;
  distance_km:        number;         // post-stacking (actual target)
  base_distance_km:   number | null;  // pre-stacking (what they'd run without the gym block); null when loadScale === 1.0
  pace_target_secs:   number;
  estimated_minutes:  number;
  status:             string;
  actual_pace_secs:   number | null;
  actual_distance_km: number | null;
}
```

### 1b. `DayDetail` — new field

```typescript
export interface DayDetail {
  date:                   string;
  sessions:               SessionDetail[];
  events:                 UserEvent[];
  phase:                  CyclePhase | null;
  phase_guidance:         string;
  volume_plan:            VolumePlanResult;
  volume_adjustment_note: string | null;  // new
}
```

### 1c. `getWeeklyVolumePlan` — `loadScale` parameter

Add an optional `loadScale?: number` parameter (default `1.0`) to `getWeeklyVolumePlan`:

```typescript
export async function getWeeklyVolumePlan(
  userId:     string,
  blockId:    string,
  dateISO:    string,
  cycleStore: { periodStart: Date | null; cycleLength: number },
  loadScale?: number,
): Promise<VolumePlanResult>
```

Inside, after the existing redistribution computes `adjusted_km` for each week, multiply by `loadScale ?? 1.0`:

```typescript
const scale = loadScale ?? 1.0;
for (const week of weeks) {
  week.adjusted_km = Math.round(week.adjusted_km * scale * 10) / 10;
}
```

Apply the scale AFTER redistribution (so the front-loading and taper-protection logic operates on unscaled values, and stacking is applied as a final multiplier).

### 1d. `getDaySessionDetail` — stacking logic

After fetching the run block's sessions_json and before calling `getWeeklyVolumePlan`, add:

```typescript
import { getActiveBlocks, computeBlockLoad } from './trainingBlocks';

// Inside getDaySessionDetail, per run blockId:
const allBlocks   = await getActiveBlocks(userId);
const computed    = computeBlockLoad(allBlocks, phase ?? 'follicular');
const thisBlock   = computed.find((b) => b.id === blockId);
const loadScale   = thisBlock
  ? Math.min(1.0, thisBlock.effective_load / (thisBlock.load_modifier || 1))
  : 1.0;
```

`getActiveBlocks` is called once per `getDaySessionDetail` invocation (not once per block group — memoize the result before the block loop).

Pass `loadScale` to `getWeeklyVolumePlan`. After `distributeWeeklyKm`, compute `base_distance_km`:

```typescript
const base_distance_km = loadScale < 1.0
  ? Math.round((distance_km / loadScale) * 10) / 10
  : null;
```

### 1e. `volume_adjustment_note` computation

```typescript
function buildVolumeAdjustmentNote(
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

Set `DayDetail.volume_adjustment_note = buildVolumeAdjustmentNote(loadScale, phase)`.

`loadScale` here is the minimum across all run blocks on this day (if there are multiple run blocks, the most suppressed one governs the note — conservative).

### 1f. `SessionDetailModal` — UI changes

**Run detail line** — when `base_distance_km` is set:

```tsx
{s.status === 'completed' && r.actual_distance_km
  ? `${r.actual_distance_km.toFixed(1)}km · ${r.actual_pace_secs ? formatPace(r.actual_pace_secs) : '—'} · actual`
  : r.base_distance_km
    ? `${r.base_distance_km.toFixed(1)} → ${r.distance_km.toFixed(1)}km · ${formatPace(r.pace_target_secs)} · ~${r.estimated_minutes}min`
    : `${r.distance_km.toFixed(1)}km · ${formatPace(r.pace_target_secs)} · ~${r.estimated_minutes}min`}
```

**Adjustment note** — rendered once per modal, below the phase banner, before session cards:

```tsx
{detail.volume_adjustment_note && (
  <VirraText
    variant="mono"
    size={9}
    color={colors.muted}
    style={{ marginBottom: spacing.xs }}
  >
    {detail.volume_adjustment_note}
  </VirraText>
)}
```

---

## Deliverable 2: Insights Surfacing

### 2a. `insightMetrics.ts` — query + new field

**Query change:** Add `modality` to the `planned_sessions` select:

```typescript
.from('planned_sessions')
.select('status, modality')
```

**New interface field:**

```typescript
export interface InsightMetrics {
  // ... existing fields ...
  droppedByModality: Record<string, number> | null;  // new
}
```

**Computation** (after the existing `droppedSessions` line):

```typescript
const droppedByModality: Record<string, number> | null = droppedSessions === 0
  ? null
  : (sessionWindow as any[])
      .filter((s) => s.status === 'dropped')
      .reduce((acc: Record<string, number>, s: any) => {
        acc[s.modality] = (acc[s.modality] ?? 0) + 1;
        return acc;
      }, {});
```

### 2b. `insights.tsx` — breakdown sub-line

Below the `trainingAdherencePct` metric row, add:

```tsx
{metrics?.droppedByModality && (
  <VirraText variant="mono" size={9} color={colors.muted}>
    {Object.entries(metrics.droppedByModality)
      .map(([mod, count]) => `${count} ${mod}`)
      .join(' · ')}
    {' dropped'}
  </VirraText>
)}
```

This produces e.g. `"2 strength · 1 run dropped"`. Rendered directly below the adherence metric, same left-alignment, no separator. Only shown when `droppedByModality` is non-null (i.e. at least one session dropped in the 28-day window).

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `src/lib/volumePlan.ts` | `loadScale` param in `getWeeklyVolumePlan`; `base_distance_km` in `RunSessionDetail`; `volume_adjustment_note` in `DayDetail`; stacking fetch + `buildVolumeAdjustmentNote` in `getDaySessionDetail` |
| Modify | `src/lib/insightMetrics.ts` | Add `modality` to session query; `droppedByModality` field + computation |
| Modify | `src/components/ui/SessionDetailModal.tsx` | Render `8.5 → 6.8km` when `base_distance_km` set; render `volume_adjustment_note` |
| Modify | `app/(app)/insights.tsx` | Render modality breakdown when non-null |

---

## Edge Cases

| Scenario | Behaviour |
|---|---|
| No supplementary blocks | `loadScale = 1.0`; `base_distance_km = null`; no arrow in session line |
| Multiple run blocks on same day | Use minimum effective_load across all run blocks for the note; each block's own scale for its sessions |
| `computeBlockLoad` with null phase | Pass `'follicular'` as default — conservative (highest budget) |
| Phase is follicular (volume boosted) | `phaseReduced = false`; only gym suppression shown in note |
| All sessions completed (no drops) | `droppedByModality = null`; adherence % shown with no sub-line |
| Strength sessions dropped | Included in `droppedByModality` — e.g. `"2 strength dropped"` |
| `getActiveBlocks` fails | Log error, fall back to `loadScale = 1.0` — conservative, no misleading data |

---

## Spec Self-Review

**Placeholder scan:** None. All sections specify exact behaviour, types, and code.

**Internal consistency:**
- `loadScale` applied AFTER redistribution — taper + phase weights operate on unscaled values ✓
- `base_distance_km = distance_km / loadScale` is only valid when `loadScale > 0` — `computeBlockLoad` guarantees `MIN_RUN_LOAD = 0.5`, so `effective_load >= 0.5` always ✓
- `droppedByModality` null when zero drops matches the "only show when needed" UX ✓
- `getActiveBlocks` called once per `getDaySessionDetail` (not once per block iteration) — no N+1 ✓

**Scope check:** Four file changes, two focused deliverables, no schema changes. Shippable together as one plan.

**Ambiguity resolved:**
- `loadScale` is per-block but the adjustment note is per-day (once) — note uses the minimum scale across all run blocks, reflecting the most constrained situation
- Completed sessions show actuals — `base_distance_km` is irrelevant for completed sessions; skip the arrow when `status === 'completed'`
- `buildVolumeAdjustmentNote` is a pure function — testable in isolation
