# Training Context → Nutrition Intelligence — Design Spec

## Context

The Nutrition screen currently requires the user to manually select a training load (REST / EASY / MODERATE / HARD) before the cycle-aware macro targets are meaningful. The `planned_sessions` table already knows what type of session is scheduled for today. The cycle engine already knows the phase. Nothing connects them.

This spec wires those signals together via a reusable `getDailyTrainingContext()` utility — designed to be extended by Phase E's load-balancing engine without touching its consumers.

---

## Scope

Four deliverables:

1. **`dailyTrainingContext.ts`** — utility that infers today's training load from planned sessions + cycle phase
2. **DB migration** — add `inferred_load` to `nutrition_logs`
3. **Nutrition screen** — auto-set chip from inferred load, store deviation signal
4. **WeekStrip** — load-tier label on today's cell
5. **`insightMetrics.ts`** — `fuellingAlignment` metric from inferred vs actual intake

---

## Deliverable 1: `getDailyTrainingContext` Utility

### File

`src/lib/dailyTrainingContext.ts`

### Interfaces

```typescript
import type { CyclePhase } from '@/store/cycle';
import type { TrainingLoad } from './nutritionTargets';

export interface PlannedSessionSummary {
  id:            string;
  session_label: string;
  modality:      string;
  status:        string;
}

export interface DailyTrainingContext {
  inferred_load:    TrainingLoad;
  planned_sessions: PlannedSessionSummary[];
  phase:            CyclePhase | null;
  phase_guidance:   string;
  source_label:     string | null; // e.g. "tempo run" — shown in Nutrition UI
}
```

### Session label → load mapping

`inferLoadFromLabel(label: string, modality: string): TrainingLoad`

| Session label | Load |
|---|---|
| `long`, `race`, `interval`, `tempo`, `threshold` | `hard` |
| `moderate`, `progression` | `moderate` |
| `easy`, `recovery`, `base` | `easy` |
| Strength `lower`, `upper` | `moderate` |
| Strength `general` | `easy` |
| No match / unknown | `easy` (safe default) |

When no planned sessions exist for the date: return `rest`.

When multiple sessions exist (e.g. run block + strength block on the same day): take the highest-tier load across all sessions. Example: `tempo` run (hard) + `general` strength (easy) → `hard`.

### Main function

```typescript
export async function getDailyTrainingContext(
  userId:  string,
  dateISO: string,
  phase:   CyclePhase | null,
): Promise<DailyTrainingContext>
```

1. Query `planned_sessions` where `user_id = userId`, `scheduled_date = dateISO`, `status = 'planned'` or `status = 'completed'` (exclude `dropped`, `moved`)
2. If zero rows → `inferred_load = 'rest'`, `source_label = null`
3. If one or more rows → map each to a load tier via `inferLoadFromLabel`, take the maximum tier
4. `source_label`: the `session_label` of the highest-tier session (e.g. `"tempo run"`, `"lower body strength"`)
5. `phase_guidance`: the existing `PHASE_LOAD[phase].note` string (or `""` if phase is null)
6. Return the full `DailyTrainingContext`

### Load tier ordering (for max computation)

`rest < easy < moderate < hard` — numeric: 0, 1, 2, 3.

### Phase E extension point

Phase E's load-balancing engine will extend this function's internals (e.g. factoring in total weekly volume, block overlap, cycle-adjusted load modifier). Its return type and call signature are frozen — consumers never need to change.

---

## Deliverable 2: DB Migration

### File

`supabase/migrations/010_inferred_load.sql`

```sql
alter table public.nutrition_logs
  add column if not exists inferred_load text
  check (inferred_load in ('rest', 'easy', 'moderate', 'hard'));

notify pgrst, 'reload schema';
```

### Purpose

`training_load` = what the user selected (or accepted as default).
`inferred_load` = what the system recommended based on planned sessions.

When `training_load ≠ inferred_load`: user made an explicit override (ate above or below what was planned).
When both are set and calorie intake exceeds `targets_json.calories` for `inferred_load`: over-consumption signal.

---

## Deliverable 3: Nutrition Screen

### File

`app/(app)/(tabs)/nutrition.tsx`

### Changes

**On mount:** call `getDailyTrainingContext(session.user.id, today, cycleInfo?.phase ?? null)` and set the initial `load` state from `context.inferred_load`. Store `context` in a `dailyContext` state variable.

**Auto-set label:** Show a line below the chip row when the chip matches the inferred load:

```
"Auto-set · tempo run"      (when a session exists)
"Auto-set · rest day"       (when no session)
```

Label colour: `colors.muted`, mono 9pt. Label disappears when the user taps a different chip (i.e. `load !== context.inferred_load`).

