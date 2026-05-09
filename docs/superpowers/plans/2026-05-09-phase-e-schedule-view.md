# Phase E — Schedule View + Session Detail + Volume Intelligence

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire volume intelligence into the training calendar so tapping a session shows computed distance, pace, and duration, with cross-week volume redistribution that accounts for missed sessions and cycle phase.

**Architecture:** A new `volumePlan.ts` library provides four functions — pace resolution (3-source hierarchy), session pace targets, weekly volume redistribution (front-loaded + cycle-aware), and per-day detail computation. `SessionDetailModal` replaces `SessionActionModal` in the Training tab, fetching day detail on open. `MonthCalendar` gains race event markers. `SessionActionModal` gets a free-day query so MOVE THIS WEEK no longer picks occupied days.

**Tech Stack:** React Native, Supabase (PostgREST queries), `expo-symbols` (SF Symbols), `VirraModal`, `VirraText`, `VirraButton`, existing `dropSession`/`moveSession` from `scheduleGenerator.ts`, Zustand `useCycleStore`.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/lib/volumePlan.ts` | `getGoalPace`, `getSessionPaceTarget`, `getWeeklyVolumePlan`, `getDaySessionDetail`, `_redistributeKm`, `distributeWeeklyKm` |
| Create | `supabase/migrations/011_phase_e_schedule.sql` | `target_finish_time` on `user_events` + unique constraint on `planned_sessions` |
| Create | `src/components/ui/SessionDetailModal.tsx` | Enhanced day modal — computed detail, phase banner, deficit message, actions |
| Modify | `src/components/ui/MonthCalendar.tsx` | Race event query + `flag.fill` markers + tap events with no sessions |
| Modify | `src/components/ui/SessionActionModal.tsx` | Free-day pre-query in `handleMoveThisWeek`, `noFreeDay` state |
| Modify | `app/(app)/(tabs)/training.tsx` | Replace `SessionActionModal` with `SessionDetailModal`, pass `cycleStore` |

---

## Task 1: DB Migration 011

**Files:**
- Create: `supabase/migrations/011_phase_e_schedule.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- 1. Target finish time for race events (optional, user-set)
alter table public.user_events
  add column if not exists target_finish_time text;
-- Format: 'H:MM:SS' or 'HH:MM:SS', e.g. '4:15:00'. Nullable — validated in app.

-- 2. Prevent duplicate planned sessions for same user/date/modality/label
create unique index if not exists planned_sessions_no_clash_idx
  on public.planned_sessions (user_id, scheduled_date, modality, session_label)
  where status in ('planned', 'completed');
-- Allows upper + lower strength on same day (different session_label).
-- Blocks duplicate tempo run on same day at DB level.

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Apply via Supabase MCP**

Use `mcp__supabase__apply_migration` with name `011_phase_e_schedule` and the SQL above.

Then verify with `mcp__supabase__execute_sql`:
```sql
select column_name, data_type
from information_schema.columns
where table_name = 'user_events' and column_name = 'target_finish_time';
```
Expected: 1 row, `data_type = 'text'`.

```sql
select indexname from pg_indexes
where tablename = 'planned_sessions' and indexname = 'planned_sessions_no_clash_idx';
```
Expected: 1 row.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/011_phase_e_schedule.sql
git commit -m "feat: add target_finish_time to user_events and unique constraint on planned_sessions"
```

---

## Task 2: `volumePlan.ts` — Core Intelligence Library

**Files:**
- Create: `src/lib/volumePlan.ts`
- Create: `__tests__/lib/volumePlan.test.ts`

- [ ] **Step 1: Write the test file first**

Create `mobile/__tests__/lib/volumePlan.test.ts`:

```typescript
import {
  getSessionPaceTarget,
  _redistributeKm,
  distributeWeeklyKm,
  formatPace,
  type WeekInput,
} from '@/lib/volumePlan';

// --- getSessionPaceTarget ---

test('easy session in follicular phase is slower than goal pace', () => {
  // goal 300 s/km (5:00/km), easy modifier 1.20, follicular 0.98
  const result = getSessionPaceTarget(300, 'easy', 'follicular');
  expect(result).toBeCloseTo(300 * 1.20 * 0.98, 1); // 352.8
});

test('interval session in ovulatory phase is faster than goal pace', () => {
  const result = getSessionPaceTarget(300, 'interval', 'ovulatory');
  expect(result).toBeCloseTo(300 * 0.92 * 0.97, 1); // 267.72
});

test('unknown session label defaults to 1.0 type modifier', () => {
  const result = getSessionPaceTarget(300, 'unknown_label', null);
  expect(result).toBeCloseTo(300 * 1.0 * 1.0, 1); // 300
});

test('null phase defaults to 1.0 phase modifier', () => {
  const result = getSessionPaceTarget(300, 'tempo', null);
  expect(result).toBeCloseTo(300 * 1.0 * 1.0, 1); // 300
});

// --- _redistributeKm ---

const baseWeeks: WeekInput[] = [
  { week_number: 1, original_km: 30, phase: 'follicular', is_current: false, is_past: true, is_taper: false },
  { week_number: 2, original_km: 35, phase: 'ovulatory',  is_current: true,  is_past: false, is_taper: false },
  { week_number: 3, original_km: 40, phase: 'luteal',     is_current: false, is_past: false, is_taper: false },
  { week_number: 4, original_km: 25, phase: 'menstrual',  is_current: false, is_past: false, is_taper: true },
];

test('past weeks always get 0 from redistribution', () => {
  const result = _redistributeKm(70, baseWeeks);
  expect(result[0]).toBe(0); // week 1 is past
});

test('redistribution total equals remainingKm when no caps hit', () => {
  // Use small remaining_km so caps are not hit
  const result = _redistributeKm(30, baseWeeks);
  const remaining = result.slice(1).reduce((a, b) => a + b, 0);
  expect(remaining).toBeCloseTo(30, 1);
});

test('front-loading: earlier remaining weeks get more km than later weeks (equal phase weight)', () => {
  const equalPhaseWeeks: WeekInput[] = [
    { week_number: 1, original_km: 50, phase: null, is_current: true,  is_past: false, is_taper: false },
    { week_number: 2, original_km: 50, phase: null, is_current: false, is_past: false, is_taper: false },
    { week_number: 3, original_km: 50, phase: null, is_current: false, is_past: false, is_taper: false },
  ];
  const result = _redistributeKm(90, equalPhaseWeeks);
  expect(result[0]).toBeGreaterThan(result[1]);
  expect(result[1]).toBeGreaterThan(result[2]);
});

test('taper week capped at original_km', () => {
  // Week 4 is taper (25km). Redistribute 200km — would overflow, taper should cap at 25.
  const result = _redistributeKm(200, baseWeeks);
  expect(result[3]).toBeLessThanOrEqual(25);
});

