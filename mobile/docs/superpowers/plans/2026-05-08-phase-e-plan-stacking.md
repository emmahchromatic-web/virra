# Phase E Plan Stacking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement cross-sport plan stacking so users can combine a primary run plan with supplementary training blocks (strength, swim, yoga), with run volume automatically redistributed based on total load and cycle phase.

**Architecture:** A new `training_blocks` table replaces the single-active-plan model (`user_plans` is preserved for backwards compatibility — the existing current-week tracker in `plan/[id].tsx` continues to read from it). `src/lib/trainingBlocks.ts` owns the pure `computeBlockLoad` function (unit-tested without mocking Supabase) plus Supabase helpers (`getActiveBlocks`, `addBlock`, `removeBlock`). `plan/[id].tsx` gains an "Add to stack as supplementary" CTA alongside the existing "Start plan" path. The Training tab gains a `BlockStack` component that renders all active blocks with effective loads; it falls back to the existing `ActivePlanCard` for users with `user_plans` but no `training_blocks` yet.

**Tech Stack:** Supabase MCP (migration), React Native + expo-symbols, Jest for `computeBlockLoad` unit tests.

**Scope note:** This plan covers stacking only (Phase E Part 1). Multi-event progressive planning (`user_events` engine + continuous timeline) is Phase E Part 2 — a separate plan. The `user_events` table and `event_id` column are created here as stubs so Part 2 can add the FK without a schema change.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/003_training_blocks.sql` | `training_blocks` + `user_events` tables + RLS |
| Create | `src/lib/trainingBlocks.ts` | `computeBlockLoad` (pure), `inferModality`, `getActiveBlocks`, `addBlock`, `removeBlock` |
| Create | `__tests__/lib/trainingBlocks.test.ts` | Unit tests for `computeBlockLoad` |
| Modify | `app/(app)/plan/[id].tsx` | Add "Add to stack" CTA; `handleStart` also writes a `training_blocks` row |
| Modify | `app/(app)/(tabs)/training.tsx` | Add `BlockStack` component; show it when blocks exist, fall back to `ActivePlanCard` |

---

## Task 1: DB migration + training blocks library + tests

**Files:**
- Create: `supabase/migrations/003_training_blocks.sql`
- Create: `src/lib/trainingBlocks.ts`
- Create: `__tests__/lib/trainingBlocks.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/trainingBlocks.test.ts`:

```typescript
import { computeBlockLoad } from '@/lib/trainingBlocks';

type BlockInput = { modality: string; load_modifier: number };

