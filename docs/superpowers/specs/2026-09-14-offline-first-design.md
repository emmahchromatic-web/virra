# Offline-first — design

**Date:** 2026-09-14
**Status:** approved in brainstorm, awaiting written review
**Trello:** programme card 284 (`mgp6Km41`). Related: 283 (launch, PR #100), 258 (start workout, PR #80), 253 (finish workout, PR #70, failed build 14 UAT)
**Supersedes:** the "Phase J — Local Cache + Offline Resilience" outline in `CLAUDE.md`, which this document refines

## 1. Problem

Gyms without wifi or signal are where Virra's users train, and today the app cannot be used there. Emma's report (2026-09-13): users need to see their data and workouts and manually log meals without signal. Three fixes have landed for build 15 (open the app, start a workout, finish a workout) but none is verified on device, one failed its last device test, and every other screen still reads straight from Supabase and every other write fails outright.

This is a programme, not a fix. The app needs to treat offline as a state, not an error.

## 2. Goals and non-goals

**Must work with no signal ("gym-day set + nutrition extras", Paul's ruling 2026-09-14):**

- Open the app to the dashboard as a signed-in user, including with an expired access token
- Dashboard: cycle phase, today's session, week strip, readiness
- Training tab: this week's sessions, month calendar from cached ranges
- Start, log and finish a workout (run and strength), including RPE
- Nutrition tab: today's log, entries, targets; add, edit and delete entries
- Log a meal from recent foods, from a cached recipe, or from a saved meal combo
- Recipes tab and recipe detail from cache, including favourites
- Daily check-in
- Drop or move a planned session

**May honestly say "needs signal" (a single inline state with a retry, never a blank):**

- Insights narrative (Haiku), unless a cached copy exists
- Weight screen, activity timeline, plan detail
- Live Open Food Facts search and barcode lookup beyond the recent-foods cache
- Describe-a-meal (Haiku)
- Sign-in, sign-up, subscription purchase and restore

**Non-goals:**

- A local relational database or a managed sync SDK. Approach B (SQLite mirror) and C (PowerSync) were considered and rejected for cost and risk this close to submission. Section 4.6 keeps the door open.
- Queuing HealthKit and weight imports. They are already idempotent upserts retried on every foreground.
- Offline insight regeneration or RevenueCat changes. RevenueCat's SDK caches entitlement offline; the app keeps using it as the gate.

## 3. Current state (verified against the code 2026-09-14)

| Concern | Today |
|---|---|
| Local storage | AsyncStorage only (`@react-native-async-storage/async-storage` 2.2.0). No SQLite, MMKV or SecureStore. |
| Connectivity detection | None. No NetInfo, no `navigator.onLine`. |
| Session | supabase-js persists to AsyncStorage. `app/_layout.tsx` races `getSession()` against a 4 s timeout and falls back to `readPersistedSession()` (PR #100). `startAutoRefresh` / `stopAutoRefresh` are never called. |
| Persisted stores | `sessionStore` (Zustand `persist` via `src/store/persistAdapter.ts`, key `virra:sessions:v1`). `readiness` and `notifications` hand-roll AsyncStorage. `profile`, `cycle`, `subscription`, `today`, `auth` are memory-only. |
| Data access | No repository layer. 18 files call `supabase.from()` directly; the heavy logic sits in `src/lib/*.ts` (`scheduleGenerator`, `trainingBlocks`, `recipes`, `nutritionLog`, `healthKitImport`). |
| Offline writes | `src/lib/pendingCompletions.ts`: per-user AsyncStorage FIFO of finished workouts, replayed on launch and foreground with upserts keyed on `(user_id, started_at)`. Nothing else is queued. |
| Cache clearing | `src/lib/localCaches.ts` `clearUserScopedCaches()` sweeps `USER_CACHE_KEYS` and `USER_CACHE_PREFIXES` on sign-out. |
| Exercise library | Bundled TS constant. Always available. |
| Recipes | Live Supabase reads in `src/lib/recipes.ts`; no cache. |

## 4. Design

### 4.1 Principles

1. **Offline is a state, not an error.** A failed request is never treated as a fact about the user (card 283). Not knowing is never recorded as knowing.
2. **Render local first, refresh in the background.** No in-scope screen shows a spinner when it holds cached data.
3. **One write path.** Every in-scope mutation goes through the outbox, online or offline. Online, the outbox drains immediately. A request that dies mid-flight online is retried exactly like one made in a gym.
4. **Cache is never authoritative for money.** Paywall gating reads RevenueCat's SDK, which has its own offline cache. The persisted `subscription` store is for display only.
5. **Idempotent by construction.** Every queued write carries a client-generated UUID that becomes the row id, or targets an existing unique key, so replay cannot duplicate.
6. **Server wins on conflict.** Offline edits are optimistic; the server's answer replaces them on drain.

### 4.2 Read layer: persisted stores

All persisted stores use Zustand `persist` through the existing `persistAdapter`, with `partialize` so only data (never loading flags or callbacks) is written. Each gains `fetchedAt: string | null`. Each exposes `refresh()`, which fetches, replaces state, and stamps `fetchedAt`; a failed refresh leaves the state untouched and sets nothing.

| Store | Key | Persisted data | Refresh trigger |
|---|---|---|---|
| `profile` | `virra:profile:v1` | `user_profiles` row fields already held in the store | app launch, Profile screen focus |
| `cycle` | `virra:cycle:v1` | cycle profile (period start, cycle length, overrides). Phase is derived on device, never stored. | app launch, Cycle settings save |
| `subscription` | `virra:subscription:v1` | `status`, `trialEnd` for display only | RevenueCat listener (unchanged) |
| `sessionStore` | `virra:sessions:v1` (existing) | unchanged | unchanged; already cache-first for the workout screen |
| `today` | derived from `sessionStore`; no key | unchanged | unchanged |
| `nutritionDay` (new) | `virra:nutrition:v1` | last 7 days keyed by `recorded_on`: log id, `training_load`, `inferred_load`, `targets_json`, entries | Nutrition tab focus, after any food mutation |
| `recipes` (new) | `virra:recipes:v1` | recipe list, detail by id (filled on first open), favourite ids, meal combos | Recipes tab focus, recipe detail open |
| `recentFoods` (new) | `virra:recent_foods:v1` | last 200 distinct foods logged: name, brand, barcode, per-100 g macros, last portion, last used | after any food entry write |

Pattern for a screen in scope:

```ts
const entries = useNutritionDay((s) => s.days[todayKey]?.entries ?? []);
useFocusEffect(useCallback(() => { void useNutritionDay.getState().refresh(todayKey); }, [todayKey]));
```

The screen never awaits `refresh()`. Its existing direct `supabase.from()` reads move into the store's `refresh()`.

**Staleness rule.** Under 24 hours since `fetchedAt`, nothing is shown. Over 24 hours, a muted mono line "Updated 2 days ago" under the screen title, using the existing relative-date helper. Cached data is always rendered regardless of age.

**Out-of-scope screens** keep their direct reads but adopt one shared `NeedsSignal` inline state (message + Retry) in place of any blank or silent branch, rendered when the network store says offline or the read fails. This is a sweep of the silent-failure class from cards 253 and 258, not new caching.

**Sign-out** adds the new keys to `USER_CACHE_KEYS`/`USER_CACHE_PREFIXES`. Everything under `virra:` that is per-user is swept, as today.

### 4.3 Write layer: the outbox

`src/lib/outbox.ts` generalises `pendingCompletions.ts`. Shape:

```ts
interface OutboxItem<K extends MutationKind = MutationKind> {
  id:        string;          // client UUID; doubles as the row id where the handler inserts
  kind:      K;
  payload:   MutationPayload[K];
  createdAt: string;          // ISO
  attempts:  number;
  lastError?: string;
}

type Drain = { sent: number; left: number; failed: number };

enqueue(userId, item): Promise<void>          // persists, then drains if online
drain(userId): Promise<Drain>                  // FIFO; stops on network error; dead-letters permanent errors
readOutbox(userId): Promise<OutboxItem[]>
readDeadLetters(userId): Promise<OutboxItem[]>
dismissDeadLetter(userId, id): Promise<void>
```

Storage keys: `virra:outbox:v1:<userId>` and `virra:outbox_failed:v1:<userId>`. The existing `virra:pending_completions:v1:<userId>` queue is migrated into the outbox on first read and the old key deleted.

**Handlers** live in `src/lib/outbox/handlers/<kind>.ts`, one per kind, each `(payload) => Promise<void>` performing the same ordered Supabase writes the online path performs today. The handler is the only place the writes live; screens no longer call `supabase.from()` for these mutations.

| Kind | Payload holds | Idempotency | Sub-project |
|---|---|---|---|
| `completeWorkout` | existing `QueuedRun` / `QueuedStrength` | upsert `(user_id, started_at)` (existing) | J1 (migrated) |
| `logFoodEntries` | `recorded_on`, meal type, rows with client ids | `nutrition_logs` upsert `(user_id, recorded_on)` at replay (as `getOrCreateTodayLogId` does), then `food_entries` upsert on `id` | J3 |
| `deleteFoodEntry` | entry id | delete by id; not-found is success | J3 |
| `updateFoodEntry` | entry id, quantity/macros | update by id; not-found dead-letters | J3 |
| `saveMealCombo` | combo with client id | upsert on `id` | J3 |
| `checkIn` | symptom log fields for `recorded_on` | `symptom_logs` upsert `(user_id, recorded_on)` (existing) | J3 |
| `dropSession` | session id | update status; if server status is `completed` or `moved`, skip as success | J3 |
| `moveSession` | session id, target date, new client id | as `moveSession` today; same skip rule | J3 |
| `toggleFavourite` | recipe id, desired state | upsert/delete on `(user_id, recipe_id)` | J3 |

**Drain rules.**

- FIFO per user. Items are independent enough that order only matters within one kind for the same row; FIFO guarantees that.
- A **network error** (fetch failed, timeout, 5xx) stops the drain, leaves the item at the head, increments `attempts`. Next trigger retries.
- A **permanent error** (401 after a successful token refresh, 403 RLS, 409 that the handler does not classify as success, 422, 400) moves the item to the dead-letter list with `lastError` and the drain continues.
- No maximum attempts and no expiry. An hour's workout is never discarded by a counter.
- Drain is single-flight: a second call while one is running returns the running promise.

**Triggers:** enqueue while online; NetInfo transition to online; app foreground (existing `syncPending` hook in `app/(app)/_layout.tsx`); successful sign-in for the same user id.

**Optimistic application.** Each handler has a paired `applyLocally(payload)` that updates the relevant persisted store immediately with `pending: true` on the affected row. On successful drain the store's next `refresh()` replaces the row with the server's copy. On dead-letter the local row is removed and the failure surfaced (4.5).

### 4.4 Connectivity and auth

**Network store** (`src/store/network.ts`): `isOnline: boolean`, `lastOnlineAt`. Backed by `@react-native-community/netinfo` (`isInternetReachable ?? isConnected`). NetInfo is a native module: `expo prebuild --clean` is required, per `docs/cutting-a-build.md`.

**Token refresh.** supabase-js's auto-refresh timer does not run while the app is backgrounded. Following the Supabase React Native guidance, `app/_layout.tsx` calls `supabase.auth.startAutoRefresh()` on foreground and `stopAutoRefresh()` on background. This removes the case where a user returns after hours with an expired token and the first screen's requests fail before a refresh happens.

**Reconnect sequence.** On NetInfo online transition or foreground while online:

1. `supabase.auth.getSession()` (refreshes if expired), bounded by the existing 4 s race.
2. If it yields a session, `drain(userId)`.
3. If it fails with an invalid or revoked refresh token: set `auth.needsSignIn = true`, keep the outbox untouched, route to sign-in with the message "Please sign in again to sync your changes". After sign-in, if `user.id` matches the outbox owner, drain. The outbox is keyed by user id, so a different user's sign-in can never drain it; the sign-in flow runs the existing `clearUserScopedCaches()` sweep before establishing the new session so the old user's outbox does not linger on the device.

**Offline identity.** The persisted session's `user.id` is the identity for all local reads and outbox keys, exactly as PR #100 established. An expired access token offline is expected and fine.

**Sign-out guard.** `signOut` reads the outbox first. If it is non-empty, the confirmation copy becomes "3 changes haven't synced yet. Signing out will discard them." with Cancel as the default. Online with a non-empty outbox, sign-out drains first and only warns if items remain.

### 4.5 Surfacing: the sync pill

One component, `SyncPill`, mounted once in `app/(app)/_layout.tsx` above the tab content so every screen shares it. Icon plus one word, Space Mono, no sentence:

| State | Icon (SF Symbol) | Word | Behaviour |
|---|---|---|---|
| offline | `wifi.slash` | Offline | shown while `isOnline` is false |
| syncing | `arrow.triangle.2.circlepath` | Syncing | shown while a drain is running with items left |
| synced | `checkmark` | Synced | shown for 1.5 s after a drain empties the outbox, then fades out |
| failed | `exclamationmark.triangle` | Unsaved | shown while the dead-letter list is non-empty; tap opens a sheet listing items with Dismiss |

Nothing is shown when online, idle, and nothing is failed. Rows with `pending: true` carry no per-row marker; the pill is the only indicator. Errors inside modals stay inline (`InlineError`), per card 253.

### 4.6 Containment

All in-scope reads live in store `refresh()` methods and all in-scope writes in outbox handlers. Screens touch neither `supabase.from()` nor AsyncStorage for these paths. If a later phase moves to SQLite or a sync SDK, the stores and handlers are the only files that change.

## 5. Data flow

**Log a meal offline.** Nutrition tab → recent-foods picker (cached) → `enqueue(logFoodEntries)` → `applyLocally` adds the row with `pending` to `nutritionDay` → pill shows Offline → user leaves the gym → NetInfo online → `getSession()` refreshes → `drain` → handler upserts `nutrition_logs` then `food_entries` → `nutritionDay.refresh(today)` replaces rows → pill shows Syncing then Synced, fades.

**Cold launch offline.** `_layout.tsx` races `getSession()`, falls back to the persisted session → profile check fails, user stays routed (PR #100) → tabs mount → each store hydrates synchronously from AsyncStorage → dashboard paints from `cycle`, `sessionStore`, `profile`, `readiness` → refreshes fire and fail silently → pill shows Offline.

## 6. Error handling summary

| Situation | Behaviour |
|---|---|
| Read fails, cache exists | render cache, no message unless over 24 h old |
| Read fails, no cache, in scope | screen's empty state with "Needs signal" inline + Retry |
| Read fails, out of scope | shared `NeedsSignal` inline + Retry |
| Write while offline | enqueued, applied locally, pill Offline |
| Write fails online with network error | same as offline; drains on next trigger |
| Write rejected permanently | dead-letter, local row removed, pill Unsaved |
| Token refresh rejected | keep outbox, route to sign-in, drain after same-user sign-in |
| Corrupt persisted store | persist adapter catches parse errors and starts empty; the app never fails to open on bad local data (same rule as `readPersistedSession`) |

## 7. Testing

**Unit (Jest, existing harness; 130 test files today):**

- Outbox: enqueue persists before returning; FIFO order; network error halts and keeps head; permanent error dead-letters and continues; single-flight drain; migration from `pending_completions` key; per-user isolation; sign-out sweep.
- Handlers: each replays the same writes as the former online path, asserted against a chainable Supabase mock (the fixture note on card 258 applies: mocks must support multiple `.eq()`).
- Stores: hydrate from a seeded AsyncStorage; `refresh()` failure leaves state and `fetchedAt` unchanged; `partialize` excludes flags.
- Network store: NetInfo transitions; reconnect sequence calls refresh before drain; revoked refresh token keeps outbox.
- Root layout: extend `rootLayoutOffline.test.tsx` with start/stop auto-refresh on AppState changes.
- SyncPill: state table above, including the fade after Synced.

**Device QA (aeroplane mode), recorded as steps on each Trello card:**

1. Signed in for over an hour, aeroplane mode, force quit, cold launch: dashboard, not splash, not onboarding.
2. Open today's session, log sets and RPE, finish: pill Offline, session shows complete locally.
3. Nutrition: log a recent food, a cached recipe, and a combo; delete one entry; check in.
4. Drop one session and move another in the calendar.
5. Aeroplane mode off, foreground: pill Syncing then Synced. Every change appears once in Supabase.
6. Repeat step 2 twice for one workout: one activity row.
7. Sign out offline with pending changes: warning shown; Cancel keeps them.
8. Online, break RLS for one row on purpose: pill Unsaved, sheet lists it, Dismiss clears.

## 8. Delivery

Three sub-projects, each with its own implementation plan, in this order.

**J1 Foundation.** NetInfo and network store; `SyncPill`; outbox core with `completeWorkout` migrated from `pendingCompletions`; auto-refresh wiring; reconnect-then-drain; sign-out guard; investigation of the card 253 build 14 failure, since this replaces that code. Closes 253 and 258 on device.

**J2 Reads.** Persist on `profile`, `cycle`, `subscription`; new `nutritionDay`, `recipes`, `recentFoods` stores; dashboard, training, nutrition, recipes made cache-first; staleness line; `NeedsSignal` sweep on out-of-scope screens.

**J3 Writes.** Remaining handlers with `applyLocally`; nutrition, check-in, calendar, favourites moved onto the outbox; dead-letter sheet.

J1 ships first and alone. J2 and J3 can be planned together but land as separate PRs.

## 9. Risks

- **AsyncStorage size.** Recipes with detail and 200 recent foods are tens of kilobytes; the GPS trace in a queued run is the largest item and already has a size guard from card 253. Keep that guard in the migrated handler.
- **Native module.** NetInfo needs a clean prebuild; a build cut without it will crash at import. `docs/cutting-a-build.md` gains a line.
- **Two writers for one row.** `nutritionDay` rows written by `applyLocally` and later by `refresh()`: `refresh()` must not clobber rows still pending in the outbox. Rule: `refresh()` keeps any local row whose id is still in the outbox.
- **Device verification debt.** Three offline fixes are unverified on device. J1 QA covers them; nothing in J2 or J3 starts until J1 has passed on a phone.
