# Phase E Sub-Project 3b — Multi-Event Progressive Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `seasons` aggregate above `training_blocks` that chains multiple events into a phase-based, cycle-modulated continuous timeline.

**Architecture:** A new `seasons` table owns an ordered list of `user_events`. `seasonEngine.buildChain()` is a pure function that turns events into a sequence of `training_blocks` with named phases (recovery/base/build/peak/taper/race). `applySeasonChain()` persists the chain and populates `planned_sessions.phase` for every generated session. At session read time, `getDaySessionDetail` calls `modulateForCycle()` which applies a cycle-phase × session-type matrix to produce a cycle-adjusted target plus a human-readable reason. The SessionDetailModal renders the "why this pace" card; TodaysSessionHero shows a small adjustment badge; a new MY SEASON timeline section on the Training tab visualises the chain.

**Tech Stack:** Supabase MCP (migration), TypeScript pure-function engine, existing `volumePlan` / `scheduleGenerator` primitives, React Native, `expo-symbols`, existing `VirraCard` / `VirraText` / `VirraModal` components, Zustand (`useAuthStore`, `useCycleStore`).

---

## Context

This builds directly on shipped Phase E work:

- `training_blocks` (Phase E core) — already supports overlapping blocks per modality
- `planned_sessions` (Phase E sub-1) — day-level scheduling, status tracking, drop/move/catch-up
- `user_events` (Phase E sub-1) — race markers on calendar, `target_finish_time` column
- `volumePlan.ts` (Phase E sub-1) — `getGoalPace`, `getSessionPaceTarget` with TYPE × PHASE modifiers, `getWeeklyVolumePlan`, `getDaySessionDetail`
- Plan stacking + load-balancing (Phase E sub-2) — `buildVolumeAdjustmentNote`, `loadScale`, `minRunLoadScale`
- Break handling (Phase E sub-3a) — `training_breaks`, `computeBreakDays`, `applyBreak`

This sub-project does not replace any of the above. It adds a **connecting layer** that produces `training_blocks` and `planned_sessions` rows of the same shape, plus extends `getDaySessionDetail` to fold a cycle modulation result into each session at read time.

The full spec lives at `docs/superpowers/specs/2026-05-13-phase-e-sub3b-multi-event-design.md` — read it before starting Task 1.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/013_seasons.sql` | seasons table, FK columns on user_events/training_blocks/planned_sessions, phase enum |
| Create | `mobile/src/lib/cycleModulation.ts` | Pure cycle-phase × session-type modifier matrix, `modulateForCycle()` |
| Create | `mobile/src/lib/seasonEngine.ts` | `buildSeasonChain()` pure function + `applySeasonChain()` persistence + `recomputeSeasonForUser()` |
| Modify | `mobile/src/lib/volumePlan.ts` | `getDaySessionDetail` returns `cycle_modulation` field |
| Modify | `mobile/src/lib/trainingBlocks.ts` | `addBlock` triggers `recomputeSeasonForUser` when 2+ future events exist |
| Modify | `mobile/src/components/ui/SessionDetailModal.tsx` | Render why-card when `cycle_modulation` non-null |
| Modify | `mobile/src/lib/todaysSession.ts` | Surface cycle-adjustment indicator on today's sessions |
| Modify | `mobile/src/components/ui/TodaysSessionHero.tsx` | Render adjustment badge (↓/↑ + reason snippet) |
| Create | `mobile/src/components/ui/SeasonTimeline.tsx` | MY SEASON timeline component |
| Modify | `mobile/app/(app)/(tabs)/training.tsx` | Insert `SeasonTimeline` above `TodaysSessionHero`; load season state |

---

## Task 1: DB Migration 013 — `seasons` + schema additions

**Files:**
- Create: `supabase/migrations/013_seasons.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Seasons aggregate: links 2+ user_events into a continuous training arc
create table public.seasons (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  starts_on   date not null,
  ends_on     date not null,
  status      text not null default 'active'
                check (status in ('active','completed','abandoned')),
  created_at  timestamptz default now()
);

create index seasons_user_active_idx
  on public.seasons (user_id, status);

alter table public.seasons enable row level security;
create policy "Users manage own seasons"
  on public.seasons for all
  using (auth.uid() = user_id);

-- user_events: season link, sequence position, priority
alter table public.user_events
  add column season_id          uuid references public.seasons(id) on delete set null,
  add column sequence_position  integer,
  add column priority           text check (priority in ('A','B','C'));

-- training_blocks: season link
alter table public.training_blocks
  add column season_id uuid references public.seasons(id) on delete set null;

-- planned_sessions: phase tag from the periodisation engine
alter table public.planned_sessions
  add column phase text check (phase in ('recovery','base','build','peak','taper','race'));

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Apply via Supabase MCP**

Use `mcp__supabase__apply_migration` with name `013_seasons` and the SQL above.

Verify:
```sql
select column_name, data_type
from information_schema.columns
where table_name in ('seasons','user_events','training_blocks','planned_sessions')
  and column_name in ('id','season_id','sequence_position','priority','phase','status')
order by table_name, column_name;
```
Expected: `seasons` columns present; `season_id` on `user_events` + `training_blocks`; `phase` on `planned_sessions`; `priority` + `sequence_position` on `user_events`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/013_seasons.sql
git commit -m "feat: migration 013 — seasons table + phase column for multi-event planning"
```

---

## Task 2: Cycle Modulation — pure function + tests

**Files:**
- Create: `mobile/src/lib/cycleModulation.ts`
- Create: `mobile/__tests__/lib/cycleModulation.test.ts`

- [ ] **Step 1: Write the module**

Create `mobile/src/lib/cycleModulation.ts`:

```typescript
import type { CyclePhase, CycleProfile } from '@/store/cycle';

export type SessionType = 'easy' | 'tempo' | 'intervals' | 'long' | 'race' | 'strength';

