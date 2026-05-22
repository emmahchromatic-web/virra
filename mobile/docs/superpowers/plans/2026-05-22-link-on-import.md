# Link-on-Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically mark planned sessions `completed` when a HealthKit-imported (or manually logged) activity meets ≥90% of the session's target, on import and via a rolling current-week sweep.

**Architecture:** A pure matcher (`sessionMatcher.ts`) decides which planned session an activity completes (90% gate, closest-target). A DB-facing reconciler (`sessionReconciler.ts`) loads unlinked activities + planned sessions for a date range and applies the matcher, linking via the existing `_commitLink`. `healthKitImport` calls the reconciler every foreground cycle (current week) and once on first install (full year). The manual-log path (`linkActivityToSession`) is refactored to delegate to the same matcher.

**Tech Stack:** TypeScript, Expo/React Native, Supabase JS client, Jest. Spec: `docs/superpowers/specs/2026-05-22-link-on-import-design.md`.

---

### Task 1: Pure matcher — `sessionMatcher.ts`

**Files:**
- Create: `src/lib/sessionMatcher.ts`
- Test: `__tests__/lib/sessionMatcher.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/sessionMatcher.test.ts`:

```typescript
import {
  sessionTarget,
  matchActivityToSession,
  SESSION_DURATION_MIN,
  type MatchActivity,
  type MatchSession,
} from '@/lib/sessionMatcher';

const runSession = (id: string, total_distance_m: number | null): MatchSession => ({
  id, modality: 'run', session_label: 'easy',
  run_structure: total_distance_m == null ? null : { total_distance_m },
});
const strengthSession = (id: string, label: string): MatchSession => ({
  id, modality: 'strength', session_label: label, run_structure: null,
});

describe('sessionTarget', () => {
  test('run target is structure distance in metres', () => {
    expect(sessionTarget(runSession('r', 10000))).toEqual({ id: 'r', metric: 'distance', target_value: 10000 });
  });
  test('run with no structure has null target', () => {
    expect(sessionTarget(runSession('r', null)).target_value).toBeNull();
  });
  test('strength target is label duration in seconds', () => {
    expect(sessionTarget(strengthSession('s', 'lower'))).toEqual({ id: 's', metric: 'duration', target_value: 45 * 60 });
    expect(sessionTarget(strengthSession('s', 'upper')).target_value).toBe(40 * 60);
  });
  test('unknown strength label falls back to 40 min', () => {
    expect(sessionTarget(strengthSession('s', 'mystery')).target_value).toBe(40 * 60);
  });
  test('swim and other have null target', () => {
    expect(sessionTarget({ id: 'w', modality: 'swim', session_label: '', run_structure: null }).target_value).toBeNull();
    expect(sessionTarget({ id: 'o', modality: 'other', session_label: '', run_structure: null }).target_value).toBeNull();
  });
  test('yoga target uses the yoga default duration', () => {
    expect(sessionTarget({ id: 'y', modality: 'yoga', session_label: '', run_structure: null }).target_value).toBe(SESSION_DURATION_MIN.yoga * 60);
  });
});

describe('matchActivityToSession', () => {
  const act = (over: Partial<MatchActivity>): MatchActivity => ({
    activity_type: 'run', duration_seconds: 0, distance_meters: null, ...over,
  });

  test('distance activity at exactly 90% passes the gate', () => {
    const c = [sessionTarget(runSession('r', 10000))];
    expect(matchActivityToSession(act({ distance_meters: 9000 }), c)).toBe('r');
  });
  test('distance activity below 90% matches nothing', () => {
    const c = [sessionTarget(runSession('r', 10000))];
    expect(matchActivityToSession(act({ distance_meters: 8999 }), c)).toBeNull();
  });
  test('duration activity at exactly 90% passes the gate', () => {
    const c = [sessionTarget(strengthSession('s', 'lower'))]; // target 2700s
    expect(matchActivityToSession(act({ activity_type: 'strength', duration_seconds: 2430 }), c)).toBe('s');
  });
  test('closest target wins: 50-min workout on upper/lower day completes lower', () => {
    const candidates = [
      sessionTarget(strengthSession('upper', 'upper')), // 2400s
      sessionTarget(strengthSession('lower', 'lower')), // 2700s
    ];
    // 3000s clears both gates; |2700-3000|=300 < |2400-3000|=600 -> lower
    expect(matchActivityToSession(act({ activity_type: 'strength', duration_seconds: 3000 }), candidates)).toBe('lower');
  });
  test('candidate with null target is skipped', () => {
    const c = [sessionTarget(runSession('r', null))];
    expect(matchActivityToSession(act({ distance_meters: 99999 }), c)).toBeNull();
  });
  test('measured value missing for the metric matches nothing', () => {
    const c = [sessionTarget(runSession('r', 10000))];
    expect(matchActivityToSession(act({ distance_meters: null }), c)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest __tests__/lib/sessionMatcher.test.ts`
