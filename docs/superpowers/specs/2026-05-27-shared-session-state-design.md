# Shared Session State — Design

**Date:** 2026-05-27
**Status:** Approved, ready for implementation plan
**Phase:** J (Local Cache + Offline Resilience), Sub-project Ja (first slice)

---

## Problem

Three surfaces — Dashboard `WeekStrip`, `MonthCalendar`, and the Training tab (including `SessionDetailModal`) — each fetch `planned_sessions` independently into local component state and never re-sync after a sibling mutates the same data. Completions, drops, and moves performed on one surface do not propagate to the others until navigation away and back, or until a specific manual refresh path runs. The HealthKit auto-link path (background reconciler → `planned_sessions.status='completed'`) writes to Supabase but signals no UI surface to refetch, so a real watch-recorded run can sit invisible on Dashboard for an arbitrary period.

Today there is no shared in-memory source of truth for session state in the mobile app.

Separately and concurrently: the modality enum (`run | strength | swim | yoga | other`) needs to grow to include `cycle` and `hike`.

## Goals

1. **One source of truth** for session state across every consuming surface. A mutation on any surface is reflected on every other surface immediately, with no manual refresh and no navigation gymnastics.
2. **Cache-first reads.** Surfaces paint instantly from cached data on warm and cold start. Network fetches happen in the background to refresh staleness; they do not block the UI.
3. **First slice of Phase J.** Establish the Zustand + persist + cache-first pattern in a single, focused store. The same template will be reused for profile, cycle, today/week aggregates, season, etc. in later slices.
4. **Add `cycle` and `hike` modalities** with first-class visual treatment, while we are already touching the relevant code.

## Non-goals (deferred to later Phase J slices)