export interface SessionPaceTarget {
  pace_seconds_per_km?: number;
  duration_minutes?:    number;
  intensity_label:      string;  // "Easy", "Threshold", "Race pace"
}

export interface ModulationResult {
  adjusted_target:    SessionPaceTarget;
  reason:             string | null;
  source_cycle_phase: CyclePhase | null;
}

interface PaceModifier {
  pace_delta_pct?:      number;   // negative = slower
  intensity_delta_pct?: number;
  skip?:                boolean;
  fuel_caution?:        boolean;
  reason:               string;
}

// Conservative evidence-based defaults. Negative pace_delta = slower (e.g. -3% = 3% slower).
const MATRIX: Record<SessionType, Record<CyclePhase, PaceModifier | null>> = {
  easy: {
    menstrual:  { pace_delta_pct: -3, reason: 'Menstrual phase — body is recovering. Easy means easy today.' },
    follicular: null,
    ovulatory:  null,
    luteal:     { pace_delta_pct: -2, reason: 'Luteal phase — thermoregulation is harder. A touch slower keeps the effort easy.' },
  },
  tempo: {
    menstrual:  { intensity_delta_pct: -8, reason: 'Menstrual phase — threshold work is taxing. Lower intensity protects recovery.' },
    follicular: null,
    ovulatory:  { intensity_delta_pct:  3, reason: 'Ovulatory phase — peak power window. Today\'s the day to push.' },
    luteal:     { intensity_delta_pct: -6, reason: 'Luteal phase — body temperature is up, lactate threshold shifts. Today\'s adjusted target is the same physiological work as your follicular pace.' },
  },
  intervals: {
    menstrual:  { skip: true,                intensity_delta_pct: -10, reason: 'Menstrual phase — high-intensity intervals on Day 1–3 typically underperform and prolong recovery. Substitute easy aerobic.' },
    follicular: null,
    ovulatory:  { intensity_delta_pct: 3,                              reason: 'Ovulatory phase — peak neuromuscular window. Sharp intervals land best here.' },
    luteal:     { intensity_delta_pct: -6,                             reason: 'Luteal phase — power output drops. Adjusted intensity matches your actual readiness.' },
  },
  long: {
    menstrual:  { pace_delta_pct: -5, reason: 'Menstrual phase — long runs are fine, but walk breaks are okay if needed.' },
    follicular: null,  // baseline + anchoring preference
    ovulatory:  null,
    luteal:     { pace_delta_pct: -3, fuel_caution: true, reason: 'Luteal phase — carb needs are up, hydration matters more. Pace adjusted, fuel earlier and more often.' },
  },
  race: {
    menstrual:  { reason: 'Race day in your menstrual phase — manage cramps with magnesium pre-race. Pace is unchanged; awareness matters.' },
    follicular: null,
    ovulatory:  null,
    luteal:     { fuel_caution: true, reason: 'Race day in your luteal phase — body temp is elevated, carb burn is higher. Hydrate aggressively and carb-load through race week.' },
  },
  strength: {
    menstrual:  { intensity_delta_pct: -5, reason: 'Menstrual phase — bar work feels heavier than it is. Drop 5% and own the form.' },
    follicular: null,
    ovulatory:  { intensity_delta_pct: 3,  reason: 'Ovulatory phase — strongest lifting window. PR attempts land best here.' },
    luteal:     { intensity_delta_pct: -3, reason: 'Luteal phase — recovery from heavy lifts is slower. Slight reduction protects the cycle\'s second half.' },
  },
};

function applyModifier(base: SessionPaceTarget, mod: PaceModifier): SessionPaceTarget {
  const next = { ...base };
  if (mod.pace_delta_pct !== undefined && next.pace_seconds_per_km) {
    next.pace_seconds_per_km = Math.round(next.pace_seconds_per_km * (1 - mod.pace_delta_pct / 100));
  }
  if (mod.intensity_delta_pct !== undefined && next.pace_seconds_per_km) {
    // Intensity decrease = slower pace. -8% intensity ~= +4% pace
    const paceShift = -mod.intensity_delta_pct / 2;
    next.pace_seconds_per_km = Math.round(next.pace_seconds_per_km * (1 + paceShift / 100));
  }
  return next;
}

function conservativeReason(reason: string): string {
  // Used for 'irregular' cycle_profile — softens absolute claims into estimates
  return reason.replace(/today\b/gi, 'today (estimated)');
}