Expected: FAIL — `Cannot find module '@/lib/sessionMatcher'`.

- [ ] **Step 3: Implement `sessionMatcher.ts`**

Create `src/lib/sessionMatcher.ts`:

```typescript
import type { Modality } from './dayState';

// Single source of truth for per-label session durations (minutes).
// volumePlan.ts imports this; the matcher derives duration targets from it.
export const SESSION_DURATION_MIN: Record<string, number> = {
  lower:   45,
  upper:   40,
  general: 35,
  yoga:    30,
};
const DEFAULT_DURATION_MIN = 40;

export interface MatchActivity {
  activity_type:    Modality;
  duration_seconds: number;
  distance_meters:  number | null;
}

export interface MatchSession {
  id:            string;
  modality:      Modality;
  session_label: string;
  run_structure: { total_distance_m?: number } | null;
}

export interface MatchCandidate {
  id:           string;
  metric:       'distance' | 'duration';
  target_value: number | null; // metres (distance) or seconds (duration)
}

// Resolve a planned session's completion target.
export function sessionTarget(s: MatchSession): MatchCandidate {
  switch (s.modality) {
    case 'run':
      return { id: s.id, metric: 'distance', target_value: s.run_structure?.total_distance_m ?? null };
    case 'swim':
      return { id: s.id, metric: 'distance', target_value: null }; // no target stored yet
    case 'strength':
      return { id: s.id, metric: 'duration', target_value: (SESSION_DURATION_MIN[s.session_label] ?? DEFAULT_DURATION_MIN) * 60 };
    case 'yoga':
      return { id: s.id, metric: 'duration', target_value: SESSION_DURATION_MIN.yoga * 60 };
    default:
      return { id: s.id, metric: 'duration', target_value: null }; // 'other' excluded
  }
}

// Pick the planned session an activity completes, or null.
// `candidates` must be pre-sorted by created_at for a stable tie-break.
export function matchActivityToSession(
  activity:   MatchActivity,
  candidates: MatchCandidate[],
  opts:       { gateFraction?: number } = {},
): string | null {
  const gate = opts.gateFraction ?? 0.9;
  let best: { id: string; diff: number } | null = null;
  for (const c of candidates) {
    if (c.target_value == null) continue;
    const measured = c.metric === 'distance' ? activity.distance_meters : activity.duration_seconds;
    if (measured == null) continue;
    if (measured < gate * c.target_value) continue;
    const diff = Math.abs(c.target_value - measured);
    if (best === null || diff < best.diff) best = { id: c.id, diff };
  }
  return best?.id ?? null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest __tests__/lib/sessionMatcher.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sessionMatcher.ts __tests__/lib/sessionMatcher.test.ts
git commit -m "feat: pure session matcher (90% gate, closest-target)"
```

---

### Task 2: Make `volumePlan` reuse `SESSION_DURATION_MIN` (DRY)

**Files:**
- Modify: `src/lib/volumePlan.ts:133-137` (remove local const) and `:701` (use import)

- [ ] **Step 1: Replace the local constant with the import**

In `src/lib/volumePlan.ts`, delete the local declaration (lines 133-137):

```typescript
const STRENGTH_DURATION: Record<string, number> = {
  lower:   45,
  upper:   40,
  general: 35,
};
```

Add to the existing import block at the top of the file:

```typescript
import { SESSION_DURATION_MIN } from './sessionMatcher';
```

- [ ] **Step 2: Update the usage site**

At what was line 701, change:

```typescript
      const estimated_minutes = STRENGTH_DURATION[s.session_label] ?? 40;
```

to:

```typescript
      const estimated_minutes = SESSION_DURATION_MIN[s.session_label] ?? 40;
```

- [ ] **Step 3: Run volumePlan tests to verify no regression**

