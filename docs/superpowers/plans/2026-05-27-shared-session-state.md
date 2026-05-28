# Shared Session State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single Zustand-based source of truth for `planned_sessions` that all UI surfaces read from and mutate through, with persist middleware for cold-start cache-first rendering. Add `cycle` and `hike` modalities as part of the same slice.

**Architecture:** New `sessionStore` (Zustand + persist over AsyncStorage) holds a normalised `byId` + `idsByDate` projection of `planned_sessions`. Surfaces consume via narrow selector hooks. All writes — UI-driven and HealthKit-reconciler-driven — route through store actions that wrap existing `scheduleGenerator` helpers with optimistic updates. Phase J Sub-project Ja, first slice.

**Tech Stack:** TypeScript, React Native (Expo SDK 54), Zustand 5.x, AsyncStorage, Supabase JS, Jest + jest-expo, React Testing Library Native.

**Spec:** `docs/superpowers/specs/2026-05-27-shared-session-state-design.md`

**All commands run from `mobile/` unless stated.**

---

## Task 1: Widen DB CHECK constraints for `cycle` and `hike`

**Files:**
- Create: `mobile/supabase/migrations/20260527000000_widen_modality_check_cycle_hike.sql`

- [ ] **Step 1: Author the migration**

```sql
-- 20260527000000_widen_modality_check_cycle_hike.sql
-- Widen planned_sessions.modality, training_blocks.modality, and
-- activities.activity_type CHECK constraints to admit 'cycle' and 'hike'.

alter table public.planned_sessions
  drop constraint if exists planned_sessions_modality_check;
alter table public.planned_sessions
  add  constraint planned_sessions_modality_check
       check (modality in ('run','strength','swim','yoga','cycle','hike','other'));

alter table public.training_blocks
  drop constraint if exists training_blocks_modality_check;
alter table public.training_blocks
  add  constraint training_blocks_modality_check
       check (modality in ('run','strength','swim','yoga','cycle','hike','other'));

alter table public.activities
  drop constraint if exists activities_activity_type_check;
alter table public.activities
  add  constraint activities_activity_type_check
       check (activity_type in ('run','strength','swim','yoga','cycle','hike','other'));
```

- [ ] **Step 2: Apply via Supabase MCP**

Use the Supabase MCP `apply_migration` tool against project `elebuieojodsjmghwjub` with the SQL above and migration name `widen_modality_check_cycle_hike`.

- [ ] **Step 3: Verify**

Run via Supabase MCP `execute_sql`:

```sql
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conname in (
  'planned_sessions_modality_check',
  'training_blocks_modality_check',
  'activities_activity_type_check'
);
```

Expected: three rows, each `check (... in (...'cycle','hike','other'))`.

- [ ] **Step 4: Commit**

```bash
git add mobile/supabase/migrations/20260527000000_widen_modality_check_cycle_hike.sql
git commit -m "db: widen planned_sessions/training_blocks/activities modality CHECK to include cycle, hike"
```

---

## Task 2: Add `slate`, `sage`, `peach` theme tokens

**Files:**
- Modify: `mobile/src/constants/theme.ts`
- Test: `mobile/__tests__/theme.test.ts`

- [ ] **Step 1: Extend the failing test**

Append to `mobile/__tests__/theme.test.ts`:

```ts
import { colors } from '@/constants/theme';

describe('modality palette additions', () => {
  it('exposes slate token for swim', () => {
    expect(colors.slate).toBe('#9DB8AC');
  });
  it('exposes sage token for hike', () => {
    expect(colors.sage).toBe('#94B062');
  });
  it('exposes peach token for cycle', () => {
    expect(colors.peach).toBe('#F5A077');
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
npx jest __tests__/theme.test.ts -t "modality palette additions"
```

Expected: FAIL — `colors.slate` is `undefined`.

- [ ] **Step 3: Add tokens**

In `mobile/src/constants/theme.ts`, extend the `colors` object:

```ts
export const colors = {
  pulse:   '#D4FF26',
  heat:    '#FF2E7E',
  mile:    '#0A0A0F',
  breath:  '#F4EDE0',
  dawn:    '#FF6B3D',
  mist:    '#1C1C24',
  slate:   '#9DB8AC',
  sage:    '#94B062',
  peach:   '#F5A077',
  muted:   'rgba(244, 237, 224, 0.5)',
  border:  'rgba(244, 237, 224, 0.08)',
} as const;
```

- [ ] **Step 4: Run test, expect pass**

```bash
npx jest __tests__/theme.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/constants/theme.ts mobile/__tests__/theme.test.ts
git commit -m "theme: add slate, sage, peach tokens (modality palette for swim, hike, cycle)"
```

---

## Task 3: Widen `Modality` union and extend `DayCell` modality maps

**Files:**
- Modify: `mobile/src/lib/dayState.ts`
- Modify: `mobile/src/components/ui/DayCell.tsx`
- Test: `mobile/__tests__/dayState.test.ts`

- [ ] **Step 1: Extend the failing test**

Append to `mobile/__tests__/dayState.test.ts`:

```ts
import type { Modality } from '@/lib/dayState';

describe('Modality union widening', () => {
  it('accepts cycle and hike at the type level', () => {
    const m: Modality[] = ['run','strength','swim','yoga','cycle','hike','other'];
    expect(m).toHaveLength(7);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
npx jest __tests__/dayState.test.ts -t "Modality union widening"
```

Expected: FAIL — TypeScript compile error (`'cycle'`/`'hike'` not assignable).

- [ ] **Step 3: Widen the union**

In `mobile/src/lib/dayState.ts`, find the `Modality` type declaration and update to:

```ts
export type Modality = 'run' | 'strength' | 'swim' | 'yoga' | 'cycle' | 'hike' | 'other';
```

- [ ] **Step 4: Extend DayCell modality maps**

In `mobile/src/components/ui/DayCell.tsx`, replace the `MODALITY_ICON` and `MODALITY_COLOR` constants:

```ts
const MODALITY_ICON: Record<Modality, React.ComponentProps<typeof SymbolView>['name']> = {
  run:      'figure.run',
  strength: 'dumbbell',
  swim:     'figure.pool.swim',
  yoga:     'figure.mind.and.body',
  cycle:    'figure.outdoor.cycle',
  hike:     'figure.hiking',
  other:    'figure.mixed.cardio',
};

const MODALITY_COLOR: Record<Modality, string> = {
  run:      colors.pulse,
  strength: colors.dawn,
  swim:     colors.slate,
  yoga:     colors.breath,
  cycle:    colors.peach,
  hike:     colors.sage,
  other:    colors.muted,
};
```

- [ ] **Step 5: Run test + typecheck, expect pass**

```bash
npx jest __tests__/dayState.test.ts && npx tsc --noEmit
```