describe('computeBlockLoad', () => {
  it('returns full load for a single run block (no supplement pressure)', () => {
    // capacity = 1.8 * 1.1 (follicular) = 1.98; budget = 1.98; scale = min(1, 1.98) = 1.0
    const result = computeBlockLoad([{ modality: 'run', load_modifier: 1.0 }], 'follicular');
    expect(result[0].effective_load).toBe(1.0);
  });

  it('reduces run load when a heavy strength supplement is added in luteal phase', () => {
    // capacity = 1.8 * 0.9 (luteal) = 1.62; suppLoad = 1.0; runBudget = 0.62
    // scale = 0.62; effective_run = max(0.5, round(0.62 * 100)/100) = 0.62
    const blocks: BlockInput[] = [
      { modality: 'run',      load_modifier: 1.0 },
      { modality: 'strength', load_modifier: 1.0 },
    ];
    const result = computeBlockLoad(blocks, 'luteal');
    expect(result[0].effective_load).toBe(0.62);
    expect(result[1].effective_load).toBe(1.0); // supplement never scaled
  });

  it('follicular phase allows higher run load than luteal under the same stack', () => {
    // follicular: budget = 1.98 - 1.0 = 0.98 → effective_run = 0.98
    // luteal:     budget = 1.62 - 1.0 = 0.62 → effective_run = 0.62
    const blocks: BlockInput[] = [
      { modality: 'run',      load_modifier: 1.0 },
      { modality: 'strength', load_modifier: 1.0 },
    ];
    const follicular = computeBlockLoad(blocks, 'follicular')[0].effective_load;
    const luteal     = computeBlockLoad(blocks, 'luteal')[0].effective_load;
    expect(follicular).toBeGreaterThan(luteal);
  });

  it('floors run effective_load at 0.5 when supplement stack exceeds capacity', () => {
    // capacity = 1.8 * 0.85 (menstrual) = 1.53; suppLoad = 3.0; runBudget = 0
    // scale = 0; effective_run = max(0.5, 0) = 0.5
    const blocks: BlockInput[] = [
      { modality: 'run',      load_modifier: 1.0 },
      { modality: 'strength', load_modifier: 1.0 },
      { modality: 'swim',     load_modifier: 1.0 },
      { modality: 'yoga',     load_modifier: 1.0 },
    ];
    const result = computeBlockLoad(blocks, 'menstrual');
    expect(result[0].effective_load).toBe(0.5);
  });

  it('never scales supplement blocks regardless of total load', () => {
    const blocks: BlockInput[] = [
      { modality: 'strength', load_modifier: 0.6 },
      { modality: 'yoga',     load_modifier: 0.4 },
    ];
    const result = computeBlockLoad(blocks, 'luteal');
    expect(result[0].effective_load).toBe(0.6);
    expect(result[1].effective_load).toBe(0.4);
  });

  it('handles an empty block array', () => {
    expect(computeBlockLoad([], 'follicular')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx jest __tests__/lib/trainingBlocks.test.ts --no-coverage 2>&1 | tail -8
```

Expected: FAIL — `Cannot find module '@/lib/trainingBlocks'`

- [ ] **Step 3: Write the migration SQL**

Create `supabase/migrations/003_training_blocks.sql`:

```sql
-- training_blocks: one row per active training commitment.
-- is_primary=true = the user's main run plan; is_primary=false = supplementary modality (strength, swim, yoga).
-- load_modifier controls what fraction of that plan's volume is scheduled (0.0–2.0; 1.0 = full).
-- event_id is reserved for Phase E Part 2 (multi-event planning); nullable for now.
create table if not exists training_blocks (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  template_id    uuid references plan_templates(id) on delete set null,
  starts_on      date not null default current_date,
  ends_on        date,
  load_modifier  numeric not null default 1.0 check (load_modifier >= 0 and load_modifier <= 2.0),
  modality       text not null check (modality in ('run', 'strength', 'swim', 'yoga', 'other')),
  is_primary     boolean not null default false,
  event_id       uuid,
  created_at     timestamptz default now()
);

-- user_events: target races for multi-event planning (Phase E Part 2 — reserved).
create table if not exists user_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text not null,
  event_date     date not null,
  distance_goal  text,
  priority       integer not null default 1 check (priority between 1 and 3),
  created_at     timestamptz default now()
);

alter table training_blocks
  add constraint training_blocks_event_id_fkey
  foreign key (event_id) references user_events(id) on delete set null;

alter table training_blocks enable row level security;
create policy "Users manage own training blocks" on training_blocks
  for all using (auth.uid() = user_id);

alter table user_events enable row level security;
create policy "Users manage own events" on user_events
  for all using (auth.uid() = user_id);
```

- [ ] **Step 4: Apply the migration via Supabase MCP**

Use `mcp__supabase__apply_migration` with:
- `name`: `training_blocks`
- `query`: the full SQL from Step 3

Then verify with `mcp__supabase__list_tables` — confirm `training_blocks` and `user_events` appear in the results.

- [ ] **Step 5: Write `src/lib/trainingBlocks.ts`**

```typescript
import { supabase } from './supabase';

// Cycle phase multipliers: follicular = peak adaptation window, menstrual/luteal = reduced capacity.
const PHASE_MULTIPLIER: Record<string, number> = {
  menstrual:  0.85,
  follicular: 1.10,
  ovulatory:  1.05,
  luteal:     0.90,
};

const MAX_TOTAL_LOAD = 1.8; // ceiling for combined block load (relative to one full plan)
const MIN_RUN_LOAD   = 0.5; // run block never drops below 50% — plan remains meaningful

export type BlockModality = 'run' | 'strength' | 'swim' | 'yoga' | 'other';

export interface TrainingBlock {
  id:            string;
  user_id:       string;
  template_id:   string | null;
  starts_on:     string;
  ends_on:       string | null;
  load_modifier: number;
  modality:      BlockModality;
  is_primary:    boolean;
  event_id:      string | null;
  template?:     { name: string; duration_weeks: number; distance_goal: string | null; sport_type: string } | null;
}

export interface ComputedBlock extends TrainingBlock {
  effective_load: number;
}

// Pure function — run blocks scale down when supplement load fills the cycle-phase capacity.
// Supplement blocks (non-run) are never scaled; they represent fixed commitments.
export function computeBlockLoad(
  blocks: Array<{ modality: string; load_modifier: number }>,
  cyclePhase: string,
): Array<{ modality: string; load_modifier: number; effective_load: number }> {
  if (blocks.length === 0) return [];

  const capacity  = MAX_TOTAL_LOAD * (PHASE_MULTIPLIER[cyclePhase] ?? 1.0);
  const suppLoad  = blocks.filter((b) => b.modality !== 'run').reduce((s, b) => s + b.load_modifier, 0);
  const runBudget = Math.max(0, capacity - suppLoad);
  const rawRun    = blocks.filter((b) => b.modality === 'run').reduce((s, b) => s + b.load_modifier, 0);
  const runScale  = rawRun > 0 ? Math.min(1.0, runBudget / rawRun) : 1.0;

  return blocks.map((b) => ({
    ...b,
    effective_load: b.modality === 'run'
      ? Math.max(MIN_RUN_LOAD, Math.round(b.load_modifier * runScale * 100) / 100)
      : b.load_modifier,
  }));
}

export function inferModality(sportType: string): BlockModality {
  const s = sportType.toLowerCase();
  if (s === 'run' || s === 'running') return 'run';
  if (s.includes('strength') || s === 'gym') return 'strength';
  if (s === 'swim' || s === 'swimming') return 'swim';
  if (s === 'yoga') return 'yoga';
  return 'other';
}

export async function getActiveBlocks(userId: string): Promise<TrainingBlock[]> {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase
    .from('training_blocks')
    .select('id, user_id, template_id, starts_on, ends_on, load_modifier, modality, is_primary, event_id, template:plan_templates(name, duration_weeks, distance_goal, sport_type)')
    .eq('user_id', userId)
    .lte('starts_on', today)
    .or(`ends_on.is.null,ends_on.gte.${today}`)
    .order('is_primary', { ascending: false });
  return (data ?? []) as TrainingBlock[];
}

// Adding a primary block closes all existing primary blocks (ends_on = today).
// Supplementary blocks (is_primary=false) are additive — any number can coexist.
export async function addBlock(
  userId: string,
  opts: {
    templateId:   string;
    modality:     BlockModality;
    startsOn:     string;
    endsOn:       string | null;
    loadModifier: number;
    isPrimary:    boolean;
  },
): Promise<string | null> {
  if (opts.isPrimary) {
    const today = new Date().toISOString().split('T')[0];
    await supabase
      .from('training_blocks')
      .update({ ends_on: today })
      .eq('user_id', userId)
      .eq('is_primary', true)
      .is('ends_on', null);
  }

  const { data, error } = await supabase
    .from('training_blocks')
    .insert({
      user_id:       userId,
      template_id:   opts.templateId,
      modality:      opts.modality,
      starts_on:     opts.startsOn,
      ends_on:       opts.endsOn,
      load_modifier: opts.loadModifier,
      is_primary:    opts.isPrimary,
    })
    .select('id')
    .single();

  if (error) return null;
  return (data as { id: string }).id;
}

export async function removeBlock(blockId: string): Promise<void> {
  await supabase.from('training_blocks').delete().eq('id', blockId);
}
```

- [ ] **Step 6: Run tests and confirm they pass**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx jest __tests__/lib/trainingBlocks.test.ts --no-coverage 2>&1 | tail -8
```

Expected: `Tests: 6 passed, 6 total`

- [ ] **Step 7: TypeScript check for new files**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx tsc --noEmit 2>&1 | grep "trainingBlocks" | head -10
```

Expected: no output (no errors).

- [ ] **Step 8: Commit**

```bash
cd /Users/pauldickenson/Claude/virra/mobile
git add supabase/migrations/003_training_blocks.sql src/lib/trainingBlocks.ts "__tests__/lib/trainingBlocks.test.ts"
git commit -m "feat: training_blocks schema + computeBlockLoad library with tests"
```

---

## Task 2: Update plan/[id].tsx to create training blocks

**Files:**
- Modify: `app/(app)/plan/[id].tsx`

`handleStart` (existing "Start this plan" path) now also writes a primary `training_block` row so the new BlockStack in the Training tab has data. A new `handleAddSupplementary` writes a non-primary block at 0.5 load modifier. The existing `user_plans` write in `handleStart` is preserved — the current-week tracker already reads from it.

Key existing code to understand before editing (read the file first):
- `useEffect` at line ~95: `Promise.all([templateRes, planRes])` — you will extend this to a 3-item array
- `handleStart` at line ~152: writes `user_plans`, then navigates — you will add `addBlock` after the insert succeeds
- CTA section at line ~410: shows `VirraButton label="Start this plan"` — you will add a second button below it

- [ ] **Step 9: Read `app/(app)/plan/[id].tsx` to confirm current structure, then apply the following changes**

**Change 1 — Import** (add to existing imports at top of file):
```typescript
import { getActiveBlocks, addBlock, inferModality, type TrainingBlock } from '@/lib/trainingBlocks';
```

**Change 2 — State** (add after the existing `const [saving, setSaving] = useState(false);` line):
```typescript
const [existingBlocks, setExistingBlocks] = useState<TrainingBlock[]>([]);
```

**Change 3 — Extend the Promise.all** (replace the two-item array with three items, and add `setExistingBlocks` after setting `setUserPlan`):

Replace:
```typescript
    Promise.all([
      supabase
        .from('plan_templates')
        .select('id, name, sport_type, distance_goal, duration_weeks, description, sessions_json')
        .eq('id', id)
        .single(),
      supabase
        .from('user_plans')
        .select('start_date, goal_date')
        .eq('user_id', session.user.id)
        .eq('template_id', id)
        .eq('is_active', true)
        .maybeSingle(),
    ]).then(async ([templateRes, planRes]) => {
      const t = templateRes.data as PlanTemplate;
      const p = planRes.data as UserPlan | null;
      setPlan(t);
      setUserPlan(p);
```

With:
```typescript
    Promise.all([
      supabase
        .from('plan_templates')
        .select('id, name, sport_type, distance_goal, duration_weeks, description, sessions_json')
        .eq('id', id)
        .single(),
      supabase
        .from('user_plans')
        .select('start_date, goal_date')
        .eq('user_id', session.user.id)
        .eq('template_id', id)
        .eq('is_active', true)
        .maybeSingle(),
      getActiveBlocks(session.user.id),
    ]).then(async ([templateRes, planRes, blocks]) => {
      const t = templateRes.data as PlanTemplate;
      const p = planRes.data as UserPlan | null;
      setPlan(t);
      setUserPlan(p);
      setExistingBlocks(blocks);
```

**Change 4 — Update `handleStart`** (add the `addBlock` call after the successful `supabase.from('user_plans').insert(...)`. The insert is followed by `setSaving(false)` and an `if (error)` check — add the block write inside the success branch, just before `router.replace`):

Replace:
```typescript
    setSaving(false);
    if (error) {
      Alert.alert('Could not start plan', error.message);
    } else {
      router.replace('/(app)/(tabs)/training');
    }
```

With:
```typescript
    setSaving(false);
    if (error) {
      Alert.alert('Could not start plan', error.message);
    } else {
      await addBlock(session!.user.id, {
        templateId:   plan.id,
        modality:     inferModality(plan.sport_type),
        startsOn:     planStart,
        endsOn:       goalDate,
        loadModifier: 1.0,
        isPrimary:    true,
      });
      router.replace('/(app)/(tabs)/training');
    }
```

**Change 5 — Add `handleAddSupplementary`** (add after the closing brace of `handleStart`):
```typescript
  async function handleAddSupplementary() {
    if (!session || !plan) return;
    setSaving(true);
    const today  = new Date().toISOString().split('T')[0];
    const endsOn = plan.duration_weeks > 0
      ? new Date(Date.now() + plan.duration_weeks * 7 * 86400000).toISOString().split('T')[0]
      : null;
    const id = await addBlock(session.user.id, {
      templateId:   plan.id,
      modality:     inferModality(plan.sport_type),
      startsOn:     today,
      endsOn,
      loadModifier: 0.5,
      isPrimary:    false,
    });
    setSaving(false);
    if (!id) {
      Alert.alert('Could not add block', 'Please try again.');
      return;
    }
    router.replace('/(app)/(tabs)/training');
  }
```

**Change 6 — Add "Add to stack" button** (in the CTA section, after the existing primary `VirraButton` for "Start this plan". The button is only shown when the user already has active blocks — i.e., they're adding a supplementary modality):
```typescript
            {existingBlocks.length > 0 && (
              <VirraButton
                label="Add to stack as supplementary"
                variant="ghost"
                onPress={handleAddSupplementary}
                loading={saving}
                style={{ marginTop: spacing.xs }}
              />
            )}
```

- [ ] **Step 10: TypeScript check**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx tsc --noEmit 2>&1 | grep "plan" | head -10
```

Expected: no errors for `plan/[id].tsx`.

- [ ] **Step 11: Run full test suite**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx jest --no-coverage 2>&1 | tail -8
```

Expected: `Tests: 72 passed, 72 total` (66 existing + 6 new)

- [ ] **Step 12: Commit**

```bash
cd /Users/pauldickenson/Claude/virra/mobile
git add "app/(app)/plan/[id].tsx"
git commit -m "feat: plan detail writes training_blocks on start and add-to-stack"
```

---

## Task 3: Training tab — BlockStack component

**Files:**
- Modify: `app/(app)/(tabs)/training.tsx`

Adds a `BlockStack` component showing all active blocks with their cycle-adjusted effective loads. The existing `ActivePlanCard` is preserved as a fallback for users who have a `user_plan` but no `training_blocks` yet (backwards compatible — no migration of existing data needed).

- [ ] **Step 13: Read `app/(app)/(tabs)/training.tsx` to confirm current structure, then apply the following changes**

**Change 1 — Import** (add to existing imports):
```typescript
import { getActiveBlocks, computeBlockLoad, type TrainingBlock, type ComputedBlock } from '@/lib/trainingBlocks';
```

**Change 2 — Modality constants** (add after the existing `PHASE_LOAD` const, before the `WhyCard` function):
```typescript
const MODALITY_ICON: Record<string, string> = {
  run:      'figure.run',
  strength: 'dumbbell',
  swim:     'figure.pool.swim',
  yoga:     'figure.yoga',
  other:    'figure.walk',
};

const MODALITY_COLOR: Record<string, string> = {
  run:      colors.pulse,
  strength: colors.dawn,
  swim:     colors.breath,
  yoga:     colors.breath,
  other:    colors.muted,
};
```

**Change 3 — `activeBlocks` state** (add after the existing `const [loading, setLoading] = useState(true);` inside `TrainingScreen`):
```typescript
  const [activeBlocks, setActiveBlocks] = useState<TrainingBlock[]>([]);
```

**Change 4 — Update `loadData`** (add the blocks fetch as the first item in the `Promise.all`):

Replace:
```typescript
    const [planRes, templateRes, activityRes] = await Promise.all([
      supabase
        .from('user_plans')
        .select('id, template_id, start_date, goal_date, template:plan_templates(id, name, sport_type, distance_goal, duration_weeks, description, tagline)')
        .eq('user_id', session!.user.id)
        .eq('is_active', true)
        .maybeSingle(),
      supabase
        .from('plan_templates')
        .select('id, name, sport_type, distance_goal, duration_weeks, description, tagline')
        .order('sort_order'),
      supabase
        .from('activities')
        .select('id, activity_type, started_at, duration_seconds, distance_meters, phase_at_time, run_details(avg_pace_seconds_per_km)')
        .eq('user_id', session!.user.id)
        .order('started_at', { ascending: false })
        .limit(5),
    ]);
    setActivePlan(planRes.data as UserPlan | null);
    setTemplates((templateRes.data ?? []) as PlanTemplate[]);
    setRecentActivities((activityRes.data ?? []) as Activity[]);
    setLoading(false);
```

With:
```typescript
    const [blocks, planRes, templateRes, activityRes] = await Promise.all([
      getActiveBlocks(session!.user.id),
      supabase
        .from('user_plans')
        .select('id, template_id, start_date, goal_date, template:plan_templates(id, name, sport_type, distance_goal, duration_weeks, description, tagline)')
        .eq('user_id', session!.user.id)
        .eq('is_active', true)
        .maybeSingle(),
      supabase
        .from('plan_templates')
        .select('id, name, sport_type, distance_goal, duration_weeks, description, tagline')
        .order('sort_order'),
      supabase
        .from('activities')
        .select('id, activity_type, started_at, duration_seconds, distance_meters, phase_at_time, run_details(avg_pace_seconds_per_km)')
        .eq('user_id', session!.user.id)
        .order('started_at', { ascending: false })
        .limit(5),
    ]);
    setActiveBlocks(blocks);
    setActivePlan(planRes.data as UserPlan | null);
    setTemplates((templateRes.data ?? []) as PlanTemplate[]);
    setRecentActivities((activityRes.data ?? []) as Activity[]);
    setLoading(false);
```

**Change 5 — Update the MY PLAN view** (replace the `activePlan ? <ActivePlanCard ...> : <empty state>` block):

Replace:
```typescript
            {activePlan ? (
              <ActivePlanCard plan={activePlan} onBrowse={() => setView('browse')} />
            ) : (
              <VirraCard style={styles.emptyCard}>
                <VirraText variant="serif" size={17} color={colors.breath} style={{ lineHeight: 26 }}>
                  You don't have an active plan yet.
                </VirraText>
                <VirraButton label="Browse plans" onPress={() => setView('browse')} style={{ marginTop: spacing.md }} />
              </VirraCard>
            )}
```

With:
```typescript
            {activeBlocks.length > 0 ? (
              <BlockStack
                blocks={activeBlocks}
                cyclePhase={cycleInfo?.phase ?? null}
                onAddBlock={() => setView('browse')}
              />
            ) : activePlan ? (
              <ActivePlanCard plan={activePlan} onBrowse={() => setView('browse')} />
            ) : (
              <VirraCard style={styles.emptyCard}>
                <VirraText variant="serif" size={17} color={colors.breath} style={{ lineHeight: 26 }}>
                  You don't have an active plan yet.
                </VirraText>
                <VirraButton label="Browse plans" onPress={() => setView('browse')} style={{ marginTop: spacing.md }} />
              </VirraCard>
            )}
```

**Change 6 — Add `BlockStack` component and `stack` StyleSheet** (add before the existing `// ---- Active plan card ----` comment, around line 223):

```typescript
// ---- Block stack ----

function BlockStack({ blocks, cyclePhase, onAddBlock }: {
  blocks:     TrainingBlock[];
  cyclePhase: string | null;
  onAddBlock: () => void;
}) {
  const computed = (cyclePhase
    ? computeBlockLoad(blocks, cyclePhase)
    : blocks.map((b) => ({ ...b, effective_load: b.load_modifier }))
  ) as ComputedBlock[];

  return (
    <View style={stack.container}>
      <VirraText variant="mono" size={9} color={colors.pulse} style={stack.title}>MY STACK</VirraText>
      {computed.map((b) => (
        <Pressable
          key={b.id}
          onPress={() => b.template_id && router.push(`/(app)/plan/${b.template_id}` as any)}
          accessibilityRole="button"
        >
          <VirraCard style={stack.blockRow}>
            <View style={stack.iconWrap}>
              <SymbolView
                name={MODALITY_ICON[b.modality] ?? 'figure.walk'}
                size={18}
                tintColor={MODALITY_COLOR[b.modality] ?? colors.muted}
              />
            </View>
            <View style={stack.blockBody}>
              <View style={stack.titleRow}>
                <VirraText variant="bodyMedium" size={14} color={colors.breath} style={{ flex: 1 }}>
                  {b.template?.name ?? b.modality}
                </VirraText>
                {b.is_primary && (
                  <VirraText variant="mono" size={8} color={colors.pulse} style={stack.primaryTag}>PRIMARY</VirraText>
                )}
              </View>
              <View style={stack.loadTrack}>
                <View style={[stack.loadFill, {
                  width: `${Math.round(b.effective_load * 100)}%` as any,
                  backgroundColor: MODALITY_COLOR[b.modality] ?? colors.pulse,
                }]} />
              </View>
              <VirraText variant="mono" size={8} color={colors.muted}>
                {Math.round(b.effective_load * 100)}% load
                {b.effective_load < b.load_modifier ? ' · adjusted for stack' : ''}
              </VirraText>
            </View>
          </VirraCard>
        </Pressable>
      ))}
      <Pressable onPress={onAddBlock} style={stack.addRow} accessibilityRole="button">
        <SymbolView name="plus" size={11} tintColor={colors.muted} />
        <VirraText variant="mono" size={9} color={colors.muted} style={{ letterSpacing: 1.5 }}>
          ADD SUPPLEMENTARY BLOCK
        </VirraText>
      </Pressable>
    </View>
  );
}

const stack = StyleSheet.create({
  container:  { gap: spacing.sm },
  title:      { letterSpacing: 1.5 },
  blockRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.sm },
  iconWrap:   { width: 28, alignItems: 'center', paddingTop: 2 },
  blockBody:  { flex: 1, gap: spacing.xs },
  titleRow:   { flexDirection: 'row', alignItems: 'center' },
  primaryTag: { letterSpacing: 1, marginLeft: spacing.sm },
  loadTrack:  { height: 3, backgroundColor: colors.border, borderRadius: radius.full, overflow: 'hidden' },
  loadFill:   { height: '100%', borderRadius: radius.full },
  addRow:     { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm, paddingLeft: spacing.xs },
});
```

- [ ] **Step 14: TypeScript check**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx tsc --noEmit 2>&1 | grep "training" | head -20
```

Expected: no errors.

- [ ] **Step 15: Run full test suite**

```bash
cd /Users/pauldickenson/Claude/virra/mobile && npx jest --no-coverage 2>&1 | tail -8
```

Expected: `Tests: 72 passed, 72 total`

- [ ] **Step 16: Commit**

```bash
cd /Users/pauldickenson/Claude/virra/mobile
git add "app/(app)/(tabs)/training.tsx"
git commit -m "feat: Training tab BlockStack — shows stacked blocks with cycle-adjusted load"
```

---

## Self-Review

**Spec coverage:**
- ✅ Plan stacking (cross-sport) — Tasks 2 + 3 (primary run + supplementary modalities)
- ✅ Run volume redistributed, not additive — `computeBlockLoad` with `runBudget` logic
- ✅ Cycle phase governs combined demand — `PHASE_MULTIPLIER` in `computeBlockLoad`
- ✅ `training_blocks` schema — Task 1 migration
- ✅ `user_events` table + `event_id` stub — Task 1 migration (unblocks Part 2)
- ✅ `user_plans` backwards compatibility — Task 3 falls back to `ActivePlanCard` if no blocks
- ✅ Primary vs supplementary distinction — `is_primary` flag; `addBlock` closes existing primary
- ✅ "Add to stack as supplementary" CTA — Task 2 Change 6 (shown when blocks already exist)
- ✅ Training tab renders stack — Task 3 `BlockStack` with load bars + "adjusted for stack" label
- ✅ Unit tests for `computeBlockLoad` — Task 1 (6 tests covering: no pressure, reduction, phase diff, floor, supplements unchanged, empty)

**Placeholder scan:** None — all code blocks are complete and self-contained.

**Type consistency:**
- `TrainingBlock` — defined Task 1, used in Tasks 2 + 3 ✅
- `ComputedBlock extends TrainingBlock` — defined Task 1, cast in Task 3 `BlockStack` ✅
- `computeBlockLoad(blocks, cyclePhase)` — defined Task 1, called in Task 3 ✅
- `addBlock(userId, opts)` returns `string | null` — defined Task 1, called in Tasks 2 ✅
- `inferModality(sportType)` returns `BlockModality` — defined Task 1, called in Task 2 ✅
- `getActiveBlocks(userId)` returns `Promise<TrainingBlock[]>` — defined Task 1, called in Tasks 2 + 3 ✅
- `removeBlock(blockId)` — defined Task 1, not called in this plan (available for future swipe-to-remove UI) ✅
