# Offline J2 Reads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Dashboard, Training tab, Nutrition tab, and Recipes tab genuinely cache-first — rendering immediately from whatever the phone already has, refreshing in the background, and never blocking on the network — plus a `NeedsSignal` sweep on the screens that honestly can't be cached. This is J2 of the offline-first spec's three-part delivery (J1 Foundation, already shipped and hardened; J3 Writes, the remaining outbox handlers, comes after this).

**Architecture:** Add Zustand `persist` (over the existing `asyncStorageAdapter`, matching `sessionStore.ts`'s established pattern) to `profile`, `cycle`, and `subscription`; add three brand-new persisted stores (`nutritionDay`, `recipes`, `recentFoods`); and — the one place this plan's investigation found the spec's own assumption wrong — make the Dashboard's "today" data genuinely read from `sessionStore`'s cache instead of issuing its own fresh queries, since it turned out to still be doing the latter despite the spec's table claiming otherwise.

**Tech Stack:** Same as J1 — Expo SDK 54, React Native 0.81, Zustand 5, Jest + `@testing-library/react-native`, Supabase JS.

**Spec:** `docs/superpowers/specs/2026-09-14-offline-first-design.md` §4.2 (read layer), §2 (goals — which screens are in scope vs. "needs signal"), §6 (error handling summary). Read §4.2's store table and staleness rule before starting any task — every task below implements one row of it, or a close cousin the investigation found necessary.

## Global Constraints

- Every persisted store uses the existing `mobile/src/store/persistAdapter.ts`'s `asyncStorageAdapter`, with `partialize` excluding functions and any derived/computed field (never persist something recomputable from raw data plus "now").
- **Staleness rule (spec §4.2):** under 24 hours since a store's `fetchedAt`, nothing is shown about staleness. Over 24 hours, a muted mono line ("Updated 2 days ago") appears under the screen title, using the codebase's existing relative-date helper (find it — multiple screens already show relative dates). Cached data is ALWAYS rendered regardless of age; the staleness line is additive, never a replacement for the data.
- **Never gate the paywall on cached data.** `subscription`'s persisted `status`/`trialEnd` are for display only — nothing added by this plan may use them to decide whether to show a locked/unlocked feature. RevenueCat stays the source of truth for that, unchanged.
- Every new persisted key (`virra:profile:v1`, `virra:cycle:v1`, `virra:subscription:v1`, `virra:nutrition:v1`, `virra:recipes:v1`, `virra:recent_foods:v1`) must be added to `USER_CACHE_KEYS` in `mobile/src/lib/localCaches.ts` so sign-out sweeps it — a key left off leaks to the next account on the device (card 225's bug class, repeated twice already in this codebase's history).
- `mobile/src/components/ui/NeedsSignal.tsx` already exists and is generic (`{ title, detail?, onRetry, retrying? }`) — reuse it as-is everywhere this plan calls for an honest "needs signal" state. Do not build a second version.
- Do not rename any existing store action (`load`, `loadFromSupabase`, etc.) across its call sites unless a task explicitly says to — several of these functions are called from many screens, and a rename is a much bigger, riskier diff than adding `persist` around the existing function.
- Nutrition's existing "upsert nutrition_logs as part of loading" behavior is a write mixed into a read path, and is explicitly OUT of scope for this plan (it's J3-shaped — an outbox handler, not a caching concern). Tasks touching nutrition must leave that specific upsert call exactly as it is today; only the surrounding *read* path becomes cache-first.

---

### Task 1: Persist the `profile` store

**Context:** `mobile/src/store/profile.ts` is a plain `create<ProfileState>((set) => ({...}))` with no persistence at all — the spec's claim that it "already uses persist-like manual AsyncStorage" is stale; verify this yourself and don't assume it. `load(userId)` fetches `user_profiles` and sets the fields; many screens already call `useProfileStore().load(userId)` and rely on `isLoaded` — do not rename `load` or change its call signature.