Expected: tests pass, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/lib/dayState.ts mobile/src/components/ui/DayCell.tsx mobile/__tests__/dayState.test.ts
git commit -m "modality: add cycle and hike with slate/sage/peach palette in DayCell"
```

---

## Task 4: Refactor `plan/[id].tsx` `PHASE_COLOR` to consume new tokens

**Files:**
- Modify: `mobile/app/(app)/plan/[id].tsx` (lines 42-53)

- [ ] **Step 1: Visual smoke test (manual — no automated coverage exists for this map)**

Note for verification: open the running app, navigate to any training plan detail, and screenshot the WEEKLY VOLUME bar legend. Compare before/after — colours must be identical.

- [ ] **Step 2: Edit the PHASE_COLOR constant**

In `mobile/app/(app)/plan/[id].tsx`, replace lines 42-53:

```ts
const PHASE_COLOR: Record<string, string> = {
  // Run phases
  Recovery:    colors.slate,
  Base:        colors.sage,
  Steady:      '#C9B68F',
  Taper:       colors.peach,
  Build:       '#D4521F',
  Peak:        colors.pulse,
  'Race week': colors.heat,
  // Gym phases
  Foundation:  colors.slate,
  Strength:    colors.dawn,
  Deload:      '#5BA4CF',
};
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "mobile/app/(app)/plan/[id].tsx"
git commit -m "refactor(plan): consume slate/sage/peach/pulse/heat/dawn tokens in PHASE_COLOR"
```

---

## Task 5: Create shared AsyncStorage adapter

**Files:**
- Create: `mobile/src/store/persistAdapter.ts`
- Test: `mobile/__tests__/store/persistAdapter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `mobile/__tests__/store/persistAdapter.test.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { asyncStorageAdapter } from '@/store/persistAdapter';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('asyncStorageAdapter', () => {
  it('round-trips a JSON payload', async () => {
    await asyncStorageAdapter.setItem('virra:test', '{"a":1}');
    const got = await asyncStorageAdapter.getItem('virra:test');
    expect(got).toBe('{"a":1}');
  });

  it('returns null for missing keys', async () => {
    const got = await asyncStorageAdapter.getItem('virra:absent');
    expect(got).toBeNull();
  });

  it('removes a key', async () => {
    await asyncStorageAdapter.setItem('virra:test', 'x');
    await asyncStorageAdapter.removeItem('virra:test');
    expect(await asyncStorageAdapter.getItem('virra:test')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
npx jest __tests__/store/persistAdapter.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement adapter**

Create `mobile/src/store/persistAdapter.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StateStorage } from 'zustand/middleware';

export const asyncStorageAdapter: StateStorage = {
  getItem:    (key) => AsyncStorage.getItem(key),
  setItem:    (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};
```

- [ ] **Step 4: Run test, expect pass**

```bash
npx jest __tests__/store/persistAdapter.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/store/persistAdapter.ts mobile/__tests__/store/persistAdapter.test.ts
git commit -m "store: add shared AsyncStorage adapter for Zustand persist middleware"
```

---

## Task 6: Create `sessionStore.types.ts`

**Files:**
- Create: `mobile/src/store/sessionStore.types.ts`

- [ ] **Step 1: Author types file (compile-time only — no runtime test)**

Create `mobile/src/store/sessionStore.types.ts`:

```ts
import type { Modality } from '@/lib/dayState';

export type DateISO = string;     // 'YYYY-MM-DD' in user's local timezone
export type SessionId = string;   // planned_sessions.id

export type SessionStatus = 'planned' | 'completed' | 'dropped' | 'moved';

export interface PlannedSessionRow {
  id:                  SessionId;
  scheduled_date:      DateISO;
  modality:            Modality;
  session_label:       string | null;
  status:              SessionStatus;
  block_id:            string | null;
  activity_id:         string | null;
  moved_to_id:         SessionId | null;
  week_number:         number;
  day_of_week:         number;
  run_structure?:      unknown;
  strength_structure?: unknown;
  created_at?:         string;
}

export interface LoadedRange {
  from:      DateISO;
  to:        DateISO;
  fetchedAt: number;             // Date.now() at completion of fetch
}

export interface SessionStoreState {
  byId:         Record<SessionId, PlannedSessionRow>;
  idsByDate:    Record<DateISO, SessionId[]>;
  loadedRanges: LoadedRange[];
  fetching:     Set<string>;     // range keys 'YYYY-MM-DD..YYYY-MM-DD' in flight
  hasHydrated:  boolean;
  lastError:    { at: number; op: string; message: string } | null;
}

export interface SessionStoreActions {
  // lifecycle
  ensureLoaded(from: DateISO, to: DateISO): Promise<void>;
  refresh(from: DateISO, to: DateISO):      Promise<void>;

  // mutations
  markComplete(sessionId: SessionId, activityId: string): Promise<void>;
  dropSession(sessionId: SessionId):                      Promise<void>;
  moveSession(sessionId: SessionId, newDate: DateISO):    Promise<SessionId>;
  linkActivity(activityId: string, sessionId: SessionId): Promise<void>;

  // background reconciliation
  reconcileFromActivities(): Promise<{ linked: number }>;

  // diagnostics
  clearCache(): Promise<void>;
}

export type SessionStore = SessionStoreState & SessionStoreActions;
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/store/sessionStore.types.ts
git commit -m "store: define sessionStore types (PlannedSessionRow, state, actions)"
```

---

## Task 7: Build `sessionStore` skeleton with `ensureLoaded` and `refresh`

**Files:**
- Create: `mobile/src/store/sessionStore.ts`
- Test: `mobile/__tests__/store/sessionStore.fetch.test.ts`

- [ ] **Step 1: Write the failing test**

Create `mobile/__tests__/store/sessionStore.fetch.test.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@/lib/supabase', () => {
  const rows: any[] = [
    { id: 's1', scheduled_date: '2026-05-25', modality: 'run', session_label: 'Easy', status: 'planned',
      block_id: 'b1', activity_id: null, moved_to_id: null, week_number: 1, day_of_week: 0, created_at: '2026-05-20T00:00:00Z' },
    { id: 's2', scheduled_date: '2026-05-26', modality: 'strength', session_label: 'Lower', status: 'planned',
      block_id: 'b1', activity_id: null, moved_to_id: null, week_number: 1, day_of_week: 1, created_at: '2026-05-20T00:00:00Z' },
  ];
  const builder = {
    select: () => builder, eq: () => builder, gte: () => builder, lte: () => builder, in: () => builder,
    order: () => Promise.resolve({ data: rows, error: null }),
  };
  return {
    supabase: {
      from: () => builder,
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    },
  };
});

import { useSessionStore } from '@/store/sessionStore';

beforeEach(async () => {
  await AsyncStorage.clear();
  useSessionStore.setState({
    byId: {}, idsByDate: {}, loadedRanges: [], fetching: new Set(),
    hasHydrated: true, lastError: null,
  });
});

