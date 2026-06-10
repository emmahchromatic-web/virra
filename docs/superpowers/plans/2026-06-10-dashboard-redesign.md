# Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the text-heavy dashboard with an infographic-first layout: phase hero with streak, today's session card, nutrition arc widget, quick log row, week strip, phase tips carousel, and an adaptive check-in tile.

**Architecture:** New data-fetching logic lives in `dashboardData.ts` and `phaseNarrative.ts`; new UI in three focused components (`NutritionArcCard`, `QuickLogRow`, `TipsCarousel`); the existing `TodaysSessionHero` gains an optional start-press callback; the dashboard screen (`index.tsx`) is rewritten to wire everything together. The two AI guidance text cards are removed from the dashboard (they remain intact on the Insights screen, which already fetches and displays them independently).

**Tech Stack:** React Native, Expo, expo-router, react-native-svg, Zustand, Supabase JS client, Jest + @testing-library/react-native

---

All commands run from `mobile/` unless stated otherwise.

---

### Task 1: Supabase migration — tips table

**Files:**
- Create: `mobile/supabase/migrations/20260610000000_tips_table.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- mobile/supabase/migrations/20260610000000_tips_table.sql
create table public.tips (
  id           uuid primary key default gen_random_uuid(),
  phase        text not null
                 check (phase in ('menstrual','follicular','ovulatory','luteal','all')),
  category     text not null
                 check (category in ('training','nutrition','lifestyle')),
  tip_text     text not null,
  detail_text  text,
  active       boolean not null default true,
  sort_order   integer,
  created_at   timestamptz not null default now()
);

alter table public.tips enable row level security;

create policy "tips_read_authenticated"
  on public.tips for select
  to authenticated
  using (true);

insert into public.tips (phase, category, tip_text, active) values
  ('menstrual',  'training',   'Bleed days call for gentler effort. Walk, stretch, or a short easy run — honour how you feel.',     true),
  ('menstrual',  'nutrition',  'Iron-rich foods support what your body loses during your period. Red meat, lentils, spinach.',       true),
  ('menstrual',  'lifestyle',  'Rest is training. Your body is doing a lot right now — sleep and warmth are your tools.',             true),
  ('follicular', 'training',   'Your peak adaptation window. Hard sessions pay dividends now — your body is primed.',               true),
  ('follicular', 'nutrition',  'Oestrogen suppresses appetite in follicular phase. Hit protein targets even when not hungry.',      true),
  ('follicular', 'lifestyle',  'Social energy peaks in follicular. Use it — a group run or a class can lift performance.',          true),
  ('ovulatory',  'training',   'Strength and power peak around ovulation. A good week for PBs and race efforts.',                  true),
  ('ovulatory',  'nutrition',  'A brief water lift around ovulation is normal. Stay hydrated — it supports performance.',          true),
  ('ovulatory',  'lifestyle',  'Confidence is high right now. Set intentions, have the hard conversations, lead the run.',         true),
  ('luteal',     'training',   'Effort feels harder now. That''s real — not weakness. Run to feel, not to pace.',                  true),
  ('luteal',     'nutrition',  'Carb cravings are hormonal signals. Honour them with quality fuel before long efforts.',           true),
  ('luteal',     'lifestyle',  'Sleep quality dips in luteal. Aim for 8h and lower screen time before bed.',                       true);
```

- [ ] **Step 2: Apply via Supabase MCP**

Use the Supabase MCP `execute_sql` tool to run the migration against project `elebuieojodsjmghwjub`. Verify with:
```sql
select phase, category, tip_text from tips order by phase, category;
```
Expected: 12 rows returned.

- [ ] **Step 3: Commit**

```bash
git add mobile/supabase/migrations/20260610000000_tips_table.sql
git commit -m "feat(db): add tips table with phase-specific carousel seed data"
```

---

### Task 2: phaseNarrative lib

**Files:**
- Create: `mobile/src/lib/phaseNarrative.ts`
- Test: `mobile/__tests__/lib/phaseNarrative.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// mobile/__tests__/lib/phaseNarrative.test.ts
import { buildNarrative } from '@/lib/phaseNarrative';
import type { CyclePhase } from '@/store/cycle';
import type { TrainingLoad } from '@/lib/nutritionTargets';

describe('buildNarrative', () => {
  it('returns null when no cycle info and no sessions', () => {
    expect(buildNarrative(null, null, [], 'easy')).toBeNull();
  });

  it('combines phase + run day + luteal hard cue', () => {
    const result = buildNarrative('luteal' as CyclePhase, 3, [{ session_label: 'Long Run' }], 'hard');
    expect(result).toBe('Luteal Day 3 · Long run today · Fuel hard, rest after.');
  });

  it('combines phase + rest day + luteal easy cue', () => {
    const result = buildNarrative('luteal' as CyclePhase, 12, [], 'easy');
    expect(result).toBe('Luteal Day 12 · Rest day · Keep it easy. Your body is working hard.');
  });

  it('handles follicular hard day', () => {
    const result = buildNarrative('follicular' as CyclePhase, 8, [{ session_label: 'Tempo' }], 'hard');
    expect(result).toBe('Follicular Day 8 · Tempo today · Your adaptation window — make it count.');
  });

  it('handles menstrual any load', () => {
    const result = buildNarrative('menstrual' as CyclePhase, 2, [], 'moderate');
    expect(result).toBe('Menstrual Day 2 · Rest day · Listen to your body today.');
  });

  it('handles ovulatory with session', () => {
    const result = buildNarrative('ovulatory' as CyclePhase, 14, [{ session_label: 'Intervals' }], 'hard');
    expect(result).toBe('Ovulatory Day 14 · Intervals today · Peak week. Go for it.');
  });

  it('omits phase segment when phase is null but session exists', () => {
    const result = buildNarrative(null, null, [{ session_label: 'Easy Run' }], 'easy');
    expect(result).toBe('Easy run today · Fuel well today.');
  });

  it('capitalises first letter of session label', () => {
    const result = buildNarrative('follicular' as CyclePhase, 5, [{ session_label: 'easy run' }], 'easy');
    expect(result).toContain('Easy run today');
  });

  it('uses first session when multiple sessions planned', () => {
    const sessions = [{ session_label: 'Long Run' }, { session_label: 'Strength' }];
    const result = buildNarrative('luteal' as CyclePhase, 3, sessions, 'hard');
    expect(result).toContain('Long run today');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx jest __tests__/lib/phaseNarrative.test.ts --watchAll=false
```
Expected: `Cannot find module '@/lib/phaseNarrative'`

- [ ] **Step 3: Implement phaseNarrative.ts**

