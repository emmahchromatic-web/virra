# Offline J3b Writes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the remaining two write surfaces the offline-first effort deliberately deferred from J3a — food-entry logging (5 call sites, 3 files) and training-calendar drop/move (6 call sites, 3 files) — onto the outbox, so they survive a dead phone signal exactly like every other mutation in the app already does.

**Architecture:** Same outbox pattern as J1/J2/J3a: a typed `MutationKind` + handler that throws `SupabaseWriteError`, a screen/store action that tries the direct write first and enqueues on failure while keeping (never reverting) the optimistic local state, and — where the write carries local state that a background `refresh()` could otherwise clobber before the queued item lands — an overlay/preserve rule extended from the exact patterns J1/J2/J3a already established (`sessionStore.refresh`'s `local_`-prefix preserve rule for completions; J3a's `overlayQueuedToggles` for favourites). `dropSession`/`moveSession` today have the SAME "revert the optimistic UI on ANY failure, not just a permanent one" bug that J3a Task 5 just fixed for favourite-toggling — this plan applies the identical fix shape to them.

**Tech Stack:** React Native (Expo, RN 0.81.5) + Supabase (Postgres/PostgREST) + Zustand 5 (`persist` middleware) + Jest/`@testing-library/react-native`. `expo-modules-core`'s `uuid.v4()` is this codebase's established client-side UUID source (NOT `crypto.randomUUID`, which does not exist on this project's Hermes runtime — see J3a Task 4).

**Spec:** `docs/superpowers/specs/2026-09-14-offline-first-design.md` (§4.3 write layer, §9 risks/reconnect-race section). This plan implements the two write surfaces J3a's own self-review explicitly deferred as too large/risky to bundle: `logFoodEntries` and `dropSession`/`moveSession`.

## Global Constraints

- Every handler throws `SupabaseWriteError` (from `mobile/src/lib/outbox/errors.ts`) on a genuine Supabase error — never swallows, never returns a boolean. The one deliberate, pre-existing exception is documented explicitly in Task 2 below (a non-fatal cleanup delete) — do not introduce any other silent-failure path.
- `withLock` in `mobile/src/lib/outbox.ts` is NOT re-entrant. Never call anything that itself acquires the lock (`enqueue`, `drain`, `dismissDeadLetter`, `markDeadLettersReconciled`) from inside a locked section.
- Every write path (screen or store action) that needs a user identity (`userId`/`session`) MUST guard on it BEFORE attempting the direct write — not only when deciding whether to enqueue on failure. This exact bug recurred three times in J3a's first-attempt task diffs (fixed each time in a review round) — get it right the first time here.
- Screens/store actions follow "try the direct write first, enqueue + keep the optimistic state on failure" — never revert on a mere enqueue. Only a genuine dead-letter (a permanent failure) reverts optimistic state, via `syncPending.ts`'s existing dispatch-by-kind reconciliation loop (currently handles `completeWorkout` and `toggleFavourite`; this plan extends it to `dropSession` and `moveSession`).
- A dead-lettered item's revert action MUST return `boolean` (did it actually revert something) and MUST be stamped reconciled via `markDeadLettersReconciled(userId, ids)` (added in J3a's final fix wave) ONLY when the revert actually fired — never stamp on a no-op, since a no-op can mean "already reverted" (fine, was already reconciled) OR "the persisted store hasn't rehydrated yet" (must NOT be treated as permanently reconciled, or it can never self-heal). Mirror `revertLocalCompletion`/`revertLocalToggle`'s exact shape (`mobile/src/store/sessionStore.ts`, `mobile/src/store/recipes.ts`).
- Client-generated ids use `expo-modules-core`'s `uuid.v4()` — `import { uuid } from 'expo-modules-core'; const id = uuid.v4();`. Do not use `crypto.randomUUID()` anywhere (confirmed absent from this project's Hermes runtime in J3a Task 4's fix). Do not add a new dependency.
- Any store field or cached row that a background `refresh()`/list-fetch could overwrite with stale server data before a queued write lands MUST be protected by an explicit preserve/overlay rule, analogous to `sessionStore.refresh`'s `local_`-activity-id preserve check or `recipes.ts`'s `overlayQueuedToggles`. Do not assume "it'll resolve fast enough" — J3a's final review found exactly this class of bug reachable on the plain online happy path (queue head-of-line-blocked behind an earlier retryable item).
- A write whose direct-attempt failure is DETERMINISTIC and user-facing (e.g. a unique-constraint clash, an RLS violation) must be classified BEFORE deciding to enqueue, not after: on a permanent failure, revert any optimistic state immediately and surface the existing friendly error to the caller (so `catch → appAlert` UX is unchanged); only a genuinely retryable/transient failure should enqueue and keep the optimistic state. Reuse `outbox.ts`'s existing permanent-vs-retryable classification (export `isPermanentError` or an equivalent helper) rather than duplicating that logic at each new call site.
- Report test counts as ACTUAL numbers from command output, never estimates.