**Nutrition log upsert:** Include `inferred_load: context.inferred_load` in the upsert payload alongside `training_load: load`. Both are written on every mount (the inferred value is always the system's recommendation for that date regardless of user selection).

**No other UI change** — chips remain fully interactive, macro bars update on tap, `WhyCard` unchanged.

### State additions

```typescript
const [dailyContext, setDailyContext] = useState<DailyTrainingContext | null>(null);
```

Load is initialised to `'easy'` (existing default) and updated once context resolves. This avoids a blank state on first render.

---

## Deliverable 4: WeekStrip Load Label

### File

`src/components/ui/WeekStrip.tsx`

### Change

Today's cell (`.isToday = true`) gains a load-tier label beneath the circle. The label is only shown for today — not for past or future days.

The `WeekStrip` component calls `getDailyTrainingContext` for today's date once on mount (alongside the existing week query). The returned `inferred_load` drives a small text label:

| Load | Label |
|---|---|
| `hard` | `HARD` |
| `moderate` | `MOD` |
| `easy` | `EASY` |
| `rest` | `REST` |

Style: `VirraText variant="mono" size={8} color={colors.muted}`, centred below the circle.

**Implementation note:** `getDailyTrainingContext` requires `userId` and `phase`. `WeekStrip` currently only receives `userId`. The Nutrition screen's `cycleInfo` comes from `useCycleStore`. For the WeekStrip (used inside `index.tsx`), the dashboard already has `cycleInfo` — pass `phase={cycleInfo?.phase ?? null}` as a new optional prop to `WeekStrip`.

WeekStrip prop addition:
```typescript
interface Props {
  userId: string;
  phase?: CyclePhase | null;   // new — for today's load label
}
```

If `phase` is not provided, `getDailyTrainingContext` is called with `null` and the load label still renders (using flat targets).

---

## Deliverable 5: `fuellingAlignment` Metric

### File

`src/lib/insightMetrics.ts`

### New metric

```typescript
export interface FuellingAlignment {
  daysOverTarget:  number;  // actual kcal > inferred_load target by >10%
  daysUnderTarget: number;  // actual kcal < inferred_load target by >10%
  daysOnTarget:    number;  // within 10% of inferred_load target
}
```

Added to `InsightMetrics`:
```typescript
fuellingAlignment: FuellingAlignment | null;
```

### Computation

Query last 7 days of `nutrition_logs` where `inferred_load IS NOT NULL` and `user_id = userId`, joined with `food_entries(calories)` sum per log.

For each log:
- `target_kcal` = `targets_json.calories` (stored at log time for the inferred load)
- `actual_kcal` = sum of `food_entries.calories` for that `log_id`
- `ratio = actual_kcal / target_kcal`
- `> 1.10` → over
- `< 0.90` → under
- otherwise → on target

Return `null` if fewer than 3 days have `inferred_load` set (insufficient signal).

### Surface in Insights screen

In the Nutrition section, below the compliance % metric, add a text summary when `fuellingAlignment` is non-null:

- All or mostly on-target: `"Fuelling well-aligned with your training this week."`
- 3+ days under: `"You've fuelled below your planned sessions {N} days this week."`
- 3+ days over: `"You've eaten above your rest-day targets {N} days this week."`

This text is rendered as `VirraText variant="body" size={13}` below the existing metric row.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/lib/dailyTrainingContext.ts` | `inferLoadFromLabel`, `getDailyTrainingContext`, `DailyTrainingContext` interface |
| Create | `supabase/migrations/010_inferred_load.sql` | Add `inferred_load` column to `nutrition_logs` |
| Modify | `app/(app)/(tabs)/nutrition.tsx` | Auto-set chip, store `inferred_load`, show source label |
| Modify | `src/components/ui/WeekStrip.tsx` | Add `phase` prop, show load-tier label on today's cell |
| Modify | `app/(app)/(tabs)/index.tsx` | Pass `phase` prop to `WeekStrip` |
| Modify | `src/lib/insightMetrics.ts` | Add `fuellingAlignment` metric |
| Modify | `app/(app)/insights.tsx` | Surface `fuellingAlignment` in Nutrition section |

---

## Edge Cases

| Scenario | Behaviour |
|---|---|
| No planned sessions for today | `inferred_load = 'rest'`, label shows "Auto-set · rest day" |
| Session status `completed` (already done) | Still counts — load already happened |
| Session status `dropped` | Excluded — treat as rest if no other sessions |
| Multiple sessions, mixed modalities | Highest load tier wins |
| `inferred_load` column not yet set on old rows | `fuellingAlignment` only uses rows where `inferred_load IS NOT NULL` |
| User has no cycle data | `getDailyTrainingContext` receives `null` phase; flat targets apply; label still shows |
| `getDailyTrainingContext` fails (network) | Nutrition screen falls back to `'easy'` default; no label shown |

---

## Spec Self-Review

**Placeholder scan:** None. All sections specify exact behaviour, types, and SQL.

**Internal consistency:**
- `inferred_load` CHECK constraint matches `TrainingLoad` values ✓
- `DailyTrainingContext.inferred_load` type is `TrainingLoad` — same union ✓
- `fuellingAlignment` uses `targets_json.calories` (stored at log time) — not recomputed — so historical records are stable ✓
- `WeekStrip` phase prop is optional — no breaking change to existing call sites ✓
- `getDailyTrainingContext` only queries `status IN ('planned', 'completed')` — consistent with "this load happened or is planned to happen today" ✓

**Scope check:** Five focused deliverables, tightly coupled (each depends on the utility), shippable together as one plan.

**Phase E extension:** `getDailyTrainingContext` signature and return type are stable. Phase E extends internals only.