```typescript
// mobile/src/lib/phaseNarrative.ts
import type { CyclePhase } from '@/store/cycle';
import type { TrainingLoad } from '@/lib/nutritionTargets';

interface SessionStub { session_label: string; }

const CUES: Record<CyclePhase, Partial<Record<TrainingLoad, string>>> & { default?: string } = {
  luteal: {
    hard:     'Fuel hard, rest after.',
    moderate: 'Fuel hard, rest after.',
    easy:     'Keep it easy. Your body is working hard.',
    rest:     'Keep it easy. Your body is working hard.',
  },
  follicular: {
    hard:     'Your adaptation window — make it count.',
    moderate: 'Your adaptation window — make it count.',
    easy:     'Energy is rising. Build on it.',
    rest:     'Energy is rising. Build on it.',
  },
  ovulatory: {
    hard:     'Peak week. Go for it.',
    moderate: 'Peak week. Go for it.',
    easy:     'Peak week. Go for it.',
    rest:     'Peak week. Go for it.',
  },
  menstrual: {
    hard:     'Listen to your body today.',
    moderate: 'Listen to your body today.',
    easy:     'Listen to your body today.',
    rest:     'Listen to your body today.',
  },
};

function cueFor(phase: CyclePhase | null, load: TrainingLoad): string {
  if (!phase) return 'Fuel well today.';
  return CUES[phase][load] ?? 'Fuel well today.';
}

function sessionLabel(sessions: SessionStub[]): string | null {
  if (sessions.length === 0) return null;
  const raw = sessions[0].session_label;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

export function buildNarrative(
  phase:     CyclePhase | null,
  dayOfCycle: number | null,
  sessions:  SessionStub[],
  load:      TrainingLoad,
): string | null {
  const hasPhase   = phase !== null && dayOfCycle !== null;
  const label      = sessionLabel(sessions);
  const training   = label ? `${label} today` : 'Rest day';
  const cue        = cueFor(phase, load);

  if (!hasPhase && sessions.length === 0) return null;

  const parts: string[] = [];
  if (hasPhase) parts.push(`${phase!.charAt(0).toUpperCase() + phase!.slice(1)} Day ${dayOfCycle}`);
  parts.push(training);
  parts.push(cue);

  return parts.join(' · ');
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/lib/phaseNarrative.test.ts --watchAll=false
```
Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/phaseNarrative.ts __tests__/lib/phaseNarrative.test.ts
git commit -m "feat(lib): add phaseNarrative — deterministic dashboard narrative line"
```

---

### Task 3: dashboardData lib

**Files:**
- Create: `mobile/src/lib/dashboardData.ts`
- Test: `mobile/__tests__/lib/dashboardData.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// mobile/__tests__/lib/dashboardData.test.ts
import {
  getMonthlyStats,
  getTodayNutritionTotals,
  getTodayCheckin,
} from '@/lib/dashboardData';

// ── Supabase mock ────────────────────────────────────────────────────
const mockFrom = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

function chainFor(data: unknown, error: unknown = null) {
  const obj: Record<string, unknown> = {};
  const methods = ['select','eq','gte','in','maybeSingle','single'];
  methods.forEach(m => { obj[m] = jest.fn(() => obj); });
  obj['maybeSingle'] = jest.fn().mockResolvedValue({ data, error });
  obj['single']      = jest.fn().mockResolvedValue({ data, error });
  // make all chain methods return obj, then maybeSingle/single resolve
  methods.slice(0, -2).forEach(m => { (obj[m] as jest.Mock).mockReturnValue(obj); });
  return obj;
}

// ── getMonthlyStats ──────────────────────────────────────────────────
describe('getMonthlyStats', () => {
  it('calculates sessions and adherence from status rows', async () => {
    const rows = [
      { status: 'completed' },
      { status: 'completed' },
      { status: 'completed' },
      { status: 'planned' },
      { status: 'dropped' },
    ];
    const chain: Record<string, unknown> = {};
    const methods = ['select','eq','gte','in'];
    methods.forEach(m => { chain[m] = jest.fn(() => chain); });
    // resolve on the last call
    (chain['in'] as jest.Mock).mockResolvedValue({ data: rows, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await getMonthlyStats('user-1');
    // 3 completed / (3+1+1) = 60%
    expect(result.sessionsCompleted).toBe(3);
    expect(result.adherencePct).toBe(60);
  });

  it('returns zeros when no planned_sessions exist', async () => {
    const chain: Record<string, unknown> = {};
    const methods = ['select','eq','gte','in'];
    methods.forEach(m => { chain[m] = jest.fn(() => chain); });
    (chain['in'] as jest.Mock).mockResolvedValue({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    const result = await getMonthlyStats('user-2');
    expect(result.sessionsCompleted).toBe(0);
    expect(result.adherencePct).toBe(0);
  });
});

// ── getTodayNutritionTotals ──────────────────────────────────────────
describe('getTodayNutritionTotals', () => {
  it('sums food_entries for an existing log', async () => {
    const logRow = {
      id: 'log-1',
      targets_json: { calories: 2300, carbs_g: 275, protein_g: 130, fat_g: 72, fibre_g: 30 },
    };
    const foodRows = [
      { calories: 400, carbs_g: 50, protein_g: 20, fat_g: 15 },
      { calories: 600, carbs_g: 80, protein_g: 30, fat_g: 18 },
    ];

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // nutrition_logs query
        const c: Record<string, unknown> = {};
        ['select','eq'].forEach(m => { c[m] = jest.fn(() => c); });
        c['maybeSingle'] = jest.fn().mockResolvedValue({ data: logRow, error: null });
        (c['eq'] as jest.Mock).mockReturnValue(c);
        return c;
      } else {
        // food_entries query
        const c: Record<string, unknown> = {};
        ['select','eq'].forEach(m => { c[m] = jest.fn(() => c); });
        (c['eq'] as jest.Mock).mockResolvedValue({ data: foodRows, error: null });
        return c;
      }
    });

    const result = await getTodayNutritionTotals('user-1', '2026-06-10', 'luteal', 'hard');
    expect(result.caloriesLogged).toBe(1000);
    expect(result.carbsLogged).toBe(130);
    expect(result.proteinLogged).toBe(50);
    expect(result.fatLogged).toBe(33);
    expect(result.caloriesTarget).toBe(2300);
  });

  it('returns zero logged values when no log exists', async () => {
    mockFrom.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      ['select','eq'].forEach(m => { c[m] = jest.fn(() => c); });
      c['maybeSingle'] = jest.fn().mockResolvedValue({ data: null, error: null });
      (c['eq'] as jest.Mock).mockReturnValue(c);
      return c;
    });

    const result = await getTodayNutritionTotals('user-1', '2026-06-10', null, 'easy');
    expect(result.caloriesLogged).toBe(0);
    expect(result.carbsLogged).toBe(0);
    // targets come from getNutritionTargets(null, 'easy') = flat easy defaults
    expect(result.caloriesTarget).toBe(2050);
  });
});