- Offline write queue (Phase J Sub-project Jc).
- Persisting other stores — profile, cycle, today/week, season (Phase J Sub-project Jb).
- Hydration-first routing in `app/_layout.tsx` (Phase J Sub-project Ja's second half).
- Supabase realtime subscriptions on `planned_sessions`.
- Replacing AsyncStorage with MMKV.
- Schema changes beyond CHECK constraint widening.
- Visual changes beyond the modality additions.
- Mirroring `activities` rows into the store (Activity Timeline keeps its current fetch).
- Server-side `mutation_log` table.

---

## Architecture

```
UI surfaces (WeekStrip / MonthCalendar / Training / SessionDetailModal)
  └─→ selector hook (useWeekSessions / useMonthSessions / useTodaySessions / useSessionById)
        └─→ sessionStore (Zustand + persist over AsyncStorage)
              ├─→ scheduleGenerator helpers (DB writes — pure)
              └─→ AsyncStorage (persist middleware)

HealthKit observer → import pipeline → sessionStore.reconcileFromActivities()
```

**New files:**

- `src/stores/sessionStore.ts`
- `src/stores/sessionStore.types.ts`
- `src/stores/persistAdapter.ts` (shared with future Phase J stores)
- `src/hooks/useTodaySessions.ts`
- `src/hooks/useWeekSessions.ts`
- `src/hooks/useMonthSessions.ts`
- `src/hooks/useSessionById.ts`

**Modified files:**

- `src/components/ui/WeekStrip.tsx` — drops local fetch, subscribes via `useWeekSessions`.
- `src/components/ui/MonthCalendar.tsx` — drops local fetch + drop/move call sites, subscribes via `useMonthSessions`, calls store actions.
- `src/components/ui/SessionDetailModal.tsx` — uses `useSessionById`, calls store actions, `onMutate` callback prop removed.
- `app/(app)/(tabs)/training.tsx` — subscribes via hooks, removes redundant `loadData` paths.
- `src/lib/sessionReconciler.ts` — extracted into a pure `proposeLinks()` plus a thin compatibility wrapper that the store calls; old function signature removed once all callers move.
- `src/lib/scheduleGenerator.ts` — `_commitLink`, `dropSession`, `moveSession`, `linkActivityToSession` stay as pure DB helpers; no API change. Store calls them.
- `src/constants/theme.ts` — adds `slate`, `sage`, `peach` tokens.
- `src/lib/dayState.ts` — widens `Modality` union to include `cycle`, `hike`.
- `src/components/ui/DayCell.tsx` — extends `MODALITY_ICON`, `MODALITY_COLOR` for cycle, hike.
- `app/(app)/plan/[id].tsx` — `PHASE_COLOR` map consumes new tokens instead of inline literals (for the three colours that map to modalities).

**Unchanged:** Supabase schema (except CHECK widening), RLS, `dayState.ts` derivation logic, `DayCell` rendering, MonthCalendar dot styling.

---

## Data model

```ts
type DateISO = string;        // 'YYYY-MM-DD' in user's local timezone
type SessionId = string;      // planned_sessions.id

interface PlannedSessionRow {
  id:                  SessionId;
  scheduled_date:      DateISO;
  modality:            'run' | 'strength' | 'swim' | 'yoga' | 'cycle' | 'hike' | 'other';
  session_label:       string | null;
  status:              'planned' | 'completed' | 'dropped' | 'moved';
  block_id:            string | null;
  activity_id:         string | null;
  moved_to_id:         SessionId | null;
  week_number:         number;
  day_of_week:         number;
  run_structure?:      unknown;   // jsonb passthrough
  strength_structure?: unknown;
}

interface SessionState {
  byId:         Record<SessionId, PlannedSessionRow>;
  idsByDate:    Record<DateISO, SessionId[]>;
  loadedRanges: Array<{ from: DateISO; to: DateISO; fetchedAt: number }>;
  fetching:     Set<string>;
  hasHydrated:  boolean;
  lastError:    { at: number; op: string; message: string } | null;
}
```

**Why normalised:** move = new row + old row updated; drop = single status flip; complete = status + activity_id flip. A flat `byId` map handles all three without re-keying. Selectors stay cheap.

**Coverage tracking:** `loadedRanges` lets hooks decide whether a range is authoritative cache (no fetch needed within staleness window) or needs network.

**Persisted:** `byId`, `idsByDate`, `loadedRanges`. Estimated payload ceiling ~40 KB for power users.
**Not persisted:** `fetching`, `hasHydrated`, `lastError`.

**Staleness windows:**

- 0–5 min: cache trusted, no refetch.
- 5 min – 24 h: cache rendered, silent background refresh.
- > 24 h: cache rendered (better than blank), refresh prioritised.
- Mutation: subscribers re-render immediately via optimistic update; no time-based logic.

---

## Mutation API

```ts
interface SessionActions {
  hydrate():               Promise<void>;
  ensureLoaded(from, to):  Promise<void>;
  refresh(from, to):       Promise<void>;

  markComplete(sessionId, activityId): Promise<void>;
  dropSession(sessionId, reason?):     Promise<void>;
  moveSession(sessionId, newDate):     Promise<SessionId>;
  linkActivity(activityId, sessionId): Promise<void>;

  reconcileFromActivities(activityIds?): Promise<{ linked: number }>;

  clearCache():            Promise<void>;
}
```

**Every mutation follows the same optimistic pattern:**

1. Snapshot the current `byId` entry.
2. Apply the optimistic state change locally — UI re-renders instantly.
3. Await DB write via `scheduleGenerator` helper.
4. On success: reconcile with the server response (canonical row).
5. On failure: revert to snapshot, set `lastError`, throw.

**`moveSession` specifics:** schema creates a new row at the new date and marks the old `status='moved'`. Optimistic flow inserts a synthetic row with `id: 'temp_<uuid>'` at the new date, marks the old row `moved`, and on success swaps the temp id for the real id returned by the DB write. Subscribers see no flicker.

**Reconciler integration:** `sessionReconciler` is split. `proposeLinks(activities, sessions)` is a pure function that returns proposed (activity → session) links. The store's `reconcileFromActivities` action calls `proposeLinks`, then applies the writes via `_commitLink` (or its store-owned equivalent), and updates state. The HK import pipeline calls `sessionStore.getState().reconcileFromActivities(newActivityIds)` once after import. No screen needs to refetch.

**Background reconcile is NOT optimistic.** State only updates on confirmed DB write.

**Error handling:** mutations throw on failure; `lastError` is set for diagnostics. UI catches at the call site (existing `Alert.alert` paths in `SessionDetailModal` stay). No global error toast in this slice.

---

## Read API (selector hooks)

```ts
function useTodaySessions(): PlannedSessionRow[];
function useWeekSessions(startDate: DateISO): {
  days: Array<{ date: DateISO; sessions: PlannedSessionRow[] }>;
  isFetching: boolean;
};
function useMonthSessions(year: number, month: number): {
  byDate: Record<DateISO, PlannedSessionRow[]>;
  isFetching: boolean;
};
function useSessionById(id: SessionId | null): PlannedSessionRow | null;
```

- Each hook calls `ensureLoaded` for its date range on mount; surface code stays declarative.
- Each hook scopes its Zustand subscription via `shallow` equality so only date-range-relevant mutations trigger re-render.
- Cache-first contract: if any data exists for the range, return it; refresh in background if `loadedRanges.fetchedAt` is older than 5 minutes.

**Boot sequence:**

1. `app/_layout.tsx` triggers `useSessionStore.persist.rehydrate()` (synchronous for our payload size).
2. `hasHydrated` flips true. No surface waits on this flag in scope today.
3. First surface to mount calls its hook → background refresh kicks off for its range.
4. UI paints from persisted cache immediately, with no spinner.

---

## Persist & hydration

```ts
// src/stores/persistAdapter.ts
export const asyncStorageAdapter: StateStorage = {
  getItem:    (k) => AsyncStorage.getItem(k),
  setItem:    (k, v) => AsyncStorage.setItem(k, v),
  removeItem: (k) => AsyncStorage.removeItem(k),
};

// src/stores/sessionStore.ts
persist(
  (set, get) => ({ /* state + actions */ }),
  {
    name:        'virra:sessions:v1',
    storage:     createJSONStorage(() => asyncStorageAdapter),
    partialize:  (s) => ({ byId: s.byId, idsByDate: s.idsByDate, loadedRanges: s.loadedRanges }),
    version:     1,
    migrate:     (persisted, version) => /* wipe-on-bump fallback */,
    onRehydrateStorage: () => (state) => state?._setHasHydrated(true),
  }
)
```

**Versioning policy:** future schema additions to `PlannedSessionRow` bump `version`. Default `migrate` wipes (`{ byId: {}, idsByDate: {}, loadedRanges: [] }`) so the next launch refetches from Supabase.

**Storage key namespace:** `virra:` prefix for all Phase J stores to avoid collisions with Expo internals.

**Timezone correctness:** `DateISO` is always the user's local date (computed once via `Intl.DateTimeFormat`). `planned_sessions.scheduled_date` stores a bare date — no UTC conversion needed on read. Existing HK reconciler timezone handling preserved.

---

## Modality additions: cycle and hike

**DB migration (prerequisite step, ships standalone):**

Widen three CHECK constraints:

- `planned_sessions.modality` → adds `'cycle'`, `'hike'`
- `training_blocks.modality` → adds `'cycle'`, `'hike'`
- `activities.activity_type` → adds `'cycle'`, `'hike'`

Applied via Supabase MCP. No data change.

**Theme tokens added to `src/constants/theme.ts`:**

```ts
slate: '#9DB8AC',   // → swim
sage:  '#94B062',   // → hike
peach: '#F5A077',   // → cycle
```

Hex values lifted from the existing inline palette in `app/(app)/plan/[id].tsx:42-53` (planner phase colours: Recovery, Base, Taper). Naming convention: hue-based (`slate`/`sage`/`peach`) to match existing `pulse`/`heat`/`dawn`/`breath`/`mist`/`mile`/`muted`/`border`.

**Refactor side-effect:** `plan/[id].tsx` `PHASE_COLOR` map rewritten to consume `colors.slate / colors.sage / colors.peach / colors.dawn / colors.pulse / colors.heat`. The three remaining planner-only colours (Steady `#C9B68F`, Build `#D4521F`, Deload `#5BA4CF`) stay inline — they don't map to a modality. Hygiene only.

**Final `MODALITY_COLOR` and `MODALITY_ICON` in `DayCell.tsx`:**

| Modality  | Token           | Hex        | SF Symbol                  |
|-----------|-----------------|------------|----------------------------|
| run       | `pulse`         | `#D4FF26`  | `figure.run`               |
| strength  | `dawn`          | `#FF6B3D`  | `dumbbell`                 |
| swim      | `slate`         | `#9DB8AC`  | `figure.pool.swim`         |
| yoga      | `breath`        | `#F4EDE0`  | `figure.mind.and.body`     |
| cycle     | `peach`         | `#F5A077`  | `figure.outdoor.cycle`     |
| hike      | `sage`          | `#94B062`  | `figure.hiking`            |
| other     | `muted`         | rgba 50%   | `figure.mixed.cardio`      |

---

## Migration plan (ordered, each step independently verifiable)

| Step | Action | Verification gate |
|------|--------|------------------|
| 0 | DB CHECK widening for cycle/hike | Supabase migration runs; no data change |
| 1 | Theme tokens + DayCell modality map + plan/[id] PHASE_COLOR refactor | Open `plan/[id]`, phase colours unchanged |
| 2 | Build store + extract pure `proposeLinks` from reconciler | Typecheck + new unit tests green |
| 3 | Build selector hooks | Hook unit tests green |
| 4 | Swap WeekStrip to `useWeekSessions` | Dashboard renders correctly cold-start in airplane mode |
| 5 | Swap MonthCalendar to `useMonthSessions`; drop/move via store | Long-press drop reflects without scroll/refresh |
| 6 | Swap Training tab + SessionDetailModal; remove `onMutate` prop | Complete a session, switch tabs, all surfaces updated — **drift bug gone** |
| 7 | HK reconciler calls `sessionStore.reconcileFromActivities` | Real watch run lands on Dashboard without manual refresh |
| 8 | Cleanup: dead code, redundant `loadData`, audit remaining `planned_sessions` readers | Grep audit passes |

**Risks:**

- **Reconciler firing mid-interaction.** Mitigated by Zustand `shallow` selector scoping — only the affected day re-renders.
- **Other unknown readers of `planned_sessions`.** Step 2 includes a grep audit; anything outside the store path is either routed through the store or proved to be a pure DB helper unrelated to live UI state.

---

## Testing

**Unit (Jest):**

- `sessionStore.test.ts` — markComplete / dropSession / moveSession state shape, optimistic revert on rejection, `ensureLoaded` idempotency, `loadedRanges` merge.
- `proposeLinks.test.ts` — existing reconciler test coverage moved here; local-date + modality matching, HK UUID precedence (preserves `34a12a6` fix).
- `useWeekSessions.test.ts` / `useMonthSessions.test.ts` / `useTodaySessions.test.ts` — cache-first behaviour, range-change re-subscription, 5-minute staleness window with mocked clock.
- `persistAdapter.test.ts` — round-trip serialize/deserialize, version-mismatch wipe.

**Integration (on-device manual):**

Each migration step's verification gate. The Step 6 cross-screen propagation check is the canonical "drift bug is gone" proof.

---

## Out-of-scope-but-noted

- `MonthCalendar`'s opacity-only treatment for past-uncompleted sessions is visually weak. Not changing here. Future styling pass should align with the DayCell completed/planned/missed treatment.
