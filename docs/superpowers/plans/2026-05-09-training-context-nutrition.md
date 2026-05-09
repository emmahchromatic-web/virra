# Training Context → Nutrition Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-infer today's training load from planned sessions, pre-select the nutrition chip, store the inferred value for deviation tracking, and surface a fuelling alignment metric in Insights.

**Architecture:** A new `dailyTrainingContext.ts` utility queries `planned_sessions` for a given date, maps session labels to load tiers, and returns a `DailyTrainingContext` object. The Nutrition screen calls this on mount to pre-select the chip and write `inferred_load` to the DB. The WeekStrip shows a load-tier label on today's cell. `insightMetrics.ts` uses the stored `inferred_load` to compute a fuelling alignment metric surfaced in the Insights screen.

**Tech Stack:** React Native, Supabase (Postgres + MCP), Zustand (`useCycleStore`, `useAuthStore`), expo-symbols, existing VirraCard/VirraText components, Jest for unit tests.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/lib/dailyTrainingContext.ts` | `inferLoadFromLabel`, `getDailyTrainingContext`, interfaces |
| Create | `supabase/migrations/010_inferred_load.sql` | Add `inferred_load` column to `nutrition_logs` |
| Create | `__tests__/lib/dailyTrainingContext.test.ts` | Unit tests for `inferLoadFromLabel` |
| Modify | `app/(app)/(tabs)/nutrition.tsx` | Auto-set chip, store `inferred_load`, show source label |
| Modify | `src/components/ui/WeekStrip.tsx` | Add `phase` prop, show load-tier label on today |
| Modify | `app/(app)/(tabs)/index.tsx` | Pass `phase` prop to `WeekStrip` |
| Modify | `src/lib/insightMetrics.ts` | Add `FuellingAlignment` + `fuellingAlignment` metric |
| Modify | `app/(app)/insights.tsx` | Surface fuelling alignment card |

---

## Task 1: `dailyTrainingContext.ts` + Unit Tests

**Files:**
- Create: `src/lib/dailyTrainingContext.ts`
- Create: `__tests__/lib/dailyTrainingContext.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/dailyTrainingContext.test.ts`:

```typescript
import { inferLoadFromLabel } from '@/lib/dailyTrainingContext';

test('long run → hard', () => {
  expect(inferLoadFromLabel('long', 'run')).toBe('hard');
});

test('tempo run → hard', () => {
  expect(inferLoadFromLabel('tempo', 'run')).toBe('hard');
});

test('interval run → hard', () => {
  expect(inferLoadFromLabel('interval', 'run')).toBe('hard');
});

test('race → hard', () => {
  expect(inferLoadFromLabel('race', 'run')).toBe('hard');
});

test('threshold → hard', () => {
  expect(inferLoadFromLabel('threshold', 'run')).toBe('hard');
});

test('easy run → easy', () => {
  expect(inferLoadFromLabel('easy', 'run')).toBe('easy');
});

test('recovery run → easy', () => {
  expect(inferLoadFromLabel('recovery', 'run')).toBe('easy');
});

test('base run → easy', () => {
  expect(inferLoadFromLabel('base', 'run')).toBe('easy');
});

test('moderate run → moderate', () => {
  expect(inferLoadFromLabel('moderate', 'run')).toBe('moderate');
});

test('progression → moderate', () => {
  expect(inferLoadFromLabel('progression', 'run')).toBe('moderate');
});

test('strength lower → moderate', () => {
  expect(inferLoadFromLabel('lower', 'strength')).toBe('moderate');
});

test('strength upper → moderate', () => {
  expect(inferLoadFromLabel('upper', 'strength')).toBe('moderate');
});

test('strength general → easy', () => {
  expect(inferLoadFromLabel('general', 'strength')).toBe('easy');
});

test('unknown label → easy fallback', () => {
  expect(inferLoadFromLabel('custom-session', 'run')).toBe('easy');
});