Run: `npx jest __tests__/lib/volumePlan.test.ts`
Expected: PASS (durations unchanged — lower 45 / upper 40 / general 35; the extra `yoga` key is harmless).

- [ ] **Step 4: Commit**

```bash
git add src/lib/volumePlan.ts
git commit -m "refactor: volumePlan reuses SESSION_DURATION_MIN from sessionMatcher"
```

---

### Task 3: Export `_commitLink` and refactor `linkActivityToSession` to use the matcher

**Files:**
- Modify: `src/lib/scheduleGenerator.ts:256-289` (`linkActivityToSession`), `:291` (`_commitLink` export), top imports

- [ ] **Step 1: Export `_commitLink`**

In `src/lib/scheduleGenerator.ts`, change line 291 from:

```typescript
async function _commitLink(plannedSessionId: string, activityId: string): Promise<void> {
```

to:

```typescript
export async function _commitLink(plannedSessionId: string, activityId: string): Promise<void> {
```

- [ ] **Step 2: Add the matcher import**

Add to the import block at the top of `src/lib/scheduleGenerator.ts` (after line 6):

```typescript
import { sessionTarget, matchActivityToSession, type MatchSession } from './sessionMatcher';
```

- [ ] **Step 3: Refactor `linkActivityToSession`**

Replace the entire function body (lines 256-289) with:

```typescript
export async function linkActivityToSession(
  activityId:    string,
  userId:        string,
  dateISO:       string,
  activityType:  string,
  sessionLabel?: string,
): Promise<void> {
  // Measured values for the 90% gate.
  const { data: act, error: actErr } = await supabase
    .from('activities')
    .select('activity_type, duration_seconds, distance_meters')
    .eq('id', activityId)
    .single();
  if (actErr || !act) { if (actErr) console.warn('[scheduleGenerator] linkActivity activity', actErr.message); return; }

  // Candidate sessions. Manual strength logging knows the exact label (the
  // user picked upper/lower), so narrow to it; otherwise all same-modality
  // planned sessions that day. The matcher then applies the gate + closest-target.
  let query = supabase
    .from('planned_sessions')
    .select('id, modality, session_label, run_structure, created_at')
    .eq('user_id', userId)
    .eq('scheduled_date', dateISO)
    .eq('modality', activityType)
    .eq('status', 'planned')
    .order('created_at');
  if (activityType === 'strength' && sessionLabel) query = query.eq('session_label', sessionLabel);

  const { data: sessions, error } = await query;
  if (error) { console.warn('[scheduleGenerator] linkActivity query', error.message); return; }
  if (!sessions?.length) return;

  const candidates = (sessions as MatchSession[]).map(sessionTarget);
  const matchedId = matchActivityToSession(
    {
      activity_type:    act.activity_type,
      duration_seconds: act.duration_seconds,
      distance_meters:  act.distance_meters,
    },
    candidates,
  );
  if (matchedId) await _commitLink(matchedId, activityId);
}
```

- [ ] **Step 4: Run the existing scheduleGenerator tests**

Run: `npx jest __tests__/lib/scheduleGenerator.test.ts __tests__/lib/scheduleGeneratorMove.test.ts`
Expected: PASS (these cover only `generateSchedule` / `moveSession`; `linkActivityToSession` has no existing test, so nothing breaks).

- [ ] **Step 5: Commit**

```bash
git add src/lib/scheduleGenerator.ts
git commit -m "refactor: linkActivityToSession delegates to matcher + applies 90% gate"
```

---

### Task 4: The reconciler — `sessionReconciler.ts`

**Files:**
- Create: `src/lib/sessionReconciler.ts`
- Test: `__tests__/lib/sessionReconciler.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/sessionReconciler.test.ts`:

```typescript
import { reconcileRange } from '@/lib/sessionReconciler';

// --- reconcileRange (pure) ---
describe('reconcileRange', () => {
  test('first install returns a one-year window ending today', () => {
    const { from, to } = reconcileRange(false, new Date('2026-05-22T12:00:00'));
    expect(to).toBe('2026-05-22');
    expect(from).toBe('2025-05-22');
  });
  test('after backfill returns the current Mon-Sun week', () => {
    // 2026-05-22 is a Friday
    const { from, to } = reconcileRange(true, new Date('2026-05-22T12:00:00'));
    expect(from).toBe('2026-05-18'); // Monday
    expect(to).toBe('2026-05-24');   // Sunday
  });
  test('after backfill on a Sunday still spans that week', () => {
    const { from, to } = reconcileRange(true, new Date('2026-05-24T12:00:00'));
    expect(from).toBe('2026-05-18');
    expect(to).toBe('2026-05-24');
  });
});

// --- reconcileSessions (mocked supabase + _commitLink) ---
const commitCalls: Array<[string, string]> = [];
jest.mock('@/lib/scheduleGenerator', () => ({
  _commitLink: jest.fn((sessionId: string, activityId: string) => {
    commitCalls.push([sessionId, activityId]);
    return Promise.resolve();
  }),
}));

let ACTIVITIES: any[] = [];
let SESSIONS: any[] = [];
jest.mock('@/lib/supabase', () => {
  const makeBuilder = (rows: () => any[]) => {
    const b: any = {};
    for (const m of ['select', 'eq', 'neq', 'is', 'gte', 'lte', 'order', 'in']) b[m] = () => b;
    b.then = (resolve: (v: any) => void) => resolve({ data: rows(), error: null });
    return b;
  };
  return {
    supabase: {
      from: jest.fn((table: string) => makeBuilder(() => (table === 'activities' ? ACTIVITIES : SESSIONS))),
    },
  };
});

import { reconcileSessions } from '@/lib/sessionReconciler';

beforeEach(() => {
  commitCalls.length = 0;
  ACTIVITIES = [];
  SESSIONS = [];
});

test('links a run activity that clears the distance gate', async () => {
  ACTIVITIES = [{ id: 'a1', started_at: '2026-05-18T08:00:00Z', activity_type: 'run', duration_seconds: 2400, distance_meters: 9500 }];
  SESSIONS = [{ id: 's1', scheduled_date: '2026-05-18', modality: 'run', session_label: 'easy', run_structure: { total_distance_m: 10000 }, created_at: '2026-05-01' }];
  const n = await reconcileSessions('u', '2026-05-18', '2026-05-24');
  expect(n).toBe(1);
  expect(commitCalls).toEqual([['s1', 'a1']]);
});

test('two same-modality activities link to two distinct sessions (no double-link)', async () => {
  ACTIVITIES = [
    { id: 'a1', started_at: '2026-05-18T08:00:00Z', activity_type: 'strength', duration_seconds: 2500, distance_meters: null },
    { id: 'a2', started_at: '2026-05-18T18:00:00Z', activity_type: 'strength', duration_seconds: 3000, distance_meters: null },
  ];
  SESSIONS = [
    { id: 'upper', scheduled_date: '2026-05-18', modality: 'strength', session_label: 'upper', run_structure: null, created_at: '2026-05-01' },
    { id: 'lower', scheduled_date: '2026-05-18', modality: 'strength', session_label: 'lower', run_structure: null, created_at: '2026-05-02' },
  ];
  const n = await reconcileSessions('u', '2026-05-18', '2026-05-24');
  expect(n).toBe(2);
  const linkedSessions = commitCalls.map((c) => c[0]).sort();
  expect(linkedSessions).toEqual(['lower', 'upper']);
});

test('no unlinked activities -> zero links', async () => {
  ACTIVITIES = [];
  SESSIONS = [{ id: 's1', scheduled_date: '2026-05-18', modality: 'run', session_label: 'easy', run_structure: { total_distance_m: 10000 }, created_at: '2026-05-01' }];
  expect(await reconcileSessions('u', '2026-05-18', '2026-05-24')).toBe(0);
  expect(commitCalls).toEqual([]);
});

test('activity below gate is left unlinked', async () => {
  ACTIVITIES = [{ id: 'a1', started_at: '2026-05-18T08:00:00Z', activity_type: 'run', duration_seconds: 600, distance_meters: 4000 }];
  SESSIONS = [{ id: 's1', scheduled_date: '2026-05-18', modality: 'run', session_label: 'easy', run_structure: { total_distance_m: 10000 }, created_at: '2026-05-01' }];
  expect(await reconcileSessions('u', '2026-05-18', '2026-05-24')).toBe(0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest __tests__/lib/sessionReconciler.test.ts`
Expected: FAIL — `Cannot find module '@/lib/sessionReconciler'`.

- [ ] **Step 3: Implement `sessionReconciler.ts`**

Create `src/lib/sessionReconciler.ts`:

```typescript
import { supabase } from './supabase';
import { _commitLink } from './scheduleGenerator';
import { sessionTarget, matchActivityToSession, type MatchSession, type MatchActivity } from './sessionMatcher';

interface ActivityRow {
  id:               string;
  started_at:       string;
  activity_type:    MatchActivity['activity_type'];
  duration_seconds: number;
  distance_meters:  number | null;
}
interface SessionRow extends MatchSession {
  scheduled_date: string;
  created_at:     string;
}

function isoLocal(d: Date): string {
  return d.toLocaleDateString('en-CA'); // YYYY-MM-DD in local zone
}

// Date range to reconcile: full year on first install, current Mon-Sun thereafter.
export function reconcileRange(backfillDone: boolean, today: Date): { from: string; to: string } {
  if (!backfillDone) {
    const yearAgo = new Date(today);
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    return { from: isoLocal(yearAgo), to: isoLocal(today) };
  }
  const monday = new Date(today);
  const day = monday.getDay(); // 0=Sun … 6=Sat
  monday.setDate(monday.getDate() + (day === 0 ? -6 : 1 - day));
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  return { from: isoLocal(monday), to: isoLocal(sunday) };
}

// Link unlinked activities to matching planned sessions in [from,to].
// Additive only: turns planned -> completed, never the reverse. Idempotent.
export async function reconcileSessions(userId: string, fromISO: string, toISO: string): Promise<number> {
  const { data: acts, error: aErr } = await supabase
    .from('activities')
    .select('id, started_at, activity_type, duration_seconds, distance_meters')
    .eq('user_id', userId)
    .is('planned_session_id', null)
    .neq('activity_type', 'other')
    .gte('started_at', `${fromISO}T00:00:00.000Z`)
    .lte('started_at', `${toISO}T23:59:59.999Z`)
    .order('started_at');
  if (aErr) { console.warn('[sessionReconciler] activities', aErr.message); return 0; }
  if (!acts?.length) return 0;

  const { data: sess, error: sErr } = await supabase
    .from('planned_sessions')
    .select('id, scheduled_date, modality, session_label, run_structure, created_at')
    .eq('user_id', userId)
    .gte('scheduled_date', fromISO)
    .lte('scheduled_date', toISO)
    .eq('status', 'planned')
    .order('created_at');
  if (sErr) { console.warn('[sessionReconciler] sessions', sErr.message); return 0; }
  if (!sess?.length) return 0;

  // Index unconsumed planned sessions by `${localDate}|${modality}`.
  const byKey = new Map<string, SessionRow[]>();
  for (const s of sess as SessionRow[]) {
    const k = `${s.scheduled_date}|${s.modality}`;
    const arr = byKey.get(k);
    if (arr) arr.push(s);
    else byKey.set(k, [s]);
  }

  let linked = 0;
  for (const a of acts as ActivityRow[]) {
    const k = `${isoLocal(new Date(a.started_at))}|${a.activity_type}`;
    const pool = byKey.get(k);
    if (!pool?.length) continue;
    const candidates = pool.map(sessionTarget);
    const matchedId = matchActivityToSession(
      { activity_type: a.activity_type, duration_seconds: a.duration_seconds, distance_meters: a.distance_meters },
      candidates,
    );
    if (!matchedId) continue;
    await _commitLink(matchedId, a.id);
    byKey.set(k, pool.filter((s) => s.id !== matchedId)); // consume so it isn't reused this pass
    linked++;
  }
  return linked;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest __tests__/lib/sessionReconciler.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sessionReconciler.ts __tests__/lib/sessionReconciler.test.ts
git commit -m "feat: sessionReconciler — link unlinked activities to planned sessions"
```

---

### Task 5: Wire the reconciler into `healthKitImport`

**Files:**
- Modify: `src/lib/healthKitImport.ts` (imports + constants near line 7, the HK callback around lines 105-191)

- [ ] **Step 1: Add imports and the backfill flag constant**

In `src/lib/healthKitImport.ts`, add after the existing imports (after line 5):

```typescript
import { reconcileSessions, reconcileRange } from './sessionReconciler';
```

Add alongside the existing key constants (after line 8, next to `REIMPORT_FLAG_KEY`):

```typescript
const BACKFILL_FLAG_KEY = 'hk_backfill_done_v1';
```

- [ ] **Step 2: Add a reconcile helper inside the module**