test('non-taper week capped at 1.30 × original_km', () => {
  const result = _redistributeKm(200, baseWeeks);
  expect(result[1]).toBeLessThanOrEqual(35 * 1.30 + 0.01);
  expect(result[2]).toBeLessThanOrEqual(40 * 1.30 + 0.01);
});

// --- distributeWeeklyKm ---

test('long session gets 40% when present', () => {
  const sessions = [
    { id: 'long-1', session_label: 'long' },
    { id: 'easy-1', session_label: 'easy' },
    { id: 'tempo-1', session_label: 'tempo' },
  ];
  const dist = distributeWeeklyKm(sessions, 40);
  expect(dist['long-1']).toBeCloseTo(16, 0); // 40% of 40
  // total should equal 40
  const total = Object.values(dist).reduce((a, b) => a + b, 0);
  expect(total).toBeCloseTo(40, 1);
});

test('without long session, all sessions split by type modifier weight', () => {
  const sessions = [
    { id: 'easy-1', session_label: 'easy' },   // modifier 1.20
    { id: 'tempo-1', session_label: 'tempo' },  // modifier 1.00
  ];
  const dist = distributeWeeklyKm(sessions, 22);
  // easy: 1.20/(1.20+1.00) * 22 = 12.0; tempo: 1.00/2.20 * 22 = 10.0
  expect(dist['easy-1']).toBeCloseTo(12.0, 0);
  expect(dist['tempo-1']).toBeCloseTo(10.0, 0);
});

// --- formatPace ---

test('formatPace 300 s/km → 5:00/km', () => {
  expect(formatPace(300)).toBe('5:00/km');
});

test('formatPace 323 s/km → 5:23/km', () => {
  expect(formatPace(323)).toBe('5:23/km');
});

test('formatPace 60 s/km → 1:00/km', () => {
  expect(formatPace(60)).toBe('1:00/km');
});
```

- [ ] **Step 2: Run tests to confirm they fail (functions not yet defined)**

```bash
cd mobile && npx jest --no-coverage volumePlan 2>&1 | tail -15
```
Expected: `Cannot find module '@/lib/volumePlan'`.

- [ ] **Step 3: Write `volumePlan.ts`**

Create `mobile/src/lib/volumePlan.ts`:

```typescript
import { supabase } from './supabase';
import type { CyclePhase } from './cycleEngine';
import { getCycleInfo } from './cycleEngine';

// ---- Interfaces ----

export interface GoalPace {
  seconds_per_km: number;
  source: 'event_target' | 'split_calibrated' | 'baseline';
}

export interface WeekVolumePlan {
  week_number: number;
  original_km: number;
  adjusted_km: number;
  phase:       CyclePhase | null;
  is_current:  boolean;
  is_past:     boolean;
}

export interface VolumePlanResult {
  weeks:           WeekVolumePlan[];
  total_km:        number;
  completed_km:    number;
  remaining_km:    number;
  deficit_message: string | null;
}

export interface RunSessionDetail {
  kind:               'run';
  planned_session_id: string;
  session_label:      string;
  distance_km:        number;
  pace_target_secs:   number;
  estimated_minutes:  number;
  status:             string;
  actual_pace_secs:   number | null;
  actual_distance_km: number | null;
}

export interface StrengthSessionDetail {
  kind:               'strength';
  planned_session_id: string;
  session_label:      string;
  estimated_minutes:  number;
  status:             string;
}

export type SessionDetail = RunSessionDetail | StrengthSessionDetail;

export interface UserEvent {
  id:                 string;
  name:               string;
  event_date:         string;
  priority:           string;
  target_finish_time: string | null;
}

export interface DayDetail {
  date:            string;
  sessions:        SessionDetail[];
  events:          UserEvent[];
  phase:           CyclePhase | null;
  phase_guidance:  string;
  volume_plan:     VolumePlanResult;
}

// Input type for the pure redistribution function (exported for tests)
export interface WeekInput {
  week_number: number;
  original_km: number;
  phase:       CyclePhase | null;
  is_current:  boolean;
  is_past:     boolean;
  is_taper:    boolean;
}

// ---- Constants ----

const RACE_DISTANCES: Record<string, number | null> = {
  '5k':            5.0,
  '10k':           10.0,
  'half_marathon': 21.0975,
  'marathon':      42.195,
  'general':       null,
};

const TYPE_MODIFIER: Record<string, number> = {
  interval:    0.92,
  tempo:       1.00,
  threshold:   1.00,
  race:        1.00,
  moderate:    1.05,
  progression: 1.05,
  long:        1.15,
  easy:        1.20,
  recovery:    1.20,
  base:        1.20,
};

// Same values — used in split calibration to normalise actual pace to threshold equivalent
const TYPE_INVERSE_MODIFIER: Record<string, number> = { ...TYPE_MODIFIER };

const PHASE_MODIFIER: Record<string, number> = {
  ovulatory:  0.97,
  follicular: 0.98,
  luteal:     1.03,
  menstrual:  1.05,
};

const PHASE_WEIGHT: Record<string, number> = {
  follicular: 1.15,
  ovulatory:  1.10,
  luteal:     0.90,
  menstrual:  0.85,
};

const STRENGTH_DURATION: Record<string, number> = {
  lower:   45,
  upper:   40,
  general: 35,
};

const PHASE_GUIDANCE: Record<string, string> = {
  follicular: 'Ramp up. Your body adapts faster now.',
  ovulatory:  'Hardest sessions belong here.',
  luteal:     'Hold the work, honour fatigue.',
  menstrual:  'Keep effort light — rest is training too.',
};

// ---- Helpers (exported for tests) ----