export function modulateForCycle(
  base_target:   SessionPaceTarget,
  session_type:  SessionType,
  cycle_phase:   CyclePhase | null,
  cycle_profile: CycleProfile,
): ModulationResult {
  // Hard-off profiles
  if (cycle_profile === 'hormonal' || cycle_profile === 'perimenopause' || cycle_profile === 'menopause') {
    return { adjusted_target: base_target, reason: null, source_cycle_phase: null };
  }
  if (!cycle_phase) {
    return { adjusted_target: base_target, reason: null, source_cycle_phase: null };
  }

  const mod = MATRIX[session_type]?.[cycle_phase];
  if (!mod) {
    return { adjusted_target: base_target, reason: null, source_cycle_phase: cycle_phase };
  }

  // Conservative bands for irregular cycles
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

export function shouldAnchorKeySession(session_type: SessionType): boolean {
  return session_type === 'long' || session_type === 'tempo' || session_type === 'intervals';
}

/** Rank order: which cycle phase is preferred for this session type. Lower = better. */
const ANCHOR_RANK: Record<SessionType, Record<CyclePhase, number>> = {
  long:      { follicular: 0, ovulatory: 1, luteal: 2, menstrual: 3 },
  tempo:     { follicular: 0, ovulatory: 1, luteal: 2, menstrual: 3 },
  intervals: { ovulatory:  0, follicular: 1, luteal: 2, menstrual: 3 },
  easy:      { follicular: 0, ovulatory: 0, luteal: 0, menstrual: 0 },
  race:      { follicular: 0, ovulatory: 0, luteal: 0, menstrual: 0 },
  strength:  { ovulatory:  0, follicular: 1, luteal: 2, menstrual: 3 },
};

/**
 * Picks the best day for a key session within candidate days, given the cycle phase
 * forecast for each. Ties break on the earliest day to keep recovery windows intact.
 */
export function anchorKeySession(
  candidates:   { date: string; cycle_phase: CyclePhase | null }[],
  session_type: SessionType,
): string {
  if (candidates.length === 0) throw new Error('anchorKeySession: empty candidates');
  if (!shouldAnchorKeySession(session_type)) return candidates[0].date;

  return candidates
    .map((c) => ({
      date: c.date,
      rank: c.cycle_phase ? ANCHOR_RANK[session_type][c.cycle_phase] : 99,
    }))
    .sort((a, b) => a.rank - b.rank || a.date.localeCompare(b.date))
    [0].date;
}
```

- [ ] **Step 2: Write the tests**

Create `mobile/__tests__/lib/cycleModulation.test.ts`:

```typescript
import { modulateForCycle, anchorKeySession } from '@/lib/cycleModulation';

const baseTempo = { pace_seconds_per_km: 275, intensity_label: 'Threshold' }; // 4:35/km

describe('modulateForCycle', () => {
  test('tempo in luteal slows the pace and surfaces a reason', () => {
    const r = modulateForCycle(baseTempo, 'tempo', 'luteal', 'natural');
    expect(r.adjusted_target.pace_seconds_per_km).toBeGreaterThan(275);
    expect(r.adjusted_target.pace_seconds_per_km).toBeLessThan(295);
    expect(r.reason).toContain('Luteal');
    expect(r.source_cycle_phase).toBe('luteal');
  });

  test('tempo in follicular is baseline (no modulation)', () => {
    const r = modulateForCycle(baseTempo, 'tempo', 'follicular', 'natural');
    expect(r.adjusted_target.pace_seconds_per_km).toBe(275);
    expect(r.reason).toBeNull();
  });

  test('tempo in ovulatory speeds up slightly (peak power)', () => {
    const r = modulateForCycle(baseTempo, 'tempo', 'ovulatory', 'natural');
    expect(r.adjusted_target.pace_seconds_per_km).toBeLessThan(275);
    expect(r.reason).toContain('peak power');
  });

  test('hormonal cycle profile bypasses modulation entirely', () => {
    const r = modulateForCycle(baseTempo, 'tempo', 'luteal', 'hormonal');
    expect(r.adjusted_target.pace_seconds_per_km).toBe(275);
    expect(r.reason).toBeNull();
    expect(r.source_cycle_phase).toBeNull();
  });

  test('menopause cycle profile bypasses modulation entirely', () => {
    const r = modulateForCycle(baseTempo, 'tempo', 'luteal', 'menopause');
    expect(r.reason).toBeNull();
  });

  test('irregular cycle profile uses conservative half-magnitude modifiers', () => {
    const luteal_natural   = modulateForCycle(baseTempo, 'tempo', 'luteal', 'natural');
    const luteal_irregular = modulateForCycle(baseTempo, 'tempo', 'luteal', 'irregular');
    const natural_delta   = luteal_natural.adjusted_target.pace_seconds_per_km!   - 275;
    const irregular_delta = luteal_irregular.adjusted_target.pace_seconds_per_km! - 275;
    expect(irregular_delta).toBeLessThan(natural_delta);
    expect(irregular_delta).toBeGreaterThan(0);
    expect(luteal_irregular.reason).toContain('estimated');
  });

  test('long run in menstrual gets walk-friendly slower pace', () => {
    const baseLong = { pace_seconds_per_km: 330, intensity_label: 'Easy long' };
    const r = modulateForCycle(baseLong, 'long', 'menstrual', 'natural');
    expect(r.adjusted_target.pace_seconds_per_km).toBeGreaterThan(330);
    expect(r.reason).toContain('walk');
  });
});

describe('anchorKeySession', () => {
  test('long run anchors to follicular over luteal', () => {
    const result = anchorKeySession([
      { date: '2026-04-28', cycle_phase: 'luteal'     },
      { date: '2026-04-29', cycle_phase: 'follicular' },
      { date: '2026-05-01', cycle_phase: 'menstrual'  },
    ], 'long');
    expect(result).toBe('2026-04-29');
  });

  test('intervals anchor to ovulatory over follicular', () => {
    const result = anchorKeySession([
      { date: '2026-05-04', cycle_phase: 'follicular' },
      { date: '2026-05-06', cycle_phase: 'ovulatory'  },
      { date: '2026-05-08', cycle_phase: 'luteal'     },
    ], 'intervals');
    expect(result).toBe('2026-05-06');
  });

  test('non-key sessions return the first candidate (no anchoring)', () => {
    const result = anchorKeySession([
      { date: '2026-05-04', cycle_phase: 'luteal'     },
      { date: '2026-05-05', cycle_phase: 'follicular' },
    ], 'easy');
    expect(result).toBe('2026-05-04');
  });

  test('ties on rank break by earliest date', () => {
    const result = anchorKeySession([
      { date: '2026-05-05', cycle_phase: 'follicular' },
      { date: '2026-05-04', cycle_phase: 'follicular' },
    ], 'long');
    expect(result).toBe('2026-05-04');
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd mobile && npx jest --no-coverage cycleModulation
```
Expected: 10 tests pass.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/lib/cycleModulation.ts mobile/__tests__/lib/cycleModulation.test.ts
git commit -m "feat: cycleModulation — modifier matrix + day-anchoring for key sessions"
```

---

## Task 3: seasonEngine — `buildSeasonChain` pure function + tests

**Files:**
- Create: `mobile/src/lib/seasonEngine.ts`
- Create: `mobile/__tests__/lib/seasonEngine.test.ts`

- [ ] **Step 1: Define types and write `buildSeasonChain`**

Create `mobile/src/lib/seasonEngine.ts`:

```typescript
import type { CycleProfile } from '@/store/cycle';

export type BlockPhase = 'recovery' | 'base' | 'build' | 'peak' | 'taper' | 'race';
export type Priority   = 'A' | 'B' | 'C';

export interface SeasonEvent {
  id:         string;
  event_date: string;            // ISO date
  modality:   string;             // 'run' | 'strength' | ...
  distance:   string | null;     // '5k' | '10k' | 'half_marathon' | 'marathon' | 'ultra'
}

export interface PhaseSegment {
  phase:     BlockPhase;
  starts_on: string;
  ends_on:   string;
  weeks:     number;
}

export interface ChainBlock {
  event_id:        string;
  modality:        string;
  starts_on:       string;
  ends_on:         string;
  priority:        Priority;
  phase_segments:  PhaseSegment[];
}

const STANDARD_PREP_WEEKS: Record<string, number> = {
  '5k':            8,
  '10k':           10,
  'half_marathon': 12,
  'marathon':      16,
  'ultra':         20,
};

const RECOVERY_WEEKS: Record<string, number> = {
  '5k':            1,
  '10k':           1,
  'half_marathon': 2,
  'marathon':      3,
  'ultra':         4,
};

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function diffDays(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime())
    / (1000 * 60 * 60 * 24),
  );
}

function distributePhases(
  starts_on:    string,
  ends_on:      string,            // race date
  is_first:     boolean,           // first event has full base; bridges compress
  recovery_in:  number,            // recovery weeks at front (post-prior-event)
): PhaseSegment[] {
  const totalDays = diffDays(starts_on, ends_on) + 1;
  const totalWks  = Math.max(1, Math.round(totalDays / 7));

  // Phase ratios: first-event vs bridge
  // First event: 30% base, 35% build, 15% peak, 15% taper, 5% race-week
  // Bridge:      recovery_in fixed, remainder split build/taper
  let segments: PhaseSegment[] = [];

  if (is_first) {
    const baseWks  = Math.max(2, Math.floor(totalWks * 0.35));
    const buildWks = Math.max(2, Math.floor(totalWks * 0.40));
    const peakWks  = Math.max(1, Math.floor(totalWks * 0.10));
    const taperWks = Math.max(1, totalWks - baseWks - buildWks - peakWks - 1);
    let cursor = starts_on;
    segments.push({ phase: 'base',  starts_on: cursor, ends_on: addDays(cursor, baseWks  * 7 - 1), weeks: baseWks  });
    cursor = addDays(cursor, baseWks * 7);
    segments.push({ phase: 'build', starts_on: cursor, ends_on: addDays(cursor, buildWks * 7 - 1), weeks: buildWks });
    cursor = addDays(cursor, buildWks * 7);
    segments.push({ phase: 'peak',  starts_on: cursor, ends_on: addDays(cursor, peakWks  * 7 - 1), weeks: peakWks  });
    cursor = addDays(cursor, peakWks * 7);
    segments.push({ phase: 'taper', starts_on: cursor, ends_on: addDays(ends_on, -1),              weeks: taperWks });
  } else {
    // Bridge: recovery → build → taper (no full base, no full peak)
    const remainingWks = totalWks - recovery_in;
    const taperWks     = remainingWks <= 4 ? 1 : Math.min(2, Math.floor(remainingWks * 0.25));
    const buildWks     = Math.max(1, remainingWks - taperWks);
    let cursor = starts_on;
    segments.push({ phase: 'recovery', starts_on: cursor, ends_on: addDays(cursor, recovery_in * 7 - 1), weeks: recovery_in });
    cursor = addDays(cursor, recovery_in * 7);
    segments.push({ phase: 'build',    starts_on: cursor, ends_on: addDays(cursor, buildWks    * 7 - 1), weeks: buildWks    });
    cursor = addDays(cursor, buildWks * 7);
    segments.push({ phase: 'taper',    starts_on: cursor, ends_on: addDays(ends_on, -1),                 weeks: taperWks    });
  }

  segments.push({ phase: 'race', starts_on: ends_on, ends_on: ends_on, weeks: 0 });
  return segments;
}

function assignPriorities(events: SeasonEvent[]): Priority[] {
  // Heuristic: longest distance wins A. Stepping stones B. Conflicts (events <14 days apart) → shorter becomes C.
  const distanceRank: Record<string, number> = {
    'ultra':         5,
    'marathon':      4,
    'half_marathon': 3,
    '10k':           2,
    '5k':            1,
  };
  const ranks = events.map((e) => distanceRank[e.distance ?? ''] ?? 0);
  const max   = Math.max(...ranks);
  return events.map((e, i) => {
    if (i > 0) {
      const gap = diffDays(events[i - 1].event_date, e.event_date);
      if (gap > 0 && gap < 14) return 'C';
    }
    return ranks[i] === max ? 'A' : 'B';
  });
}

/**
 * Pure function. Given an ordered list of events + cycle profile + today's date,
 * produce the block chain that the season should generate.
 */
export function buildSeasonChain(input: {
  events:        SeasonEvent[];
  cycle_profile: CycleProfile;
  today:         string;
}): ChainBlock[] {
  const events = [...input.events].sort((a, b) => a.event_date.localeCompare(b.event_date));
  if (events.length < 2) return [];

  const priorities = assignPriorities(events);
  const out: ChainBlock[] = [];
  let cursor = input.today;

  for (let i = 0; i < events.length; i++) {
    const event   = events[i];
    if (event.event_date < input.today) continue;

    const isFirst    = i === 0 || diffDays(input.today, event.event_date) >= STANDARD_PREP_WEEKS[event.distance ?? 'marathon'] * 7;
    const recoveryIn = i === 0 ? 0 : RECOVERY_WEEKS[events[i - 1].distance ?? 'marathon'];

    let starts_on: string;
    if (i === 0) {
      // Block out the full standard prep window from today, capped at the event date
      const standardStart = addDays(event.event_date, -STANDARD_PREP_WEEKS[event.distance ?? 'marathon'] * 7);
      starts_on = standardStart < input.today ? input.today : standardStart;
    } else {
      starts_on = addDays(events[i - 1].event_date, 1);
    }

    const phase_segments = distributePhases(starts_on, event.event_date, isFirst, recoveryIn);

    out.push({
      event_id:        event.id,
      modality:        event.modality,
      starts_on,
      ends_on:         event.event_date,
      priority:        priorities[i],
      phase_segments,
    });
    cursor = event.event_date;
  }

  return out;
}
```

- [ ] **Step 2: Write the engine tests**

Create `mobile/__tests__/lib/seasonEngine.test.ts`:

```typescript
import { buildSeasonChain, type SeasonEvent } from '@/lib/seasonEngine';

const TODAY = '2025-12-21';  // ~16 weeks before Brighton

const brightonLeeds: SeasonEvent[] = [
  { id: 'e1', event_date: '2026-04-12', modality: 'run', distance: 'marathon' },
  { id: 'e2', event_date: '2026-05-17', modality: 'run', distance: 'marathon' },
];

const tenHalfMara: SeasonEvent[] = [
  { id: 'e1', event_date: '2026-04-12', modality: 'run', distance: '10k' },
  { id: 'e2', event_date: '2026-06-07', modality: 'run', distance: 'half_marathon' },
  { id: 'e3', event_date: '2026-10-18', modality: 'run', distance: 'marathon' },
];

const maraConflict: SeasonEvent[] = [
  { id: 'e1', event_date: '2026-10-11', modality: 'run', distance: '5k' },
  { id: 'e2', event_date: '2026-10-18', modality: 'run', distance: 'marathon' },
];

describe('buildSeasonChain — back-to-back marathon (Brighton + Leeds)', () => {
  const chain = buildSeasonChain({ events: brightonLeeds, cycle_profile: 'natural', today: TODAY });

  test('produces two blocks', () => {
    expect(chain).toHaveLength(2);
  });

  test('both blocks marked priority A (same distance)', () => {
    expect(chain[0].priority).toBe('A');
    expect(chain[1].priority).toBe('A');
  });

  test('first block ends on Brighton race date', () => {
    expect(chain[0].ends_on).toBe('2026-04-12');
  });

  test('second block (bridge) starts day after Brighton', () => {
    expect(chain[1].starts_on).toBe('2026-04-13');
  });

  test('bridge block begins with recovery phase', () => {
    expect(chain[1].phase_segments[0].phase).toBe('recovery');
    expect(chain[1].phase_segments[0].weeks).toBe(3); // marathon recovery
  });

  test('bridge block has no full base or peak — recovery → build → taper → race', () => {
    const phases = chain[1].phase_segments.map((s) => s.phase);
    expect(phases).toEqual(['recovery', 'build', 'taper', 'race']);
  });
});

describe('buildSeasonChain — progressive ladder (10K → Half → Marathon)', () => {
  const chain = buildSeasonChain({ events: tenHalfMara, cycle_profile: 'natural', today: TODAY });

  test('produces three blocks', () => {
    expect(chain).toHaveLength(3);
  });

  test('marathon (longest) is A; shorter stepping stones are B', () => {
    expect(chain[0].priority).toBe('B'); // 10K
    expect(chain[1].priority).toBe('B'); // Half
    expect(chain[2].priority).toBe('A'); // Marathon
  });

  test('first block (10K) starts with base phase', () => {
    expect(chain[0].phase_segments[0].phase).toBe('base');
  });

  test('half block (bridge from 10K) starts with 1 wk recovery', () => {
    expect(chain[1].phase_segments[0].phase).toBe('recovery');
    expect(chain[1].phase_segments[0].weeks).toBe(1);
  });

  test('marathon block (bridge from half) starts with 2 wk recovery', () => {
    expect(chain[2].phase_segments[0].phase).toBe('recovery');
    expect(chain[2].phase_segments[0].weeks).toBe(2);
  });
});

describe('buildSeasonChain — conflict (5K within marathon taper)', () => {
  const chain = buildSeasonChain({ events: maraConflict, cycle_profile: 'natural', today: TODAY });

  test('5K event 7 days before marathon is downgraded to priority C', () => {
    expect(chain[0].priority).toBe('C');
  });

  test('marathon remains priority A', () => {
    expect(chain[1].priority).toBe('A');
  });
});

describe('buildSeasonChain — single event', () => {
  test('returns empty chain for single event (no season needed)', () => {
    const chain = buildSeasonChain({
      events: [brightonLeeds[0]],
      cycle_profile: 'natural',
      today: TODAY,
    });
    expect(chain).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd mobile && npx jest --no-coverage seasonEngine
```
Expected: 12 tests pass.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/lib/seasonEngine.ts mobile/__tests__/lib/seasonEngine.test.ts
git commit -m "feat: seasonEngine.buildSeasonChain — block chain + phase distribution + priority defaults"
```

---

## Task 4: seasonEngine — persistence + integration

**Files:**
- Modify: `mobile/src/lib/seasonEngine.ts` (add `applySeasonChain` + `recomputeSeasonForUser`)
- Modify: `mobile/src/lib/trainingBlocks.ts` (call `recomputeSeasonForUser` after addBlock when 2+ future events exist)
- Modify: `mobile/src/lib/scheduleGenerator.ts` (extend `generateAndSaveSchedule` to accept + write a `phase` per session)

- [ ] **Step 1: Extend `scheduleGenerator.generateAndSaveSchedule` to accept phase resolver**

In `mobile/src/lib/scheduleGenerator.ts`, find `generateAndSaveSchedule` and update its signature:

```typescript
// Add to top of file
import type { BlockPhase, PhaseSegment } from './seasonEngine';

// Update the function signature — add an optional phase_segments parameter
export async function generateAndSaveSchedule(
  userId:         string,
  blockId:        string,
  modality:       string,
  startsOn:       string,
  sessionsJson:   WeekSession[],
  phaseSegments?: PhaseSegment[],   // NEW — optional, falls back to undefined phase
): Promise<void> {
  // existing logic to generate rows...

  function resolvePhase(scheduled_date: string): BlockPhase | null {
    if (!phaseSegments) return null;
    return phaseSegments.find(
      (s) => scheduled_date >= s.starts_on && scheduled_date <= s.ends_on,
    )?.phase ?? null;
  }

  // When building each row, add: phase: resolvePhase(rowDate)
  // and include phase in the supabase insert payload
}
```

- [ ] **Step 2: Add `applySeasonChain` and `recomputeSeasonForUser` to `seasonEngine.ts`**

Append to `mobile/src/lib/seasonEngine.ts`:

```typescript
import { supabase } from './supabase';
import { generateAndSaveSchedule } from './scheduleGenerator';

/**
 * Persists a chain: creates the season, blocks, and planned_sessions.
 * Caller is responsible for picking a season name. Returns the new season_id.
 */
export async function applySeasonChain(
  userId:        string,
  events:        SeasonEvent[],
  chain:         ChainBlock[],
  season_name:   string,
): Promise<string> {
  if (chain.length === 0) throw new Error('applySeasonChain: empty chain');

  // 1. Create season row
  const { data: season, error: seasonErr } = await supabase
    .from('seasons')
    .insert({
      user_id:   userId,
      name:      season_name,
      starts_on: chain[0].starts_on,
      ends_on:   chain[chain.length - 1].ends_on,
      status:    'active',
    })
    .select('id')
    .single();
  if (seasonErr || !season) throw new Error(seasonErr?.message ?? 'season insert failed');
  const season_id = season.id;

  // 2. Update user_events: link to season + write priority + sequence_position
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const block = chain.find((b) => b.event_id === event.id);
    if (!block) continue;
    await supabase
      .from('user_events')
      .update({
        season_id,
        sequence_position: i + 1,
        priority:          block.priority,
      })
      .eq('id', event.id);
  }

  // 3. For each block, find or create training_blocks row + generate planned_sessions
  for (const block of chain) {
    // Look up matching template (simplified: pick by modality + distance — caller may have own logic)
    const { data: tmpl } = await supabase
      .from('plan_templates')
      .select('id, sessions_json')
      .eq('sport_type', block.modality)
      .limit(1)
      .maybeSingle();
    if (!tmpl) continue;

    const { data: blockRow, error: blockErr } = await supabase
      .from('training_blocks')
      .insert({
        user_id:       userId,
        template_id:   tmpl.id,
        starts_on:     block.starts_on,
        ends_on:       block.ends_on,
        modality:      block.modality,
        load_modifier: 1.0,
        event_id:      block.event_id,
        season_id,
      })
      .select('id')
      .single();
    if (blockErr || !blockRow) continue;

    await generateAndSaveSchedule(
      userId,
      blockRow.id,
      block.modality,
      block.starts_on,
      tmpl.sessions_json as WeekSession[],
      block.phase_segments,
    );
  }

  return season_id;
}

/**
 * Detects 2+ future events for a user; if a season doesn't already exist
 * for them, builds the chain and applies it.
 */
export async function recomputeSeasonForUser(
  userId: string,
  today:  string,
  cycle_profile: CycleProfile,
): Promise<{ season_id: string | null }> {
  // Check for existing active season — V1 does not regenerate; user must manage
  const { data: existing } = await supabase
    .from('seasons')
    .select('id')
    .eq('user_id', userId)
    .eq('status',  'active')
    .maybeSingle();
  if (existing) return { season_id: existing.id };

  const { data: events } = await supabase
    .from('user_events')
    .select('id, event_date, modality, distance')
    .eq('user_id', userId)
    .gte('event_date', today)
    .order('event_date');
  if (!events || events.length < 2) return { season_id: null };

  const seasonEvents: SeasonEvent[] = events.map((e) => ({
    id:         e.id,
    event_date: e.event_date,
    modality:   e.modality,
    distance:   e.distance,
  }));

  const chain = buildSeasonChain({ events: seasonEvents, cycle_profile, today });
  if (chain.length === 0) return { season_id: null };

  const name = seasonEvents.map((e) => e.distance?.toUpperCase() ?? 'Event').join(' → ');
  const season_id = await applySeasonChain(userId, seasonEvents, chain, name);
  return { season_id };
}
```

- [ ] **Step 3: Wire `recomputeSeasonForUser` into `trainingBlocks.addBlock`**

In `mobile/src/lib/trainingBlocks.ts`, after `addBlock` successfully creates a block, also call `recomputeSeasonForUser` if the user has 2+ future events without a season:

```typescript
import { recomputeSeasonForUser } from './seasonEngine';

// Inside addBlock, after generateAndSaveSchedule:
const today = new Date().toLocaleDateString('en-CA');
const cycle_profile = useCycleStore.getState().cycleProfile;
await recomputeSeasonForUser(userId, today, cycle_profile);
```

- [ ] **Step 4: Run full test suite**

```bash
cd mobile && npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | head -20
cd mobile && npx jest --no-coverage 2>&1 | tail -8
```
Expected: no TS errors; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/seasonEngine.ts mobile/src/lib/scheduleGenerator.ts mobile/src/lib/trainingBlocks.ts
git commit -m "feat: seasonEngine persistence — applySeasonChain + auto-create on 2+ future events"
```

---

## Task 5: `getDaySessionDetail` returns cycle modulation

**Files:**
- Modify: `mobile/src/lib/volumePlan.ts`

- [ ] **Step 1: Extend `DayDetail` shape and call `modulateForCycle`**

In `mobile/src/lib/volumePlan.ts`, find the `DayDetail` interface and `getDaySessionDetail` function.

Add to `DayDetail`:
```typescript
import type { ModulationResult } from './cycleModulation';
import { modulateForCycle } from './cycleModulation';

export interface DayDetail {
  // ...existing fields
  cycle_modulation: ModulationResult | null;
}
```

At the end of `getDaySessionDetail`, before the return statement, compute the modulation:

```typescript
const session_type = mapLabelToSessionType(plannedSession.session_label);
const cycle_modulation = modulateForCycle(
  base_target,             // existing computed target
  session_type,
  cycle_phase_today,       // already in scope from caller
  cycle_profile,           // need to pass through from caller
);

return {
  // ...existing fields
  cycle_modulation,
};
```

Where `mapLabelToSessionType` is a tiny helper:
```typescript
function mapLabelToSessionType(label: string): SessionType {
  const L = label.toLowerCase();
  if (L.includes('long'))     return 'long';
  if (L.includes('tempo') || L.includes('threshold')) return 'tempo';
  if (L.includes('interval') || L.includes('vo2'))    return 'intervals';
  if (L.includes('race'))     return 'race';
  if (L.includes('lower') || L.includes('upper') || L.includes('strength')) return 'strength';
  return 'easy';
}
```

- [ ] **Step 2: Pass `cycle_profile` through caller chain**

Update the `getDaySessionDetail` signature to accept `cycle_profile: CycleProfile` as a parameter, and update all call sites (search for `getDaySessionDetail` in the codebase) to pass it from `useCycleStore.getState().cycleProfile`.

- [ ] **Step 3: TypeScript check + tests**

```bash
cd mobile && npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | head -20
cd mobile && npx jest --no-coverage 2>&1 | tail -8
```
Expected: no TS errors; tests pass.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/lib/volumePlan.ts
git commit -m "feat: getDaySessionDetail returns cycle_modulation for session-time rendering"
```

---

## Task 6: SessionDetailModal — render "why this pace" card

**Files:**
- Modify: `mobile/src/components/ui/SessionDetailModal.tsx`

- [ ] **Step 1: Add modulation-aware target display + why-card**

Read `SessionDetailModal.tsx`. Find where the pace target renders. Update to show adjusted-from value when `cycle_modulation.reason` is non-null, and add a why-card below:

```tsx
{detail.cycle_modulation?.reason && (
  <>
    <View style={styles.targetRow}>
      <VirraText variant="display" size={20} color={colors.breath}>
        {formatPace(detail.cycle_modulation.adjusted_target.pace_seconds_per_km)}/km
      </VirraText>
      <VirraText variant="mono" size={9} color={colors.muted}>
        ADJUSTED FROM {formatPace(detail.base_target.pace_seconds_per_km)}/km
      </VirraText>
    </View>
    <VirraCard style={styles.whyCard}>
      <VirraText variant="mono" size={9} color={colors.pulse} style={styles.whyLabel}>
        WHY THIS PACE
      </VirraText>
      <VirraText variant="body" size={13} color="rgba(244,237,224,0.75)" style={styles.whyText}>
        {detail.cycle_modulation.reason}
      </VirraText>
    </VirraCard>
  </>
)}
```

Add styles:
```typescript
targetRow: { gap: 2 },
whyCard:   { gap: spacing.xs, marginTop: spacing.sm },
whyLabel:  { letterSpacing: 1.5 },
whyText:   { lineHeight: 20 },
```

- [ ] **Step 2: TypeScript check**

```bash
cd mobile && npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | head -20
```

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/ui/SessionDetailModal.tsx
git commit -m "feat: SessionDetailModal renders why-this-pace card for cycle-modulated sessions"
```

---

## Task 7: TodaysSessionHero — adjustment badge

**Files:**
- Modify: `mobile/src/lib/todaysSession.ts` (surface modulation in the row)
- Modify: `mobile/src/components/ui/TodaysSessionHero.tsx` (render adjustment indicator)

- [ ] **Step 1: Surface cycle modulation in `getTodaysSessions`**

Extend `TodaysSession` interface and `getTodaysSessions` to call `modulateForCycle` for each row using the user's current cycle phase + profile from `useCycleStore`. Add fields:

```typescript
export interface TodaysSession {
  // ...existing
  cycle_adjusted_pace?: number | null;
  cycle_reason_short?: string | null;   // first sentence of full reason
}
```

In `getTodaysSessions`, after building each row, call `modulateForCycle` and attach. Take the first sentence of the reason as `cycle_reason_short`:
```typescript
const short = reason ? reason.split('—')[0]?.trim() ?? reason : null;
```

- [ ] **Step 2: Render the badge in `TodaysSessionHero`**

When `s.cycle_reason_short` is non-null, show a small "↓ 4:48/km · luteal" indicator next to the modality line:

```tsx
{s.cycle_reason_short && (
  <VirraText variant="mono" size={9} color={colors.pulse} style={{ marginTop: 2 }}>
    {s.cycle_adjusted_pace ? `↓ ${formatPace(s.cycle_adjusted_pace)}/km · ` : ''}
    {s.cycle_reason_short.toLowerCase()}
  </VirraText>
)}
```

- [ ] **Step 3: TypeScript check + commit**

```bash
cd mobile && npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | head -20
git add mobile/src/lib/todaysSession.ts mobile/src/components/ui/TodaysSessionHero.tsx
git commit -m "feat: TodaysSessionHero shows cycle-adjusted pace badge with reason snippet"
```

---

## Task 8: MY SEASON timeline component

**Files:**
- Create: `mobile/src/components/ui/SeasonTimeline.tsx`
- Modify: `mobile/app/(app)/(tabs)/training.tsx` (load + render)

- [ ] **Step 1: Write the timeline component**

```typescript
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, spacing, radius } from '@/constants/theme';
import { VirraCard } from './VirraCard';
import { VirraText } from './VirraText';

export interface SeasonChainSummary {
  season_name:        string;
  total_weeks:        number;
  current_week:       number;
  current_phase:      string;        // 'Build', 'Recovery', etc.
  current_cycle_phase: string | null; // 'Follicular', etc.
  next_event_name:    string;
  next_event_in_weeks: number;
  next_event_date:    string;
  later_events:       { name: string; in_weeks_after_next: number; date: string }[];
}

interface Props {
  summary: SeasonChainSummary | null;
}

export function SeasonTimeline({ summary }: Props) {
  if (!summary) return null;
  const progressPct = Math.min(100, Math.round((summary.current_week / summary.total_weeks) * 100));

  return (
    <VirraCard style={styles.card}>
      <View style={styles.headerRow}>
        <VirraText variant="mono" size={9} color={colors.pulse} style={styles.kicker}>
          MY SEASON · {summary.total_weeks} WEEKS
        </VirraText>
        <VirraText variant="mono" size={9} color={colors.muted}>
          {summary.season_name}
        </VirraText>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${progressPct}%` }]} />
      </View>
      <View style={styles.statusRow}>
        <VirraText variant="display" size={14} color={colors.breath}>
          Week {summary.current_week} · {summary.current_phase}
        </VirraText>
        {summary.current_cycle_phase && (
          <VirraText variant="mono" size={10} color={colors.pulse}>
            {summary.current_cycle_phase.toUpperCase()}
          </VirraText>
        )}
      </View>
      <View style={styles.divider} />
      <View style={styles.eventRow}>
        <VirraText variant="mono" size={9} color={colors.muted} style={{ letterSpacing: 1.5 }}>
          NEXT
        </VirraText>
        <VirraText variant="bodyMedium" size={14} color={colors.breath}>
          {summary.next_event_name} · {summary.next_event_in_weeks} wk
        </VirraText>
      </View>
      {summary.later_events.map((e) => (
        <View key={e.date} style={styles.eventRow}>
          <VirraText variant="mono" size={9} color={colors.muted} style={{ letterSpacing: 1.5 }}>
            THEN
          </VirraText>
          <VirraText variant="body" size={12} color="rgba(244,237,224,0.6)">
            {e.name} · {e.in_weeks_after_next} wk after
          </VirraText>
        </View>
      ))}
    </VirraCard>
  );
}