describe('sessionStore.ensureLoaded', () => {
  it('fetches and indexes sessions for the requested range', async () => {
    await useSessionStore.getState().ensureLoaded('2026-05-25', '2026-05-26');
    const s = useSessionStore.getState();
    expect(Object.keys(s.byId)).toEqual(['s1','s2']);
    expect(s.idsByDate['2026-05-25']).toEqual(['s1']);
    expect(s.idsByDate['2026-05-26']).toEqual(['s2']);
    expect(s.loadedRanges).toHaveLength(1);
    expect(s.loadedRanges[0]).toMatchObject({ from: '2026-05-25', to: '2026-05-26' });
  });

  it('is idempotent — second call within staleness window does not refetch', async () => {
    await useSessionStore.getState().ensureLoaded('2026-05-25', '2026-05-26');
    const fetchedAt1 = useSessionStore.getState().loadedRanges[0].fetchedAt;
    await new Promise((r) => setTimeout(r, 5));
    await useSessionStore.getState().ensureLoaded('2026-05-25', '2026-05-26');
    const fetchedAt2 = useSessionStore.getState().loadedRanges[0].fetchedAt;
    expect(fetchedAt2).toBe(fetchedAt1);
  });

  it('refresh() always refetches and updates fetchedAt', async () => {
    await useSessionStore.getState().ensureLoaded('2026-05-25', '2026-05-26');
    const fetchedAt1 = useSessionStore.getState().loadedRanges[0].fetchedAt;
    await new Promise((r) => setTimeout(r, 5));
    await useSessionStore.getState().refresh('2026-05-25', '2026-05-26');
    const fetchedAt2 = useSessionStore.getState().loadedRanges[0].fetchedAt;
    expect(fetchedAt2).toBeGreaterThan(fetchedAt1);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
npx jest __tests__/store/sessionStore.fetch.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement skeleton store**

Create `mobile/src/store/sessionStore.ts`:

```ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { supabase } from '@/lib/supabase';
import { asyncStorageAdapter } from './persistAdapter';
import type {
  SessionStore, SessionStoreState, PlannedSessionRow, DateISO, SessionId, LoadedRange,
} from './sessionStore.types';

const STORE_NAME = 'virra:sessions:v1';
const STALENESS_MS = 5 * 60 * 1000; // 5 minutes
const SESSION_COLUMNS =
  'id, scheduled_date, modality, session_label, status, block_id, activity_id, moved_to_id, week_number, day_of_week, run_structure, strength_structure, created_at';

function rangeKey(from: DateISO, to: DateISO): string {
  return `${from}..${to}`;
}

function isCovered(ranges: LoadedRange[], from: DateISO, to: DateISO, now: number): boolean {
  return ranges.some((r) =>
    r.from <= from && r.to >= to && now - r.fetchedAt < STALENESS_MS,
  );
}

function mergeRange(ranges: LoadedRange[], next: LoadedRange): LoadedRange[] {
  // Drop any range fully covered by `next`, then append.
  const kept = ranges.filter((r) => !(next.from <= r.from && next.to >= r.to));
  return [...kept, next];
}

function indexRows(rows: PlannedSessionRow[]): { byId: Record<SessionId, PlannedSessionRow>; idsByDate: Record<DateISO, SessionId[]> } {
  const byId: Record<SessionId, PlannedSessionRow> = {};
  const idsByDate: Record<DateISO, SessionId[]> = {};
  for (const r of rows) {
    byId[r.id] = r;
    (idsByDate[r.scheduled_date] ??= []).push(r.id);
  }
  return { byId, idsByDate };
}

const initialState: SessionStoreState = {
  byId: {},
  idsByDate: {},
  loadedRanges: [],
  fetching: new Set(),
  hasHydrated: false,
  lastError: null,
};

export const useSessionStore = create<SessionStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      ensureLoaded: async (from, to) => {
        const s = get();
        if (isCovered(s.loadedRanges, from, to, Date.now())) return;
        await get().refresh(from, to);
      },

      refresh: async (from, to) => {
        const key = rangeKey(from, to);
        if (get().fetching.has(key)) return;
        const nextFetching = new Set(get().fetching); nextFetching.add(key);
        set({ fetching: nextFetching });
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;
          const { data, error } = await supabase
            .from('planned_sessions')
            .select(SESSION_COLUMNS)
            .eq('user_id', user.id)
            .gte('scheduled_date', from)
            .lte('scheduled_date', to)
            .order('scheduled_date');
          if (error) {
            set({ lastError: { at: Date.now(), op: 'refresh', message: error.message } });
            return;
          }
          const rows = (data ?? []) as PlannedSessionRow[];

          // Merge into existing byId/idsByDate. Replace anything within the range
          // (server is authoritative for the window).
          const existing = get();
          const nextById = { ...existing.byId };
          const nextIdsByDate = { ...existing.idsByDate };

          // Drop any session currently keyed within [from,to] — about to be replaced.
          for (const [date, ids] of Object.entries(existing.idsByDate)) {
            if (date >= from && date <= to) {
              for (const id of ids) delete nextById[id];
              delete nextIdsByDate[date];
            }
          }
          for (const r of rows) {
            nextById[r.id] = r;
            (nextIdsByDate[r.scheduled_date] ??= []).push(r.id);
          }

          const nextLoaded = mergeRange(get().loadedRanges, { from, to, fetchedAt: Date.now() });
          set({ byId: nextById, idsByDate: nextIdsByDate, loadedRanges: nextLoaded });
        } finally {
          const after = new Set(get().fetching); after.delete(key);
          set({ fetching: after });
        }
      },

      markComplete: async () => { throw new Error('not implemented yet'); },
      dropSession:  async () => { throw new Error('not implemented yet'); },
      moveSession:  async () => { throw new Error('not implemented yet'); },
      linkActivity: async () => { throw new Error('not implemented yet'); },
      reconcileFromActivities: async () => { throw new Error('not implemented yet'); },

      clearCache: async () => {
        set({ ...initialState, hasHydrated: true });
      },
    }),
    {
      name: STORE_NAME,
      storage: createJSONStorage(() => asyncStorageAdapter),
      partialize: (s) => ({
        byId: s.byId,
        idsByDate: s.idsByDate,
        loadedRanges: s.loadedRanges,
      }),
      version: 1,
      migrate: () => ({ byId: {}, idsByDate: {}, loadedRanges: [] }) as any,
      onRehydrateStorage: () => (state) => {
        if (state) state.hasHydrated = true;
      },
    },
  ),
);
```

- [ ] **Step 4: Run test, expect pass**

```bash
npx jest __tests__/store/sessionStore.fetch.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/store/sessionStore.ts mobile/__tests__/store/sessionStore.fetch.test.ts
git commit -m "store(sessions): skeleton with ensureLoaded, refresh, persist; mutations stubbed"
```

---

## Task 8: Extract pure `proposeLinks` from `sessionReconciler.ts`

**Files:**
- Modify: `mobile/src/lib/sessionReconciler.ts`
- Test: `mobile/__tests__/lib/proposeLinks.test.ts`

- [ ] **Step 1: Write the failing test**

Create `mobile/__tests__/lib/proposeLinks.test.ts`:

```ts
import { proposeLinks } from '@/lib/sessionReconciler';

const baseSession = {
  id: 's1',
  scheduled_date: '2026-05-25',
  modality: 'run' as const,
  session_label: 'Easy',
  run_structure: null,
  created_at: '2026-05-20T00:00:00Z',
};

const baseActivity = {
  id: 'a1',
  started_at: '2026-05-25T07:30:00.000Z',
  activity_type: 'run' as const,
  duration_seconds: 1800,
  distance_meters: 5000,
};

describe('proposeLinks', () => {
  it('proposes a link when activity local date + modality match a planned session', () => {
    const links = proposeLinks([baseActivity], [baseSession]);
    expect(links).toEqual([{ activityId: 'a1', sessionId: 's1' }]);
  });

  it('does not propose a link when activity has no matching modality', () => {
    const links = proposeLinks(
      [{ ...baseActivity, activity_type: 'swim' as const }],
      [baseSession],
    );
    expect(links).toEqual([]);
  });

  it('does not double-link a session already proposed in the same pass', () => {
    const links = proposeLinks(
      [baseActivity, { ...baseActivity, id: 'a2', started_at: '2026-05-25T18:00:00.000Z' }],
      [baseSession],
    );
    expect(links).toHaveLength(1);
    expect(links[0].sessionId).toBe('s1');
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
npx jest __tests__/lib/proposeLinks.test.ts
```

Expected: FAIL — `proposeLinks` not exported.

- [ ] **Step 3: Extract pure function**

In `mobile/src/lib/sessionReconciler.ts`, add this export above `reconcileSessions` (keep `reconcileSessions` as a thin wrapper for now):

```ts
export interface ProposedLink { activityId: string; sessionId: string; }

export function proposeLinks(activities: ActivityRow[], sessions: SessionRow[]): ProposedLink[] {
  const byKey = new Map<string, SessionRow[]>();
  for (const s of sessions) {
    const k = `${s.scheduled_date}|${s.modality}`;
    const arr = byKey.get(k);
    if (arr) arr.push(s);
    else byKey.set(k, [s]);
  }

  const out: ProposedLink[] = [];
  for (const a of activities) {
    const k = `${isoLocal(new Date(a.started_at))}|${a.activity_type}`;
    const pool = byKey.get(k);
    if (!pool?.length) continue;
    const candidates = pool.map(sessionTarget);
    const matchedId = matchActivityToSession(
      { activity_type: a.activity_type, duration_seconds: a.duration_seconds, distance_meters: a.distance_meters },
      candidates,
    );
    if (!matchedId) continue;
    out.push({ activityId: a.id, sessionId: matchedId });
    byKey.set(k, pool.filter((s) => s.id !== matchedId));
  }
  return out;
}
```

Then rewrite `reconcileSessions` to use it (replace the matching loop):

```ts
export async function reconcileSessions(userId: string, fromISO: string, toISO: string): Promise<number> {
  // ... existing fetch logic (acts, sess) unchanged ...

  const links = proposeLinks(acts as ActivityRow[], sess as SessionRow[]);
  for (const { sessionId, activityId } of links) {
    await _commitLink(sessionId, activityId);
  }
  return links.length;
}
```

(Keep the existing fetch blocks at the top of `reconcileSessions`; only the matching loop changes.)

- [ ] **Step 4: Run tests, expect pass**

```bash
npx jest __tests__/lib/proposeLinks.test.ts __tests__/lib/sessionReconciler.test.ts
```

Expected: both files pass. `sessionReconciler.test.ts` must remain green — behavior preserved.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/sessionReconciler.ts mobile/__tests__/lib/proposeLinks.test.ts
git commit -m "refactor(reconciler): extract pure proposeLinks(); reconcileSessions delegates"
```

---

## Task 9: Implement `markComplete` with optimistic update

**Files:**
- Modify: `mobile/src/store/sessionStore.ts`
- Test: `mobile/__tests__/store/sessionStore.mutations.test.ts`

- [ ] **Step 1: Write the failing test**

Create `mobile/__tests__/store/sessionStore.mutations.test.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const commitLinkMock = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/scheduleGenerator', () => ({
  _commitLink: (sid: string, aid: string) => commitLinkMock(sid, aid),
  dropSession: jest.fn(),
  moveSession: jest.fn(),
  linkActivityToSession: jest.fn(),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ gte: () => ({ lte: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) }) }) }),
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
  },
}));