**This plan was independently reviewed before execution began** (by a second model, after Task 1 was already implemented and reviewed) — that review found one Critical bug already landed in Task 1 (fixed in the same fix round as a pre-existing type-narrowing issue) and several required revisions to Tasks 2-6, all incorporated into the task text above. Its most load-bearing findings: `nutritionDay.ts`'s `refresh()` needed the same queued-write overlay `recipes.ts` already has (now folded into Task 1); `moveSession`'s 23505 clash needs to revert-and-throw rather than enqueue (folded into Task 5); `pendingOps` needed to be persisted to survive a restart (folded into Task 4); and two of the three drop/move UI call sites need new auth-store wiring, not just a signature change (folded into Task 4's correction note, referenced again in Task 5).

---

### Task 1: `logFoodEntries` outbox kind + wire `food-search.tsx`'s three call sites

**Context:** `mobile/app/(app)/food-search.tsx` has three direct `supabase.from('food_entries').insert(...)` call sites with zero offline handling today — a failed insert just shows `appAlert('Could not add food', ...)` and leaves the user stuck. `food_entries.id` is `uuid default gen_random_uuid() primary key` (confirmed in `mobile/supabase/migrations/001_initial_schema.sql`), the same client-settable-id pattern J3a Task 4 (`saveMealCombo`) already used — so this can be an idempotent upsert-on-`id` the same way, with the client generating the id(s) up front so a retried/replayed write matches, rather than a plain `insert` that would duplicate on replay.

**Files:**
- Modify: `mobile/src/lib/outbox.ts`
- Create: `mobile/src/lib/outbox/handlers/logFoodEntries.ts`
- Test: `mobile/__tests__/lib/outbox/handlers/logFoodEntries.test.ts`
- Modify: `mobile/src/store/nutritionDay.ts`
- Test: add to `mobile/__tests__/store/nutritionDay.test.ts`
- Modify: `mobile/app/(app)/food-search.tsx`

**Interfaces:**
- Produces: `MutationPayloadMap.logFoodEntries: { rows: LogFoodEntryRow[] }` where `LogFoodEntryRow` matches every field any of the 5 call sites across this plan's Tasks 1-3 need (defined once here, reused by Tasks 2 and 3):
  ```ts
  import type { MealType, FoodEntrySource } from '@/lib/nutritionLog';

  export interface LogFoodEntryRow {
    id:             string;
    log_id:         string;
    meal_type:      MealType;
    food_name:      string;
    quantity_g:     number | null;
    quantity_unit:  string;
    calories:       number;
    carbs_g:        number;
    protein_g:      number;
    fat_g:          number;
    fibre_g:        number;
    nutritionix_id: string | null;
    source:         FoodEntrySource;
    haiku_input:    string | null;
    confidence:     number | null;
  }
  ```
  Export this interface from `mobile/src/lib/outbox.ts` alongside `MutationPayloadMap` (it is not a payload of its own — it is the row shape the `rows` array holds — but every task in this plan that builds a payload needs the exact same field list, so define it once, here, and import it in Tasks 2 and 3). `meal_type`/`source` use the SAME literal unions `mobile/src/lib/nutritionLog.ts`'s `FoodEntryRow` already uses (not plain `string`) — `addEntryLocal` (below) requires this narrower shape, and narrowing here also makes the outbox layer itself reject a bad/typo'd value at the `enqueue()` call site, not only inside `addEntryLocal`. `quantity_unit` is `string`, NOT `string | null` — `food_entries.quantity_unit` is `text not null default 'g' check (quantity_unit in ('g','ml'))` (`mobile/supabase/migrations/20260807000000_food_entry_quantity_unit.sql`); PostgREST does NOT substitute the column default for an explicit `null` (only for a genuinely *missing* key), so sending `null` here throws a `23502` not-null violation that dead-letters every time. Every one of this plan's 5 call sites always has a real unit to pass (`'g'`, `'ml'`, `inferUnitFromName(...)`, or an existing row's `quantity_unit ?? 'g'`) — never pass `null`.

  **Building a row literal against this interface:** a bare string literal like `source: 'haiku'` inside an object literal or `.map()` callback WIDENS to plain `string` unless the surrounding context supplies the narrower type — this will fail `tsc` against `LogFoodEntryRow.source: FoodEntrySource`. Either reference an already-narrow-typed variable (e.g. `activeMeal: MealType`, the way Task 1's own call sites do), or annotate the literal explicitly (`source: 'haiku' as const`, or type the whole row object as `LogFoodEntryRow`). Get this right at each call site as you write it — Tasks 2 and 3 both construct row literals from scratch and will hit this if the literal is left bare.
- Produces: `useNutritionDay`'s new `addEntryLocal(recordedOn: string, rows: FoodEntryRow[]): void` action, consumed by Tasks 1-3's screen wiring.

- [ ] **Step 1: Read `food-search.tsx`'s three call sites (`handleAdd` line ~389, `handleAddManual` line ~420, `handleAddCombo` line ~471) and `mobile/src/lib/outbox/handlers/saveMealCombo.ts` (the closest existing pattern — an upsert-on-client-id handler) in full.**

- [ ] **Step 2: Write the failing handler test**

```ts
// mobile/__tests__/lib/outbox/handlers/logFoodEntries.test.ts
import { handler } from '@/lib/outbox/handlers/logFoodEntries';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

describe('logFoodEntries handler', () => {
  const row = {
    id: 'e1', log_id: 'log1', meal_type: 'lunch', food_name: 'Apple',
    quantity_g: 150, quantity_unit: 'g', calories: 80, carbs_g: 20,
    protein_g: 0, fat_g: 0, fibre_g: 4, nutritionix_id: null,
    source: 'off', haiku_input: null, confidence: null,
  };

  it('upserts every row on id, not a plain insert', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    (supabase.from as jest.Mock).mockReturnValue({ upsert });
    await handler({ rows: [row] });
    expect(upsert).toHaveBeenCalledWith([row], { onConflict: 'id' });
  });

  it('a replay with the same id does not duplicate (idempotent upsert)', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    (supabase.from as jest.Mock).mockReturnValue({ upsert });
    await handler({ rows: [row] });
    await handler({ rows: [row] });
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenNthCalledWith(1, [row], { onConflict: 'id' });
    expect(upsert).toHaveBeenNthCalledWith(2, [row], { onConflict: 'id' });
  });

  it('throws SupabaseWriteError on a genuine failure', async () => {
    const upsert = jest.fn().mockResolvedValue({
      error: { message: 'row-level security policy violation', code: '42501' },
    });
    (supabase.from as jest.Mock).mockReturnValue({ upsert });
    await expect(handler({ rows: [row] })).rejects.toMatchObject({
      name: 'SupabaseWriteError',
      code: '42501',
    });
  });
});
```
Run it, confirm it fails (module doesn't exist yet).

- [ ] **Step 3: Add the kind and implement the handler**

In `mobile/src/lib/outbox.ts`, add `'logFoodEntries'` to `MutationKind` (now: `'completeWorkout' | 'checkIn' | 'deleteFoodEntry' | 'updateFoodEntry' | 'saveMealCombo' | 'toggleFavourite' | 'logFoodEntries'`), add the `LogFoodEntryRow` interface above, and add `MutationPayloadMap.logFoodEntries: { rows: LogFoodEntryRow[] }`.

`mobile/src/lib/outbox/handlers/logFoodEntries.ts`:
```ts
import { supabase } from '@/lib/supabase';
import { registerHandler, type LogFoodEntryRow } from '@/lib/outbox';
import { SupabaseWriteError } from '@/lib/outbox/errors';

export async function handler({ rows }: { rows: LogFoodEntryRow[] }): Promise<void> {
  const { error } = await supabase.from('food_entries').upsert(rows, { onConflict: 'id' });
  if (error) throw new SupabaseWriteError(error.message, { status: undefined, code: error.code, details: error.details });
}

registerHandler('logFoodEntries', handler);
```
(Match `SupabaseWriteError`'s actual constructor shape from `mobile/src/lib/outbox/errors.ts` and `saveMealCombo.ts`'s exact error-wrapping idiom — copy that file's pattern precisely rather than the sketch above if the real signature differs.)

Add the side-effect import to `mobile/app/(app)/_layout.tsx`'s handler-registration block, alongside the existing six.

- [ ] **Step 4: Add `addEntryLocal` to `nutritionDay.ts`**

```ts
addEntryLocal: (recordedOn, rows) => {
  const day = get().days[recordedOn];
  if (day) {
    set({
      days: {
        ...get().days,
        [recordedOn]: { ...day, entries: [...day.entries, ...rows] },
      },
    });
  } else {
    // The day isn't cached yet (shouldn't normally happen -- these screens only
    // ever operate on today, and today's day is loaded before a logId exists to
    // navigate here with -- but don't silently drop the entries if it does).
    set({
      days: {
        ...get().days,
        [recordedOn]: {
          logId: rows[0]?.log_id ?? null, trainingLoad: null, inferredLoad: null,
          targetsJson: null, entries: rows, fetchedAt: new Date().toISOString(),
        },
      },
    });
  }
},
```
Add the corresponding line to the `NutritionDayState` interface and a test in `mobile/__tests__/store/nutritionDay.test.ts` covering both branches (day cached → appends; day not cached → creates a minimal entry, matching `removeEntryLocal`/`updateEntryLocal`'s existing test style in that file).

**Also required in this step — a queued-write overlay in `refresh()` itself:** `nutritionDay.ts`'s `refresh()` replaces `entries` wholesale from a SUCCESSFUL server fetch, with no protection for a `logFoodEntries` item still sitting unsent in the outbox. This is the exact bug class J3a's final review found in `recipes.ts`'s `refreshFavourites` (fixed there with `overlayQueuedToggles`) — reachable on the plain online happy path when the outbox is head-of-line-blocked behind an earlier retryable item: a user adds food, it queues; before the queued item drains, `nutrition.tsx`'s focus effect calls `refresh(today)`; the server's list (not yet updated) overwrites the entry the user just saw appear. Add an `overlayQueuedFoodEntries` step to `refresh()`, mirroring `recipes.ts`'s `overlayQueuedToggles` pattern exactly: read `readOutbox(userId)` from `@/lib/outbox`, filter to `logFoodEntries` items for this user whose `rows[].log_id` matches `snapshot.logId`, and append any row not already present in the server-fetched `entries` (by `id`) before the final `set()`. Write a regression test: seed a queued `logFoodEntries` item (enqueued, not drained), call `refresh()` with a mocked server response that does NOT yet include that row, and assert the row survives in `days[recordedOn].entries`.

- [ ] **Step 5: Wire `food-search.tsx`'s three call sites**

For each of `handleAdd`, `handleAddManual`, `handleAddCombo`: generate the row's `id` (or each row's `id`, for the combo's multi-row case) via `uuid.v4()` from `expo-modules-core` BEFORE the direct `supabase.from('food_entries').insert(...)` call, include it in the inserted row(s), and on the direct insert's `error`, call `enqueue(session.user.id, 'logFoodEntries', { rows })` (matching the exact row shape from the direct insert plus the generated `id`), fire-and-forget `syncPending(session.user.id)`, then call `useNutritionDay.getState().addEntryLocal(today, rows)` (compute `today` the same way `mobile/app/(app)/(tabs)/nutrition.tsx` does: `new Date().toISOString().split('T')[0]` — this screen has no date param, but every call site here only ever operates on today's log). Call `addEntryLocal` on the SUCCESS path too (not just the failure/enqueue path) so the UI reflects the new entr(ies) immediately without waiting on `nutrition.tsx`'s next focus-triggered refresh — check whether `router.back()`'s target screen already re-fetches on focus (it does, per `nutrition.tsx`'s `useFocusEffect`) and decide whether `addEntryLocal` on the success path is still worth doing for immediate feedback even before that refetch lands; the established convention throughout this plan and J3a is to always apply the local state immediately regardless of which path (online or queued) did the work, so do that here too.

Guard `session`/`session.user.id` at the top of each handler, before the direct write, per this plan's Global Constraints — check the current code's existing `if (!logId) return;` guards and add the session guard alongside them, matching the exact shape `mobile/app/(app)/checkin.tsx`'s `handleSave` or J3a's fixed `handleDeleteEntry` use (`if (!logId || !session) return;`).

`handleAddCombo`'s existing fire-and-forget `supabase.from('meal_combos').update({ last_used_at: ... })` side effect is UNCHANGED by this task — leave it exactly as-is (it is not part of the offline-critical path; a failed touch of `last_used_at` is cosmetic and already fire-and-forget).

- [ ] **Step 6: Verify, commit**

Run: `cd mobile && npx jest __tests__/lib/outbox/handlers/logFoodEntries.test.ts __tests__/store/nutritionDay.test.ts && npm test && npx tsc --noEmit`

```bash
git add mobile/src/lib/outbox.ts mobile/src/lib/outbox/handlers/logFoodEntries.ts mobile/__tests__/lib/outbox/handlers/logFoodEntries.test.ts mobile/src/store/nutritionDay.ts mobile/__tests__/store/nutritionDay.test.ts "mobile/app/(app)/food-search.tsx"
git commit -m "feat(offline): move food-search's food-entry logging onto the outbox"
```

---

### Task 2: Wire `describe-meal.tsx`'s `handleSaveAll` onto `logFoodEntries`

**Context:** `mobile/app/(app)/describe-meal.tsx`'s `handleSaveAll` (line ~273) is harder than Task 1's three call sites: in "replace mode" it first does `supabase.from('food_entries').delete().eq('log_id', logId).eq('haiku_input', replaceHaikuInput)` (explicitly non-fatal today — the existing code comment says "A failed delete is non-fatal; we continue to insert: user can hand-delete duplicates if it matters" and only `console.warn`s on that delete's error) before inserting the new estimate's rows via a plain `insert`.

**Decision for this task (already made, not left to your judgment):** preserve the existing non-fatal-delete behavior exactly as today — this is a deliberate, pre-existing product decision predating this plan, not a new exception you are introducing. Do NOT make the delete's failure throw or block the insert. The delete-by-`(log_id, haiku_input)` criteria is itself naturally idempotent to replay (deleting an already-deleted set of rows is a no-op, the same reasoning J3a's `deleteFoodEntry` used for a not-found single-row delete) — so replaying this delete on a later drain attempt is safe even though it isn't the primary tracked mutation.

**Files:**
- Modify: `mobile/src/lib/outbox.ts` (extend `logFoodEntries`'s payload, additive)
- Modify: `mobile/src/lib/outbox/handlers/logFoodEntries.ts`
- Modify: `mobile/__tests__/lib/outbox/handlers/logFoodEntries.test.ts`
- Modify: `mobile/app/(app)/describe-meal.tsx`

**Interfaces:**
- Consumes: `LogFoodEntryRow` and the `logFoodEntries` kind from Task 1.
- Produces: `MutationPayloadMap.logFoodEntries` gains an optional field: `replaceCriteria?: { logId: string; haikuInput: string }`. This is additive to Task 1's shape — do not change the existing `rows` field.

- [ ] **Step 1: Read `describe-meal.tsx`'s `handleSaveAll` in full, and Task 1's finished `logFoodEntries.ts` handler and its test.**

- [ ] **Step 2: Extend the failing handler test**

Add to `logFoodEntries.test.ts`: a test that when `replaceCriteria` is present, the handler calls `.delete().eq('log_id', ...).eq('haiku_input', ...)` BEFORE the upsert, and that a delete error is logged (`console.warn`, matching the exact pre-existing message style from `describe-meal.tsx`'s current comment) but does NOT prevent the upsert from running or throw. A test that when `replaceCriteria` is absent (Task 1's plain case), no delete call happens at all.

- [ ] **Step 3: Extend the handler**

```ts
export async function handler({ rows, replaceCriteria }: {
  rows: LogFoodEntryRow[];
  replaceCriteria?: { logId: string; haikuInput: string };
}): Promise<void> {
  if (replaceCriteria) {
    const { error: delErr } = await supabase
      .from('food_entries')
      .delete()
      .eq('log_id', replaceCriteria.logId)
      .eq('haiku_input', replaceCriteria.haikuInput);
    if (delErr) console.warn('[logFoodEntries] failed to remove prior haiku rows:', delErr.message);
  }
  const { error } = await supabase.from('food_entries').upsert(rows, { onConflict: 'id' });
  if (error) throw new SupabaseWriteError(/* ... match Task 1's exact shape ... */);
}
```

- [ ] **Step 4: Wire `describe-meal.tsx`'s `handleSaveAll`**

Generate each new row's `id` via `uuid.v4()` before the direct delete/insert (annotate/type each row explicitly — a bare `source: 'haiku'` literal in this file's `.map()` will otherwise widen to plain `string` and fail `tsc` against `LogFoodEntryRow.source: FoodEntrySource`, per this plan's note on Task 1's interface). Keep the existing non-fatal direct delete exactly as-is (online path, unchanged). On the direct INSERT's `error` (not the delete's), call `enqueue(session.user.id, 'logFoodEntries', { rows, replaceCriteria: isReplaceMode && replaceHaikuInput ? { logId, haikuInput: replaceHaikuInput } : undefined })`, fire-and-forget `syncPending`, and call `useNutritionDay.getState().addEntryLocal(today, rows)` on both the success and the queued path (matching Task 1's convention).

**The local-cache removal of the OLD (replaced) rows — exact rule, not left to judgment:** find the old rows in the cached day via `useNutritionDay.getState().days[today]?.entries.filter(e => e.log_id === logId && e.haiku_input === replaceHaikuInput) ?? []` (both fields exist on `FoodEntryRow`), then call `removeEntryLocal(today, e.id)` for each — do this whenever the replace intent is committed, i.e. the direct delete SUCCEEDED, OR the item was enqueued WITH `replaceCriteria` set (the queued handler will run that delete when it eventually drains, so removing the old rows from the local view now is correct either way). The only case that should leave the old cached rows in place is: the direct delete failed AND the direct insert succeeded with no `replaceCriteria` enqueued (i.e., nothing is tracking that the old rows still need removing) — this is pre-existing behavior from before this task and is not something to fix here.

Note: `describe-meal.tsx` only reaches replace mode when `prefillHaikuInput === replaceHaikuInput` (an unedited re-estimate) — in that case the new rows carry the SAME `haiku_input` as the delete criteria, so a replay after a lost ack (delete ran, but the ack was lost before the outbox recorded "sent") deletes the just-inserted rows and re-upserts them with the same ids on retry — net idempotent. Two back-to-back re-estimates queued while offline resolve latest-wins, which is also correct. Write a test confirming this replay-idempotency for the common (unedited re-estimate) case.

Guard `session` at the top of `handleSaveAll`, before any write is attempted, per this plan's Global Constraints.

- [ ] **Step 5: Verify, commit**

Run: `cd mobile && npx jest __tests__/lib/outbox/handlers/logFoodEntries.test.ts && npm test && npx tsc --noEmit`

```bash
git add mobile/src/lib/outbox.ts mobile/src/lib/outbox/handlers/logFoodEntries.ts mobile/__tests__/lib/outbox/handlers/logFoodEntries.test.ts "mobile/app/(app)/describe-meal.tsx"
git commit -m "feat(offline): move describe-meal's haiku-estimated logging onto the outbox"
```

---

### Task 3: Wire `CopyMealFromDayModal.tsx`'s `copyDay` onto `logFoodEntries`

**Context:** The simplest of the three food-logging call sites — a plain multi-row `insert`, no delete/replace complication. `mobile/src/components/ui/CopyMealFromDayModal.tsx`'s `copyDay` (line ~106) copies a prior day's entries into today's log.

**Files:**
- Modify: `mobile/src/components/ui/CopyMealFromDayModal.tsx`
- Create: `mobile/__tests__/components/CopyMealFromDayModal.test.tsx` (confirmed: no test file exists for this component today — this task creates it, not extends it)

**Interfaces:**
- Consumes: `logFoodEntries` kind and `LogFoodEntryRow` from Task 1 (no further outbox/handler changes needed — this task is UI wiring only).

- [ ] **Step 1: Read `CopyMealFromDayModal.tsx`'s `copyDay` and its `Props` (for `userId`) in full.**

- [ ] **Step 2: Write the failing test**

In a new test file `mobile/__tests__/components/CopyMealFromDayModal.test.tsx` (check a sibling component's test file, e.g. `FoodEntryEditModal.test.tsx`, for this codebase's established test-setup conventions for a similar modal), add: a test that a failed direct insert calls `enqueue('u1', 'logFoodEntries', { rows: [...] })` with client-generated ids present on every row, calls `syncPending`, and still calls `addEntryLocal`/`onCopied()` (the local-first "reads as done regardless of which path did the work" convention). A test that `onCopied()` is still called on a genuine failure too (matching this plan's "never leave the user stuck" goal) — verify this is the right behavior by checking whether `onCopied()`'s caller (`nutrition.tsx`, via `reloadEntries`) does anything harmful if called when the copy is actually queued rather than confirmed (it shouldn't — it just triggers a `refresh()`, which per the established preserve/cache-on-failure pattern won't clobber the optimistic local entries).

- [ ] **Step 3: Wire it**

Generate each row's `id` via `uuid.v4()` before the direct insert. On the direct insert's `error`, call `enqueue(userId, 'logFoodEntries', { rows })`, fire-and-forget `syncPending(userId)`, then call `useNutritionDay.getState().addEntryLocal(today, rows)` (compute `today` the same way as Tasks 1/2 — this modal always copies INTO today's log per `targetLogId`'s usage). Call `addEntryLocal` on the success path too, matching the established convention. Guard `userId` (already a prop) before the direct write — check the existing `if (!targetLogId) return;` guard and confirm/add a `userId` check alongside it.

Note: `copyDay`'s existing row-building ternary `source: e.source === 'haiku' ? 'manual' : e.source` mixes a bare `'manual'` literal with an already-`FoodEntrySource`-typed `e.source` — run `tsc --noEmit` after wiring this and, if it widens to `string` against the now-narrowed `LogFoodEntryRow.source`, annotate explicitly (`as const` on the literal, or type the row object).

- [ ] **Step 4: Verify, commit**

Run: `cd mobile && npm test && npx tsc --noEmit`

```bash
git add mobile/src/components/ui/CopyMealFromDayModal.tsx mobile/__tests__/components/CopyMealFromDayModal.test.tsx
git commit -m "feat(offline): move meal-copying onto the outbox"
```

---

### Task 4: `dropSession` outbox kind + revert-on-dead-letter

**Context:** `mobile/src/store/sessionStore.ts`'s `dropSession` action (line ~175) has the exact "revert on ANY failure" bug J3a Task 5 fixed for favourite-toggling: it sets `status: 'dropped'` optimistically, calls `dropSessionDb` (a single `UPDATE planned_sessions SET status='dropped' WHERE id=...`, in `mobile/src/lib/scheduleGenerator.ts:309`), and on ANY error (network or permanent) reverts the optimistic change and re-throws. Six UI call sites across `week-ahead.tsx`, `week-move.tsx`, and `SessionDetailModal.tsx` all wrap this in `try { await ... } catch { appAlert } finally { ... }` — after this fix, a queued (not-yet-confirmed) drop must not throw, so those catches simply won't fire, which is the correct new behavior (no action needed in those 6 call sites beyond the signature change below).

An UPDATE matching zero rows resolves `{error: null}` (standard PostgREST behavior, same reasoning as J3a's `deleteFoodEntry`) — no special not-found handling needed.

**Correction to the "no action needed in those 6 call sites beyond the signature change" claim above — verified false for 2 of the 3 files, read this before Step 6:** `week-ahead.tsx` and `week-move.tsx` import NO auth store at all today (confirmed by grep — no `useAuthStore`, no `user?.id`, no `session` anywhere in either file). Passing `session.user.id` at their `dropSession(...)`/`moveSession(...)` call sites (Step 6 / Task 5 Step 6) requires first adding a `useAuthStore((s) => s.user?.id)` (or however this codebase's `useAuthStore` actually exposes the current user — check its real shape) subscription and a null guard to BOTH files — this is a small addition, not the zero-touch "just add one arg" the plan originally implied. `SessionDetailModal.tsx` already has a `userId` prop in scope (used elsewhere in the file, e.g. `getDaySessionDetail`) — only that file is genuinely a one-arg change.

Separately, `SessionDetailModal.tsx`'s drop/catch-up handlers (lines ~118-127, ~134-143) do MORE than `try/catch/finally(appAlert)` — after the `await`, both call `await reloadDetail()`, which calls `getDaySessionDetail()`, a DIRECT Supabase read of `planned_sessions` (not a `sessionStore` read). On a queued (not-yet-confirmed) drop or move, this reload reads server truth and immediately shows the session as still planned/not-moved — visibly contradicting the optimistic state this task is trying to preserve, even though the `catch` block correctly no longer fires. Handle this in Step 6: either filter `reloadDetail`'s result through `useSessionStore.getState().byId`'s optimistic status before rendering, or close the modal the way `week-move.tsx`'s equivalent flow does (`router.back()`) rather than reloading and re-showing stale-relative-to-optimistic server state. Use your judgment on which fits this modal's existing UX better, but do not leave the modal showing a status that contradicts what the user just did.

**Files:**
- Modify: `mobile/src/lib/outbox.ts`
- Create: `mobile/src/lib/outbox/handlers/dropSession.ts`
- Test: `mobile/__tests__/lib/outbox/handlers/dropSession.test.ts`
- Modify: `mobile/src/store/sessionStore.ts`
- Modify: `mobile/src/store/sessionStore.types.ts`
- Modify: `mobile/__tests__/store/sessionStore.mutations.test.ts` (NOT `sessionStore.test.ts` — that file does not exist; the real drop/move tests live in `sessionStore.mutations.test.ts`, and the `local_`-preserve pattern to mirror lives in `sessionStore.fetch.test.ts`)
- Modify: `mobile/__tests__/store/sessionStore.fetch.test.ts` (for the `refresh()` preserve-rule test)
- Modify: `mobile/src/lib/syncPending.ts`
- Modify: `mobile/__tests__/lib/syncPending.test.ts`
- Modify (signature change + new auth-store wiring for 2 of the 3 — see above): `mobile/app/(app)/week-ahead.tsx`, `mobile/app/(app)/week-move.tsx`, `mobile/src/components/ui/SessionDetailModal.tsx`

**Interfaces:**
- Produces: `MutationPayloadMap.dropSession: { sessionId: string }`.
- Produces: `SessionStoreActions.dropSession(userId: string, sessionId: SessionId): Promise<void>` — SIGNATURE CHANGE from today's `dropSession(sessionId)`. This matches the established convention from J3a's `recipes.ts`'s `toggleFavourite(userId, recipeId, next)` (userId is an explicit param, not fetched internally via `supabase.auth.getUser()` the way the current `moveSessionDb` does it) — update all 6 call sites (3 for `dropSession`, 3 for `moveSession` in Task 5) to pass `session.user.id` as the new first argument.
- Produces: `SessionStoreActions.revertLocalDrop(sessionId: SessionId): boolean` — the dead-letter revert action, mirroring `revertLocalCompletion`'s exact shape and doc-comment style.
- Produces: `SessionStoreState.pendingOps: Record<SessionId, { op: 'drop' } | { op: 'move'; newSessionId: SessionId }>` — a new store field (see Task 5 for the `move` variant; this task only needs the `drop` variant). Tracks which sessions have a locally-applied, not-yet-server-confirmed drop or move, so `refresh()` knows not to clobber them and so the dead-letter revert knows what to undo. This is functionally the same role `local_`-prefixed `activity_id` plays for completions, but drop/move have no spare field to overload this way, hence the separate map.

- [ ] **Step 1: Read `sessionStore.ts`'s `dropSession`, `applyLocalCompletion`/`revertLocalCompletion`, and `refresh()`'s preserve-rule block (lines ~90-136) in full. Read `mobile/src/lib/syncPending.ts`'s `revertDeadLetteredItems` and `markDeadLettersReconciled` usage (added in J3a's final fix wave) in full — this task's revert wiring follows the identical shape for a third kind.**

- [ ] **Step 2: Write the failing tests**

Handler test (`dropSession.test.ts`): a genuine error throws `SupabaseWriteError`; a zero-row-match update resolves without throwing (mirror `deleteFoodEntry.test.ts`'s not-found-is-success test shape).

**Store tests — REWRITE existing tests, don't just add new ones.** `mobile/__tests__/store/sessionStore.mutations.test.ts` already has `dropSession`/`moveSession` describes (around lines 79-118) that mock `@/lib/scheduleGenerator`'s `dropSession`/`moveSession` directly and use a `supabase` mock with no `update`/`upsert` methods — after this task's rewrite, that mock setup is wrong (the store no longer calls `scheduleGenerator`'s functions at all) and at least two of the existing tests (`reverts on DB failure`-style tests) assert the EXACT revert-on-any-failure behavior this task removes. Rewrite this file's mock setup to mock `supabase.from(...).update(...)` directly (matching how other rewritten stores in this codebase mock Supabase, e.g. `recipes.test.ts`), and replace the failing-assertion tests with ones matching the new behavior: `dropSession(userId, sessionId)` on a transient failure keeps the optimistic `status: 'dropped'` (no revert, no throw) and records `pendingOps[sessionId] = { op: 'drop' }`; `revertLocalDrop(sessionId)` reverts `status` back to `'planned'` and clears the `pendingOps` entry ONLY when `pendingOps[sessionId]?.op === 'drop'`, returns `false` and does nothing otherwise (already reconciled, or was never a pending drop).

In `mobile/__tests__/store/sessionStore.fetch.test.ts` (where the existing `local_`-preserve tests for completions live, around lines 84-116 — mirror their exact shape for this new case): `refresh()` for a date range containing a `pendingOps`-marked dropped session does NOT overwrite it back to `'planned'` from a stale server response that hasn't caught up yet, but DOES let a server response that agrees (`status: 'dropped'`) clear the `pendingOps` entry (matching completions' "the moment the server agrees, drop the local marker" behavior).

`syncPending.test.ts`: a dead-lettered `dropSession` item calls `revertLocalDrop` and, only on an actual revert, stamps `reconciledAt` (mirror the exact test shape used for `toggleFavourite`'s equivalent case from J3a's final fix wave).

- [ ] **Step 3: Add the kind and implement the handler**

`MutationKind` gains `'dropSession'`. `MutationPayloadMap.dropSession: { sessionId: string }`.

```ts
// mobile/src/lib/outbox/handlers/dropSession.ts
import { supabase } from '@/lib/supabase';
import { registerHandler } from '@/lib/outbox';
import { SupabaseWriteError } from '@/lib/outbox/errors';

export async function handler({ sessionId }: { sessionId: string }): Promise<void> {
  const { error } = await supabase.from('planned_sessions').update({ status: 'dropped' }).eq('id', sessionId);
  if (error) throw new SupabaseWriteError(/* match the established shape from deleteFoodEntry.ts */);
}

registerHandler('dropSession', handler);
```

Register the side-effect import in `_layout.tsx`.

- [ ] **Step 4: Extend `SessionStoreState`/`SessionStoreActions` and rewrite `dropSession`**

Add `pendingOps: Record<SessionId, { op: 'drop' } | { op: 'move'; newSessionId: SessionId }>` to `SessionStoreState` (initial value `{}`), and `revertLocalDrop(sessionId: SessionId): boolean` to `SessionStoreActions`, in `sessionStore.types.ts`. Change `dropSession`'s signature to `dropSession(userId: string, sessionId: SessionId): Promise<void>`.

**`pendingOps` MUST be persisted — add it to `partialize`** (`sessionStore.ts`'s `persist(...)` config, alongside `byId`/`idsByDate`/`loadedRanges`) and to `initialState` (so `clearCache()` resets it on sign-out, matching every other field there). Without this, an app restart between the optimistic drop and the outbox draining loses the marker entirely: `byId`/`idsByDate` ARE persisted (so the dropped-looking row survives restart), but with no `pendingOps` entry the next `refresh()` immediately flips it back to `'planned'` before the queued item has a chance to land — silently undoing the drop the user thinks already happened. This is exactly why the `local_`-activity-id trick works across restarts (the marker lives inside the persisted row itself); `pendingOps` needs the same durability since drop/move have no spare field to overload that way.

```ts
dropSession: async (userId, sessionId) => {
  if (!userId) throw new Error('dropSession: no user id');
  const prev = get().byId[sessionId];
  if (!prev) return;
  set({
    byId: { ...get().byId, [sessionId]: { ...prev, status: 'dropped' } },
    pendingOps: { ...get().pendingOps, [sessionId]: { op: 'drop' } },
  });
  const { error } = await supabase.from('planned_sessions').update({ status: 'dropped' }).eq('id', sessionId);
  if (error) {
    await enqueue(userId, 'dropSession', { sessionId });
    syncPending(userId);
    // Keep the optimistic drop and the pendingOps marker -- do NOT revert here.
    // Only a genuine dead-letter (via syncPending's reconciliation) reverts it.
  } else {
    const next = { ...get().pendingOps };
    delete next[sessionId];
    set({ pendingOps: next });
  }
},
revertLocalDrop: (sessionId) => {
  const prev = get().byId[sessionId];
  const pending = get().pendingOps[sessionId];
  if (!prev || !pending || pending.op !== 'drop') return false;
  const nextOps = { ...get().pendingOps };
  delete nextOps[sessionId];
  set({
    byId: { ...get().byId, [sessionId]: { ...prev, status: 'planned' } },
    pendingOps: nextOps,
  });
  return true;
},
```
(Import `enqueue` and `syncPending` at the top of the file — check whether this introduces a circular import the way J3a's `recipes.ts` ↔ `syncPending.ts` did, and confirm it resolves the same safe way — J3a's final review verified that pattern is fine because both references are only dereferenced inside function bodies, well after module init; keep it that way here too, don't import either at module-evaluation time in a way that would matter. This import ALSO means the store comment at `sessionStore.ts` lines ~24-31, explaining why `LOCAL_ACTIVITY_PREFIX` exists as "the only tell `refresh()` has ... short of importing the outbox itself -- which would tie this store to the write layer it is deliberately independent of", becomes FALSE once this task imports `enqueue`/`syncPending` — update or remove that claim in the same diff rather than leaving a stale, now-incorrect comment in the file.)

Extend `refresh()`'s preserve block: today it only checks `isLocallyCompleted`. Add an equivalent check for `pendingOps[id]?.op === 'drop'` — preserve the row (don't overwrite from server) UNLESS the server's row for that id already shows `status: 'dropped'`, in which case let the server row win AND clear the `pendingOps` entry (matching completions' exact "server caught up" clearing behavior at line ~116).

- [ ] **Step 5: Wire dead-letter reversion in `syncPending.ts`**

Add an `isDropSession` type guard (mirror `isToggleFavourite`'s shape) and a branch in `revertDeadLetteredItems` calling `useSessionStore.getState().revertLocalDrop(item.payload.sessionId)`, following the exact `reverted`-array/stamp-only-on-`true` pattern already there for `completeWorkout`/`toggleFavourite`.

- [ ] **Step 6: Update the 3 call sites' signature (and add auth-store access to 2 of them — see the correction note at the top of this task)**

`week-ahead.tsx`, `week-move.tsx`: add a `useAuthStore` subscription for the current user id (check `mobile/src/store/auth.ts` for its real exposed shape) plus a null guard, then change each `dropSession(sessionId)` call to `dropSession(userId, sessionId)`. `SessionDetailModal.tsx`: already has `userId` in scope — change `dropSession(sessionId)` to `dropSession(userId, sessionId)` directly, and address the `reloadDetail()`-shows-stale-state issue described above.

- [ ] **Step 7: Verify, commit**

Run: `cd mobile && npx jest __tests__/lib/outbox/handlers/dropSession.test.ts __tests__/store/sessionStore.mutations.test.ts __tests__/store/sessionStore.fetch.test.ts __tests__/lib/syncPending.test.ts && npm test && npx tsc --noEmit`

```bash
git add mobile/src/lib/outbox.ts mobile/src/lib/outbox/handlers/dropSession.ts mobile/__tests__/lib/outbox/handlers/dropSession.test.ts mobile/src/store/sessionStore.ts mobile/src/store/sessionStore.types.ts mobile/__tests__/store/sessionStore.mutations.test.ts mobile/__tests__/store/sessionStore.fetch.test.ts mobile/src/lib/syncPending.ts mobile/__tests__/lib/syncPending.test.ts "mobile/app/(app)/week-ahead.tsx" "mobile/app/(app)/week-move.tsx" mobile/src/components/ui/SessionDetailModal.tsx
git commit -m "feat(offline): move session-dropping onto the outbox, revert only on dead-letter"
```

---

### Task 5: `moveSession` outbox kind + idempotent redesign + revert-on-dead-letter

**Context:** The hardest task in this plan. `mobile/src/lib/scheduleGenerator.ts`'s `moveSession` (line ~317) does THREE network round trips: (1) SELECT the original session's fields, (2) INSERT a new row on the target date, (3) UPDATE the original row to `status: 'moved', moved_to_id: <new id>`. This is not naturally idempotent — a replay after a partial success (step 2 succeeded, the process died before step 3, or before the outbox recorded "sent") would INSERT A SECOND new row. It also does its own redundant network SELECT for data `sessionStore.ts`'s `moveSession` action ALREADY HAS CACHED (`prev = get().byId[sessionId]` already holds `week_number, modality, session_label, block_id, run_structure, strength_structure` — the exact fields `moveSessionDb`'s SELECT re-fetches over the network).

**The fix (already designed, follow this exactly):**
1. Eliminate the handler-side SELECT entirely — the store already has every field the new row needs, cached, at the moment `moveSession` is called. Pass them all in the payload.
2. Generate the new row's id CLIENT-SIDE up front (`uuid.v4()`), and make step 2 an `upsert(..., {onConflict:'id'})` instead of a plain `insert` — this makes step 2 idempotent on replay (same id → same row, not a duplicate), and removes the "swap the temp id for the real id" dance the current store code does (`sessionStore.ts` lines ~195-237) since the id chosen at enqueue time IS the final id from the start.
3. Step 3 (marking the original row `moved`) is already naturally idempotent — setting `status:'moved', moved_to_id:X` again is a no-op if it's already set to the same values.
4. **The 23505 unique-violation case needs SPECIAL HANDLING at the store level — this is a correction to an earlier draft of this plan, read carefully.** A same-day, same-modality-and-label clash (`planned_sessions_no_clash_idx`, a partial unique index scoped to `status in ('planned','completed')`) is a common, user-triggerable, DETERMINISTIC outcome — not a connectivity failure — and today's code immediately reverts the optimistic move and shows a specific friendly message ("That day already has a run session (tempo). Two identical sessions can't share a day. Move the existing one first."). If the store's direct-attempt path treats a 23505 exactly like any other error (enqueue + keep optimistic), the user sees the move as "done", then a moment later the drain dead-letters it and `revertLocalMove` silently snaps it back with only a generic "We couldn't save this one" dead-letter sheet entry — a real UX regression on a common path. **Fix:** in the store action's direct-attempt path (Step 4 below), check the upsert error's `code` BEFORE deciding whether to enqueue — on a `23505` (or more generally, whatever the codebase's `isPermanentError`/`PERMANENT_CODE` logic already treats as permanent — consider exporting that check from `outbox.ts` and reusing it here rather than duplicating the regex), revert the optimistic state immediately (call `revertLocalMove` yourself, inline) and re-throw the existing friendly error message so the 6 call sites' `catch → appAlert` still fires exactly as it does today. Only a genuinely retryable/transient error should enqueue. Apply the identical classify-before-enqueue rule to `dropSession` (Task 4) too, for consistency, even though no realistic user path triggers a permanent error there today.

**Files:**
- Modify: `mobile/src/lib/outbox.ts`
- Create: `mobile/src/lib/outbox/handlers/moveSession.ts`
- Test: `mobile/__tests__/lib/outbox/handlers/moveSession.test.ts`
- Modify: `mobile/src/store/sessionStore.ts`
- Modify: `mobile/src/store/sessionStore.types.ts`
- Modify: `mobile/__tests__/store/sessionStore.mutations.test.ts` (rewrite the existing `moveSession` describe block — same reasoning as Task 4: it mocks `scheduleGenerator.moveSession` and the old temp/real-id-swap behavior, both gone after this task)
- Modify: `mobile/__tests__/store/sessionStore.fetch.test.ts` (the `refresh()` preserve-rule tests for the `move` case)
- Modify: `mobile/src/lib/syncPending.ts`
- Modify: `mobile/__tests__/lib/syncPending.test.ts`
- Modify (signature change; `week-ahead.tsx`/`week-move.tsx` also need the same new auth-store wiring described in Task 4): `mobile/app/(app)/week-ahead.tsx`, `mobile/app/(app)/week-move.tsx`, `mobile/src/components/ui/SessionDetailModal.tsx`
- Delete (confirmed genuinely dead after this task — see Step 7): `mobile/src/lib/scheduleGenerator.ts`'s `moveSession`/`dropSession` exports, and `mobile/__tests__/lib/scheduleGeneratorMove.test.ts` (tests `scheduleGenerator.moveSession` directly; becomes a test of dead code once this task lands)

**Interfaces:**
- Consumes: `pendingOps` (from Task 4) — extends its `move` variant's usage.
- Produces: `MutationPayloadMap.moveSession`:
  ```ts
  {
    sessionId:         string;
    newSessionId:      string;   // client-generated, the final id -- no temp/real swap
    newDate:           string;   // 'YYYY-MM-DD'
    userId:            string;
    blockId:           string | null;
    weekNumber:         number;
    dayOfWeek:          number;   // computed client-side from newDate, same UTC-day math as today's moveSessionDb
    modality:           string;
    sessionLabel:       string | null;
    runStructure:       unknown;
    strengthStructure:  unknown;
  }
  ```
- Produces: `SessionStoreActions.moveSession(userId: string, sessionId: SessionId, newDate: DateISO): Promise<SessionId>` — same return type as today (the final session id — now always immediately known, since it's client-generated, not swapped in later).
- Produces: `SessionStoreActions.revertLocalMove(sessionId: SessionId): boolean` — undoes BOTH halves: removes the `newSessionId` row from `byId`/`idsByDate`, and restores the original row's `status`/`moved_to_id` to their pre-move values.

- [ ] **Step 1: Read `sessionStore.ts`'s current `moveSession` (lines ~191-238) and `scheduleGenerator.ts`'s `moveSession`/`dropSession` (lines ~309-365) in full. Read Task 4's finished `dropSession`/`revertLocalDrop`/`pendingOps` wiring — this task extends the same `pendingOps` map with the `move` variant.**

- [ ] **Step 2: Write the failing tests**

**`expo-modules-core` jest setup — required before any test calling `moveSession` can pass.** `import { uuid } from 'expo-modules-core'; uuid.v4()` reads `globalThis.expo.uuidv4` at call time and THROWS if it's absent (`node_modules/expo-modules-core/src/uuid/index.ts`) — neither `jest.setup.env.js` nor `jest.setup.after.js` shims this today (only two, currently-untested, screens call it in production code, so this has never surfaced). Add `jest.mock('expo-modules-core', () => ({ uuid: { v4: jest.fn(() => 'new-session-id') } }))` at the top of `sessionStore.mutations.test.ts` (or wherever `moveSession` is tested) before writing any test that exercises it.

Handler test (`moveSession.test.ts`): the handler calls `.upsert({id: newSessionId, ...}, {onConflict:'id'})` then `.update({status:'moved', moved_to_id: newSessionId}).eq('id', sessionId)`, in that order; a replay with the same payload does not create a second row (assert `upsert` called with the identical `id` both times); a `23505` error from the upsert step throws `SupabaseWriteError` with `code: '23505'` set; a genuine error from the second (update) step also throws.

Store test: `moveSession(userId, sessionId, newDate)` generates the new row directly with its final id (no `temp_` prefix appears anywhere in `byId`/`idsByDate` at any point — assert this explicitly, since removing the temp/real swap is a real behavior change from today's code), keeps the optimistic move (both the new row and the original's `moved`/`moved_to_id` state) on a TRANSIENT failure without reverting, and records `pendingOps[sessionId] = { op: 'move', newSessionId }`. A SEPARATE test: a `23505`-coded failure on the direct upsert attempt REVERTS the optimistic move immediately (both rows) and re-throws the existing friendly clash message — matching today's behavior — rather than enqueueing (this is the Step 4 correction above; a test that only checks the transient case would miss this regression class entirely). `revertLocalMove(sessionId)` removes the new row entirely, restores the original row's `status`/`moved_to_id`, ALSO clears any `pendingOps[newSessionId]` entry if one exists (see the leak note in Step 4 below), and returns `false` if `pendingOps[sessionId]?.op !== 'move'`. `refresh()` for a range containing the ORIGINAL session's date preserves it while `pendingOps[id]?.op === 'move'` (mirroring the drop case), and — this is the part J3a's final review specifically flagged as easy to miss for an analogous bug — a SEPARATE `refresh()` call for a range containing the NEW session's date (`newDate`, which may be a different week than the one currently being viewed) does not delete the optimistically-inserted new row just because the server hasn't confirmed it yet either; write a test that calls `refresh()` for `newDate`'s range with a server response that does NOT yet include `newSessionId`, and asserts the row survives.

`syncPending.test.ts`: a dead-lettered `moveSession` item calls `revertLocalMove` and stamps `reconciledAt` only on an actual revert (mirror the established shape).

- [ ] **Step 3: Add the kind and implement the handler**

```ts
// mobile/src/lib/outbox/handlers/moveSession.ts
import { supabase } from '@/lib/supabase';
import { registerHandler } from '@/lib/outbox';
import { SupabaseWriteError } from '@/lib/outbox/errors';

export async function handler(payload: {
  sessionId: string; newSessionId: string; newDate: string; userId: string;
  blockId: string | null; weekNumber: number; dayOfWeek: number;
  modality: string; sessionLabel: string | null;
  runStructure: unknown; strengthStructure: unknown;
}): Promise<void> {
  const { error: upsertErr } = await supabase.from('planned_sessions').upsert({
    id: payload.newSessionId, user_id: payload.userId, block_id: payload.blockId,
    scheduled_date: payload.newDate, week_number: payload.weekNumber, day_of_week: payload.dayOfWeek,
    modality: payload.modality, session_label: payload.sessionLabel, status: 'planned',
    run_structure: payload.runStructure, strength_structure: payload.strengthStructure,
  }, { onConflict: 'id' });
  if (upsertErr) throw new SupabaseWriteError(/* include upsertErr.code -- 23505 must survive to isPermanentError */);

  const { error: updateErr } = await supabase.from('planned_sessions')
    .update({ status: 'moved', moved_to_id: payload.newSessionId })
    .eq('id', payload.sessionId);
  if (updateErr) throw new SupabaseWriteError(/* ... */);
}

registerHandler('moveSession', handler);
```

- [ ] **Step 4: Rewrite `sessionStore.ts`'s `moveSession` and add `revertLocalMove`**

```ts
moveSession: async (userId, sessionId, newDate) => {
  if (!userId) throw new Error('moveSession: no user id');
  const prev = get().byId[sessionId];
  if (!prev) throw new Error(`moveSession: session ${sessionId} not in cache`);

  const newSessionId = uuid.v4();
  const [ny, nm, nd] = newDate.split('-').map(Number);
  const jsDay = new Date(Date.UTC(ny, nm - 1, nd)).getUTCDay();
  const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1;
  const newRow: PlannedSessionRow = {
    ...prev, id: newSessionId, scheduled_date: newDate, day_of_week: dayOfWeek,
    status: 'planned', activity_id: null, moved_to_id: null,
  };

  set({
    byId: {
      ...get().byId,
      [sessionId]: { ...prev, status: 'moved', moved_to_id: newSessionId },
      [newSessionId]: newRow,
    },
    idsByDate: {
      ...get().idsByDate,
      [newDate]: [...(get().idsByDate[newDate] ?? []), newSessionId],
    },
    pendingOps: { ...get().pendingOps, [sessionId]: { op: 'move', newSessionId } },
  });

  const payload = {
    sessionId, newSessionId, newDate, userId,
    blockId: prev.block_id, weekNumber: prev.week_number, dayOfWeek,
    modality: prev.modality, sessionLabel: prev.session_label,
    runStructure: prev.run_structure, strengthStructure: prev.strength_structure,
  };
  const { error: upsertErr } = await supabase.from('planned_sessions').upsert({/* same shape as the handler */}, { onConflict: 'id' });
  if (upsertErr && isPermanentError(upsertErr)) {
    // A deterministic clash (23505: another session already occupies that day
    // with the same modality+label) or another permanent failure -- revert
    // immediately and surface the SAME friendly message today's code shows,
    // rather than enqueueing something that can only ever dead-letter.
    get().revertLocalMove(sessionId);
    if (upsertErr.code === '23505') {
      throw new Error(`That day already has a ${payload.modality} session (${payload.sessionLabel}). Two identical sessions can't share a day. Move the existing one first.`);
    }
    throw new Error(upsertErr.message);
  }
  if (!upsertErr) {
    const { error: updateErr } = await supabase.from('planned_sessions')
      .update({ status: 'moved', moved_to_id: newSessionId }).eq('id', sessionId);
    if (!updateErr) {
      const nextOps = { ...get().pendingOps };
      delete nextOps[sessionId];
      set({ pendingOps: nextOps });
      return newSessionId;
    }
    if (isPermanentError(updateErr)) {
      get().revertLocalMove(sessionId);
      throw new Error(updateErr.message);
    }
  }
  await enqueue(userId, 'moveSession', payload);
  syncPending(userId);
  // Keep the optimistic move -- do not revert here, only on a real dead-letter.
  return newSessionId;
},
revertLocalMove: (sessionId) => {
  const pending = get().pendingOps[sessionId];
  const prev = get().byId[sessionId];
  if (!prev || !pending || pending.op !== 'move') return false;
  const { newSessionId } = pending;
  const nextById = { ...get().byId };
  const nextIdsByDate = { ...get().idsByDate };
  const newRow = nextById[newSessionId];
  delete nextById[newSessionId];
  nextById[sessionId] = { ...prev, status: 'planned', moved_to_id: null };
  if (newRow) {
    const dateIds = nextIdsByDate[newRow.scheduled_date] ?? [];
    nextIdsByDate[newRow.scheduled_date] = dateIds.filter((id) => id !== newSessionId);
  }
  const nextOps = { ...get().pendingOps };
  delete nextOps[sessionId];
  delete nextOps[newSessionId]; // in case a drop was separately queued against the not-yet-confirmed new row
  set({ byId: nextById, idsByDate: nextIdsByDate, pendingOps: nextOps });
  return true;
},
```
(This sketch tries the direct write inline rather than via the handler function directly, matching the rest of the codebase's convention of screens/stores duplicating the handler's write logic for their own direct-attempt path rather than importing and calling the handler function itself — verify this is genuinely the established convention by checking how `recipes.ts`'s `toggleFavourite` or `nutrition.tsx`'s `handleDeleteEntry` do their "direct attempt" vs. the registered handler, and follow whichever pattern is actually used, adjusting the sketch above if it differs. `isPermanentError` is currently an unexported internal function in `outbox.ts` (used by `drain()`) — export it, or export an equivalent small helper, so this store action and `dropSession`'s equivalent classify-before-enqueue check reuse the SAME logic as `drain()`'s own dead-letter classification rather than duplicating the `PERMANENT_CODE`/`RETRYABLE_STATUSES` regex/set inline here.)

**One caveat to be aware of, not something to fix:** `prev.run_structure`/`.strength_structure` can be `null` in the store's cache even when the server has since lazily backfilled real structure for that session (via `persistHydratedRows`, which writes to the server without updating this store) — a session moved from a cache that predates that backfill will carry `null` structure into the new row. This self-heals on the next read that goes through the same lazy-hydration path (e.g. `getDaySessionDetail`/`todaysSession`) once the moved row is fetched fresh. Low severity, not blocking, just don't mistake it for a bug introduced by this task if a reviewer notices `run_structure: null` on a moved session that should have had structure.

Import `uuid` from `expo-modules-core` at the top of `sessionStore.ts`.

Extend `refresh()`'s preserve block for the `move` case: preserve the ORIGINAL row (`sessionId`) while `pendingOps[id]?.op === 'move'`, clearing it once the server agrees (`status: 'moved', moved_to_id` matching). ALSO preserve the NEW row (`newSessionId`) the same way — it won't have a `pendingOps` entry of its own (only the original `sessionId` does), so key this preserve check off scanning `pendingOps` values for `op:'move'` and treating BOTH `sessionId` and `pending.newSessionId` as preserved, for any date range refresh touches either of their dates.

- [ ] **Step 5: Wire dead-letter reversion in `syncPending.ts`**

Add an `isMoveSession` type guard and a branch calling `revertLocalMove(item.payload.sessionId)`, same shape as Task 4's `dropSession` branch.

- [ ] **Step 6: Update the 3 call sites' signature (reuse Task 4's auth-store wiring in `week-ahead.tsx`/`week-move.tsx` if Task 4 already added it — don't duplicate the subscription)**

For `moveSession`'s 3 call sites (`week-ahead.tsx` line ~169, `week-move.tsx` lines ~156/174, `SessionDetailModal.tsx` line ~137): `moveSession(sessionId, newDate)` → `moveSession(userId, sessionId, newDate)`. `SessionDetailModal.tsx` also needs the `reloadDetail()`-shows-stale-state fix described in Task 4's correction note (it applies to `moveSession`'s catch-up/move handlers too, not just `dropSession`'s).

- [ ] **Step 7: Clean up now-dead code, if genuinely dead**

Grep for any remaining caller of `scheduleGenerator.ts`'s exported `moveSession`/`dropSession` functions (the ones `sessionStore.ts` used to call as `moveSessionDb`/`dropSessionDb`). If this task's rewrite leaves them with zero remaining callers (verify — `scheduleGenerator.ts` may use them internally for something else, e.g. `closeBlock`), delete them the same way J3a's final fix wave deleted `lib/recipes.ts`'s now-dead `toggleFavourite`. If you delete them, ALSO delete `mobile/__tests__/lib/scheduleGeneratorMove.test.ts` (it tests `scheduleGenerator.moveSession` directly and would otherwise become a test of dead code that no longer exists). If anything else still calls the `scheduleGenerator.ts` functions, leave them and the test file in place and note this in your report.

- [ ] **Step 8: Verify, commit**

Run: `cd mobile && npx jest __tests__/lib/outbox/handlers/moveSession.test.ts __tests__/store/sessionStore.mutations.test.ts __tests__/store/sessionStore.fetch.test.ts __tests__/lib/syncPending.test.ts && npm test && npx tsc --noEmit`

```bash
git add mobile/src/lib/outbox.ts mobile/src/lib/outbox/handlers/moveSession.ts mobile/__tests__/lib/outbox/handlers/moveSession.test.ts mobile/src/store/sessionStore.ts mobile/src/store/sessionStore.types.ts mobile/__tests__/store/sessionStore.mutations.test.ts mobile/__tests__/store/sessionStore.fetch.test.ts mobile/src/lib/syncPending.ts mobile/__tests__/lib/syncPending.test.ts "mobile/app/(app)/week-ahead.tsx" "mobile/app/(app)/week-move.tsx" mobile/src/components/ui/SessionDetailModal.tsx mobile/src/lib/scheduleGenerator.ts
git commit -m "feat(offline): move session-moving onto the outbox, redesigned to be idempotent on replay"
```

---

### Task 6: Extend the dead-letter sheet's labels to the three new kinds

**Context:** J3a's `DeadLetterSheet.tsx` has a `labelForDeadLetter` function covering all six J1/J3a kinds. This plan adds three more (`logFoodEntries`, `dropSession`, `moveSession`) — extend the same function rather than building a second one.

**Files:**
- Modify: `mobile/src/components/ui/DeadLetterSheet.tsx`
- Modify: `mobile/__tests__/components/DeadLetterSheet.test.tsx`

- [ ] **Step 1: Read `DeadLetterSheet.tsx`'s `labelForDeadLetter` in full — it's a switch/lookup over `MutationKind` producing a short human-readable string per kind, using each kind's own payload fields where useful (e.g. a date).**

- [ ] **Step 2: Write the failing tests**

Add cases to `DeadLetterSheet.test.tsx` asserting a label renders for each of the three new kinds and never contains raw `{`/`}` JSON (matching the existing test's convention for the six prior kinds).

- [ ] **Step 3: Implement**

Add cases: `logFoodEntries` → something like `"A food entry from " + (rows[0]?.food_name ?? "your log")` (use the first row's name if present — a combo/copy might have several, a single name is still a reasonable label; don't dump the whole array); `dropSession` → a generic label, since the payload only carries `sessionId` (no date/label available, same honestly-disclosed limitation J3a accepted for `deleteFoodEntry`/`updateFoodEntry`) — something like `"A dropped training session"`; `moveSession` → `"Moving a session to " + payload.newDate` (the payload DOES carry a real date here, unlike `dropSession` — use it).

- [ ] **Step 4: Verify, commit**

Run: `cd mobile && npx jest __tests__/components/DeadLetterSheet.test.tsx && npm test && npx tsc --noEmit`

```bash
git add mobile/src/components/ui/DeadLetterSheet.tsx mobile/__tests__/components/DeadLetterSheet.test.tsx
git commit -m "feat(offline): label the three new J3b outbox kinds in the dead-letter sheet"
```

---

## Self-Review

**Spec coverage:** all of J3a's explicitly-deferred J3b scope is covered — `logFoodEntries` (Tasks 1-3, all 5 call sites) and `dropSession`/`moveSession` (Tasks 4-5), plus the dead-letter sheet kept current (Task 6).

**Type consistency check:** `LogFoodEntryRow` (Task 1) is defined once and reused verbatim by Tasks 2-3's payloads. `pendingOps`'s two-variant shape (Task 4's `{op:'drop'}`, Task 5's `{op:'move', newSessionId}`) is introduced once in Task 4 and its `move` variant is used, not redefined, in Task 5. `dropSession`/`moveSession`'s new `userId`-first signature is applied consistently across all 6 call sites in both tasks.

**Known risk this plan explicitly designs around, carried from J3a's final review:** `refresh()`'s preserve rule for `pendingOps` must correctly cover BOTH ends of a move (the original session's old date AND the new session's new date, potentially different weeks refreshed independently) — this is called out explicitly in Task 5's Step 2/4 rather than left as an implicit assumption, because J3a's whole-branch final review found exactly this class of bug (a background refresh clobbering unconfirmed local state) reachable on the plain online happy path, invisible to a task-scoped review that only looks at one commit's diff. Expect the whole-branch final review for THIS plan to specifically re-check this.

**Deliberately out of scope for this plan:** any further consolidation of `scheduleGenerator.ts`'s other functions, any change to `closeBlock`'s batched update pattern, and any change to how `week-ahead.tsx`/`week-move.tsx` display busy/loading state beyond what naturally falls out of the "queued writes no longer throw" behavior change.

**Incorporated from an independent plan review (run after Task 1 was already implemented and task-reviewed, before Task 2 started):** that review verified this plan's descriptions of current code against the actual source and found one Critical bug already landed in Task 1 (`quantity_unit: null` violating a not-null constraint — fixed in the same fix round as the type-narrowing issue a task reviewer separately found), plus a design gap (`nutritionDay.refresh()` needed the same queued-write overlay `recipes.ts` already has — folded into Task 1), and several corrections to Tasks 2-6's task text (all applied above): `moveSession`'s 23505 clash must revert-and-throw rather than enqueue; `pendingOps` must be persisted to survive a restart; `week-ahead.tsx`/`week-move.tsx` need new auth-store wiring, not just a signature change; `SessionDetailModal.tsx`'s `reloadDetail()` reads server truth directly and can visibly contradict a queued drop/move; existing tests in `sessionStore.mutations.test.ts` need rewriting, not just extending; and `expo-modules-core`'s `uuid.v4()` needs an explicit jest mock since nothing in this codebase's test setup shims it today. One accepted, non-blocking residual noted by that review: a moved session's `run_structure`/`strength_structure` can carry a stale-`null` value if the store's cache predates a server-side lazy backfill of that session's structure — self-heals on the next read through the normal hydration path, not worth designing around.