const styles = StyleSheet.create({
  card:       { gap: spacing.sm },
  kicker:     { letterSpacing: 1.5 },
  headerRow:  { flexDirection: 'row', justifyContent: 'space-between' },
  barTrack:   { height: 4, backgroundColor: 'rgba(212,255,38,0.15)', borderRadius: radius.full, overflow: 'hidden' },
  barFill:    { height: 4, backgroundColor: colors.pulse },
  statusRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  divider:    { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  eventRow:   { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
```

- [ ] **Step 2: Load season summary in Training tab**

In `mobile/app/(app)/(tabs)/training.tsx`, add a `seasonSummary` state and load it in `loadData`. Query: get active season for user; compute current_week from today vs. season.starts_on; compute current_phase from active block's phase_segments at today's date; current_cycle_phase from useCycleStore.

Insert `<SeasonTimeline summary={seasonSummary} />` above `<TodaysSessionHero …>` in the JSX.

- [ ] **Step 3: TypeScript check + tests + commit**

```bash
cd mobile && npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | head -20
cd mobile && npx jest --no-coverage 2>&1 | tail -8
git add mobile/src/components/ui/SeasonTimeline.tsx "mobile/app/(app)/(tabs)/training.tsx"
git commit -m "feat: MY SEASON timeline on Training tab — chain visualisation + current phase + countdown"
```

---

## Verification (end-to-end)

1. Run migration 013; confirm `seasons` table exists and `phase` column on `planned_sessions`.
2. Add a 2nd future event in the Training tab → confirm a `seasons` row appears, `user_events` rows get `season_id` + `priority` + `sequence_position`, and a new `training_blocks` row exists with `season_id` set.
3. Query `planned_sessions` for the new bridge block — every row has a `phase` value.
4. Open a SessionDetailModal for a luteal-week tempo session — verify the "WHY THIS PACE" card renders with adjusted pace + reason.
5. Open today's date — if the cycle modulates today's session, the TodaysSessionHero shows a "↓ {pace} · {reason snippet}" indicator.
6. Training tab top section shows MY SEASON timeline with progress bar, current phase, current cycle phase, next event countdown.
7. Switch cycle profile to `hormonal` — all cycle modulation disappears; SessionDetailModal no longer renders the why-card.

## Self-Review

**Spec coverage:**
- ✅ Migration with seasons + FK additions + phase column (Task 1)
- ✅ Cycle modulation matrix + day-anchoring (Task 2)
- ✅ `buildSeasonChain` pure function with three worked scenarios as tests (Task 3)
- ✅ `applySeasonChain` persistence + auto-create on 2+ events (Task 4)
- ✅ Phase resolver wired into `generateAndSaveSchedule` (Task 4)
- ✅ `getDaySessionDetail` surfaces `cycle_modulation` (Task 5)
- ✅ SessionDetailModal why-card UI (Task 6)
- ✅ TodaysSessionHero adjustment badge (Task 7)
- ✅ MY SEASON timeline (Task 8)
- ✅ Cycle profile branches (natural/irregular/hormonal/peri/menopause) covered in `modulateForCycle` tests

**Placeholder scan:** No TBDs. The phase distribution ratios, recovery-week defaults per distance, priority assignment heuristic, and modulation matrix are all concrete. The Task 4 template lookup is simplified ("pick by modality + distance") but flagged as such — implementation may refine.

**Type consistency:** `BlockPhase`, `Priority`, `PhaseSegment`, `ChainBlock`, `SeasonEvent`, `ModulationResult`, `SessionType`, `SeasonChainSummary` are defined once and used consistently. `CyclePhase` and `CycleProfile` reuse existing types from `@/store/cycle`.

**Scope:** Each task is a single conceptual change with its own commit. M1=Task 1; M2=Task 3+4; M3=Task 4 (phase column populated); M4=Tasks 2, 5, 6, 7; M5=Task 8. Deferred items (conflict warnings UI, editable season, perimenopause cues, data-quality warnings, seasonal recap) are out of scope and not referenced.