import { useSessionStore } from '@/store/sessionStore';

beforeEach(async () => {
  await AsyncStorage.clear();
  commitLinkMock.mockClear().mockResolvedValue(undefined);
  useSessionStore.setState({
    byId: {
      s1: { id: 's1', scheduled_date: '2026-05-25', modality: 'run', session_label: 'Easy',
            status: 'planned', block_id: null, activity_id: null, moved_to_id: null,
            week_number: 0, day_of_week: 0 },
    },
    idsByDate: { '2026-05-25': ['s1'] },
    loadedRanges: [{ from: '2026-05-25', to: '2026-05-25', fetchedAt: Date.now() }],
    fetching: new Set(), hasHydrated: true, lastError: null,
  });
});

describe('sessionStore.markComplete', () => {
  it('flips status to completed and sets activity_id optimistically', async () => {
    await useSessionStore.getState().markComplete('s1', 'a1');
    const row = useSessionStore.getState().byId['s1'];
    expect(row.status).toBe('completed');
    expect(row.activity_id).toBe('a1');
    expect(commitLinkMock).toHaveBeenCalledWith('s1', 'a1');
  });

  it('reverts on DB failure and sets lastError', async () => {
    commitLinkMock.mockRejectedValueOnce(new Error('network'));
    await expect(useSessionStore.getState().markComplete('s1', 'a1')).rejects.toThrow('network');
    const row = useSessionStore.getState().byId['s1'];
    expect(row.status).toBe('planned');
    expect(row.activity_id).toBeNull();
    expect(useSessionStore.getState().lastError?.op).toBe('markComplete');
  });

  it('is a no-op if the session is not in the cache', async () => {
    await useSessionStore.getState().markComplete('absent', 'a1');
    expect(commitLinkMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
npx jest __tests__/store/sessionStore.mutations.test.ts -t markComplete
```

Expected: FAIL — `markComplete` throws "not implemented yet".

- [ ] **Step 3: Implement `markComplete`**

In `mobile/src/store/sessionStore.ts`, add to the imports:

```ts
import { _commitLink } from '@/lib/scheduleGenerator';
```

Replace the `markComplete` stub:

```ts
      markComplete: async (sessionId, activityId) => {
        const prev = get().byId[sessionId];
        if (!prev) return;
        set({
          byId: { ...get().byId, [sessionId]: { ...prev, status: 'completed', activity_id: activityId } },
        });
        try {
          await _commitLink(sessionId, activityId);
        } catch (e) {
          set({
            byId: { ...get().byId, [sessionId]: prev },
            lastError: { at: Date.now(), op: 'markComplete', message: e instanceof Error ? e.message : String(e) },
          });
          throw e;
        }
      },
```

- [ ] **Step 4: Run test, expect pass**

```bash
npx jest __tests__/store/sessionStore.mutations.test.ts -t markComplete
```

Expected: 3 markComplete tests pass.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/store/sessionStore.ts mobile/__tests__/store/sessionStore.mutations.test.ts
git commit -m "store(sessions): markComplete with optimistic update + revert on failure"
```

---

## Task 10: Implement `dropSession` with optimistic update

**Files:**
- Modify: `mobile/src/store/sessionStore.ts`
- Test: `mobile/__tests__/store/sessionStore.mutations.test.ts`

- [ ] **Step 1: Extend the test file**

Append to `mobile/__tests__/store/sessionStore.mutations.test.ts`:

```ts
const dropSessionMock = jest.requireMock('@/lib/scheduleGenerator').dropSession as jest.Mock;

describe('sessionStore.dropSession', () => {
  beforeEach(() => { dropSessionMock.mockClear().mockResolvedValue(undefined); });

  it('flips status to dropped optimistically', async () => {
    await useSessionStore.getState().dropSession('s1');
    expect(useSessionStore.getState().byId['s1'].status).toBe('dropped');
    expect(dropSessionMock).toHaveBeenCalledWith('s1');
  });

  it('reverts on DB failure', async () => {
    dropSessionMock.mockRejectedValueOnce(new Error('boom'));
    await expect(useSessionStore.getState().dropSession('s1')).rejects.toThrow('boom');
    expect(useSessionStore.getState().byId['s1'].status).toBe('planned');
    expect(useSessionStore.getState().lastError?.op).toBe('dropSession');
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
npx jest __tests__/store/sessionStore.mutations.test.ts -t dropSession
```

Expected: FAIL — `dropSession` throws "not implemented yet".

- [ ] **Step 3: Implement `dropSession`**

In `mobile/src/store/sessionStore.ts`, update import:

```ts
import { _commitLink, dropSession as dropSessionDb } from '@/lib/scheduleGenerator';
```

Replace the `dropSession` stub:

```ts
      dropSession: async (sessionId) => {
        const prev = get().byId[sessionId];
        if (!prev) return;
        set({
          byId: { ...get().byId, [sessionId]: { ...prev, status: 'dropped' } },
        });
        try {
          await dropSessionDb(sessionId);
        } catch (e) {
          set({
            byId: { ...get().byId, [sessionId]: prev },
            lastError: { at: Date.now(), op: 'dropSession', message: e instanceof Error ? e.message : String(e) },
          });
          throw e;
        }
      },
```

- [ ] **Step 4: Run test, expect pass**

```bash
npx jest __tests__/store/sessionStore.mutations.test.ts -t dropSession
```

Expected: 2 dropSession tests pass.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/store/sessionStore.ts mobile/__tests__/store/sessionStore.mutations.test.ts
git commit -m "store(sessions): dropSession with optimistic update + revert on failure"
```

---

## Task 11: Implement `moveSession` (the tricky one) with temp-id swap

**Files:**
- Modify: `mobile/src/store/sessionStore.ts`
- Test: `mobile/__tests__/store/sessionStore.mutations.test.ts`

The scheduleGenerator `moveSession(sessionId, newDate)` returns the newly inserted row's id. Confirm by reading `mobile/src/lib/scheduleGenerator.ts:197-243`. If the existing signature returns void, change the test setup accordingly (the existing return type can be enriched if needed — verify before coding).

- [ ] **Step 1: Extend the test file**

Append to `mobile/__tests__/store/sessionStore.mutations.test.ts`:

```ts
const moveSessionMock = jest.requireMock('@/lib/scheduleGenerator').moveSession as jest.Mock;

describe('sessionStore.moveSession', () => {
  beforeEach(() => { moveSessionMock.mockClear().mockResolvedValue('s1_new'); });

  it('inserts a temp row at the new date, marks original moved, then swaps temp for real id', async () => {
    const newId = await useSessionStore.getState().moveSession('s1', '2026-05-26');
    const s = useSessionStore.getState();
    expect(newId).toBe('s1_new');
    expect(s.byId['s1'].status).toBe('moved');
    expect(s.byId['s1'].moved_to_id).toBe('s1_new');
    expect(s.byId['s1_new']).toMatchObject({ id: 's1_new', scheduled_date: '2026-05-26', modality: 'run' });
    expect(s.idsByDate['2026-05-26']).toContain('s1_new');
    expect(s.idsByDate['2026-05-25']).not.toContain('s1_new');
    expect(moveSessionMock).toHaveBeenCalledWith('s1', '2026-05-26');
  });

  it('reverts both rows on DB failure', async () => {
    moveSessionMock.mockRejectedValueOnce(new Error('move-fail'));
    await expect(useSessionStore.getState().moveSession('s1', '2026-05-26')).rejects.toThrow('move-fail');
    const s = useSessionStore.getState();
    expect(s.byId['s1'].status).toBe('planned');
    expect(s.byId['s1'].moved_to_id).toBeNull();
    expect(Object.keys(s.byId)).toEqual(['s1']);
    expect(s.idsByDate['2026-05-26']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
npx jest __tests__/store/sessionStore.mutations.test.ts -t moveSession
```

Expected: FAIL — `moveSession` throws "not implemented yet".

- [ ] **Step 3: Verify scheduleGenerator return type**

```bash
grep -n "export async function moveSession" mobile/src/lib/scheduleGenerator.ts
sed -n '197,243p' mobile/src/lib/scheduleGenerator.ts
```

If `moveSession` does not currently return the new session id, modify it to do so (return the inserted row's id from the insert call). This is a contract enrichment, not a behavior change. Update existing call sites if any depend on a `void` return (likely none).

- [ ] **Step 4: Implement `moveSession`**

In `mobile/src/store/sessionStore.ts`, update import:

```ts
import { _commitLink, dropSession as dropSessionDb, moveSession as moveSessionDb } from '@/lib/scheduleGenerator';
```

Replace the `moveSession` stub:

```ts
      moveSession: async (sessionId, newDate) => {
        const prev = get().byId[sessionId];
        if (!prev) throw new Error(`moveSession: session ${sessionId} not in cache`);

        const tempId: SessionId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const tempRow: PlannedSessionRow = { ...prev, id: tempId, scheduled_date: newDate, status: 'planned', activity_id: null, moved_to_id: null };

        const beforeById = get().byId;
        const beforeIdsByDate = get().idsByDate;

        // Optimistic insert + mark original moved
        set({
          byId: {
            ...beforeById,
            [sessionId]: { ...prev, status: 'moved', moved_to_id: tempId },
            [tempId]: tempRow,
          },
          idsByDate: {
            ...beforeIdsByDate,
            [newDate]: [...(beforeIdsByDate[newDate] ?? []), tempId],
          },
        });

        let realId: SessionId;
        try {
          realId = await moveSessionDb(sessionId, newDate);
        } catch (e) {
          set({
            byId: beforeById,
            idsByDate: beforeIdsByDate,
            lastError: { at: Date.now(), op: 'moveSession', message: e instanceof Error ? e.message : String(e) },
          });
          throw e;
        }

        // Swap temp id for real id
        const afterById = { ...get().byId };
        const afterIdsByDate = { ...get().idsByDate };
        delete afterById[tempId];
        afterById[realId] = { ...tempRow, id: realId };
        afterById[sessionId] = { ...afterById[sessionId], moved_to_id: realId };
        afterIdsByDate[newDate] = (afterIdsByDate[newDate] ?? []).map((id) => (id === tempId ? realId : id));

        set({ byId: afterById, idsByDate: afterIdsByDate });
        return realId;
      },
```

- [ ] **Step 5: Run test, expect pass**

```bash
npx jest __tests__/store/sessionStore.mutations.test.ts -t moveSession
```

Expected: 2 moveSession tests pass.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/store/sessionStore.ts mobile/src/lib/scheduleGenerator.ts mobile/__tests__/store/sessionStore.mutations.test.ts
git commit -m "store(sessions): moveSession with optimistic temp-id insert and post-write swap"
```

---

## Task 12: Implement `linkActivity` and `reconcileFromActivities`

**Files:**
- Modify: `mobile/src/store/sessionStore.ts`
- Test: `mobile/__tests__/store/sessionStore.mutations.test.ts`

- [ ] **Step 1: Extend the test file**

Append to `mobile/__tests__/store/sessionStore.mutations.test.ts`:

```ts
const linkActivityToSessionMock = jest.requireMock('@/lib/scheduleGenerator').linkActivityToSession as jest.Mock;

describe('sessionStore.linkActivity', () => {
  beforeEach(() => { linkActivityToSessionMock.mockClear().mockResolvedValue(undefined); });

  it('flips status to completed and sets activity_id; calls scheduleGenerator', async () => {
    await useSessionStore.getState().linkActivity('a1', 's1');
    const row = useSessionStore.getState().byId['s1'];
    expect(row.status).toBe('completed');
    expect(row.activity_id).toBe('a1');
    expect(linkActivityToSessionMock).toHaveBeenCalledWith('a1', expect.anything());
  });
});

describe('sessionStore.reconcileFromActivities', () => {
  it('returns linked: 0 with no unlinked activities (smoke test only — orchestration tested manually on-device)', async () => {
    // The action fetches activities + sessions from supabase, calls proposeLinks,
    // then _commitLink. With the supabase mock returning empty arrays, it should
    // proceed cleanly and report 0 linked.
    const result = await useSessionStore.getState().reconcileFromActivities();
    expect(result).toEqual({ linked: 0 });
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
npx jest __tests__/store/sessionStore.mutations.test.ts -t "linkActivity|reconcileFromActivities"
```

Expected: FAIL — both throw "not implemented yet".

- [ ] **Step 3: Implement both actions**

In `mobile/src/store/sessionStore.ts`, update import:

```ts
import {
  _commitLink,
  dropSession as dropSessionDb,
  moveSession as moveSessionDb,
  linkActivityToSession,
} from '@/lib/scheduleGenerator';
import { proposeLinks } from '@/lib/sessionReconciler';
```

Replace `linkActivity` stub:

```ts
      linkActivity: async (activityId, sessionId) => {
        const prev = get().byId[sessionId];
        if (!prev) return;
        set({
          byId: { ...get().byId, [sessionId]: { ...prev, status: 'completed', activity_id: activityId } },
        });
        try {
          await linkActivityToSession(activityId, sessionId);
        } catch (e) {
          set({
            byId: { ...get().byId, [sessionId]: prev },
            lastError: { at: Date.now(), op: 'linkActivity', message: e instanceof Error ? e.message : String(e) },
          });
          throw e;
        }
      },
```

Replace `reconcileFromActivities` stub:

```ts
      reconcileFromActivities: async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return { linked: 0 };

          const { data: acts, error: aErr } = await supabase
            .from('activities')
            .select('id, started_at, activity_type, duration_seconds, distance_meters')
            .eq('user_id', user.id)
            .is('planned_session_id', null)
            .neq('activity_type', 'other')
            .order('started_at');
          if (aErr) {
            set({ lastError: { at: Date.now(), op: 'reconcileFromActivities', message: aErr.message } });
            return { linked: 0 };
          }
          if (!acts?.length) return { linked: 0 };

          const { data: sess, error: sErr } = await supabase
            .from('planned_sessions')
            .select('id, scheduled_date, modality, session_label, run_structure, created_at')
            .eq('user_id', user.id)
            .eq('status', 'planned')
            .order('created_at');
          if (sErr) {
            set({ lastError: { at: Date.now(), op: 'reconcileFromActivities', message: sErr.message } });
            return { linked: 0 };
          }
          if (!sess?.length) return { linked: 0 };

          const links = proposeLinks(acts as any, sess as any);
          for (const { sessionId, activityId } of links) {
            // Optimistic in-cache update; if session is in cache, reflect immediately.
            const prev = get().byId[sessionId];
            if (prev) {
              set({ byId: { ...get().byId, [sessionId]: { ...prev, status: 'completed', activity_id: activityId } } });
            }
            try {
              await _commitLink(sessionId, activityId);
            } catch (e) {
              if (prev) set({ byId: { ...get().byId, [sessionId]: prev } });
              set({ lastError: { at: Date.now(), op: 'reconcileFromActivities', message: e instanceof Error ? e.message : String(e) } });
            }
          }
          return { linked: links.length };
        } catch (e) {
          set({ lastError: { at: Date.now(), op: 'reconcileFromActivities', message: e instanceof Error ? e.message : String(e) } });
          return { linked: 0 };
        }
      },
```

- [ ] **Step 4: Run tests, expect pass**

```bash
npx jest __tests__/store/sessionStore.mutations.test.ts
```

Expected: all mutation tests pass.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/store/sessionStore.ts mobile/__tests__/store/sessionStore.mutations.test.ts
git commit -m "store(sessions): linkActivity + reconcileFromActivities (uses proposeLinks)"
```

---

## Task 13: Build selector hooks

**Files:**
- Create: `mobile/src/hooks/useTodaySessions.ts`
- Create: `mobile/src/hooks/useWeekSessions.ts`
- Create: `mobile/src/hooks/useMonthSessions.ts`
- Create: `mobile/src/hooks/useSessionById.ts`
- Test: `mobile/__tests__/hooks/sessionHooks.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `mobile/__tests__/hooks/sessionHooks.test.tsx`:

```tsx
import React from 'react';
import { Text, View } from 'react-native';
import { render, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@/lib/supabase', () => {
  const rows = [
    { id: 's1', scheduled_date: '2026-05-25', modality: 'run', session_label: 'Easy', status: 'planned',
      block_id: null, activity_id: null, moved_to_id: null, week_number: 0, day_of_week: 0, created_at: '2026-05-20T00:00:00Z' },
    { id: 's2', scheduled_date: '2026-05-27', modality: 'strength', session_label: 'Lower', status: 'planned',
      block_id: null, activity_id: null, moved_to_id: null, week_number: 0, day_of_week: 2, created_at: '2026-05-20T00:00:00Z' },
  ];
  const builder = {
    select: () => builder, eq: () => builder, gte: () => builder, lte: () => builder, in: () => builder, is: () => builder, neq: () => builder,
    order: () => Promise.resolve({ data: rows, error: null }),
  };
  return {
    supabase: {
      from: () => builder,
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    },
  };
});

import { useSessionStore } from '@/store/sessionStore';
import { useWeekSessions } from '@/hooks/useWeekSessions';
import { useMonthSessions } from '@/hooks/useMonthSessions';
import { useSessionById } from '@/hooks/useSessionById';

beforeEach(async () => {
  await AsyncStorage.clear();
  useSessionStore.setState({
    byId: {}, idsByDate: {}, loadedRanges: [], fetching: new Set(),
    hasHydrated: true, lastError: null,
  });
});

function WeekProbe({ start }: { start: string }) {
  const { days } = useWeekSessions(start);
  return <Text testID="week">{days.map((d) => `${d.date}:${d.sessions.length}`).join('|')}</Text>;
}

function MonthProbe({ y, m }: { y: number; m: number }) {
  const { byDate } = useMonthSessions(y, m);
  return <Text testID="month">{Object.keys(byDate).sort().join(',')}</Text>;
}

function ByIdProbe({ id }: { id: string | null }) {
  const row = useSessionById(id);
  return <Text testID="byId">{row ? `${row.id}:${row.status}` : 'null'}</Text>;
}

describe('selector hooks', () => {
  it('useWeekSessions fetches the requested 7-day range and exposes per-day arrays', async () => {
    const view = render(<WeekProbe start="2026-05-25" />);
    await waitFor(() => {
      const t = view.getByTestId('week').props.children;
      expect(t).toContain('2026-05-25:1');
      expect(t).toContain('2026-05-27:1');
    });
  });

  it('useMonthSessions covers the full month range', async () => {
    const view = render(<MonthProbe y={2026} m={5} />);
    await waitFor(() => {
      const t = view.getByTestId('month').props.children;
      expect(t).toContain('2026-05-25');
      expect(t).toContain('2026-05-27');
    });
  });

  it('useSessionById returns null until session is loaded then returns row', async () => {
    const view = render(<ByIdProbe id="s1" />);
    expect(view.getByTestId('byId').props.children).toBe('null');
    await act(async () => {
      await useSessionStore.getState().ensureLoaded('2026-05-25', '2026-05-25');
    });
    await waitFor(() => expect(view.getByTestId('byId').props.children).toBe('s1:planned'));
  });

  it('useSessionById returns null when given a null id', () => {
    const view = render(<ByIdProbe id={null} />);
    expect(view.getByTestId('byId').props.children).toBe('null');
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
npx jest __tests__/hooks/sessionHooks.test.tsx
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement helpers + hooks**

Create `mobile/src/hooks/useWeekSessions.ts`:

```ts
import { useEffect, useMemo } from 'react';
import { useSessionStore } from '@/store/sessionStore';
import type { DateISO, PlannedSessionRow } from '@/store/sessionStore.types';

function addDays(iso: DateISO, n: number): DateISO {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function useWeekSessions(startDate: DateISO): {
  days:       Array<{ date: DateISO; sessions: PlannedSessionRow[] }>;
  isFetching: boolean;
} {
  const endDate = useMemo(() => addDays(startDate, 6), [startDate]);

  useEffect(() => {
    useSessionStore.getState().ensureLoaded(startDate, endDate);
  }, [startDate, endDate]);

  const byId      = useSessionStore((s) => s.byId);
  const idsByDate = useSessionStore((s) => s.idsByDate);
  const fetching  = useSessionStore((s) => s.fetching);

  return useMemo(() => {
    const days: Array<{ date: DateISO; sessions: PlannedSessionRow[] }> = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(startDate, i);
      const ids = idsByDate[d] ?? [];
      days.push({ date: d, sessions: ids.map((id) => byId[id]).filter(Boolean) });
    }
    return { days, isFetching: fetching.has(`${startDate}..${endDate}`) };
  }, [startDate, endDate, byId, idsByDate, fetching]);
}
```

Create `mobile/src/hooks/useMonthSessions.ts`:

```ts
import { useEffect, useMemo } from 'react';
import { useSessionStore } from '@/store/sessionStore';
import type { DateISO, PlannedSessionRow } from '@/store/sessionStore.types';

function monthRange(year: number, month: number): { from: DateISO; to: DateISO } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const from = `${year}-${pad(month)}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate(); // month is 1-indexed; Date(year, month, 0) = last day of previous, but month here is 1-12, so use month directly
  const to = `${year}-${pad(month)}-${pad(lastDay)}`;
  return { from, to };
}

export function useMonthSessions(year: number, month: number): {
  byDate:     Record<DateISO, PlannedSessionRow[]>;
  isFetching: boolean;
} {
  const { from, to } = useMemo(() => monthRange(year, month), [year, month]);

  useEffect(() => {
    useSessionStore.getState().ensureLoaded(from, to);
  }, [from, to]);

  const byId      = useSessionStore((s) => s.byId);
  const idsByDate = useSessionStore((s) => s.idsByDate);
  const fetching  = useSessionStore((s) => s.fetching);

  return useMemo(() => {
    const byDate: Record<DateISO, PlannedSessionRow[]> = {};
    for (const [date, ids] of Object.entries(idsByDate)) {
      if (date >= from && date <= to) {
        byDate[date] = ids.map((id) => byId[id]).filter(Boolean);
      }
    }
    return { byDate, isFetching: fetching.has(`${from}..${to}`) };
  }, [from, to, byId, idsByDate, fetching]);
}
```

Create `mobile/src/hooks/useTodaySessions.ts`:

```ts
import { useMemo } from 'react';
import { useWeekSessions } from './useWeekSessions';
import type { PlannedSessionRow } from '@/store/sessionStore.types';

function todayLocalISO(): string {
  return new Date().toLocaleDateString('en-CA');
}

function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().slice(0, 10);
}

export function useTodaySessions(): PlannedSessionRow[] {
  const today  = useMemo(() => todayLocalISO(), []);
  const monday = useMemo(() => mondayOf(today),  [today]);
  const { days } = useWeekSessions(monday);
  return days.find((d) => d.date === today)?.sessions ?? [];
}
```

Create `mobile/src/hooks/useSessionById.ts`:

```ts
import { useSessionStore } from '@/store/sessionStore';
import type { PlannedSessionRow, SessionId } from '@/store/sessionStore.types';

export function useSessionById(id: SessionId | null): PlannedSessionRow | null {
  return useSessionStore((s) => (id ? s.byId[id] ?? null : null));
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
npx jest __tests__/hooks/sessionHooks.test.tsx
```

Expected: all hook tests pass.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/hooks mobile/__tests__/hooks
git commit -m "hooks: useWeekSessions, useMonthSessions, useTodaySessions, useSessionById (cache-first selectors)"
```

---

## Task 14: Swap `WeekStrip` to consume `useWeekSessions`

**Files:**
- Modify: `mobile/src/components/ui/WeekStrip.tsx`

- [ ] **Step 1: Read current WeekStrip**

```bash
cat mobile/src/components/ui/WeekStrip.tsx
```

Identify: local `useState`, `useFocusEffect` Supabase fetch, derivation of `DayState[]` from rows.

- [ ] **Step 2: Replace fetch path with hook**

In `mobile/src/components/ui/WeekStrip.tsx`:

- Remove the `useState<DayState[]>` for fetched rows and the `useFocusEffect` Supabase block.
- Compute the Monday of the visible week (already done in the existing component — keep it).
- Replace with:

```ts
import { useWeekSessions } from '@/hooks/useWeekSessions';
import { deriveDayState } from '@/lib/dayState';

// inside the component:
const { days } = useWeekSessions(mondayISO);
const todayISO = new Date().toLocaleDateString('en-CA');
const dayStates = days.map((d) =>
  deriveDayState(d.sessions, d.date < todayISO),
);
```

Then render `dayStates` exactly as before. Preserve the load-tier label code path (today-only) by selecting `days[i]` where `d.date === todayISO`.

- [ ] **Step 3: Typecheck + run dayState tests (regression guard)**

```bash
npx tsc --noEmit && npx jest __tests__/dayState.test.ts
```

Expected: clean.

- [ ] **Step 4: On-device verification**

Run `npx expo run:ios --device`. Open the Dashboard. Verify:
- Week strip renders Mon–Sun with the same colours/icons as before.
- Completed sessions show inverted icon (Task 3's earlier DayCell change).
- Kill app, enable airplane mode, relaunch — week strip still renders from persisted cache.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/ui/WeekStrip.tsx
git commit -m "WeekStrip: consume useWeekSessions; drop local fetch + useFocusEffect"
```

---

## Task 15: Swap `MonthCalendar` to consume `useMonthSessions` + store actions

**Files:**
- Modify: `mobile/src/components/ui/MonthCalendar.tsx`

- [ ] **Step 1: Read current MonthCalendar**

```bash
sed -n '40,160p' mobile/src/components/ui/MonthCalendar.tsx
```

Identify: local `useState<Record<string, CalendarSession[]>>`, `useEffect` Supabase fetch keyed on `[userId, year, month]`, drop/move call sites that import from `scheduleGenerator`.

- [ ] **Step 2: Replace fetch path + write paths**

In `mobile/src/components/ui/MonthCalendar.tsx`:

Replace the local-state fetch with:

```ts
import { useMonthSessions } from '@/hooks/useMonthSessions';
import { useSessionStore } from '@/store/sessionStore';

// inside the component:
const { byDate } = useMonthSessions(year, month);
```

For long-press drop/move handlers, swap direct `scheduleGenerator` calls for store actions:

```ts
// drop
await useSessionStore.getState().dropSession(sessionId);

// move
await useSessionStore.getState().moveSession(sessionId, newDateISO);
```

Remove any post-mutation manual refetch — store propagation handles it.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: On-device verification**

Open the Training tab → MonthCalendar. Long-press a session → Drop. Confirm:
- Dot disappears immediately, no scroll/navigate required.
- Switch to Dashboard — WeekStrip reflects the drop (status `dropped` → DayCell falls back to its appropriate state).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/ui/MonthCalendar.tsx
git commit -m "MonthCalendar: consume useMonthSessions; drop/move via sessionStore actions"
```

---

## Task 16: Swap `SessionDetailModal` to use `useSessionById` and store actions; remove `onMutate` prop

**Files:**
- Modify: `mobile/src/components/ui/SessionDetailModal.tsx`
- Modify: any caller of `SessionDetailModal` that passes `onMutate` (audit with grep)

- [ ] **Step 1: Audit callers**

```bash
grep -rn "SessionDetailModal" mobile --include="*.tsx" | grep -v node_modules
grep -rn "onMutate" mobile/src/components/ui/SessionDetailModal.tsx
```

Note every site that passes `onMutate`.

- [ ] **Step 2: Replace in-modal fetch + writes**

In `mobile/src/components/ui/SessionDetailModal.tsx`:

- If the modal currently fetches the session by id from Supabase, replace with `useSessionById(activeSessionId)`.
- Replace drop/move/complete handlers to call `useSessionStore.getState().dropSession / moveSession / markComplete`.
- Remove the `onMutate?` prop from the component's prop interface and any internal callsite.

- [ ] **Step 3: Remove `onMutate` from callers**

For each caller identified in Step 1, delete the `onMutate={...}` prop and the associated handler if it only existed to refetch.

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 5: On-device verification — the canonical drift-bug-gone proof**

1. Open a planned session in `SessionDetailModal` from MonthCalendar.
2. Mark it complete (or drop it).
3. Dismiss the modal.
4. Without navigating, observe MonthCalendar dot updated.
5. Switch to Dashboard tab — WeekStrip's DayCell reflects the new status with no manual refresh.

This is the cross-screen propagation proof that the original drift bug is fixed.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/components/ui/SessionDetailModal.tsx <paths-of-callers-modified>
git commit -m "SessionDetailModal: useSessionById + store actions; drop onMutate prop"
```

---

## Task 17: Swap Training tab to use selector hooks

**Files:**
- Modify: `mobile/app/(app)/(tabs)/training.tsx`

- [ ] **Step 1: Read current training tab**

```bash
sed -n '100,260p' "mobile/app/(app)/(tabs)/training.tsx"
```

Identify: `loadData` function, `useFocusEffect` triggering it, anywhere it reads planned_sessions or today's sessions.

- [ ] **Step 2: Replace local state with hooks**

In `mobile/app/(app)/(tabs)/training.tsx`:

- Replace today's-sessions derivation with `const todaySessions = useTodaySessions();`.
- Replace any week-window query with `useWeekSessions(monday)`.
- Delete `loadData` and `useFocusEffect` blocks that only existed to refetch planned_sessions. Keep any other unrelated focus-effect work intact.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: On-device verification**

Open Training tab. Verify today's session hero still renders. Drop a session via MonthCalendar long-press, confirm today hero updates without leaving the screen if today is affected.

- [ ] **Step 5: Commit**

```bash
git add "mobile/app/(app)/(tabs)/training.tsx"
git commit -m "training tab: use useTodaySessions/useWeekSessions; drop manual loadData paths"
```

---

## Task 18: Wire HealthKit reconciler to call the store

**Files:**
- Modify: `mobile/src/lib/healthKitImport.ts` (line 205 — the existing `reconcileSessions` call site)

- [ ] **Step 1: Read current call site**

```bash
sed -n '190,215p' mobile/src/lib/healthKitImport.ts
```

Identify the line that currently invokes `reconcileSessions(userId, from, to)`.

- [ ] **Step 2: Replace with store call**

Update the import block in `mobile/src/lib/healthKitImport.ts`:

```ts
import { useSessionStore } from '@/store/sessionStore';
```

Replace the `reconcileSessions(...)` invocation with:

```ts
await useSessionStore.getState().reconcileFromActivities();
```

Note: `reconcileSessions` itself stays exported (other tests still depend on it). Only the import-pipeline call site moves.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: On-device verification**

With Apple Watch paired and `react-native-health` set up, do a real recorded run. Observe:
- After foregrounding the app, the imported activity appears in Activity Timeline.
- WeekStrip's DayCell for the run's local date flips to the inverted-icon completed state — with no manual refresh.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/healthKitImport.ts
git commit -m "healthKitImport: reconcile via sessionStore so completions propagate to all surfaces"
```

---

## Task 19: Final cleanup — audit remaining `planned_sessions` readers

**Files:**
- Audit + adjust any callers found

- [ ] **Step 1: Grep for direct readers**

```bash
grep -rn "from('planned_sessions')\|.from(\"planned_sessions\")" mobile/src mobile/app --include="*.tsx" --include="*.ts" | grep -v node_modules
```

- [ ] **Step 2: Triage each hit**

For each hit:
- If the reader is a UI component, route it through a selector hook (extend `useWeekSessions`/`useMonthSessions` or add a new narrow hook).
- If it's a non-UI helper (scheduleGenerator, plan creation, etc.), leave it — those write paths produce data the store consumes via `refresh`.

Document any leftover reader in a comment explaining why it's outside the store path.

- [ ] **Step 3: Remove dead code**

```bash
grep -rn "loadData\s*=\|onMutate" mobile/src mobile/app --include="*.tsx" --include="*.ts" | grep -v node_modules
```

For each match: if the function or prop existed only to compensate for the absent shared store, delete it. Be cautious — `onMutate`-style props may have other legitimate uses.

- [ ] **Step 4: Run the full test suite + typecheck**

```bash
npx jest && npx tsc --noEmit
```

Expected: green.

- [ ] **Step 5: Final on-device smoke**

Cold-start the app in airplane mode after warming the cache: Dashboard + MonthCalendar both paint from cache. Switch airplane off; observe background refresh updates them silently.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "cleanup: remove dead refetch paths replaced by sessionStore propagation"
```

---

## Done

The Phase J Ja first slice ships at the end of Task 19:

- One source of truth for `planned_sessions` across Dashboard, Training, MonthCalendar, SessionDetailModal, and the HK reconciler.
- Cache-first cold-start rendering via persist over AsyncStorage.
- `cycle` and `hike` modalities first-class across DB, types, and visual rendering.
- Same Zustand + persist + cache-first pattern ready to be templated to profile / cycle / today / week / season in subsequent Phase J slices.