export function formatPace(secondsPerKm: number): string {
  const mins = Math.floor(secondsPerKm / 60);
  const secs = Math.round(secondsPerKm % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}/km`;
}

// Pure redistribution — takes remaining km and week metadata, returns adjusted km per week.
// Past weeks always get 0 (their original_km is already counted in completed_km).
export function _redistributeKm(remainingKm: number, weeks: WeekInput[]): number[] {
  const remaining = weeks.filter((w) => !w.is_past);
  if (!remaining.length) return weeks.map(() => 0);

  // Weights: phase × front-load decay (0-indexed within remaining weeks)
  const rawWeights = remaining.map((w, i) => {
    const phaseW = PHASE_WEIGHT[w.phase ?? ''] ?? 1.0;
    return phaseW * Math.pow(0.92, i);
  });
  const totalWeight = rawWeights.reduce((a, b) => a + b, 0);

  // Initial allocation
  let alloc = remaining.map((w, i) => remainingKm * rawWeights[i] / totalWeight);

  // Apply caps: taper weeks → original_km; others → 1.30 × original_km
  let overflow = 0;
  const uncappedIdx: number[] = [];
  alloc = alloc.map((km, i) => {
    const cap = remaining[i].is_taper
      ? remaining[i].original_km
      : remaining[i].original_km * 1.30;
    if (km > cap) {
      overflow += km - cap;
      return cap;
    }
    uncappedIdx.push(i);
    return km;
  });

  // Redistribute overflow evenly to uncapped weeks (best-effort)
  if (overflow > 0 && uncappedIdx.length > 0) {
    const extra = overflow / uncappedIdx.length;
    uncappedIdx.forEach((i) => {
      const cap = remaining[i].is_taper
        ? remaining[i].original_km
        : remaining[i].original_km * 1.30;
      alloc[i] = Math.min(cap, alloc[i] + extra);
    });
  }

  // Map back to full weeks array (past → 0)
  const result: number[] = [];
  let ri = 0;
  for (const w of weeks) {
    result.push(w.is_past ? 0 : (alloc[ri++] ?? 0));
  }
  return result;
}

// Distribute a week's km budget across sessions by label weight.
// long gets 40%; others split the remaining 60% proportionally by TYPE_MODIFIER.
// Without a long session, all sessions split proportionally by TYPE_MODIFIER.
export function distributeWeeklyKm(
  sessions: Array<{ id: string; session_label: string }>,
  weekKm:   number,
): Record<string, number> {
  const result: Record<string, number> = {};
  const hasLong = sessions.some((s) => s.session_label === 'long');

  if (hasLong) {
    const longS = sessions.find((s) => s.session_label === 'long')!;
    result[longS.id] = weekKm * 0.40;
    const others = sessions.filter((s) => s.session_label !== 'long');
    const remaining = weekKm * 0.60;
    const totalMod = others.reduce((sum, s) => sum + (TYPE_MODIFIER[s.session_label] ?? 1.0), 0);
    others.forEach((s) => {
      result[s.id] = totalMod > 0
        ? remaining * (TYPE_MODIFIER[s.session_label] ?? 1.0) / totalMod
        : remaining / others.length;
    });
  } else {
    const totalMod = sessions.reduce((sum, s) => sum + (TYPE_MODIFIER[s.session_label] ?? 1.0), 0);
    sessions.forEach((s) => {
      result[s.id] = totalMod > 0
        ? weekKm * (TYPE_MODIFIER[s.session_label] ?? 1.0) / totalMod
        : weekKm / sessions.length;
    });
  }
  return result;
}

// ---- 1a. Goal pace ----

export async function getGoalPace(
  userId:  string,
  blockId: string,
  phase:   CyclePhase | null,
): Promise<GoalPace> {
  const DEFAULT_PACE = 360; // 6:00/km fallback

  const [blockRes, profileRes] = await Promise.all([
    supabase
      .from('training_blocks')
      .select('event_id, template:plan_templates(distance_goal)')
      .eq('id', blockId)
      .single(),
    supabase
      .from('user_profiles')
      .select('baseline_pace_seconds_per_km')
      .eq('id', userId)
      .single(),
  ]);

  const block    = blockRes.data;
  const baseline = profileRes.data?.baseline_pace_seconds_per_km ?? DEFAULT_PACE;

  // Source 1: event target finish time
  if (block?.event_id) {
    const { data: evt } = await supabase
      .from('user_events')
      .select('target_finish_time')
      .eq('id', block.event_id)
      .single();

    const distGoal = (block.template as any)?.distance_goal ?? null;
    const raceKm   = distGoal ? (RACE_DISTANCES[distGoal] ?? null) : null;

    if (evt?.target_finish_time && raceKm) {
      const parts      = evt.target_finish_time.split(':').map(Number);
      const finishSecs = (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
      if (finishSecs > 0 && raceKm > 0) {
        return { seconds_per_km: finishSecs / raceKm, source: 'event_target' };
      }
    }
  }

  // Source 2: split-calibrated from ≥3 completed run sessions in this block
  const { data: completedSessions } = await supabase
    .from('planned_sessions')
    .select('id, session_label')
    .eq('block_id', blockId)
    .eq('status', 'completed')
    .eq('modality', 'run');

  if ((completedSessions?.length ?? 0) >= 3) {
    const sessionIds = completedSessions!.map((s) => s.id);
    const { data: runData } = await supabase
      .from('activities')
      .select('planned_session_id, run_details(avg_pace_seconds_per_km)')
      .in('planned_session_id', sessionIds);

    const labelMap = Object.fromEntries(
      (completedSessions ?? []).map((s) => [s.id, s.session_label])
    );

    const validRuns = (runData ?? []).filter(
      (r: any) => r.run_details?.avg_pace_seconds_per_km
    );

    if (validRuns.length >= 3) {
      const estimates = validRuns.map((r: any) => {
        const modifier = TYPE_INVERSE_MODIFIER[labelMap[r.planned_session_id]] ?? 1.0;
        return (r.run_details.avg_pace_seconds_per_km as number) / modifier;
      });
      const avg = estimates.reduce((a: number, b: number) => a + b, 0) / estimates.length;
      if (baseline > 0 && Math.abs(avg - baseline) / baseline > 0.05) {
        return { seconds_per_km: avg, source: 'split_calibrated' };
      }
    }
  }

  // Source 3: baseline
  return { seconds_per_km: baseline, source: 'baseline' };
}

// ---- 1b. Session pace target (pure function) ----

export function getSessionPaceTarget(
  goalPace:     number,
  sessionLabel: string,
  phase:        CyclePhase | null,
): number {
  const typeMod  = TYPE_MODIFIER[sessionLabel] ?? 1.0;
  const phaseMod = PHASE_MODIFIER[phase ?? ''] ?? 1.0;
  return goalPace * typeMod * phaseMod;
}

// ---- 1c. Weekly volume plan ----

export async function getWeeklyVolumePlan(
  userId:     string,
  blockId:    string,
  cycleStore: { periodStart: Date | null; cycleLength: number },
): Promise<VolumePlanResult> {
  const EMPTY: VolumePlanResult = {
    weeks: [], total_km: 0, completed_km: 0, remaining_km: 0, deficit_message: null,
  };

  // Fetch block + template + sessions_json
  const { data: block } = await supabase
    .from('training_blocks')
    .select('starts_on, event_id, template:plan_templates(sessions_json, distance_goal)')
    .eq('id', blockId)
    .single();

  if (!block) return EMPTY;

  const sessionsJson: Array<{ week: number; km: number }> =
    (block.template as any)?.sessions_json ?? [];
  if (!sessionsJson.length) return EMPTY;

  const total_km = sessionsJson.reduce((sum, w) => sum + (w.km ?? 0), 0);

  // Completed km from linked activities
  const { data: completedLinks } = await supabase
    .from('planned_sessions')
    .select('activity_id')
    .eq('block_id', blockId)
    .eq('status', 'completed')
    .not('activity_id', 'is', null);

  let completed_km = 0;
  const actIds = (completedLinks ?? []).map((r: any) => r.activity_id).filter(Boolean);
  if (actIds.length > 0) {
    const { data: acts } = await supabase
      .from('activities')
      .select('distance_meters')
      .in('id', actIds);
    completed_km = (acts ?? []).reduce(
      (sum: number, a: any) => sum + (a.distance_meters ?? 0) / 1000,
      0,
    );
  }

  const remaining_km = Math.max(0, total_km - completed_km);

  // Determine current week index from starts_on
  const startsOn    = new Date(`${block.starts_on}T00:00:00`);
  const today       = new Date();
  const msPerWeek   = 7 * 24 * 60 * 60 * 1000;
  const currentWeek = Math.floor((today.getTime() - startsOn.getTime()) / msPerWeek) + 1;

  // Build week metadata with cycle phase projection
  const weekInputs: WeekInput[] = sessionsJson.map((w, i) => {
    const weekStart = new Date(startsOn.getTime() + i * msPerWeek);
    let phase: CyclePhase | null = null;
    if (cycleStore.periodStart) {
      const info = getCycleInfo(cycleStore.periodStart, cycleStore.cycleLength, weekStart);
      phase = info?.phase ?? null;
    }
    const isPast   = w.week < currentWeek;
    const isTaper  = i > 0 && w.km < sessionsJson[i - 1].km;
    return {
      week_number: w.week,
      original_km: w.km,
      phase,
      is_current: w.week === currentWeek,
      is_past:    isPast,
      is_taper:   isTaper,
    };
  });

  const adjustedKms = _redistributeKm(remaining_km, weekInputs);

  const achievableKm = adjustedKms.reduce((sum, km) => sum + km, 0) + completed_km;
  const deficit_km   = Math.max(0, total_km - achievableKm - 0.5); // 0.5 km tolerance

  let deficit_message: string | null = null;
  if (deficit_km > 0) {
    const distGoal = (block.template as any)?.distance_goal ?? null;
    const raceKm   = distGoal ? (RACE_DISTANCES[distGoal] ?? null) : null;

    if (raceKm) {
      // Estimate revised race pace: goal volume deficit implies ~0.3% pace increase per 1% volume deficit
      const { seconds_per_km: goalPaceSecs } = await getGoalPace(userId, blockId, null);
      const deficitRatio = deficit_km / total_km;
      const revisedPace  = goalPaceSecs * (1 + deficitRatio * 0.3);
      deficit_message    = `Whilst you've missed some sessions, your goal is still within reach. Hit the remaining sessions and aim for a revised pace of ${formatPace(revisedPace)} on race day.`;
    } else {
      deficit_message =
        "Whilst you've missed some sessions, your goal is still within reach — hit the remaining sessions to give yourself the best chance.";
    }
  }

  const weeks: WeekVolumePlan[] = weekInputs.map((w, i) => ({
    week_number: w.week_number,
    original_km: w.original_km,
    adjusted_km: w.is_past ? w.original_km : adjustedKms[i],
    phase:       w.phase,
    is_current:  w.is_current,
    is_past:     w.is_past,
  }));

  return { weeks, total_km, completed_km, remaining_km, deficit_message };
}