**Files:**
- Modify: `mobile/src/store/profile.ts`
- Test: `mobile/__tests__/store/profile.test.ts` (create if it doesn't already exist — check first)
- Modify: `mobile/src/lib/localCaches.ts`

**Interfaces:**
- Produces: the store gains `fetchedAt: string | null` in its state, wrapped in Zustand `persist` with `name: 'virra:profile:v1'`.
- Consumes: `asyncStorageAdapter` from `@/store/persistAdapter` (already built, used by `sessionStore.ts` — read that file's `persist(...)` config as your template for `partialize`/`version`/`onRehydrateStorage`).

- [ ] **Step 1: Read the current file in full**

Read `mobile/src/store/profile.ts` end to end (it's ~200 lines) — confirm the exact current shape of `ProfileState`, `load`, `save`, `setLocal`, `bumpWeightDataVersion`, `acknowledgeHaikuDisclosure` before wrapping anything.

- [ ] **Step 2: Write the failing test**

```ts
// mobile/__tests__/store/profile.test.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useProfileStore } from '@/store/profile';

jest.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }) },
}));

beforeEach(async () => { await AsyncStorage.clear(); });

describe('profile store persistence', () => {
  it('persists firstName/lastName/etc across a fresh store instance', async () => {
    useProfileStore.setState({ firstName: 'Emma', lastName: 'Harrison', isLoaded: true, fetchedAt: new Date().toISOString() });
    // Zustand's persist writes asynchronously; give it a tick.
    await new Promise((r) => setTimeout(r, 0));
    const raw = await AsyncStorage.getItem('virra:profile:v1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.firstName).toBe('Emma');
  });

  it('does not persist functions or the isLoaded flag', async () => {
    useProfileStore.setState({ firstName: 'Emma', isLoaded: true });
    await new Promise((r) => setTimeout(r, 0));
    const raw = await AsyncStorage.getItem('virra:profile:v1');
    const parsed = JSON.parse(raw!);
    expect(parsed.state.load).toBeUndefined();
    expect(parsed.state.isLoaded).toBeUndefined();
  });

  it('stamps fetchedAt when load() succeeds', async () => {
    const { supabase } = require('@/lib/supabase');
    supabase.from = () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({
      data: { first_name: 'Emma', last_name: 'H', avatar_url: null, steps_target: 8000, workout_preference: null,
        haiku_disclosure_acknowledged_at: null, track_weight: false, height_cm: null, date_of_birth: null, sex: null,
        injury_history: null, injury_level: null, weight_baseline_kg: null, weight_phase_bands: null,
        weight_explainer_dismissed_at: null, weight_steady_baseline_kg: null, weight_steady_baseline_computed_at: null },
    }) }) }) });
    await useProfileStore.getState().load('user-1');
    expect(useProfileStore.getState().fetchedAt).not.toBeNull();
  });

  it('a failed load() leaves fetchedAt and existing data untouched', async () => {
    useProfileStore.setState({ firstName: 'Emma', fetchedAt: '2026-09-01T00:00:00Z' });
    const { supabase } = require('@/lib/supabase');
    supabase.from = () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.reject(new Error('offline')) }) }) });
    await useProfileStore.getState().load('user-1').catch(() => {});
    expect(useProfileStore.getState().firstName).toBe('Emma');
    expect(useProfileStore.getState().fetchedAt).toBe('2026-09-01T00:00:00Z');
  });
});
```

Adjust field names/shapes to match the real `ProfileState` you read in Step 1 if this sketch drifts from it.

- [ ] **Step 2: Run to verify it fails**

Run: `cd mobile && npx jest __tests__/store/profile.test.ts`
Expected: FAIL — no persistence exists yet, and `load()` currently has no failure handling (check: does the current `load()` even guard against `data` being null on error, or would a rejected `maybeSingle()` throw uncaught out of `load()`? If it throws uncaught today, decide whether guarding it is in this task's scope — it should be, since "a failed load must not wipe existing cached data" is the whole point of this task, and the current implementation's `if (data) {...} else { set({isLoaded: true}) }` shape means a THROWN rejection from `maybeSingle()` never even reaches that check. Wrap the Supabase call in a try/catch that leaves state untouched on failure, matching the pattern in `sessionStore.ts`'s `refresh()`.)

- [ ] **Step 3: Wrap the store in `persist`, add `fetchedAt`, make `load` failure-safe**

Follow `mobile/src/store/sessionStore.ts`'s exact `persist(...)` config shape:
- `name: 'virra:profile:v1'`
- `storage: createJSONStorage(() => asyncStorageAdapter)`
- `partialize`: every data field EXCEPT the five function fields (`load`, `save`, `setLocal`, `bumpWeightDataVersion`, `acknowledgeHaikuDisclosure`) and EXCEPT `isLoaded` (a runtime flag, not data — mirrors `sessionStore`'s exclusion of `fetching`/`hasHydrated`/`lastError`)
- `version: 1`
- `onRehydrateStorage`: sets a `hasHydrated`-equivalent if you add one (check whether any screen needs to know "have we hydrated from disk yet" before first render — if `isLoaded` already serves that purpose for the online-load case, you may not need a separate flag; use your judgment, but if you add one, document why)
- Add `fetchedAt: string | null` to the state, initialized `null`, stamped with `new Date().toISOString()` at the end of a successful `load()`
- Wrap `load()`'s Supabase call in try/catch (or `.catch`) so a rejection leaves all existing state (including `fetchedAt`) untouched, per Step 2's test

- [ ] **Step 4: Run to verify tests pass**

Run: `cd mobile && npx jest __tests__/store/profile.test.ts`

- [ ] **Step 5: Add the new key to the sign-out sweep**

In `mobile/src/lib/localCaches.ts`, add `'virra:profile:v1'` to `USER_CACHE_KEYS` (it's a single fixed key per the store's `name`, not a per-user-suffixed prefix, so it goes in `USER_CACHE_KEYS` not `USER_CACHE_PREFIXES` — matching how `'virra:sessions:v1'` is listed there today).

- [ ] **Step 6: Run the full suite**

Run: `cd mobile && npm test && npx tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
git add mobile/src/store/profile.ts mobile/__tests__/store/profile.test.ts mobile/src/lib/localCaches.ts
git commit -m "feat(offline): persist the profile store, cold-start from cache"
```

---

### Task 2: Persist the `cycle` store, with derived state recomputed on rehydration

**Context:** `mobile/src/store/cycle.ts` holds `periodStart: Date | null` and `currentPackStart: Date | null` — actual `Date` objects, which do not survive a plain `JSON.stringify`/`JSON.parse` round trip (they'd need to be re-hydrated as strings and converted back). It also holds `cycleInfo`, a DERIVED value computed by `computeForProfile(...)` from the raw fields plus "today" — this must NEVER be persisted directly, because a phase computed yesterday is wrong today; the spec is explicit about this ("Phase is derived on device, never stored"). `loadFromSupabase(userId, today?)` is the existing fetch function — do not rename it or its call sites.

**Files:**
- Modify: `mobile/src/store/cycle.ts`
- Test: `mobile/__tests__/store/cycle.test.ts` (create if none exists — check first)
- Modify: `mobile/src/lib/localCaches.ts`

**Interfaces:**
- Produces: `fetchedAt: string | null` added to state; `persist` wraps the store with `name: 'virra:cycle:v1'`.

- [ ] **Step 1: Read the current file in full**

Read `mobile/src/store/cycle.ts` end to end. Identify every raw field that should persist (periodStart, currentPackStart, cycleProfile, contraceptionType, hasPlaceboWeek, cycleMode, cycleLength, periodDays, and whatever else is genuinely raw data, not derived) versus `cycleInfo` (derived, must not persist).

- [ ] **Step 2: Write the failing test**

```ts
// mobile/__tests__/store/cycle.test.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCycleStore } from '@/store/cycle';

beforeEach(async () => { await AsyncStorage.clear(); });

describe('cycle store persistence', () => {
  it('persists periodStart as a serialisable value and rehydrates it back to a Date', async () => {
    const date = new Date('2026-09-01T00:00:00.000Z');
    useCycleStore.setState({ periodStart: date });
    await new Promise((r) => setTimeout(r, 0));
    const raw = await AsyncStorage.getItem('virra:cycle:v1');
    expect(raw).not.toBeNull();
    // Whatever the serialised shape is, it must round-trip: read it back via
    // the store's own rehydration rather than asserting a specific string
    // format here, since either an ISO-string partialize+merge or a
    // JSON reviver are both valid implementations.
  });

  it('never persists cycleInfo -- it must be recomputed from raw fields, not cached stale', async () => {
    useCycleStore.setState({ periodStart: new Date('2026-09-01'), cycleInfo: { phase: 'menstrual' } as any });
    await new Promise((r) => setTimeout(r, 0));
    const raw = await AsyncStorage.getItem('virra:cycle:v1');
    const parsed = JSON.parse(raw!);
    expect(parsed.state.cycleInfo).toBeUndefined();
  });
});
```

The first test is intentionally light on asserting the exact serialised shape (see Step 3's note on picking an approach) — its real job is proving in Step 4 that a `Date` round-trips.

- [ ] **Step 3: Wrap the store, choosing a `Date` serialization strategy**

Two valid approaches — pick one and document why in a code comment:
(a) `partialize` converts `periodStart`/`currentPackStart` to ISO strings (or `null`), and a custom `merge` function (Zustand persist's `merge` option) converts them back to `Date` objects when rehydrating.
(b) A custom `storage` wrapper with a JSON `reviver`/`replacer` pair that recognizes these two fields by name.

(a) is simpler and matches how most Zustand+Date persistence is done; prefer it unless you find a concrete reason not to. Exclude `cycleInfo` from `partialize` entirely. After rehydration, recompute `cycleInfo` once (in `onRehydrateStorage`'s callback, calling the same `computeForProfile(...)` the store already uses, with `new Date()` for "today") so the very first render after a cold start has a correct, current phase — not last night's.

Add `fetchedAt: string | null`, stamped at the end of a successful `loadFromSupabase()`. Wrap its Supabase calls so a failure leaves existing state untouched (check the current function for unguarded awaits, same as Task 1's Step 2 note).

- [ ] **Step 4: Run to verify tests pass**

Run: `cd mobile && npx jest __tests__/store/cycle.test.ts`

- [ ] **Step 5: Add the new key to the sign-out sweep**

Add `'virra:cycle:v1'` to `USER_CACHE_KEYS` in `mobile/src/lib/localCaches.ts`.

- [ ] **Step 6: Run the full suite**

Run: `cd mobile && npm test && npx tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
git add mobile/src/store/cycle.ts mobile/__tests__/store/cycle.test.ts mobile/src/lib/localCaches.ts
git commit -m "feat(offline): persist the cycle store, recomputing phase fresh on every rehydration"
```

---

### Task 3: Persist the `subscription` store's display fields only

**Context:** `mobile/src/store/subscription.ts` holds `status`/`isActive`/`trialEnd` with zero persistence today. Per the Global Constraint above and spec principle 4, only `status` and `trialEnd` persist, for display continuity across a cold start (e.g. showing "Trial ends in 3 days" immediately rather than a blank state) — `isActive` is re-derived from `status` on rehydration (it's a pure function of it: `ACTIVE_STATUSES.includes(status)`), and paywall/feature gating must keep reading fresh from RevenueCat exactly as it does today. `showProFeatures` and `devOverride` already have their own separate AsyncStorage keys and must NOT be folded into this new persisted store.

**Files:**
- Modify: `mobile/src/store/subscription.ts`
- Test: `mobile/__tests__/store/subscription.test.ts` (a file with this name may already exist — check first and extend it rather than replacing it if so)
- Modify: `mobile/src/lib/localCaches.ts`

- [ ] **Step 1: Read the current file in full, and check for an existing test file**

Read `mobile/src/store/subscription.ts`. Check `mobile/__tests__/store/subscription.test.ts` — if it exists, read it and extend rather than replace.

- [ ] **Step 2: Write the failing test**

```ts
describe('subscription store persistence (display only)', () => {
  it('persists status and trialEnd, not isActive/devOverride/showProFeatures', async () => {
    useSubscriptionStore.getState().setStatus('trial', new Date('2026-10-01'));
    await new Promise((r) => setTimeout(r, 0));
    const raw = await AsyncStorage.getItem('virra:subscription:v1');
    const parsed = JSON.parse(raw!);
    expect(parsed.state.status).toBe('trial');
    expect(parsed.state.isActive).toBeUndefined();
    expect(parsed.state.devOverride).toBeUndefined();
    expect(parsed.state.showProFeatures).toBeUndefined();
  });

  it('re-derives isActive from the persisted status on rehydration, does not trust a stale cached isActive', () => {
    // isActive must never be read back from disk as a raw boolean -- it is
    // always recomputed from status via ACTIVE_STATUSES.includes(status),
    // both at setStatus() time and after rehydration.
  });
});
```

Fill in the second test's body once you've decided the rehydration mechanism in Step 3 — the point is proving `isActive` is never trusted as persisted data, only ever derived.

- [ ] **Step 3: Wrap the store**

`trialEnd` is `Date | null` — same serialization treatment as Task 2's `periodStart` (ISO string in `partialize`, converted back in `merge` or `onRehydrateStorage`). `partialize` includes only `status` and `trialEnd`. After rehydration, recompute `isActive` from the rehydrated `status`. `name: 'virra:subscription:v1'`.

- [ ] **Step 4: Run to verify tests pass, then the full suite**

Run: `cd mobile && npx jest __tests__/store/subscription.test.ts && npm test && npx tsc --noEmit`

- [ ] **Step 5: Add the new key to the sign-out sweep**

Add `'virra:subscription:v1'` to `USER_CACHE_KEYS`.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/store/subscription.ts mobile/__tests__/store/subscription.test.ts mobile/src/lib/localCaches.ts
git commit -m "feat(offline): persist subscription status/trialEnd for display continuity, never for gating"
```

---

### Task 4: Make the Dashboard's "today" data read from the cache, not a fresh query

**Context:** The spec's store table claims "today: derived from sessionStore; no key; unchanged" — this investigation found that claim false. `mobile/src/lib/todaysSession.ts`'s `getTodaysSessions(userId)` (called by the Dashboard) issues its own fresh `planned_sessions` query rather than reading `sessionStore`'s already-cached rows. The good news: the same file already has `enrichTodaysSessions(userId, plannedRows)` — an "enrichment-only variant: takes planned rows that have already been fetched (e.g. from the shared session store)" — built for exactly this purpose but never wired up to actually use the store. Separately, `mobile/src/lib/dailyTrainingContext.ts`'s `getDailyTrainingContext(userId, dateISO, phase)` has its own unguarded `planned_sessions` query with no fallback at all.

**Files:**
- Modify: `mobile/app/(app)/(tabs)/index.tsx` (the Dashboard screen)
- Modify: `mobile/src/lib/todaysSession.ts`
- Modify: `mobile/src/lib/dailyTrainingContext.ts`
- Test: whatever existing test files cover these two lib functions (check `mobile/__tests__/lib/` for `todaysSession.test.ts` / `dailyTrainingContext.test.ts` — extend if present, create if not)

- [ ] **Step 1: Read the Dashboard screen and both lib files in full**

Read `mobile/app/(app)/(tabs)/index.tsx` to find exactly where and how it currently calls `getTodaysSessions`. Read `mobile/src/lib/todaysSession.ts`'s `getTodaysSessions` and `enrichTodaysSessions` in full (both are short). Read `mobile/src/lib/dailyTrainingContext.ts`'s `getDailyTrainingContext` in full.

- [ ] **Step 2: Write the failing tests**

For `todaysSession.ts`, add a test proving the Dashboard's path now sources rows from the session store cache rather than a fresh query when one is available — the exact test shape depends on how you structure Step 3 below (e.g. a new `getTodaysSessionsFromCache(userId)` that reads `useSessionStore.getState()` and calls `enrichTodaysSessions`, versus changing the Dashboard to call `useSessionStore` directly and pass rows into `enrichTodaysSessions` itself). Pick the shape, then write:
- A test that `enrichTodaysSessions`'s three internal Supabase calls (`activities` by id, `user_profiles`, today's `activities` by date) degrade gracefully when ANY of them rejects — today they're combined in one `Promise.all`, so a single rejection currently fails the whole call. After your fix, a rejection in one must not prevent the other two's data (or sensible defaults: empty `activityMap`, baseline pace/weekly km defaults already present in the code, empty `todayActs`) from being used.
- A test that `getDailyTrainingContext`'s `planned_sessions` query, when it throws or the client rejects, falls back to reading matching rows out of `useSessionStore.getState().byId` for that `dateISO` (filtered to `status` in `['planned','completed']`, matching the original query's filter) instead of returning an empty/broken context.

- [ ] **Step 3: Run to verify tests fail**

- [ ] **Step 4: Implement**

- In `todaysSession.ts`: change `enrichTodaysSessions`'s internal `Promise.all([...])` to tolerate individual failures — wrap each of the three calls in its own `.catch()` returning the same fallback shape the code already uses when data is absent (`{ data: [] }` for the activities-by-id call, `{ data: null }`-equivalent for the profile call so `baselinePace`/`weeklyKm` fall through to their existing `?? 360`/`?? 30` defaults, `{ data: [] }` for today's activities). Do not change `enrichTodaysSessions`'s signature.
- Wire the Dashboard (or `getTodaysSessions` itself — your call on which layer is cleaner, but prefer changing `getTodaysSessions` internally so every existing caller benefits without a Dashboard-specific special case) to read today's rows from `useSessionStore.getState().byId`/`.idsByDate` first (matching the existing query's filters: `scheduled_date === today`, `status` not in `['moved','dropped']`), and only fall back to the original direct `planned_sessions` query if the session store has no data cached for today yet (e.g. right after a fresh sign-in before any range has loaded) — then pass whichever row set you got into `enrichTodaysSessions`.
- In `dailyTrainingContext.ts`: wrap the `planned_sessions` query in a try/catch (or check its error), and on failure, build `sessions` from `useSessionStore.getState().byId` filtered by `dateISO` and status, instead of leaving `sessions` empty on a network failure.

- [ ] **Step 5: Run to verify tests pass, then the full suite**

Run: `cd mobile && npm test && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add "mobile/app/(app)/(tabs)/index.tsx" mobile/src/lib/todaysSession.ts mobile/src/lib/dailyTrainingContext.ts mobile/__tests__
git commit -m "fix(offline): make the Dashboard's today-data genuinely cache-first"
```

---

### Task 5: `nutritionDay` store + cache-first Nutrition tab reads

**Context:** `mobile/app/(app)/(tabs)/nutrition.tsx` has no store abstraction at all — it reads and writes Supabase directly. Its `loadData()` function mixes a write (an unconditional upsert into `nutrition_logs` setting `targets_json`/`training_load`) into what's conceptually a "load" — per this plan's Global Constraints, that upsert stays exactly as it is; only the surrounding READ (today's `food_entries`, and whatever `loadData` returns for display) becomes cache-first. Read `mobile/src/lib/nutritionLog.ts` first — it likely already has the data-access functions this screen calls, which the new store should wrap rather than duplicating.

**Files:**
- Create: `mobile/src/store/nutritionDay.ts`
- Test: `mobile/__tests__/store/nutritionDay.test.ts`
- Modify: `mobile/app/(app)/(tabs)/nutrition.tsx`
- Modify: `mobile/src/lib/localCaches.ts`

**Interfaces:**
- Produces: `useNutritionDay` store, persisted (`name: 'virra:nutrition:v1'`), holding the last 7 days keyed by `recorded_on` (log id, `training_load`, `inferred_load`, `targets_json`, entries), each day's own `fetchedAt`. Exposes `refresh(recordedOn: string): Promise<void>`.

- [ ] **Step 1: Read `nutrition.tsx` and `nutritionLog.ts` in full**

Identify exactly which Supabase reads currently happen for "today's log" (the upsert-then-read sequence you must not touch the upsert half of), and which functions in `nutritionLog.ts` already wrap `food_entries`/`nutrition_logs` queries.

- [ ] **Step 2: Write the failing tests**

Follow `sessionStore.ts`'s persist pattern. Tests should cover: the store hydrates and renders cached entries for a `recordedOn` key before any network call; `refresh(recordedOn)` replaces that day's cached entries with fresh server data on success; a failed `refresh` leaves the cached day untouched (same "never clobber good data with a failure" rule as every other store this plan touches); `fetchedAt` is per-day, not global, since the store holds 7 days at once.

- [ ] **Step 3: Implement the store**

Mirror `sessionStore.ts`'s shape but keyed by date instead of id: `{ days: Record<string, { logId, trainingLoad, inferredLoad, targetsJson, entries, fetchedAt }> }`. `refresh(recordedOn)` wraps whatever `nutritionLog.ts` function already fetches a day's entries — do not duplicate that query logic, call the existing function. `partialize` keeps only `days`.

- [ ] **Step 4: Wire the Nutrition tab to read cache-first**

Following the pattern from spec §4.2:
```ts
const entries = useNutritionDay((s) => s.days[todayKey]?.entries ?? []);
useFocusEffect(useCallback(() => { void useNutritionDay.getState().refresh(todayKey); }, [todayKey]));
```
The existing direct `food_entries` read in the screen's `useFocusEffect` (and in `loadData` for display purposes — NOT the upsert itself) moves into the store's `refresh()`. Add the staleness line (over 24h since that day's `fetchedAt`) under the screen's date header, using the codebase's existing relative-date helper.

- [ ] **Step 5: Run tests, then the full suite**

Run: `cd mobile && npx jest __tests__/store/nutritionDay.test.ts && npm test && npx tsc --noEmit`

- [ ] **Step 6: Add the new key to the sign-out sweep**

Add `'virra:nutrition:v1'` to `USER_CACHE_KEYS`.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/store/nutritionDay.ts mobile/__tests__/store/nutritionDay.test.ts "mobile/app/(app)/(tabs)/nutrition.tsx" mobile/src/lib/localCaches.ts
git commit -m "feat(offline): add the nutritionDay store, make Nutrition tab reads cache-first"
```

---

### Task 6: `recipes` + `recentFoods` stores, cache-first Recipes tab

**Context:** `mobile/app/(app)/(tabs)/recipes.tsx` already goes through `mobile/src/lib/recipes.ts`'s functions (`fetchRecipes`, `fetchRecipeDetail`, `fetchFavouriteIds`, `toggleFavourite`) rather than calling Supabase directly — cleaner starting point than nutrition's. Per spec §4.2, `recipes` holds the recipe list, detail-by-id (filled on first open), favourite ids, and meal combos; `recentFoods` holds the last 200 distinct logged foods (name, brand, barcode, per-100g macros, last portion, last used), refreshed "after any food entry write." Note `logRecipe(...)` (in `recipes.ts`) writes into `food_entries` — the same table Task 5's `nutritionDay` store reads — so `recentFoods`'s "after any food entry write" trigger needs to fire from BOTH the nutrition-tab write path and this recipe-logging path; decide where that shared trigger point lives (a natural place: wherever a `food_entries` insert succeeds, regardless of which screen initiated it) rather than duplicating the refresh call in two unrelated files.

**Files:**
- Create: `mobile/src/store/recipes.ts`
- Create: `mobile/src/store/recentFoods.ts`
- Test: `mobile/__tests__/store/recipes.test.ts`
- Test: `mobile/__tests__/store/recentFoods.test.ts`
- Modify: `mobile/app/(app)/(tabs)/recipes.tsx`
- Modify: `mobile/src/lib/recipes.ts` (only if you decide the shared `food_entries`-write trigger point belongs here — see Context above)
- Modify: `mobile/src/lib/localCaches.ts`

- [ ] **Step 1: Read `recipes.tsx` and `recipes.ts` in full**

- [ ] **Step 2: Write failing tests for both stores**

Same pattern as prior tasks: hydrate-then-refresh, failed-refresh-leaves-cache-untouched, `fetchedAt` staleness.

- [ ] **Step 3: Implement `recipes` store**

Wraps `fetchRecipes`, `fetchRecipeDetail`, `fetchFavouriteIds`. `toggleFavourite` stays a direct online write for THIS plan (J2 is reads-only; making it outbox-backed is J3's `toggleFavourite` kind, already named in spec §4.3's table) — but the store's cached `favouriteIds` should update optimistically on a successful toggle so the UI doesn't wait for a full refetch, same optimistic-update pattern `sessionStore.ts` already uses elsewhere in this codebase.

- [ ] **Step 4: Implement `recentFoods` store**

Holds the last 200 distinct foods. Decide and document the trigger point for "after any food entry write" per the Context note above.

- [ ] **Step 5: Wire the Recipes tab to read cache-first**, with the staleness line for stale cached data.

- [ ] **Step 6: Run tests, then the full suite**

Run: `cd mobile && npx jest __tests__/store/recipes.test.ts __tests__/store/recentFoods.test.ts && npm test && npx tsc --noEmit`

- [ ] **Step 7: Add both new keys to the sign-out sweep**

Add `'virra:recipes:v1'` and `'virra:recent_foods:v1'` to `USER_CACHE_KEYS`.

- [ ] **Step 8: Commit**

```bash
git add mobile/src/store/recipes.ts mobile/src/store/recentFoods.ts mobile/__tests__/store/recipes.test.ts mobile/__tests__/store/recentFoods.test.ts "mobile/app/(app)/(tabs)/recipes.tsx" mobile/src/lib/recipes.ts mobile/src/lib/localCaches.ts
git commit -m "feat(offline): add recipes and recentFoods stores, make Recipes tab reads cache-first"
```

---

### Task 7: `NeedsSignal` sweep — Training tab's remaining unguarded reads

**Context:** The Training tab already uses `useSessionStore` and `NeedsSignal` for one part of itself (card 295's fix). This investigation found several OTHER direct, unguarded Supabase reads still in the same screen: `seasons`, `user_events`, a second `planned_sessions` query (separate from the sessionStore-backed one), `user_plans`, `activities`. None of these get a new persisted store in this plan (the spec's table doesn't list one for seasons/events) — they get the honest "needs signal" treatment instead, per spec §2's "may honestly say needs signal" list where applicable, or folded into the sessionStore-backed read where one already covers the same data.

**Files:**
- Modify: `mobile/app/(app)/(tabs)/training.tsx`
- Test: whatever existing test file covers this screen (check `mobile/__tests__/app/` for a training-tab test) — extend it

- [ ] **Step 1: Read the full current screen**

Read `mobile/app/(app)/(tabs)/training.tsx` end to end. For each of the 5 direct-read call sites found in this plan's investigation (seasons, user_events, the second planned_sessions query, user_plans, activities), determine: is this data already available from a store this plan built or J1 already built (in which case, wire it to that store instead of a new NeedsSignal), or is it genuinely a "no cache, be honest" case?

- [ ] **Step 2: Write failing tests**

For each read that becomes `NeedsSignal`-guarded: a test that a failed/erroring query renders the `NeedsSignal` component with a working retry, instead of a blank or silently-empty state (mirror however card 295's existing test in this file already does this for the read it guards).

- [ ] **Step 3: Implement**

For each of the 5 reads: either fold it into an existing cache (if one now covers the same data) or wrap its failure path in the shared `NeedsSignal` component, following the file's own established pattern from card 295.

- [ ] **Step 4: Run tests, then the full suite**

- [ ] **Step 5: Commit**

```bash
git add "mobile/app/(app)/(tabs)/training.tsx" mobile/__tests__
git commit -m "fix(offline): sweep the Training tab's remaining unguarded reads onto NeedsSignal"
```

---

### Task 8: `NeedsSignal` sweep — the remaining out-of-scope screens

**Context:** Per spec §2, these screens "may honestly say needs signal": insights narrative (unless cached — it isn't, per this plan's scope), weight screen, activity timeline, plan detail, live Open Food Facts search and barcode lookup beyond the recent-foods cache, describe-a-meal. This investigation found direct Supabase reads in `describe-meal.tsx`, `food-search.tsx`, `plan/[id].tsx`; `insights.tsx` calls an edge function via `supabase.functions.invoke` (not `.from()` — same principle applies: a failed invoke should say so, not go blank); `weight.tsx` and `timeline.tsx` likely route through lib helpers you'll need to trace.

**Files:**
- Investigate and modify as needed: `mobile/app/(app)/describe-meal.tsx`, `mobile/app/(app)/food-search.tsx`, `mobile/app/(app)/plan/[id].tsx`, `mobile/app/(app)/insights.tsx`, `mobile/app/(app)/weight.tsx`, `mobile/app/(app)/timeline.tsx` (confirm this file's actual name/path — it may be `activity-timeline.tsx` or similar, check `mobile/app/(app)/` directly)
- Test: whichever of these screens already has a test file — extend; for ones with none, use your judgment on whether adding one is proportionate (this task's primary job is the sweep, not building test infrastructure from scratch for six screens — if a screen has zero existing test coverage, wrapping its failure path in `NeedsSignal` without a new test is an acceptable, disclosed scope call, matching how J1's plan treated a similar situation)

- [ ] **Step 1: Read each of the six screens' current read-failure behavior**

For each, determine: what does the user currently see when the read/invoke fails (blank screen? silent empty state? does it already have some error handling?). Only screens with a genuinely silent or misleading failure need this task's fix — one that already shows a reasonable error doesn't need touching, note that explicitly rather than changing it anyway.

- [ ] **Step 2: Wrap each genuinely-silent failure path in `NeedsSignal`**

Same component, same "Try again" pattern as Task 7.

- [ ] **Step 3: Run the full suite**

Run: `cd mobile && npm test && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add mobile/app/\(app\)/describe-meal.tsx mobile/app/\(app\)/food-search.tsx "mobile/app/(app)/plan/[id].tsx" mobile/app/\(app\)/insights.tsx mobile/app/\(app\)/weight.tsx
git commit -m "fix(offline): sweep remaining out-of-scope screens onto NeedsSignal for honest failure"
```

(Adjust the `git add` list to whichever files you actually touched — some of the six may need no change per Step 1's finding.)

---

## Self-Review

**Spec coverage against §4.2 and §8's "J2 Reads" delivery item:**
- ✅ Persist on `profile`, `cycle`, `subscription` — Tasks 1-3
- ✅ New `nutritionDay`, `recipes`, `recentFoods` stores — Tasks 5-6
- ✅ Dashboard, Training, Nutrition, Recipes cache-first — Tasks 4-6 (Dashboard needed more than the spec assumed — see Task 4's Context)
- ✅ Staleness line — each of Tasks 5-6 (and implicitly available to Tasks 1-3's data wherever it's displayed, though no screen currently shows profile/cycle/subscription data with an explicit "as of" line beyond what's already there — note this if you find a natural place for it, but don't invent new UI just to have somewhere to put the line)
- ✅ `NeedsSignal` sweep on out-of-scope screens — Tasks 7-8

**Deliberately deferred, tracked for J3 (do not build in this plan):**
- Nutrition's upsert-on-load write, and every other write this plan's screens still make directly to Supabase (toggleFavourite, meal-combo saves, food-entry mutations) — J3's outbox handlers.
- `completeWorkout.ts`'s swallowed child-write errors (pre-existing, found during J1's hardening review) — unrelated to this plan, already tracked in memory.
- The spec §4.4 reconnect sequence — unrelated to reads, already tracked.