Add this module-level helper in `src/lib/healthKitImport.ts` (above `importNewWorkouts`, after the `ImportContext` interface near line 76):

```typescript
// Runs every foreground import cycle. First call (per install) reconciles a full
// year as a one-time backfill; subsequent calls reconcile only the current week.
async function runReconcile(userId: string): Promise<void> {
  try {
    const backfillDone = !!(await AsyncStorage.getItem(BACKFILL_FLAG_KEY));
    const { from, to } = reconcileRange(backfillDone, new Date());
    await reconcileSessions(userId, from, to);
    if (!backfillDone) await AsyncStorage.setItem(BACKFILL_FLAG_KEY, '1');
  } catch (e) {
    console.warn('[healthKitImport] reconcile', (e as Error).message);
  }
}
```

- [ ] **Step 3: Call reconcile every cycle (even when no new workouts)**

In the `HK.getAnchoredWorkouts` callback, change the early bail-out so it only bails on a hard error, and always reconciles before resolving.

Replace (around line 106):

```typescript
        if (err || !result?.data?.length) return resolve(0);

        const workouts = result.data.filter(
          (w) => w.duration > 0 && (w.distance >= 0)
        );
```

with:

```typescript
        if (err) return resolve(0);

        const workouts = (result?.data ?? []).filter(
          (w) => w.duration > 0 && (w.distance >= 0)
        );
```

Then replace the tail of the callback (around lines 186-191):

```typescript
        // Advance anchor so next call only fetches new workouts
        if (result.anchor) {
          await AsyncStorage.setItem(ANCHOR_KEY, result.anchor);
        }

        resolve(imported);
```

with:

```typescript
        // Advance anchor so next call only fetches new workouts
        if (result?.anchor) {
          await AsyncStorage.setItem(ANCHOR_KEY, result.anchor);
        }

        // Link imported (and any still-unlinked) activities to planned sessions.
        await runReconcile(ctx.userId);

        resolve(imported);
```

- [ ] **Step 4: Typecheck the touched file**

Run: `npx tsc --noEmit 2>&1 | grep healthKitImport || echo "healthKitImport clean"`
Expected: `healthKitImport clean`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/healthKitImport.ts
git commit -m "feat: reconcile sessions on every HealthKit import cycle + one-time backfill"
```

---

### Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full app typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -v "supabase/functions" | grep -v "Cannot find name 'Deno'" | grep -v "jsr:@supabase" | head -20 || echo clean`
Expected: no output (the only pre-existing errors are Deno edge-function noise, which is filtered out).

- [ ] **Step 2: Run the affected test suites**

Run: `npx jest sessionMatcher sessionReconciler scheduleGenerator volumePlan`
Expected: all suites PASS.

- [ ] **Step 3: Manual verification note (cannot be unit-tested — native HealthKit)**

After a dev build, foreground the app with a logged-in test account that has past planned sessions and HealthKit workouts. Confirm:
- On first foreground (fresh install / cleared `hk_backfill_done_v1`), past planned sessions that have a qualifying same-day workout flip to `completed` in the Training calendar and Insights adherence.
- A short workout (< 90% of target) does **not** complete its session.
- `other`-type HealthKit samples never complete anything.
- Re-foregrounding makes no further changes (idempotent).

If verifying against the live DB via Supabase MCP, spot-check that previously-orphaned activities now have `planned_session_id` set and their sessions are `completed`.

---

## Self-Review

- **Spec coverage:** matcher gate + closest-target (Task 1) ✓; distance/duration metrics + targets (Task 1 `sessionTarget`) ✓; `other` excluded (Task 1 default + Task 4 `.neq`) ✓; reconciler + greedy pass + idempotency (Task 4) ✓; triggers: first-install backfill + rolling week (Task 4 `reconcileRange`, Task 5 wiring) ✓; manual path shares matcher with gate (Task 3) ✓; local-date matching (Task 4 `isoLocal`) ✓; DRY duration constant (Task 2) ✓; unmatched activities preserved (additive design — nothing deletes) ✓.
- **Placeholder scan:** none — all steps contain concrete code/commands.
- **Type consistency:** `MatchActivity`/`MatchSession`/`MatchCandidate`, `sessionTarget`, `matchActivityToSession`, `reconcileSessions`, `reconcileRange`, `_commitLink`, `SESSION_DURATION_MIN` used identically across Tasks 1-5.