// ---- 1d. Day session detail ----

export async function getDaySessionDetail(
  userId:     string,
  dateISO:    string,
  cycleStore: { periodStart: Date | null; cycleLength: number; phase: CyclePhase | null },
): Promise<DayDetail> {
  const phase         = cycleStore.phase;
  const phase_guidance = PHASE_GUIDANCE[phase ?? ''] ?? '';

  const EMPTY_PLAN: VolumePlanResult = {
    weeks: [], total_km: 0, completed_km: 0, remaining_km: 0, deficit_message: null,
  };

  // Fetch planned sessions for this date
  const { data: daySessions } = await supabase
    .from('planned_sessions')
    .select('id, session_label, modality, status, week_number, block_id, activity_id')
    .eq('user_id', userId)
    .eq('scheduled_date', dateISO)
    .neq('status', 'moved');

  // Fetch events on this date
  const { data: events } = await supabase
    .from('user_events')
    .select('id, name, event_date, priority, target_finish_time')
    .eq('user_id', userId)
    .eq('event_date', dateISO);

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

  // Group by block_id
  const blockGroups: Record<string, typeof daySessions> = {};
  for (const s of daySessions) {
    if (!blockGroups[s.block_id]) blockGroups[s.block_id] = [];
    blockGroups[s.block_id].push(s);
  }

  const allSessions: SessionDetail[] = [];
  let volumePlan: VolumePlanResult = EMPTY_PLAN;

  for (const [blockId, sessions] of Object.entries(blockGroups)) {
    const hasRun      = sessions.some((s) => s.modality === 'run');
    const hasStrength = sessions.some((s) => s.modality === 'strength');

    if (hasRun) {
      // Get goal pace and volume plan for this block
      const [goalPace, plan] = await Promise.all([
        getGoalPace(userId, blockId, phase),
        getWeeklyVolumePlan(userId, blockId, {
          periodStart: cycleStore.periodStart,
          cycleLength: cycleStore.cycleLength,
        }),
      ]);
      volumePlan = plan; // expose the last run block's plan (typically only one)

      // Get current week's adjusted_km for this block
      const weekNumber    = sessions[0]?.week_number ?? 1;
      const weekPlan      = plan.weeks.find((w) => w.week_number === weekNumber);
      const weekAdjKm     = weekPlan?.adjusted_km ?? sessions.reduce((_, __) => 0, 0);

      // Get all active run sessions in this week for this block (for km distribution)
      const { data: weekSessions } = await supabase
        .from('planned_sessions')
        .select('id, session_label')
        .eq('block_id', blockId)
        .eq('week_number', weekNumber)
        .eq('modality', 'run')
        .in('status', ['planned', 'completed']);

      const distMap = distributeWeeklyKm(weekSessions ?? [], weekAdjKm);

      for (const s of sessions.filter((s) => s.modality === 'run')) {
        const distance_km     = distMap[s.id] ?? 0;
        const pace_target_secs = getSessionPaceTarget(goalPace.seconds_per_km, s.session_label, phase);
        const estimated_minutes = pace_target_secs > 0
          ? Math.round(distance_km * pace_target_secs / 60)
          : 0;

        // For completed sessions, fetch actual run data
        let actual_pace_secs: number | null = null;
        let actual_distance_km: number | null = null;
        if (s.status === 'completed' && s.activity_id) {
          const { data: rd } = await supabase
            .from('run_details')
            .select('avg_pace_seconds_per_km')
            .eq('activity_id', s.activity_id)
            .maybeSingle();
          const { data: act } = await supabase
            .from('activities')
            .select('distance_meters')
            .eq('id', s.activity_id)
            .maybeSingle();
          actual_pace_secs   = rd?.avg_pace_seconds_per_km ?? null;
          actual_distance_km = act?.distance_meters ? act.distance_meters / 1000 : null;
        }

        allSessions.push({
          kind: 'run',
          planned_session_id:  s.id,
          session_label:        s.session_label,
          distance_km,
          pace_target_secs,
          estimated_minutes,
          status:               s.status,
          actual_pace_secs,
          actual_distance_km,
        });
      }
    }

    for (const s of sessions.filter((s) => s.modality === 'strength')) {
      const estimated_minutes = STRENGTH_DURATION[s.session_label] ?? 40;
      allSessions.push({
        kind:               'strength',
        planned_session_id: s.id,
        session_label:      s.session_label,
        estimated_minutes,
        status:             s.status,
      });
    }
  }

  return {
    date:          dateISO,
    sessions:      allSessions,
    events:        (events ?? []) as UserEvent[],
    phase,
    phase_guidance,
    volume_plan:   volumePlan,
  };
}
```

- [ ] **Step 4: Run the tests**

```bash
cd mobile && npx jest --no-coverage volumePlan 2>&1 | tail -20
```
Expected: all tests pass (`Tests: 13 passed`).

- [ ] **Step 5: TypeScript check**

```bash
cd mobile && npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | grep "volumePlan" | head -20
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/lib/volumePlan.ts mobile/__tests__/lib/volumePlan.test.ts
git commit -m "feat: volumePlan.ts — pace resolution, volume redistribution, per-day session detail"
```

---

## Task 3: `SessionDetailModal` Component

**Files:**
- Create: `src/components/ui/SessionDetailModal.tsx`

This modal replaces `SessionActionModal` in the Training tab. It calls `getDaySessionDetail` on open and renders computed distance/pace/duration plus action buttons.

- [ ] **Step 1: Write `SessionDetailModal.tsx`**

Create `mobile/src/components/ui/SessionDetailModal.tsx`:

```typescript
import React, { useEffect, useState } from 'react';
import { View, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraModal } from './VirraModal';
import { VirraText } from './VirraText';
import { VirraButton } from './VirraButton';
import { dropSession, moveSession } from '@/lib/scheduleGenerator';
import { getDaySessionDetail, formatPace } from '@/lib/volumePlan';
import { supabase } from '@/lib/supabase';
import type { CyclePhase } from '@/lib/cycleEngine';
import type { DayDetail, SessionDetail, RunSessionDetail, UserEvent } from '@/lib/volumePlan';