test('unknown strength label → easy fallback', () => {
  expect(inferLoadFromLabel('unknown', 'strength')).toBe('easy');
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd mobile && npx jest --no-coverage dailyTrainingContext 2>&1 | tail -10
```

Expected: `FAIL __tests__/lib/dailyTrainingContext.test.ts — Cannot find module '@/lib/dailyTrainingContext'`

- [ ] **Step 3: Write `dailyTrainingContext.ts`**

Create `mobile/src/lib/dailyTrainingContext.ts`:

```typescript
import { supabase } from './supabase';
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
  source_label:     string | null; // e.g. "tempo run" — shown in Nutrition auto-set label
}

const LOAD_RANK: Record<TrainingLoad, number> = {
  rest: 0, easy: 1, moderate: 2, hard: 3,
};

const LABEL_TO_LOAD: Record<string, TrainingLoad> = {
  long:        'hard',
  race:        'hard',
  interval:    'hard',
  tempo:       'hard',
  threshold:   'hard',
  moderate:    'moderate',
  progression: 'moderate',
  easy:        'easy',
  recovery:    'easy',
  base:        'easy',
};

const STRENGTH_LABEL_TO_LOAD: Record<string, TrainingLoad> = {
  lower:   'moderate',
  upper:   'moderate',
  general: 'easy',
};

export function inferLoadFromLabel(label: string, modality: string): TrainingLoad {
  const key = label.toLowerCase().trim();
  if (modality === 'strength') return STRENGTH_LABEL_TO_LOAD[key] ?? 'easy';
  return LABEL_TO_LOAD[key] ?? 'easy';
}

const PHASE_GUIDANCE: Record<CyclePhase, string> = {
  menstrual:  'Keep effort light — rest is training too.',
  follicular: 'Ramp up. Your body adapts faster now.',
  ovulatory:  'Hardest sessions belong here.',
  luteal:     'Hold the work, honour fatigue.',
};

export async function getDailyTrainingContext(
  userId:  string,
  dateISO: string,
  phase:   CyclePhase | null,
): Promise<DailyTrainingContext> {
  const { data } = await supabase
    .from('planned_sessions')
    .select('id, session_label, modality, status')
    .eq('user_id', userId)
    .eq('scheduled_date', dateISO)
    .in('status', ['planned', 'completed']);

  const sessions = (data ?? []) as PlannedSessionSummary[];

  if (sessions.length === 0) {
    return {
      inferred_load:    'rest',
      planned_sessions: [],
      phase,
      phase_guidance:   phase ? PHASE_GUIDANCE[phase] : '',
      source_label:     null,
    };
  }

  let topLoad: TrainingLoad = 'easy';
  let topSource = `${sessions[0].session_label} ${sessions[0].modality}`;

  for (const s of sessions) {
    const load = inferLoadFromLabel(s.session_label, s.modality);
    if (LOAD_RANK[load] > LOAD_RANK[topLoad]) {
      topLoad  = load;
      topSource = `${s.session_label} ${s.modality}`;
    }
  }

  return {
    inferred_load:    topLoad,
    planned_sessions: sessions,
    phase,
    phase_guidance:   phase ? PHASE_GUIDANCE[phase] : '',
    source_label:     topSource,
  };
}
```

- [ ] **Step 4: Run tests — expect all 15 to pass**

```bash
cd mobile && npx jest --no-coverage dailyTrainingContext 2>&1 | tail -10
```

Expected: `Tests: 15 passed, 15 total`

- [ ] **Step 5: TypeScript check**

```bash
cd mobile && npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/lib/dailyTrainingContext.ts mobile/__tests__/lib/dailyTrainingContext.test.ts
git commit -m "feat: dailyTrainingContext utility — infer training load from planned sessions"
```

---

## Task 2: DB Migration — `inferred_load`

**Files:**
- Create: `supabase/migrations/010_inferred_load.sql`

- [ ] **Step 1: Write the migration file**

Create `mobile/supabase/migrations/010_inferred_load.sql`:

```sql
alter table public.nutrition_logs
  add column if not exists inferred_load text
  check (inferred_load in ('rest', 'easy', 'moderate', 'hard'));

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Apply via Supabase MCP**

Use `mcp__supabase__apply_migration` with:
- name: `010_inferred_load`
- SQL: the content above

- [ ] **Step 3: Verify the column exists**

Use `mcp__supabase__execute_sql`:
```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'nutrition_logs'
  and column_name = 'inferred_load';
```

Expected: one row with `column_name = 'inferred_load'`, `data_type = 'text'`, `is_nullable = YES`.

- [ ] **Step 4: Commit**

```bash
git add mobile/supabase/migrations/010_inferred_load.sql
git commit -m "feat: add inferred_load column to nutrition_logs"
```

---

## Task 3: Nutrition Screen — Auto-Set Chip

**Files:**
- Modify: `app/(app)/(tabs)/nutrition.tsx`

Read the file first. Key existing code:
- Line 9: imports from `@/lib/nutritionTargets`
- Line 98: `const [load, setLoad] = useState<TrainingLoad>('easy');`
- Lines 116–157: `useEffect` + `loadLog()` function
- Lines 131–156: `loadLog()` body — upserts `nutrition_logs` then fetches `food_entries`
- Lines 167–184: chip selector UI — the load row

- [ ] **Step 1: Add import**

After line 9 (existing imports), add:

```typescript
import { getDailyTrainingContext, type DailyTrainingContext } from '@/lib/dailyTrainingContext';
```

- [ ] **Step 2: Add state for daily context**

After line 100 (`const [loading, setLoading] = useState(true);`), add:

```typescript
const [dailyContext, setDailyContext] = useState<DailyTrainingContext | null>(null);
```

- [ ] **Step 3: Replace `loadLog` with `loadData`**

Remove the existing `loadLog` function (lines 131–157) and the `useEffect` (lines 116–129). Replace both with:

```typescript
useEffect(() => {
  if (!session) return;
  loadData();
}, [session, today]);

async function loadData() {
  if (!session) return;
  setLoading(true);

  let ctx: DailyTrainingContext | null = null;
  try {
    ctx = await getDailyTrainingContext(
      session.user.id,
      today,
      cycleInfo?.phase ?? null,
    );
    setDailyContext(ctx);
    setLoad(ctx.inferred_load);
  } catch {
    // Network error — fall back to 'easy' default, no label shown
  }

  const effectiveLoad    = ctx?.inferred_load ?? load;
  const effectiveTargets = getNutritionTargets(cycleInfo?.phase ?? null, effectiveLoad);

  const { data: log } = await supabase
    .from('nutrition_logs')
    .upsert({
      user_id:       session.user.id,
      recorded_on:   today,
      phase_at_time: cycleInfo?.phase ?? null,
      training_load: effectiveLoad,
      inferred_load: ctx?.inferred_load ?? null,
      targets_json:  effectiveTargets,
    }, { onConflict: 'user_id,recorded_on' })
    .select('id')
    .single();

  if (log) {
    setLogId(log.id);
    const { data: food } = await supabase
      .from('food_entries')
      .select('id, meal_type, food_name, calories, carbs_g, protein_g, fat_g')
      .eq('log_id', log.id);
    setEntries((food as FoodEntry[]) ?? []);
  }
  setLoading(false);
}
```

Also update the `useFocusEffect` (currently calls `loadLog` indirectly). It only refetches food entries, so rename the internal reference if needed — it doesn't call `loadLog` directly, it refetches from `logId`. No change needed there.

- [ ] **Step 4: Add auto-set label below chip row**

After the closing `</View>` of `styles.loadChips` (the chip row, around line 183), add:

```tsx
{dailyContext && load === dailyContext.inferred_load && (
  <VirraText variant="mono" size={9} color={colors.muted} style={{ letterSpacing: 1 }}>
    {dailyContext.source_label
      ? `AUTO-SET · ${dailyContext.source_label.toUpperCase()}`
      : 'AUTO-SET · REST DAY'}
  </VirraText>
)}
```

This label disappears automatically when the user taps a different chip (because `load !== dailyContext.inferred_load`).

- [ ] **Step 5: TypeScript check + full test suite**

```bash
cd mobile && npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | head -20
cd mobile && npx jest --no-coverage 2>&1 | tail -8
```

Expected: no TS errors; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add "mobile/app/(app)/(tabs)/nutrition.tsx"
git commit -m "feat: auto-set nutrition training load from planned session, store inferred_load"
```

---

## Task 4: WeekStrip — Load Label on Today

**Files:**
- Modify: `src/components/ui/WeekStrip.tsx`
- Modify: `app/(app)/(tabs)/index.tsx`

Read both files first.

- [ ] **Step 1: Add imports and type to `WeekStrip.tsx`**

After the existing imports (line 6), add:

```typescript
import { getDailyTrainingContext } from '@/lib/dailyTrainingContext';
import type { CyclePhase } from '@/store/cycle';
import type { TrainingLoad } from '@/lib/nutritionTargets';
```

- [ ] **Step 2: Update the `WeekStrip` props interface and signature**

Replace:
```typescript
export function WeekStrip({ userId }: { userId: string }) {
  const [dayMap, setDayMap] = useState<Record<string, DayData>>({});

  useEffect(() => { load(); }, [userId]);
```

With:
```typescript
export function WeekStrip({ userId, phase }: { userId: string; phase?: CyclePhase | null }) {
  const [dayMap,    setDayMap]    = useState<Record<string, DayData>>({});
  const [todayLoad, setTodayLoad] = useState<TrainingLoad | null>(null);

  useEffect(() => { load(); }, [userId]);
```

- [ ] **Step 3: Fetch today's load inside `load()`**

At the end of the existing `load()` function, after `setDayMap(map);`, add:

```typescript
    try {
      const ctx = await getDailyTrainingContext(userId, todayISO, phase ?? null);
      setTodayLoad(ctx.inferred_load);
    } catch {
      // Non-critical — load label omitted on error
    }
```

- [ ] **Step 4: Render load label on today's cell**

Inside the `return` block, find the `<View key={iso} style={strip.col}>` that renders each day. After the `{hasSessions && day.sessions.length > 1 && ...}` dots block (the last child of the column), add:

```tsx
{day.isToday && todayLoad && (
  <VirraText variant="mono" size={8} color={colors.muted}>
    {todayLoad === 'moderate' ? 'MOD' : todayLoad.toUpperCase()}
  </VirraText>
)}
```

- [ ] **Step 5: Update `index.tsx` to pass `phase` prop**

In `app/(app)/(tabs)/index.tsx`, find the `<WeekStrip userId={session.user.id} />` line and update to:

```tsx
<WeekStrip userId={session.user.id} phase={cycleInfo?.phase ?? null} />
```

`cycleInfo` is already destructured from `useCycleStore()` in `DashboardScreen`.

- [ ] **Step 6: TypeScript check + tests**

```bash
cd mobile && npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | head -20
cd mobile && npx jest --no-coverage 2>&1 | tail -8
```

Expected: no errors; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/components/ui/WeekStrip.tsx "mobile/app/(app)/(tabs)/index.tsx"
git commit -m "feat: WeekStrip shows today's inferred training load label"
```

---

## Task 5: `insightMetrics.ts` — Fuelling Alignment Metric

**Files:**
- Modify: `src/lib/insightMetrics.ts`

Read the file first. Key existing code:
- Lines 15–26: `InsightMetrics` interface
- Lines 98–103: `nutrition_logs` query in `Promise.all` — selects `recorded_on, targets_json, food_entries(calories)`
- Lines 164–179: nutrition compliance computation block

- [ ] **Step 1: Add `FuellingAlignment` interface and extend `InsightMetrics`**

After line 13 (`}`  closing `SymptomTrend`), insert:

```typescript
export interface FuellingAlignment {
  daysOverTarget:  number;
  daysUnderTarget: number;
  daysOnTarget:    number;
}
```

In `InsightMetrics` (after `symptomTrend: SymptomTrend | null;`), add:

```typescript
  fuellingAlignment:     FuellingAlignment | null;
```

- [ ] **Step 2: Update the `nutrition_logs` query to include `inferred_load`**

Find the existing query (around line 98):
```typescript
    supabase
      .from('nutrition_logs')
      .select('recorded_on, targets_json, food_entries(calories)')
      .eq('user_id', userId)
      .gte('recorded_on', window7ISO)
      .order('recorded_on'),
```

Change `select` to include `inferred_load`:
```typescript
    supabase
      .from('nutrition_logs')
      .select('recorded_on, targets_json, inferred_load, food_entries(calories)')
      .eq('user_id', userId)
      .gte('recorded_on', window7ISO)
      .order('recorded_on'),
```

- [ ] **Step 3: Compute `fuellingAlignment` after the existing nutrition compliance block**

After line 179 (`const nutritionCompliancePct = ...`), add:

```typescript
  // Fuelling alignment — compares actual intake against inferred_load target (not user-selected)
  const alignedLogs = (nutritionLogs as any[]).filter((l: any) => l.inferred_load);
  let fuellingAlignment: FuellingAlignment | null = null;
  if (alignedLogs.length >= 3) {
    let over = 0, under = 0, onTarget = 0;
    for (const log of alignedLogs) {
      const targetCal: number = (log.targets_json as any)?.calories ?? 0;
      if (!targetCal) continue;
      const actualCal = (log.food_entries as any[])
        .reduce((s: number, e: any) => s + (e.calories ?? 0), 0);
      if (actualCal <= 0) continue;
      const ratio = actualCal / targetCal;
      if (ratio > 1.10) over++;
      else if (ratio < 0.90) under++;
      else onTarget++;
    }
    fuellingAlignment = { daysOverTarget: over, daysUnderTarget: under, daysOnTarget: onTarget };
  }
```

- [ ] **Step 4: Add `fuellingAlignment` to the return statement**

In the `return { ... }` block at the end of `computeInsightMetrics`, add:

```typescript
    fuellingAlignment,
```

- [ ] **Step 5: TypeScript check + tests**

```bash
cd mobile && npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | head -20
cd mobile && npx jest --no-coverage 2>&1 | tail -8
```

Expected: no errors; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/lib/insightMetrics.ts
git commit -m "feat: add fuellingAlignment metric to insightMetrics"
```

---

## Task 6: Insights Screen — Fuelling Alignment Card

**Files:**
- Modify: `app/(app)/insights.tsx`

Read the file first. The Nutrition narrative card is at lines 209–217:
```tsx
{nutritionText && (
  <VirraCard style={{ gap: spacing.xs }}>
    <VirraText variant="mono" size={9} color={phaseColor} style={styles.sectionLabel}>NUTRITION</VirraText>
    ...
  </VirraCard>
)}
```

The fuelling card should appear directly after this block (before the Phase-pace breakdown at line 219).

- [ ] **Step 1: Add fuelling alignment card after the Nutrition narrative card**

After the closing `)}` of the Nutrition narrative card (line 217), insert:

```tsx
{/* Fuelling alignment */}
{metrics?.fuellingAlignment && (() => {
  const { daysOverTarget, daysUnderTarget, daysOnTarget } = metrics.fuellingAlignment!;
  const total = daysOverTarget + daysUnderTarget + daysOnTarget;
  if (total === 0) return null;
  let text: string;
  if (daysUnderTarget >= 3 && daysUnderTarget >= daysOverTarget) {
    text = `You've fuelled below your planned sessions ${daysUnderTarget} day${daysUnderTarget !== 1 ? 's' : ''} this week.`;
  } else if (daysOverTarget >= 3) {
    text = `You've eaten above your rest-day targets ${daysOverTarget} day${daysOverTarget !== 1 ? 's' : ''} this week.`;
  } else {
    text = 'Fuelling well-aligned with your training this week.';
  }
  return (
    <VirraCard style={{ gap: spacing.xs }}>
      <VirraText variant="mono" size={9} color={phaseColor} style={styles.sectionLabel}>FUELLING</VirraText>
      <VirraText variant="body" size={13} color="rgba(244,237,224,0.8)" style={{ lineHeight: 20 }}>
        {text}
      </VirraText>
    </VirraCard>
  );
})()}
```

- [ ] **Step 2: TypeScript check + full test suite**

```bash
cd mobile && npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | head -20
cd mobile && npx jest --no-coverage 2>&1 | tail -8
```

Expected: no errors; all tests pass.

- [ ] **Step 3: Commit**

```bash
git add "mobile/app/(app)/insights.tsx"
git commit -m "feat: fuelling alignment card in Insights screen"
```

---

## Verification (end-to-end)

1. Open the Nutrition tab — the chip selector should pre-select based on today's planned session (e.g. `HARD` if a tempo run is scheduled, `REST` if no session)
2. The auto-set label appears below the chips: `AUTO-SET · TEMPO RUN` or `AUTO-SET · REST DAY`
3. Tap a different chip — the label disappears
4. Check `nutrition_logs` in Supabase — both `training_load` and `inferred_load` should be written
5. Dashboard WeekStrip → today's cell shows a small load label (`HARD`, `MOD`, `EASY`, or `REST`) below the session icon
6. Insights screen → after 3+ days with `inferred_load` set, a FUELLING card appears in the Nutrition section

---

## Spec Self-Review

**Spec coverage:**
- ✅ `getDailyTrainingContext(userId, dateISO, phase)` — Task 1
- ✅ `inferLoadFromLabel(label, modality)` with all mappings — Task 1
- ✅ Multi-session highest-tier wins — Task 1 (`topLoad` loop)
- ✅ `010_inferred_load.sql` migration — Task 2
- ✅ Nutrition screen auto-sets chip from `inferred_load` — Task 3
- ✅ Source label shows/hides on override — Task 3
- ✅ `inferred_load` written to `nutrition_logs` upsert — Task 3
- ✅ `WeekStrip` `phase` prop + load label on today's cell — Task 4
- ✅ `index.tsx` passes `phase` to `WeekStrip` — Task 4
- ✅ `FuellingAlignment` interface + metric — Task 5
- ✅ `inferred_load` selected in nutrition_logs query — Task 5
- ✅ Minimum 3 days for `fuellingAlignment` signal — Task 5
- ✅ Three text cases (under / over / aligned) — Task 6
- ✅ Edge cases: network error falls back to 'easy' (Task 3), load label omitted on error (Task 4)

**Placeholder scan:** None.

**Type consistency:**
- `DailyTrainingContext.inferred_load: TrainingLoad` matches `getNutritionTargets(phase, load: TrainingLoad)` ✓
- `FuellingAlignment` fields all `number` — used directly in template strings ✓
- `WeekStrip` `phase?: CyclePhase | null` — optional, no breaking change ✓
- `getDailyTrainingContext` signature identical across all call sites (Task 1, 3, 4) ✓