// ── getTodayCheckin ──────────────────────────────────────────────────
describe('getTodayCheckin', () => {
  it('returns done=true and values when log exists', async () => {
    const logData = { energy: 4, mood: 3, sleep_quality: 5 };
    mockFrom.mockImplementation(() => chainFor(logData));

    const result = await getTodayCheckin('user-1', '2026-06-10');
    expect(result.done).toBe(true);
    expect(result.energy).toBe(4);
    expect(result.mood).toBe(3);
    expect(result.sleep).toBe(5);
  });

  it('returns done=false when no log exists', async () => {
    mockFrom.mockImplementation(() => chainFor(null));

    const result = await getTodayCheckin('user-1', '2026-06-10');
    expect(result.done).toBe(false);
    expect(result.energy).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx jest __tests__/lib/dashboardData.test.ts --watchAll=false
```
Expected: `Cannot find module '@/lib/dashboardData'`

- [ ] **Step 3: Implement dashboardData.ts**

```typescript
// mobile/src/lib/dashboardData.ts
import { supabase } from '@/lib/supabase';
import { getNutritionTargets } from '@/lib/nutritionTargets';
import type { CyclePhase } from '@/store/cycle';
import type { TrainingLoad } from '@/lib/nutritionTargets';

export interface MonthlyStats {
  sessionsCompleted: number;
  adherencePct:      number; // 0–100 integer
}

export interface NutritionTotals {
  caloriesLogged:  number;
  caloriesTarget:  number;
  carbsLogged:     number;
  carbsTarget:     number;
  proteinLogged:   number;
  proteinTarget:   number;
  fatLogged:       number;
  fatTarget:       number;
}

export interface TodayCheckin {
  done:   boolean;
  energy: number | null; // 1–5
  mood:   number | null;
  sleep:  number | null;
}

export async function getMonthlyStats(userId: string): Promise<MonthlyStats> {
  const monthStart = new Date();
  monthStart.setDate(1);
  const monthStartStr = monthStart.toLocaleDateString('en-CA'); // YYYY-MM-DD

  const { data } = await supabase
    .from('planned_sessions')
    .select('status')
    .eq('user_id', userId)
    .gte('scheduled_date', monthStartStr)
    .in('status', ['planned', 'completed', 'dropped']);

  if (!data || data.length === 0) return { sessionsCompleted: 0, adherencePct: 0 };

  const completed = data.filter((r: { status: string }) => r.status === 'completed').length;
  const total     = data.length;
  const adherencePct = Math.round((completed / total) * 100);

  return { sessionsCompleted: completed, adherencePct };
}

export async function getTodayNutritionTotals(
  userId:       string,
  today:        string, // YYYY-MM-DD
  phase:        CyclePhase | null,
  inferredLoad: TrainingLoad,
): Promise<NutritionTotals> {
  const targets = (() => {
    // Will be overridden if a log exists with its own targets_json
    return getNutritionTargets(phase, inferredLoad);
  })();

  const { data: log } = await supabase
    .from('nutrition_logs')
    .select('id, targets_json')
    .eq('user_id', userId)
    .eq('recorded_on', today)
    .maybeSingle();

  const effectiveTargets = (log as { targets_json?: typeof targets } | null)?.targets_json ?? targets;

  const base: NutritionTotals = {
    caloriesLogged: 0, caloriesTarget: effectiveTargets.calories,
    carbsLogged:    0, carbsTarget:    effectiveTargets.carbs_g,
    proteinLogged:  0, proteinTarget:  effectiveTargets.protein_g,
    fatLogged:      0, fatTarget:      effectiveTargets.fat_g,
  };

  if (!log) return base;

  const { data: entries } = await supabase
    .from('food_entries')
    .select('calories, carbs_g, protein_g, fat_g')
    .eq('log_id', (log as { id: string }).id);

  if (!entries) return base;

  for (const e of entries as { calories: number; carbs_g: number; protein_g: number; fat_g: number }[]) {
    base.caloriesLogged += e.calories   ?? 0;
    base.carbsLogged    += e.carbs_g    ?? 0;
    base.proteinLogged  += e.protein_g  ?? 0;
    base.fatLogged      += e.fat_g      ?? 0;
  }

  return base;
}

export async function getTodayCheckin(userId: string, today: string): Promise<TodayCheckin> {
  const { data } = await supabase
    .from('symptom_logs')
    .select('energy, mood, sleep_quality')
    .eq('user_id', userId)
    .eq('recorded_on', today)
    .maybeSingle();

  if (!data) return { done: false, energy: null, mood: null, sleep: null };

  const d = data as { energy: number; mood: number; sleep_quality: number };
  return { done: true, energy: d.energy, mood: d.mood, sleep: d.sleep_quality };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/lib/dashboardData.test.ts --watchAll=false
```
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboardData.ts __tests__/lib/dashboardData.test.ts
git commit -m "feat(lib): add dashboardData — monthly stats, nutrition totals, checkin state"
```

---

### Task 4: TodaysSessionHero — add onStartPress

**Files:**
- Modify: `mobile/src/components/ui/TodaysSessionHero.tsx`

The existing component is a vertical session list used in the Training tab. We add an optional `onStartPress` callback; when provided and there's at least one non-completed session, a `▶ START SESSION` / `▶ START RUN` button appears at the bottom.

- [ ] **Step 1: Add the prop and button**

In `TodaysSessionHero.tsx`, update the `Props` interface and add the button inside the card when sessions are present:

```typescript
// Add to Props interface:
interface Props {
  sessions:       TodaysSession[];
  onStartPress?:  () => void; // when provided, shows Start CTA for first planned session
}
```

After the `{sessions.map(...)}` block, and before the closing `</VirraCard>`, add:

```typescript
{onStartPress && sessions.some(s => s.status === 'planned') && (
  <Pressable
    style={styles.startBtn}
    onPress={onStartPress}
    accessibilityRole="button"
    accessibilityLabel="Start today's session"
  >
    <VirraText variant="display" size={13} color={colors.mile} style={styles.startLabel}>
      {sessions.find(s => s.modality === 'run' && s.status === 'planned') ? '▶  START RUN' : '▶  START SESSION'}
    </VirraText>
  </Pressable>
)}
```

Add to the `StyleSheet.create` call:

```typescript
startBtn:   {
  backgroundColor: colors.pulse,
  borderRadius:    radius.sm,
  paddingVertical: spacing.sm,
  alignItems:      'center',
  marginTop:       spacing.xs,
},
startLabel: { letterSpacing: 1.5 },
```

- [ ] **Step 2: Verify Training tab still renders unchanged**

The Training tab passes no `onStartPress`, so no button appears — behaviour is unchanged. Run existing tests:

```bash
npx jest --watchAll=false 2>&1 | tail -5
```
Expected: all existing tests still pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/TodaysSessionHero.tsx
git commit -m "feat(ui): TodaysSessionHero — add optional onStartPress CTA"
```

---

### Task 5: NutritionArcCard component

**Files:**
- Create: `mobile/src/components/ui/NutritionArcCard.tsx`
- Test: `mobile/__tests__/components/NutritionArcCard.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
// mobile/__tests__/components/NutritionArcCard.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { NutritionArcCard } from '@/components/ui/NutritionArcCard';
import type { NutritionTotals } from '@/lib/dashboardData';

const base: NutritionTotals = {
  caloriesLogged: 1400, caloriesTarget: 2300,
  carbsLogged:    180,  carbsTarget:    275,
  proteinLogged:  80,   proteinTarget:  130,
  fatLogged:      50,   fatTarget:      72,
};

describe('NutritionArcCard', () => {
  it('renders the FUELLING TODAY kicker', () => {
    const { getByText } = render(<NutritionArcCard totals={base} />);
    expect(getByText('FUELLING TODAY')).toBeTruthy();
  });

  it('shows the calorie percentage', () => {
    // 1400/2300 ≈ 61%
    const { getByText } = render(<NutritionArcCard totals={base} />);
    expect(getByText('61%')).toBeTruthy();
  });

  it('shows macro gram values', () => {
    const { getByText } = render(<NutritionArcCard totals={base} />);
    expect(getByText('180g')).toBeTruthy();
    expect(getByText('80g')).toBeTruthy();
    expect(getByText('50g')).toBeTruthy();
  });

  it('shows 0% when nothing logged', () => {
    const empty: NutritionTotals = { ...base, caloriesLogged: 0, carbsLogged: 0, proteinLogged: 0, fatLogged: 0 };
    const { getByText } = render(<NutritionArcCard totals={empty} />);
    expect(getByText('0%')).toBeTruthy();
  });

  it('caps percentage display at 100%', () => {
    const over: NutritionTotals = { ...base, caloriesLogged: 9999, caloriesTarget: 2300 };
    const { getByText } = render(<NutritionArcCard totals={over} />);
    expect(getByText('100%')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByLabelText } = render(<NutritionArcCard totals={base} onPress={onPress} />);
    fireEvent.press(getByLabelText('Fuelling today — open nutrition'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders without onPress (non-pressable)', () => {
    const { getByText } = render(<NutritionArcCard totals={base} />);
    expect(getByText('FUELLING TODAY')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx jest __tests__/components/NutritionArcCard.test.tsx --watchAll=false
```
Expected: `Cannot find module '@/components/ui/NutritionArcCard'`

- [ ] **Step 3: Implement NutritionArcCard.tsx**

```typescript
// mobile/src/components/ui/NutritionArcCard.tsx
import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from './VirraText';
import { VirraCard } from './VirraCard';
import type { NutritionTotals } from '@/lib/dashboardData';

const ARC_SIZE   = 52;
const ARC_STROKE = 5.5;
const ARC_RADIUS = (ARC_SIZE - ARC_STROKE * 2) / 2; // ~20.5
const ARC_CIRC   = 2 * Math.PI * ARC_RADIUS;
const ARC_CENTER = ARC_SIZE / 2;

interface Props {
  totals:   NutritionTotals;
  onPress?: () => void;
}

function pct(logged: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(Math.round((logged / target) * 100), 100);
}

function MacroBar({ label, logged, target, color }: { label: string; logged: number; target: number; color: string }) {
  const fill = target > 0 ? Math.min(logged / target, 1) : 0;
  return (
    <View style={bar.row}>
      <VirraText variant="mono" size={7} color={colors.muted} style={bar.label}>{label}</VirraText>
      <View style={bar.track}>
        <View style={[bar.fill, { width: `${fill * 100}%` as any, backgroundColor: color }]} />
      </View>
      <VirraText variant="mono" size={7} color={colors.muted} style={bar.val}>{Math.round(logged)}g</VirraText>
    </View>
  );
}

export function NutritionArcCard({ totals, onPress }: Props) {
  const calPct      = pct(totals.caloriesLogged, totals.caloriesTarget);
  const dashOffset  = ARC_CIRC * (1 - calPct / 100);

  const content = (
    <VirraCard style={styles.card} accessibilityLabel={onPress ? 'Fuelling today — open nutrition' : undefined}>
      <VirraText variant="mono" size={7} color={colors.muted} style={styles.kicker}>FUELLING TODAY</VirraText>
      <View style={styles.body}>
        {/* Arc */}
        <View style={styles.arcWrap}>
          <Svg width={ARC_SIZE} height={ARC_SIZE}>
            <Circle
              cx={ARC_CENTER} cy={ARC_CENTER} r={ARC_RADIUS}
              stroke={colors.border} strokeWidth={ARC_STROKE} fill="none"
            />
            <G transform={`rotate(-90, ${ARC_CENTER}, ${ARC_CENTER})`}>
              <Circle
                cx={ARC_CENTER} cy={ARC_CENTER} r={ARC_RADIUS}
                stroke={colors.dawn} strokeWidth={ARC_STROKE} fill="none"
                strokeDasharray={[ARC_CIRC, ARC_CIRC]}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
              />
            </G>
          </Svg>
          <View style={styles.arcCenter} pointerEvents="none">
            <VirraText variant="display" size={14} color={colors.dawn}>{calPct}%</VirraText>
            <VirraText variant="mono" size={6} color={colors.muted}>KCAL</VirraText>
          </View>
        </View>
        {/* Macro bars */}
        <View style={styles.bars}>
          <MacroBar label="CARB" logged={totals.carbsLogged}   target={totals.carbsTarget}   color={colors.pulse} />
          <MacroBar label="PRO"  logged={totals.proteinLogged} target={totals.proteinTarget} color={colors.dawn}  />
          <MacroBar label="FAT"  logged={totals.fatLogged}     target={totals.fatTarget}     color="rgba(244,237,224,0.25)" />
        </View>
      </View>
    </VirraCard>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Fuelling today — open nutrition">
        {content}
      </Pressable>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  card:     { gap: spacing.xs },
  kicker:   { letterSpacing: 1.5 },
  body:     { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xs },
  arcWrap:  { width: ARC_SIZE, height: ARC_SIZE, position: 'relative' },
  arcCenter:{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  bars:     { flex: 1, gap: 5 },
});

const bar = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  label: { width: 22, letterSpacing: 0.5 },
  track: { flex: 1, height: 4, backgroundColor: colors.border, borderRadius: radius.full, overflow: 'hidden' },
  fill:  { height: 4, borderRadius: radius.full },
  val:   { width: 28, textAlign: 'right' },
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/components/NutritionArcCard.test.tsx --watchAll=false
```
Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/NutritionArcCard.tsx __tests__/components/NutritionArcCard.test.tsx
git commit -m "feat(ui): NutritionArcCard — calorie arc + macro bars"
```

---

### Task 6: QuickLogRow component

**Files:**
- Create: `mobile/src/components/ui/QuickLogRow.tsx`
- Test: `mobile/__tests__/components/QuickLogRow.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
// mobile/__tests__/components/QuickLogRow.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { QuickLogRow } from '@/components/ui/QuickLogRow';

describe('QuickLogRow', () => {
  it('renders FOOD and ACTIVITY buttons always', () => {
    const { getByLabelText } = render(
      <QuickLogRow trackWeight={false} onFoodPress={() => {}} onActivityPress={() => {}} onWeightPress={() => {}} />,
    );
    expect(getByLabelText('Log food')).toBeTruthy();
    expect(getByLabelText('Log activity')).toBeTruthy();
  });

  it('hides WEIGHT button when trackWeight is false', () => {
    const { queryByLabelText } = render(
      <QuickLogRow trackWeight={false} onFoodPress={() => {}} onActivityPress={() => {}} onWeightPress={() => {}} />,
    );
    expect(queryByLabelText('Log weight')).toBeNull();
  });

  it('shows WEIGHT button when trackWeight is true', () => {
    const { getByLabelText } = render(
      <QuickLogRow trackWeight={true} onFoodPress={() => {}} onActivityPress={() => {}} onWeightPress={() => {}} />,
    );
    expect(getByLabelText('Log weight')).toBeTruthy();
  });

  it('calls onFoodPress when food button tapped', () => {
    const onFoodPress = jest.fn();
    const { getByLabelText } = render(
      <QuickLogRow trackWeight={false} onFoodPress={onFoodPress} onActivityPress={() => {}} onWeightPress={() => {}} />,
    );
    fireEvent.press(getByLabelText('Log food'));
    expect(onFoodPress).toHaveBeenCalledTimes(1);
  });

  it('calls onActivityPress when activity button tapped', () => {
    const onActivityPress = jest.fn();
    const { getByLabelText } = render(
      <QuickLogRow trackWeight={false} onFoodPress={() => {}} onActivityPress={onActivityPress} onWeightPress={() => {}} />,
    );
    fireEvent.press(getByLabelText('Log activity'));
    expect(onActivityPress).toHaveBeenCalledTimes(1);
  });

  it('calls onWeightPress when weight button tapped', () => {
    const onWeightPress = jest.fn();
    const { getByLabelText } = render(
      <QuickLogRow trackWeight={true} onFoodPress={() => {}} onActivityPress={() => {}} onWeightPress={onWeightPress} />,
    );
    fireEvent.press(getByLabelText('Log weight'));
    expect(onWeightPress).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx jest __tests__/components/QuickLogRow.test.tsx --watchAll=false
```
Expected: `Cannot find module '@/components/ui/QuickLogRow'`

- [ ] **Step 3: Implement QuickLogRow.tsx**

```typescript
// mobile/src/components/ui/QuickLogRow.tsx
import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from './VirraText';

interface Props {
  trackWeight:     boolean;
  onFoodPress:     () => void;
  onActivityPress: () => void;
  onWeightPress:   () => void;
}

interface TileProps {
  symbol:          import('expo-symbols').SymbolViewProps['name'];
  label:           string;
  accessibilityLabel: string;
  onPress:         () => void;
}

function LogTile({ symbol, label, accessibilityLabel, onPress }: TileProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <SymbolView name={symbol} size={20} tintColor={colors.muted as string} />
      <VirraText variant="mono" size={7} color={colors.muted} style={styles.label}>{label}</VirraText>
    </Pressable>
  );
}

export function QuickLogRow({ trackWeight, onFoodPress, onActivityPress, onWeightPress }: Props) {
  return (
    <View style={styles.row}>
      <LogTile
        symbol="fork.knife"
        label="FOOD"
        accessibilityLabel="Log food"
        onPress={onFoodPress}
      />
      <LogTile
        symbol="bolt.fill"
        label="ACTIVITY"
        accessibilityLabel="Log activity"
        onPress={onActivityPress}
      />
      {trackWeight && (
        <LogTile
          symbol="scalemass"
          label="WEIGHT"
          accessibilityLabel="Log weight"
          onPress={onWeightPress}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row:         { flexDirection: 'row', gap: spacing.sm },
  tile:        {
    flex:             1,
    backgroundColor:  'rgba(244,237,224,0.04)',
    borderWidth:      1,
    borderColor:      colors.border,
    borderRadius:     radius.md,
    paddingVertical:  spacing.sm,
    alignItems:       'center',
    gap:              spacing.xs,
  },
  tilePressed: { opacity: 0.7 },
  label:       { letterSpacing: 1 },
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/components/QuickLogRow.test.tsx --watchAll=false
```
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/QuickLogRow.tsx __tests__/components/QuickLogRow.test.tsx
git commit -m "feat(ui): QuickLogRow — one-tap food/activity/weight shortcuts"
```

---

### Task 7: TipsCarousel component

**Files:**
- Create: `mobile/src/components/ui/TipsCarousel.tsx`
- Test: `mobile/__tests__/components/TipsCarousel.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
// mobile/__tests__/components/TipsCarousel.test.tsx
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { TipsCarousel } from '@/components/ui/TipsCarousel';

const mockTips = [
  { id: '1', phase: 'luteal', category: 'training', tip_text: 'Run to feel, not to pace.', active: true },
  { id: '2', phase: 'luteal', category: 'nutrition', tip_text: 'Honour carb cravings with quality fuel.', active: true },
];

jest.mock('@/lib/supabase', () => {
  const select = jest.fn().mockReturnThis();
  const eq     = jest.fn().mockReturnThis();
  const inFn   = jest.fn().mockReturnThis();
  const order  = jest.fn().mockResolvedValue({ data: mockTips, error: null });
  return {
    supabase: {
      from: jest.fn(() => ({ select, eq, in: inFn, order })),
    },
    __select: select,
  };
});

describe('TipsCarousel', () => {
  it('renders the PHASE TIPS kicker', async () => {
    const { getByText } = render(<TipsCarousel phase="luteal" />);
    expect(getByText('PHASE TIPS')).toBeTruthy();
  });

  it('renders tip text after load', async () => {
    const { findByText } = render(<TipsCarousel phase="luteal" />);
    expect(await findByText('Run to feel, not to pace.')).toBeTruthy();
  });

  it('renders category label for each tip', async () => {
    const { findByText } = render(<TipsCarousel phase="luteal" />);
    expect(await findByText(/TRAINING/i)).toBeTruthy();
    expect(await findByText(/NUTRITION/i)).toBeTruthy();
  });

  it('renders shimmer while loading', () => {
    const { UNSAFE_getByType } = render(<TipsCarousel phase="luteal" />);
    // Shimmer is rendered before data resolves — just check component mounts cleanly
    expect(UNSAFE_getByType(require('@/components/ui/Shimmer').Shimmer)).toBeTruthy();
  });

  it('renders with null phase (falls back to all tips)', async () => {
    const { findByText } = render(<TipsCarousel phase={null} />);
    // component should not crash and should try to fetch
    expect(await findByText('Run to feel, not to pace.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx jest __tests__/components/TipsCarousel.test.tsx --watchAll=false
```
Expected: `Cannot find module '@/components/ui/TipsCarousel'`

- [ ] **Step 3: Implement TipsCarousel.tsx**

```typescript
// mobile/src/components/ui/TipsCarousel.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { supabase } from '@/lib/supabase';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraText } from './VirraText';
import { VirraCard } from './VirraCard';
import { SectionLabel } from './SectionLabel';
import { Shimmer } from './Shimmer';
import type { CyclePhase } from '@/store/cycle';

interface Tip {
  id:       string;
  phase:    string;
  category: string;
  tip_text: string;
}

const CARD_WIDTH = Dimensions.get('window').width * 0.58;

const CATEGORY_COLOR: Record<string, string> = {
  training:  colors.pulse,
  nutrition: colors.dawn,
  lifestyle: colors.breath,
};

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

interface Props {
  phase: CyclePhase | null;
}

export function TipsCarousel({ phase }: Props) {
  const [tips,    setTips]    = useState<Tip[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const phases = phase ? [phase, 'all'] : ['all'];
    const { data } = await supabase
      .from('tips')
      .select('id, phase, category, tip_text')
      .in('phase', phases)
      .order('sort_order', { ascending: true });
    setTips(shuffle((data ?? []) as Tip[]));
    setLoading(false);
  }, [phase]);

  useEffect(() => { load(); }, [load]);

  return (
    <VirraCard style={styles.card}>
      <SectionLabel style={styles.kicker}>PHASE TIPS</SectionLabel>
      {loading ? (
        <Shimmer height={72} lines={1} />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          {tips.map((tip) => (
            <View key={tip.id} style={styles.tip}>
              <VirraText
                variant="mono"
                size={7}
                color={CATEGORY_COLOR[tip.category] ?? colors.muted}
                style={styles.cat}
              >
                {tip.category.toUpperCase()} · {tip.phase === 'all' ? 'ALL PHASES' : tip.phase.toUpperCase()}
              </VirraText>
              <VirraText variant="body" size={13} color={colors.breath} style={styles.text}>
                {tip.tip_text}
              </VirraText>
            </View>
          ))}
        </ScrollView>
      )}
    </VirraCard>
  );
}

const styles = StyleSheet.create({
  card:   { gap: spacing.xs },
  kicker: { letterSpacing: 1.5 },
  scroll: { gap: spacing.sm, paddingRight: spacing.lg },
  tip:    {
    width:           CARD_WIDTH,
    backgroundColor: 'rgba(10,10,15,0.6)',
    borderRadius:    radius.md,
    padding:         spacing.md,
    borderWidth:     1,
    borderColor:     colors.border,
    gap:             spacing.xs,
  },
  cat:    { letterSpacing: 1.5 },
  text:   { lineHeight: 19 },
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/components/TipsCarousel.test.tsx --watchAll=false
```
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/TipsCarousel.tsx __tests__/components/TipsCarousel.test.tsx
git commit -m "feat(ui): TipsCarousel — phase-specific horizontally swipeable tip cards"
```

---

### Task 8: WeightGlanceCard onPress fix in cycle-detail

**Files:**
- Modify: `mobile/app/(app)/cycle-detail.tsx` (line ~159)

- [ ] **Step 1: Add onPress to WeightGlanceCard**

Find the `<WeightGlanceCard latestKg={...} />` call on the line after `</VirraCard>` in the `trackWeight && periodStart` block. Change it from:

```typescript
<WeightGlanceCard latestKg={readings.length ? readings[readings.length - 1].weight_kg : null} />
```

to:

```typescript
<WeightGlanceCard
  latestKg={readings.length ? readings[readings.length - 1].weight_kg : null}
  onPress={() => router.push('/(app)/weight' as any)}
/>
```

- [ ] **Step 2: Run full test suite to verify no regressions**

```bash
npx jest --watchAll=false 2>&1 | tail -5
```
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/\(app\)/cycle-detail.tsx
git commit -m "fix(ui): WeightGlanceCard in cycle-detail — add onPress to navigate to weight screen"
```

---

### Task 9: Dashboard rewrite

**Files:**
- Modify: `mobile/app/(app)/(tabs)/index.tsx` — full rewrite

This task replaces the entire `DashboardScreen` with the new layout. All new components are already built and committed.

- [ ] **Step 1: Rewrite index.tsx**

Replace the entire file contents:

```typescript
import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View, ScrollView, StyleSheet, SafeAreaView,
  Pressable, AppState, AppStateStatus,
} from 'react-native';
import { router } from 'expo-router';
import { colors, spacing } from '@/constants/theme';
import { AppHeader } from '@/components/layout/AppHeader';
import { VirraText } from '@/components/ui/VirraText';
import { VirraCard } from '@/components/ui/VirraCard';
import { useCycleStore, type CyclePhase } from '@/store/cycle';
import { useAuthStore } from '@/store/auth';
import { useProfileStore } from '@/store/profile';
import { WeekStrip } from '@/components/ui/WeekStrip';
import { CycleProgressBar } from '@/components/ui/CycleProgressBar';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { ActivityRings } from '@/components/ui/ActivityRing';
import { TodaysSessionHero } from '@/components/ui/TodaysSessionHero';
import { NutritionArcCard } from '@/components/ui/NutritionArcCard';
import { QuickLogRow } from '@/components/ui/QuickLogRow';
import { TipsCarousel } from '@/components/ui/TipsCarousel';
import { FitnessUpdateCard } from '@/components/ui/FitnessUpdateCard';
import { FitnessUpdateModal } from '@/components/ui/FitnessUpdateModal';
import { AddWeightModal } from '@/components/ui/AddWeightModal';
import { useFitnessUpdate } from '@/hooks/useFitnessUpdate';
import { SymbolView } from 'expo-symbols';
import { PHASE_META } from '@/lib/phaseMeta';
import { getDailyStats } from '@/lib/healthKitDaily';
import { getDailyTrainingContext } from '@/lib/dailyTrainingContext';
import { getTodaysSessions } from '@/lib/todaysSession';
import {
  getMonthlyStats, getTodayNutritionTotals, getTodayCheckin,
  type MonthlyStats, type NutritionTotals, type TodayCheckin,
} from '@/lib/dashboardData';
import { buildNarrative } from '@/lib/phaseNarrative';
import type { TrainingLoad } from '@/lib/nutritionTargets';
import type { TodaysSession } from '@/lib/todaysSession';

const EXERCISE_MINS_TARGET: Record<TrainingLoad, number> = {
  rest: 15, easy: 30, moderate: 45, hard: 60,
};

export default function DashboardScreen() {
  const { cycleInfo, cycleProfile } = useCycleStore();
  const { session }                 = useAuthStore();
  const trackWeight                 = useProfileStore((s) => s.trackWeight);
  const stepsTarget                 = useProfileStore((s) => s.stepsTarget);
  const { verdict, confirm, snooze } = useFitnessUpdate(session?.user.id ?? null);

  const appState = useRef<AppStateStatus>(AppState.currentState);
  const meta     = cycleInfo ? PHASE_META[cycleInfo.phase] : null;
  const today    = new Date().toLocaleDateString('en-CA');

  const [steps,         setSteps]         = useState(0);
  const [exerciseMins,  setExerciseMins]  = useState(0);
  const [inferredLoad,  setInferredLoad]  = useState<TrainingLoad>('easy');
  const [todaySessions, setTodaySessions] = useState<TodaysSession[]>([]);
  const [monthlyStats,  setMonthlyStats]  = useState<MonthlyStats>({ sessionsCompleted: 0, adherencePct: 0 });
  const [nutrition,     setNutrition]     = useState<NutritionTotals | null>(null);
  const [checkin,       setCheckin]       = useState<TodayCheckin>({ done: false, energy: null, mood: null, sleep: null });
  const [showFitnessModal, setShowFitnessModal] = useState(false);
  const [weightModalOpen,  setWeightModalOpen]  = useState(false);

  const loadAll = useCallback(async () => {
    if (!session) return;

    // HealthKit stats
    getDailyStats().then(({ steps: s, exerciseMins: e }) => {
      setSteps(s);
      setExerciseMins(e);
    });

    // Training context + today's sessions
    try {
      const ctx = await getDailyTrainingContext(session.user.id, today, cycleInfo?.phase ?? null);
      setInferredLoad(ctx.inferred_load);
    } catch { /* no-op — keep previous load */ }

    try {
      const sessions = await getTodaysSessions(session.user.id);
      setTodaySessions(sessions);
    } catch { /* no-op */ }

    // Dashboard-specific data
    try {
      const [monthly, nutr, ci] = await Promise.all([
        getMonthlyStats(session.user.id),
        getTodayNutritionTotals(session.user.id, today, cycleInfo?.phase ?? null, inferredLoad),
        getTodayCheckin(session.user.id, today),
      ]);
      setMonthlyStats(monthly);
      setNutrition(nutr);
      setCheckin(ci);
    } catch { /* no-op */ }
  }, [session, today, cycleInfo?.phase, inferredLoad]);

  useEffect(() => {
    loadAll();
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') loadAll();
      appState.current = next;
    });
    return () => sub.remove();
  }, [loadAll]);

  const narrative = buildNarrative(
    cycleInfo?.phase ?? null,
    cycleInfo?.dayOfCycle ?? null,
    todaySessions,
    inferredLoad,
  );

  if (!cycleInfo || !meta) {
    return (
      <SafeAreaView style={styles.safe}>
        <AppHeader title="VIRRA" showProfile />
        <ScrollView contentContainerStyle={styles.scroll}>
          <VirraCard>
            <VirraText variant="serif" size={17} color={colors.breath} style={{ lineHeight: 26 }}>
              {cycleProfile === 'natural' || cycleProfile === 'irregular'
                ? 'Add your cycle data to unlock phase-aware training and nutrition guidance.'
                : 'Training and nutrition targets are personalised to your training load.'}
            </VirraText>
            {(cycleProfile === 'natural' || cycleProfile === 'irregular') && (
              <VirraText variant="mono" size={10} color={colors.muted} style={{ marginTop: spacing.sm, letterSpacing: 1.5 }}>
                GO TO PROFILE → CYCLE SETTINGS
              </VirraText>
            )}
          </VirraCard>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader title="VIRRA" showProfile />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* 1. Narrative */}
        {narrative && (
          <VirraText variant="serif" size={13} color="rgba(244,237,224,0.65)" style={styles.narrative}>
            {narrative}
          </VirraText>
        )}

        {/* 2. Phase hero */}
        <Pressable onPress={() => router.push('/(app)/cycle-detail' as any)} accessibilityRole="button">
          <VirraCard style={styles.phaseCard}>
            <VirraText variant="mono" size={9} color={meta.color} style={styles.phasePill}>
              {meta.label.toUpperCase()} PHASE
            </VirraText>
            <VirraText variant="serif" size={15} color={colors.breath} style={styles.tagline}>
              {meta.tagline}
            </VirraText>
            <CycleProgressBar
              dayOfCycle={cycleInfo.dayOfCycle}
              cycleLength={cycleInfo.cycleLength}
              phaseColor={meta.color}
            />
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <VirraText variant="display" size={28} color={meta.color}>{cycleInfo.dayOfCycle}</VirraText>
                <VirraText variant="mono" size={9} color={colors.muted} style={styles.statLabel}>DAY</VirraText>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <VirraText variant="display" size={28} color={meta.color}>{cycleInfo.daysUntilNextPeriod}</VirraText>
                <VirraText variant="mono" size={9} color={colors.muted} style={styles.statLabel}>DAYS LEFT</VirraText>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <VirraText variant="display" size={28} color={meta.color}>{cycleInfo.cycleLength}</VirraText>
                <VirraText variant="mono" size={9} color={colors.muted} style={styles.statLabel}>DAY CYCLE</VirraText>
              </View>
            </View>
            {/* Streak inline */}
            {monthlyStats.sessionsCompleted > 0 && (
              <View style={styles.streakRow}>
                <View style={styles.streakLeft}>
                  <VirraText variant="display" size={20} color={colors.dawn}>
                    {monthlyStats.sessionsCompleted}
                  </VirraText>
                  <VirraText variant="mono" size={8} color={colors.muted} style={styles.streakMeta}>
                    sessions this month
                  </VirraText>
                </View>
                <VirraText variant="mono" size={9} color={colors.dawn}>
                  {monthlyStats.adherencePct}% ON PLAN
                </VirraText>
              </View>
            )}
          </VirraCard>
        </Pressable>

        {/* 3. Today session + rings */}
        <View style={styles.heroRow}>
          <View style={{ flex: 1 }}>
            <TodaysSessionHero
              sessions={todaySessions}
              onStartPress={() => router.push('/(app)/(tabs)/training' as any)}
            />
          </View>
          <VirraCard style={styles.ringsCard}>
            <ActivityRings
              steps={steps}
              exerciseMins={exerciseMins}
              stepsTarget={stepsTarget}
              exerciseMinsTarget={EXERCISE_MINS_TARGET[inferredLoad]}
            />
          </VirraCard>
        </View>

        {/* 4. Nutrition arc */}
        {nutrition && (
          <NutritionArcCard
            totals={nutrition}
            onPress={() => router.push('/(app)/(tabs)/nutrition' as any)}
          />
        )}

        {/* 5. Quick log */}
        <QuickLogRow
          trackWeight={trackWeight}
          onFoodPress={() => router.push('/(app)/food-search' as any)}
          onActivityPress={() => router.push('/(app)/manual-activity' as any)}
          onWeightPress={() => setWeightModalOpen(true)}
        />

        {/* 6. Week strip */}
        {session && (
          <Pressable
            onPress={() => router.push('/(app)/(tabs)/training' as any)}
            accessibilityRole="button"
            accessibilityLabel="This week's training — open Training tab"
          >
            <VirraCard style={{ paddingVertical: spacing.xs }}>
              <SectionLabel style={{ marginBottom: 2 }}>THIS WEEK</SectionLabel>
              <WeekStrip userId={session.user.id} phase={cycleInfo?.phase ?? null} />
            </VirraCard>
          </Pressable>
        )}

        {/* 7. Phase tips */}
        <TipsCarousel phase={cycleInfo?.phase ?? null} />

        {/* 8. Fitness update card (conditional) */}
        {verdict && (
          <FitnessUpdateCard
            verdict={verdict}
            onOpen={() => setShowFitnessModal(true)}
            onDismiss={snooze}
          />
        )}

        {/* 9. Action tiles */}
        <View style={styles.actionRow}>
          <Pressable
            style={[styles.actionTile, { borderColor: colors.pulse }]}
            onPress={() => router.push('/(app)/insights' as any)}
            accessibilityRole="button"
          >
            <SymbolView name="chart.line.uptrend.xyaxis" size={28} tintColor={colors.pulse} />
            <View>
              <VirraText variant="mono" size={10} color={colors.pulse} style={styles.actionLabel}>INSIGHTS</VirraText>
              <VirraText variant="body" size={11} color={colors.muted} style={styles.actionSub}>Your week, narrated</VirraText>
            </View>
          </Pressable>

          {checkin.done ? (
            <Pressable
              style={[styles.actionTile, { borderColor: colors.pulse, backgroundColor: 'rgba(212,255,38,0.06)' }]}
              onPress={() => router.push('/(app)/checkin')}
              accessibilityRole="button"
            >
              <SymbolView name="checkmark.circle.fill" size={28} tintColor={colors.pulse} />
              <View style={{ flex: 1 }}>
                <VirraText variant="mono" size={10} color={colors.pulse} style={styles.actionLabel}>✓ CHECKED IN</VirraText>
                <View style={styles.checkinVals}>
                  {[
                    { label: 'ENERGY', val: checkin.energy },
                    { label: 'MOOD',   val: checkin.mood   },
                    { label: 'SLEEP',  val: checkin.sleep  },
                  ].map(({ label, val }) => val !== null && (
                    <View key={label} style={styles.checkinVal}>
                      <VirraText variant="display" size={14} color={colors.pulse}>{val}</VirraText>
                      <VirraText variant="mono" size={6} color="rgba(212,255,38,0.5)">{label}</VirraText>
                    </View>
                  ))}
                </View>
              </View>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.actionTile, { borderColor: colors.dawn }]}
              onPress={() => router.push('/(app)/checkin')}
              accessibilityRole="button"
            >
              <SymbolView name="checkmark.circle" size={28} tintColor={colors.dawn} />
              <View>
                <VirraText variant="mono" size={10} color={colors.dawn} style={styles.actionLabel}>CHECK IN</VirraText>
                <VirraText variant="body" size={11} color={colors.muted} style={styles.actionSub}>30 seconds</VirraText>
              </View>
            </Pressable>
          )}
        </View>

      </ScrollView>

      <FitnessUpdateModal
        visible={showFitnessModal}
        verdict={verdict}
        onConfirm={async () => { await confirm(); setShowFitnessModal(false); }}
        onSnooze={async () => { await snooze(); setShowFitnessModal(false); }}
      />

      {session && (
        <AddWeightModal
          visible={weightModalOpen}
          userId={session.user.id}
          onClose={() => setWeightModalOpen(false)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: colors.mile },
  scroll:     { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  narrative:  {
    // variant="serif" already loads Fraunces italic — no fontStyle needed
    lineHeight:  20,
    color:       'rgba(244,237,224,0.65)',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  phaseCard:  { gap: spacing.xs },
  phasePill:  { letterSpacing: 2 },
  tagline:    { lineHeight: 22, marginBottom: spacing.xs },
  statsRow:   { flexDirection: 'row', marginTop: spacing.sm },
  stat:       { flex: 1, alignItems: 'center', gap: 2 },
  statLabel:  { letterSpacing: 1.5, textAlign: 'center' },
  statDivider:{ width: 1, backgroundColor: colors.border, marginHorizontal: spacing.sm },
  streakRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  streakLeft: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  streakMeta: { letterSpacing: 0.5 },
  heroRow:    { flexDirection: 'row', alignItems: 'stretch', gap: spacing.md },
  ringsCard:  { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md, width: 80 },
  actionRow:  { flexDirection: 'row', gap: spacing.md },
  actionTile: {
    flex: 1, borderWidth: 1.5, borderRadius: 10,
    backgroundColor: colors.mist, padding: spacing.md, gap: spacing.sm,
  },
  actionLabel:   { letterSpacing: 1.5 },
  actionSub:     { lineHeight: 14, marginTop: 2 },
  checkinVals:   { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs,
                   paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: 'rgba(212,255,38,0.15)' },
  checkinVal:    { alignItems: 'center', gap: 2 },
});
```

- [ ] **Step 2: Run the full test suite**

```bash
npx jest --watchAll=false 2>&1 | tail -10
```
Expected: all tests pass. Fix any import errors before proceeding.

- [ ] **Step 3: Start the dev server and visually verify**

```bash
npx expo start --clear
```

Check on device/simulator:
- Phase hero card shows with streak row at base (if sessions exist this month)
- Today's session card shows with ▶ START RUN button when a session is planned
- Rest day shows serif recovery message, no button
- Nutrition arc shows 0% if no food logged today
- Quick log row shows 2 or 3 buttons depending on `trackWeight`
- Week strip renders
- Phase tips carousel shows and scrolls horizontally
- Check-in tile shows CHECK IN state (or ✓ CHECKED IN if already checked in today)
- Insights tile links to Insights screen
- AI guidance text cards are gone from the dashboard
- Narrative italic line appears at top (if cycle data exists)

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/\(tabs\)/index.tsx
git commit -m "feat(dashboard): phase-led infographic redesign — narrative, session hero, nutrition arc, tips carousel, adaptive check-in"
```

---

### Task 10: Move Trello cards to Done

- [ ] **Step 1: Move completed app cards**

Move these cards to the **Done** list (`69fce4a09e7bf91bb0a46692`):
- `69fcf40a27e5c6ecb2d175c7` — Feature | Dashboard - Today Training
- `6a0c5c1c12b254774ef6f3ec` — Feature | Dashboard - This Week's Training (already existed)
- `6a0c5af6f830cda5cbc54a85` — Feature | Dashboard - Scrollable Tips
- `6a0c499c3fc24801e1b4a9c0` — Feature | Dashboard - Check-In
- `69ff2e7f2af32885fe33b47a` — App | Feature - Dashboard / Weekly Overview
- `6a0c492062e7f29f1bfd7963` — App | Bug - Remove Weight Insights from Dashboard

Leave `6a01a954295a1455ebab667d` (Dashboard / Cycle Info) in QA pending clarification.

```bash
source ~/.trello.env
for id in "69fcf40a27e5c6ecb2d175c7" "6a0c5c1c12b254774ef6f3ec" "6a0c5af6f830cda5cbc54a85" "6a0c499c3fc24801e1b4a9c0" "69ff2e7f2af32885fe33b47a" "6a0c492062e7f29f1bfd7963"; do
  curl -s -X PUT "https://api.trello.com/1/cards/$id?idList=69fce4a09e7bf91bb0a46692&key=$TRELLO_KEY&token=$TRELLO_TOKEN" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('name','?'), '→ Done')"
done
```

- [ ] **Step 2: Comment on the weight fix card**

```bash
source ~/.trello.env
curl -s -X POST "https://api.trello.com/1/cards/6a0c492062e7f29f1bfd7963/actions/comments" \
  --data-urlencode "text=WeightGlanceCard now has onPress → navigates to weight detail screen. Shipped with the dashboard redesign." \
  --data "key=$TRELLO_KEY&token=$TRELLO_TOKEN" > /dev/null && echo "commented"
```