interface Props {
  visible:    boolean;
  date:       string;
  userId:     string;
  cycleStore: { periodStart: Date | null; cycleLength: number; phase: CyclePhase | null };
  onClose:    () => void;
  onMutate:   () => void;
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function mondayOfISO(iso: string): string {
  const d   = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().split('T')[0];
}

const PHASE_COLOR: Record<string, string> = {
  follicular: colors.pulse,
  ovulatory:  colors.pulse,
  luteal:     colors.dawn,
  menstrual:  colors.muted,
};

export function SessionDetailModal({ visible, date, userId, cycleStore, onClose, onMutate }: Props) {
  const [detail, setDetail]       = useState<DayDetail | null>(null);
  const [loading, setLoading]     = useState(false);
  const [busy, setBusy]           = useState(false);
  const [noFreeDay, setNoFreeDay] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (visible && date) {
      setDetail(null);
      setNoFreeDay({});
      setLoading(true);
      getDaySessionDetail(userId, date, cycleStore)
        .then(setDetail)
        .catch((e) => console.warn('[SessionDetailModal]', e))
        .finally(() => setLoading(false));
    }
  }, [visible, date]);

  const title = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'short',
  });

  async function handleDrop(sessionId: string) {
    setBusy(true);
    try {
      await dropSession(sessionId);
      onMutate();
    } catch (e: unknown) {
      Alert.alert('Could not drop session', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  async function handleMoveThisWeek(session: SessionDetail) {
    const monday    = mondayOfISO(date);
    const jsDay     = new Date(`${date}T00:00:00Z`).getUTCDay();
    const dayIdx    = jsDay === 0 ? 6 : jsDay - 1;
    const weekDates = Array.from({ length: 7 }, (_, i) => shiftDate(monday, i));

    const { data: occupied } = await supabase
      .from('planned_sessions')
      .select('scheduled_date')
      .eq('user_id', userId)
      .eq('modality', session.kind)
      .eq('session_label', session.session_label)
      .in('status', ['planned', 'completed'])
      .in('scheduled_date', weekDates);

    const occupiedSet = new Set((occupied ?? []).map((r: any) => r.scheduled_date));
    occupiedSet.add(date);

    const freeDay = weekDates.slice(dayIdx + 1).find((d) => !occupiedSet.has(d));
    if (!freeDay) {
      setNoFreeDay((prev) => ({ ...prev, [session.planned_session_id]: true }));
      return;
    }

    setBusy(true);
    try {
      await moveSession(session.planned_session_id, freeDay, userId);
      onMutate();
    } catch (e: unknown) {
      Alert.alert('Could not move session', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  async function handleCatchup(sessionId: string) {
    setBusy(true);
    try {
      await moveSession(sessionId, shiftDate(date, 7), userId);
      onMutate();
    } catch (e: unknown) {
      Alert.alert('Could not move session', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  function renderSessionCard(s: SessionDetail, i: number) {
    const label = s.session_label.charAt(0).toUpperCase() + s.session_label.slice(1);
    const isRun = s.kind === 'run';
    const r     = s as RunSessionDetail;

    return (
      <View key={s.planned_session_id} style={[modal.card, i > 0 && modal.cardBorder]}>
        <View style={modal.cardHeader}>
          <VirraText variant="bodyMedium" size={14} color={colors.breath}>{label}</VirraText>
          <VirraText variant="mono" size={9} color={colors.muted}>
            {s.kind.toUpperCase()}
          </VirraText>
        </View>

        {isRun && s.status !== 'dropped' && (
          <VirraText variant="mono" size={10} color={colors.muted} style={modal.detail}>
            {s.status === 'completed' && r.actual_distance_km
              ? `${r.actual_distance_km.toFixed(1)}km · ${r.actual_pace_secs ? formatPace(r.actual_pace_secs) : '—'} · actual`
              : `${r.distance_km.toFixed(1)}km · ${formatPace(r.pace_target_secs)} · ~${r.estimated_minutes}min`}
          </VirraText>
        )}

        {!isRun && s.status !== 'dropped' && (
          <VirraText variant="mono" size={10} color={colors.muted} style={modal.detail}>
            ~{s.estimated_minutes}min
          </VirraText>
        )}

        {s.status === 'planned' && (
          <View style={modal.actions}>
            <Pressable style={modal.actionBtn} onPress={() => handleDrop(s.planned_session_id)} disabled={busy}>
              <SymbolView name="xmark.circle" size={12} tintColor={colors.heat} />
              <VirraText variant="mono" size={9} color={colors.heat}>DROP</VirraText>
            </Pressable>

            {noFreeDay[s.planned_session_id] ? (
              <VirraText variant="mono" size={9} color={colors.muted} style={{ flex: 1 }}>
                No free day this week — use Catch-Up to reschedule next week.
              </VirraText>
            ) : (
              <Pressable style={modal.actionBtn} onPress={() => handleMoveThisWeek(s)} disabled={busy}>
                <SymbolView name="arrow.left.arrow.right" size={12} tintColor={colors.muted} />
                <VirraText variant="mono" size={9} color={colors.muted}>MOVE THIS WEEK</VirraText>
              </Pressable>
            )}

            <Pressable style={modal.actionBtn} onPress={() => handleCatchup(s.planned_session_id)} disabled={busy}>
              <SymbolView name="calendar.badge.plus" size={12} tintColor={colors.pulse} />
              <VirraText variant="mono" size={9} color={colors.pulse}>CATCH-UP</VirraText>
            </Pressable>
          </View>
        )}

        {s.status === 'completed' && (
          <View style={modal.statusRow}>
            <SymbolView name="checkmark.circle.fill" size={12} tintColor={colors.pulse} />
            <VirraText variant="mono" size={9} color={colors.pulse}>COMPLETED</VirraText>
          </View>
        )}

        {s.status === 'dropped' && (
          <VirraText variant="mono" size={9} color={colors.muted}>DROPPED</VirraText>
        )}
      </View>
    );
  }

  function renderEventCard(evt: UserEvent) {
    const daysUntil = Math.ceil(
      (new Date(`${evt.event_date}T00:00:00`).getTime() - Date.now()) / 86400000
    );
    return (
      <View key={evt.id} style={[modal.card, modal.cardBorder]}>
        <View style={modal.cardHeader}>
          <SymbolView
            name="flag.fill"
            size={12}
            tintColor={evt.priority === 'high' ? colors.heat : colors.dawn}
          />
          <VirraText variant="bodyMedium" size={14} color={colors.breath}>{evt.name}</VirraText>
        </View>
        {evt.target_finish_time && (
          <VirraText variant="mono" size={10} color={colors.muted}>
            Target: {evt.target_finish_time}
          </VirraText>
        )}
        {daysUntil >= 0 && (
          <VirraText variant="mono" size={9} color={colors.muted}>
            {daysUntil === 0 ? 'Today!' : `${daysUntil} days away`}
          </VirraText>
        )}
      </View>
    );
  }

  return (
    <VirraModal visible={visible} onClose={onClose} title={title}>
      {/* Phase banner */}
      {detail?.phase && (
        <View style={modal.phaseBanner}>
          <VirraText
            variant="mono"
            size={9}
            color={PHASE_COLOR[detail.phase] ?? colors.muted}
            style={{ letterSpacing: 1.5 }}
          >
            {detail.phase.toUpperCase()} · {detail.phase_guidance}
          </VirraText>
        </View>
      )}

      {/* Loading */}
      {loading && (
        <View style={modal.loadingWrap}>
          <ActivityIndicator color={colors.pulse} />
        </View>
      )}

      {/* Sessions */}
      {!loading && detail && detail.sessions.map((s, i) => renderSessionCard(s, i))}

      {/* Events (race day info) */}
      {!loading && detail?.events.map((evt) => renderEventCard(evt))}

      {/* Empty state: events only */}
      {!loading && detail && detail.sessions.length === 0 && detail.events.length === 0 && (
        <VirraText variant="body" size={13} color={colors.muted}>
          No sessions scheduled for this day.
        </VirraText>
      )}

      {/* Deficit coaching message */}
      {!loading && detail?.volume_plan.deficit_message && (
        <VirraText
          variant="body"
          size={13}
          color={colors.dawn}
          style={modal.deficitMsg}
        >
          {detail.volume_plan.deficit_message}
        </VirraText>
      )}

      <VirraButton label="Close" variant="ghost" onPress={onClose} style={{ marginTop: spacing.md }} />
    </VirraModal>
  );
}

const modal = StyleSheet.create({
  phaseBanner: {
    backgroundColor: colors.mist,
    borderRadius:    radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginBottom:    spacing.sm,
  },
  loadingWrap: { alignItems: 'center', paddingVertical: spacing.lg },
  card:        { gap: spacing.xs, paddingVertical: spacing.sm },
  cardBorder:  { borderTopWidth: 1, borderTopColor: colors.border },
  cardHeader:  { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  detail:      { letterSpacing: 0.3 },
  actions:     { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  actionBtn:   {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 6, paddingHorizontal: spacing.sm,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
  },
  statusRow:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  deficitMsg:  { marginTop: spacing.md, lineHeight: 20 },
});
```

- [ ] **Step 2: TypeScript check**

```bash
cd mobile && npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | grep -i "sessiondetail\|volumeplan" | head -20
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/ui/SessionDetailModal.tsx
git commit -m "feat: SessionDetailModal with computed distance, pace, deficit message, and smart move"
```

---

## Task 4: `MonthCalendar` Race Markers

**Files:**
- Modify: `src/components/ui/MonthCalendar.tsx`

Add a second Supabase query to load `user_events` for the displayed month and render `flag.fill` SF Symbol markers on race dates. Also allow tapping event-only days.

- [ ] **Step 1: Read the file**

Read `mobile/src/components/ui/MonthCalendar.tsx` (already done above — the full file is at lines 1–143).

- [ ] **Step 2: Add `UserEvent` import and `eventMap` state**

At line 3, after the existing imports, add:
```typescript
import { SymbolView } from 'expo-symbols';
import type { UserEvent } from '@/lib/volumePlan';
```

After `const [sessionMap, setSessionMap] = useState<Record<string, CalendarSession[]>>({});` (line 46), add:
```typescript
const [eventMap, setEventMap] = useState<Record<string, UserEvent[]>>({});
```

- [ ] **Step 3: Extend the `load()` function to also query `user_events`**

Replace the existing `load()` function (lines 51–66) with:
```typescript
async function load() {
  const startISO = toISO(year, month, 1);
  const endISO   = toISO(year, month, daysInMonth(year, month));

  const [sessionsRes, eventsRes] = await Promise.all([
    supabase
      .from('planned_sessions')
      .select('id, scheduled_date, session_label, modality, status, block_id')
      .eq('user_id', userId)
      .gte('scheduled_date', startISO)
      .lte('scheduled_date', endISO)
      .neq('status', 'moved')
      .order('scheduled_date'),
    supabase
      .from('user_events')
      .select('id, name, event_date, priority, target_finish_time')
      .eq('user_id', userId)
      .gte('event_date', startISO)
      .lte('event_date', endISO),
  ]);

  const sMap: Record<string, CalendarSession[]> = {};
  for (const s of (sessionsRes.data ?? [])) {
    if (!sMap[s.scheduled_date]) sMap[s.scheduled_date] = [];
    sMap[s.scheduled_date].push(s as CalendarSession);
  }
  setSessionMap(sMap);

  const eMap: Record<string, UserEvent[]> = {};
  for (const e of (eventsRes.data ?? [])) {
    if (!eMap[e.event_date]) eMap[e.event_date] = [];
    eMap[e.event_date].push(e as UserEvent);
  }
  setEventMap(eMap);
}
```

- [ ] **Step 4: Update cell rendering to show flag marker and allow event-day taps**

Replace the existing `<Pressable>` block inside the week map (lines 94–123) with:
```tsx
<Pressable
  key={di}
  style={[cal.cell, isToday && cal.cellToday]}
  onPress={() => {
    const hasSessions = sessions.length > 0;
    const hasEvents   = (eventMap[iso] ?? []).length > 0;
    if (hasSessions || hasEvents) onDayPress?.(iso, sessions);
  }}
  accessibilityRole={(sessions.length > 0 || (eventMap[iso] ?? []).length > 0) ? 'button' : 'none'}
>
  <VirraText
    variant="mono"
    size={11}
    color={isToday ? colors.mile : isPast ? colors.muted : colors.breath}
  >
    {dayNum}
  </VirraText>
  {sessions.length > 0 && (
    <View style={cal.dotRow}>
      {sessions.slice(0, 3).map((s, si) => (
        <View
          key={si}
          style={[
            cal.dot,
            {
              backgroundColor: MODALITY_COLOR[s.modality] ?? colors.muted,
              opacity: isPast && s.status !== 'completed' ? 0.35 : 1,
            },
          ]}
        />
      ))}
    </View>
  )}
  {(eventMap[iso] ?? []).length > 0 && (
    <SymbolView
      name="flag.fill"
      size={8}
      tintColor={(eventMap[iso][0].priority === 'high' ? colors.heat : colors.dawn) as any}
    />
  )}
</Pressable>
```

- [ ] **Step 5: TypeScript check**

```bash
cd mobile && npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | grep -i "monthcalendar" | head -10
```
Expected: no errors.

- [ ] **Step 6: Run full test suite**

```bash
cd mobile && npx jest --no-coverage 2>&1 | tail -8
```
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/components/ui/MonthCalendar.tsx
git commit -m "feat: MonthCalendar race markers — flag.fill on user_events dates, tap event-only days"
```

---

## Task 5: `SessionActionModal` Smart Scheduling Fix

**Files:**
- Modify: `src/components/ui/SessionActionModal.tsx`

`handleMoveThisWeek` currently tries each remaining day and calls `moveSession` — because there was no unique constraint, the first candidate always succeeded even if it clashed. With migration 011's constraint active, and the `SessionDetailModal` now being the primary UI, `SessionActionModal` is kept for backwards compatibility but its `handleMoveThisWeek` needs the free-day pre-query.

- [ ] **Step 1: Read the file**

Read `mobile/src/components/ui/SessionActionModal.tsx` (already done above — full file at lines 1–121).

- [ ] **Step 2: Add Supabase import and `noFreeDay` state**

After the existing imports (line 8), add:
```typescript
import { supabase } from '@/lib/supabase';
```

Inside the `SessionActionModal` function, after `const [busy, setBusy] = useState(false);` (line 34), add:
```typescript
const [noFreeDay, setNoFreeDay] = useState<Record<string, boolean>>({});
```

- [ ] **Step 3: Replace `handleMoveThisWeek`**

Replace the entire `handleMoveThisWeek` function (lines 46–58) with:
```typescript
async function handleMoveThisWeek(s: CalendarSession) {
  const monday    = mondayOfISO(date);
  const jsDay     = new Date(`${date}T00:00:00Z`).getUTCDay();
  const dayIdx    = jsDay === 0 ? 6 : jsDay - 1;
  const weekDates = Array.from({ length: 7 }, (_, i) => shiftDate(monday, i));

  const { data: occupied } = await supabase
    .from('planned_sessions')
    .select('scheduled_date')
    .eq('user_id', userId)
    .eq('modality', s.modality)
    .eq('session_label', s.session_label)
    .in('status', ['planned', 'completed'])
    .in('scheduled_date', weekDates);

  const occupiedSet = new Set((occupied ?? []).map((r: any) => r.scheduled_date));
  occupiedSet.add(date);

  const freeDay = weekDates.slice(dayIdx + 1).find((d) => !occupiedSet.has(d));
  if (!freeDay) {
    setNoFreeDay((prev) => ({ ...prev, [s.id]: true }));
    return;
  }

  setBusy(true);
  try {
    await moveSession(s.id, freeDay, userId);
    onMutate();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    Alert.alert('Could not move session', msg);
  } finally {
    setBusy(false);
  }
}
```

- [ ] **Step 4: Update the MOVE THIS WEEK button to show `noFreeDay` message**

Replace the MOVE THIS WEEK `<Pressable>` block (lines 90–96) with:
```tsx
{noFreeDay[s.id] ? (
  <VirraText variant="mono" size={9} color={colors.muted} style={{ flex: 1 }}>
    No free day this week — use Catch-Up to reschedule next week.
  </VirraText>
) : (
  <Pressable style={modal.actionBtn} onPress={() => handleMoveThisWeek(s)} disabled={busy}>
    <SymbolView name="arrow.left.arrow.right" size={13} tintColor={colors.muted} />
    <VirraText variant="mono" size={9} color={colors.muted}>MOVE THIS WEEK</VirraText>
  </Pressable>
)}
```

- [ ] **Step 5: TypeScript check**

```bash
cd mobile && npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | grep -i "sessionaction" | head -10
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/components/ui/SessionActionModal.tsx
git commit -m "fix: SessionActionModal free-day pre-query prevents clashing MOVE THIS WEEK sessions"
```

---

## Task 6: Wire `training.tsx` — Replace Modal, Pass `cycleStore`

**Files:**
- Modify: `app/(app)/(tabs)/training.tsx`

Swap `SessionActionModal` for `SessionDetailModal` in the Training tab. The new modal fetches its own detail internally, so `actionSessions` state is no longer needed. Pass `cycleStore` derived from `useCycleStore`.

- [ ] **Step 1: Read the current file**

Read `mobile/app/(app)/(tabs)/training.tsx` — already done above (full file at lines 1–474).

- [ ] **Step 2: Update imports (lines 16–17)**

Replace:
```typescript
import { MonthCalendar, type CalendarSession } from '@/components/ui/MonthCalendar';
import { SessionActionModal } from '@/components/ui/SessionActionModal';
```
With:
```typescript
import { MonthCalendar } from '@/components/ui/MonthCalendar';
import { SessionDetailModal } from '@/components/ui/SessionDetailModal';
```

- [ ] **Step 3: Update `useCycleStore` destructure (line 99)**

Replace:
```typescript
const { cycleInfo }  = useCycleStore();
```
With:
```typescript
const { cycleInfo, periodStart, cycleLength } = useCycleStore();
```

- [ ] **Step 4: Remove `actionSessions` state and update `actionDate` state (lines 111–112)**

Replace:
```typescript
const [actionDate,     setActionDate]     = useState<string | null>(null);
const [actionSessions, setActionSessions] = useState<CalendarSession[]>([]);
```
With:
```typescript
const [actionDate, setActionDate] = useState<string | null>(null);
```

- [ ] **Step 5: Build the `cycleStore` object for passing to the modal**

After `const phaseLoad = cycleInfo ? PHASE_LOAD[cycleInfo.phase] : null;` (line 148), add:
```typescript
const cycleStore = {
  periodStart: periodStart ?? null,
  cycleLength: cycleLength ?? 28,
  phase:       cycleInfo?.phase ?? null,
} as const;
```

- [ ] **Step 6: Update `MonthCalendar.onDayPress` handler (lines 230–233)**

Replace:
```typescript
onDayPress={(date, sessions) => {
  setActionDate(date);
  setActionSessions(sessions);
}}
```
With:
```typescript
onDayPress={(date) => {
  setActionDate(date);
}}
```

- [ ] **Step 7: Replace `SessionActionModal` with `SessionDetailModal` (lines 237–246)**

Replace the entire `SessionActionModal` block:
```typescript
{actionDate && session && (
  <SessionActionModal
    visible={!!actionDate}
    date={actionDate}
    sessions={actionSessions}
    userId={session.user.id}
    onClose={() => { setActionDate(null); setActionSessions([]); }}
    onMutate={() => { setActionDate(null); setActionSessions([]); loadData(); }}
  />
)}
```
With:
```typescript
{actionDate && session && (
  <SessionDetailModal
    visible={!!actionDate}
    date={actionDate}
    userId={session.user.id}
    cycleStore={cycleStore}
    onClose={() => setActionDate(null)}
    onMutate={() => { setActionDate(null); loadData(); }}
  />
)}
```

- [ ] **Step 8: TypeScript check + full test suite**

```bash
cd mobile && npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | head -20
cd mobile && npx jest --no-coverage 2>&1 | tail -8
```
Expected: no TS errors; all tests pass.

- [ ] **Step 9: Commit**

```bash
git add "mobile/app/(app)/(tabs)/training.tsx"
git commit -m "feat: wire SessionDetailModal into Training tab with cycle-aware volume intelligence"
```

---

## Verification (end-to-end)

1. **Migration**: Run `select column_name from information_schema.columns where table_name='user_events'` — `target_finish_time` should appear. Run `select indexname from pg_indexes where tablename='planned_sessions'` — `planned_sessions_no_clash_idx` should appear.

2. **Volume plan — no sessions**: A user with no completed run sessions should see baseline pace (source: `'baseline'`) on tapping a session day.

3. **Session detail modal opens**: Tap any day with sessions in the Training tab calendar → modal opens; shows session label, distance, pace, duration. Phase banner appears if cycle data exists.

4. **Completed session**: Tap a day with a `completed` run — modal shows actual pace + distance instead of targets. No action buttons.

5. **Drop**: Tap a planned session → DROP → session disappears from calendar, `status='dropped'` in DB.

6. **MOVE THIS WEEK — free day**: Tap a planned session → MOVE THIS WEEK → session moves to a free day in the same week (no existing session of same modality + label on that day).

7. **MOVE THIS WEEK — no free day**: All remaining days in the week already have a session of the same type → modal shows "No free day this week — use Catch-Up to reschedule next week." instead of the MOVE button.

8. **Race markers**: Add a `user_events` row for a date in the current month → calendar shows `flag.fill` symbol on that date. Tapping that date opens `SessionDetailModal` (even if no sessions), showing the event name, target finish time, and days until race.

9. **Deficit message**: If a user has missed enough sessions that redistribution can't absorb remaining km (hits the 1.30× caps on all remaining weeks) → coaching message appears in `colors.dawn` below the last session card.

---

## Self-Review

**Spec coverage check:**
- ✅ `volumePlan.ts` — `getGoalPace` (3-source: event → split-calibrated → baseline), `getSessionPaceTarget` (TYPE × PHASE modifiers), `getWeeklyVolumePlan` (front-loading, phase weights, 1.30× cap, taper protection, deficit message), `getDaySessionDetail` (run distances, pace targets, strength durations, actual data for completed) — Task 2
- ✅ DB migration — `target_finish_time` on `user_events`, partial unique index on `planned_sessions` — Task 1
- ✅ `SessionDetailModal` — phase banner, run detail (distance·pace·duration), strength detail (~min), completed shows actuals, action buttons, deficit message in `colors.dawn`, loading state, event info card — Task 3
- ✅ Race markers in `MonthCalendar` — `flag.fill` SF Symbol, `colors.heat` for high priority, `colors.dawn` for normal — Task 4
- ✅ Event-day taps work (sessions.length=0 but events exist) — Task 4
- ✅ Smart scheduling fix — free-day pre-query in both `SessionActionModal` and `SessionDetailModal`, `noFreeDay` inline message — Tasks 5 + 3
- ✅ `SessionActionModal` kept (backwards-compatible) with same fix applied — Task 5

**Placeholder scan:** None. All code blocks are complete.

**Type consistency check:**
- `DayDetail.sessions: SessionDetail[]` ← returned by `getDaySessionDetail` ← consumed by `SessionDetailModal` ✓
- `DayDetail.events: UserEvent[]` ← `UserEvent` defined in `volumePlan.ts`, re-exported, used in `SessionDetailModal` ✓
- `cycleStore` shape `{ periodStart, cycleLength, phase }` — matches `getDaySessionDetail` signature and `getWeeklyVolumePlan` (which only uses `periodStart` + `cycleLength`) ✓
- `WeekInput` exported from `volumePlan.ts` for tests ✓
- `formatPace` exported from `volumePlan.ts`, imported in `SessionDetailModal` ✓
- `_redistributeKm` and `distributeWeeklyKm` exported for tests ✓
- `useCycleStore` now destructures `periodStart` and `cycleLength` in `training.tsx` — these exist on the Zustand store (confirmed in store file) ✓
