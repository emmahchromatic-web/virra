# Offline J3a Writes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the five straightforward, single-call-site writes named in the offline-first spec's J3 table (`checkIn`, `deleteFoodEntry`, `updateFoodEntry`, `saveMealCombo`, `toggleFavourite`) onto the outbox, and build the dead-letter sheet UI — the first real caller of `dismissDeadLetter`, closing a gap J1 Hardening's final review flagged and parked (a dead-lettered item currently has no way to be seen or dismissed by a user).

**Architecture:** Each write gets its own `src/lib/outbox/handlers/<kind>.ts` (matching `completeWorkout.ts`'s established shape: throw a `SupabaseWriteError` on failure, never swallow), a new `MutationKind` union member + `MutationPayloadMap` entry in `outbox.ts`, and a screen-side change following the SAME pattern `workout-preview.tsx`/`run.tsx` already established for `completeWorkout`: attempt the write directly first; on failure, `enqueue()` it and apply the change to local state immediately (optimistic), so the screen never blocks on the network and a transient failure is invisible to the user. This is a deliberate, consistent choice to match the codebase's ALREADY-REVIEWED idiom, not the spec's more literal "always enqueue" phrasing — the two are behaviorally similar when online (the outbox drains immediately) and this keeps every mutation's code shape recognizable to anyone who has read `completeWorkout`'s.

**This plan is J3a of a two-part split** (J3b covers `logFoodEntries` — which has 5 write call sites needing consolidation, not 1 — and `dropSession`/`moveSession`, which have pre-existing optimistic-update patterns from before the outbox existed that need reconciling with it). J3a is the lower-risk, higher-value-per-task half; do not attempt J3b's kinds here.

**Tech Stack:** Same as J1/J2 — Expo SDK 54, React Native 0.81, Zustand 5, Jest + `@testing-library/react-native`, Supabase JS.

**Spec:** `docs/superpowers/specs/2026-09-14-offline-first-design.md` §4.3 (write layer — the kinds table), §4.5 (sync pill — the dead-letter sheet). Also read `mobile/src/lib/outbox.ts` and `mobile/src/lib/outbox/handlers/completeWorkout.ts` in full before starting any task — they are the contract and the template every task below extends.

## Global Constraints

- Every new outbox handler throws a `SupabaseWriteError` (from `mobile/src/lib/outbox/errors.ts`) on any Supabase error — never swallow, never return a boolean. Copy `completeWorkout.ts`'s error-wrapping pattern exactly.
- `withLock` (in `outbox.ts`) is NOT re-entrant. No new handler may call `enqueue()` or `drain()` from inside itself, directly or indirectly.
- A kind needs a `dedupeKeys` entry in `outbox.ts` only if the SAME logical mutation could plausibly be triggered twice by an ordinary UI interaction (a double-tap, a retry after a UI hang) — per the spec, most J3 kinds are "a distinct intent" every time and need no dedupe key. Judge each kind on this basis in its own task; don't add one by default.
- Every screen change follows the "try direct, enqueue+apply-locally on failure" pattern already established for `completeWorkout` — do not switch to an "always enqueue, always drain" pattern for these five kinds, for consistency with the rest of the codebase.
- No kind in this plan may write to a table another kind or an existing outbox handler also writes to without checking for interaction (e.g. `deleteFoodEntry` and `updateFoodEntry` both touch `food_entries`, the same table J2's `nutritionDay` store reads — check that the local-apply step in each task correctly updates `nutritionDay`'s cache, not just some other local state, so the Nutrition tab reflects the change immediately without waiting for a refetch).
- The dead-letter sheet is a new, small screen — follow this codebase's established sub-menu header pattern (see any of `app/(app)/subscription.tsx`, `app/(app)/breaks.tsx`, `app/(app)/notifications.tsx` for the exact inline header shape: chevron-left back button, centered title, spacer or action icon on the right — documented in this project's CLAUDE.md under "Sub-menu screen pattern").

---

### Task 1: `checkIn` outbox kind

**Context:** `mobile/app/(app)/checkin.tsx`'s `handleSave()` does a direct `supabase.from('symptom_logs').upsert({...}, {onConflict:'user_id,recorded_on'})` — already naturally idempotent (upsert on the same conflict key the outbox needs), and on error today shows an alert and leaves the user on the screen (no offline handling at all). This is the simplest kind in this plan: no existing local-optimistic pattern to reconcile, one call site, one screen.

**Files:**
- Modify: `mobile/src/lib/outbox.ts` (add `checkIn` to `MutationKind`/`MutationPayloadMap`)
- Create: `mobile/src/lib/outbox/handlers/checkIn.ts`
- Test: `mobile/__tests__/lib/outbox/handlers/checkIn.test.ts`
- Modify: `mobile/app/(app)/checkin.tsx`

**Interfaces:**
- Produces: `MutationPayloadMap.checkIn` — payload shape matching exactly what `handleSave()` currently sends to `symptom_logs.upsert(...)` (read the current field list from the file itself before designing the payload type).

- [ ] **Step 1: Read `checkin.tsx`'s current `handleSave()` and `outbox/handlers/completeWorkout.ts` in full**

- [ ] **Step 2: Write the failing handler test**

Follow `completeWorkout.test.ts`'s exact mocking conventions (check `mobile/__tests__/lib/outbox/handlers/completeWorkout.test.ts` for the pattern). Test: the handler calls `supabase.from('symptom_logs').upsert(payload, {onConflict:'user_id,recorded_on'})`; on a Supabase error, throws a `SupabaseWriteError` carrying the error's `status`/`code`/`message`; on success, resolves with no return value.

- [ ] **Step 3: Add the kind and implement the handler**

```ts
// outbox.ts additions
export type MutationKind = 'completeWorkout' | 'checkIn';
export interface MutationPayloadMap {
  completeWorkout: PendingCompletion;
  checkIn: { user_id: string; recorded_on: string; energy: number; mood: number; sleep_quality: number; symptoms: string[]; notes: string | null };
}
```
(Adjust field names/types to match `checkin.tsx`'s actual current payload exactly — don't guess.)

`mobile/src/lib/outbox/handlers/checkIn.ts` — mirror `completeWorkout.ts`'s error-wrapping shape: the upsert, checked for `error`, thrown as `SupabaseWriteError` on failure. Register via `registerHandler('checkIn', handleCheckIn)` at module scope. Import it once (side-effect) from `mobile/app/(app)/_layout.tsx` alongside the existing `completeWorkout` import.

- [ ] **Step 4: Wire `checkin.tsx`'s offline path**

In `handleSave()`, on the direct upsert's error, instead of `appAlert('Could not save', error.message)`: call `enqueue(session.user.id, 'checkIn', payload)`, update local UI state exactly as the success path does (`setHasExisting(true)`, `cancelCheckinReminderToday()`, `router.back()`), and show a "Saved on your phone, will sync when you have signal" style alert matching the wording `workout-preview.tsx`/`run.tsx` use for the same situation. The direct-write success path is otherwise unchanged.

- [ ] **Step 5: Verify, commit**

Run: `cd mobile && npx jest __tests__/lib/outbox/handlers/checkIn.test.ts && npm test && npx tsc --noEmit`

```bash
git add mobile/src/lib/outbox.ts mobile/src/lib/outbox/handlers/checkIn.ts mobile/__tests__/lib/outbox/handlers/checkIn.test.ts "mobile/app/(app)/checkin.tsx" "mobile/app/(app)/_layout.tsx"
git commit -m "feat(offline): move check-in onto the outbox"
```

---

### Task 2: `deleteFoodEntry` outbox kind

**Context:** `mobile/app/(app)/(tabs)/nutrition.tsx`'s `handleDeleteEntry` does `supabase.from('food_entries').delete().eq('id', entry.id)`, and ALREADY has a local optimistic removal via `useNutritionDay.getState().removeEntryLocal(recordedOn, entryId)` (built in J2) — read that function's current behavior first, since this task's local-apply step should USE it, not duplicate it. Per spec, a delete of an already-deleted (or never-existed) row is success, not an error — the handler must treat "not found" as success, not throw.

**Files:**
- Modify: `mobile/src/lib/outbox.ts`
- Create: `mobile/src/lib/outbox/handlers/deleteFoodEntry.ts`
- Test: `mobile/__tests__/lib/outbox/handlers/deleteFoodEntry.test.ts`
- Modify: `mobile/app/(app)/(tabs)/nutrition.tsx`

- [ ] **Step 1: Read `nutrition.tsx`'s `handleDeleteEntry` and `nutritionDay.ts`'s `removeEntryLocal` in full**

- [ ] **Step 2: Write the failing handler test**

Test both the success case AND the "row already gone" case: a Supabase delete with no matching row typically returns `{error: null}` (Postgres DELETE doesn't error on zero rows affected) — confirm this is actually true for how this codebase's Supabase client is configured (check whether `.select()` is chained after `.delete()` anywhere in this codebase's delete calls, which would change the not-found signal), and write the handler/test to match whatever the real behavior is, not an assumption.

- [ ] **Step 3: Add the kind and implement the handler**

`MutationPayloadMap.deleteFoodEntry: { entryId: string }` (or whatever minimal shape is needed — an entry delete only needs the id). Handler does the delete, throws `SupabaseWriteError` only on a genuine error (not on zero-rows-affected).

- [ ] **Step 4: Wire `nutrition.tsx`'s offline path**

On the direct delete's error, `enqueue(userId, 'deleteFoodEntry', {entryId})` and call the EXISTING `removeEntryLocal` immediately (it already exists for this exact purpose from J2 — this task just needs to reach it from the failure branch too, not only wherever it's currently called from).

- [ ] **Step 5: Verify, commit**

Run: `cd mobile && npx jest __tests__/lib/outbox/handlers/deleteFoodEntry.test.ts && npm test && npx tsc --noEmit`

```bash
git add mobile/src/lib/outbox.ts mobile/src/lib/outbox/handlers/deleteFoodEntry.ts mobile/__tests__/lib/outbox/handlers/deleteFoodEntry.test.ts "mobile/app/(app)/(tabs)/nutrition.tsx"
git commit -m "feat(offline): move food-entry deletion onto the outbox"
```

---

### Task 3: `updateFoodEntry` outbox kind

**Context:** A component (find its actual current name and path — the spec calls it a "food entry edit modal"; search `mobile/app`/`mobile/src/components` for it) does `supabase.from('food_entries').update({quantity_g, calories, carbs_g, protein_g, fat_g, fibre_g}).eq('id', entry.id)`. Per spec's J3 table: "update by id; not-found dead-letters" — unlike delete, an update targeting a row that no longer exists IS a genuine failure (there's nothing to update), and should NOT be silently treated as success.

**Files:**
- Modify: `mobile/src/lib/outbox.ts`
- Create: `mobile/src/lib/outbox/handlers/updateFoodEntry.ts`
- Test: `mobile/__tests__/lib/outbox/handlers/updateFoodEntry.test.ts`
- Modify: whichever component/screen currently performs this write

- [ ] **Step 1: Find and read the current edit flow in full**

Search for the current `food_entries` update call site (a modal component is the most likely place, per the spec's own naming) and read it completely, along with how it currently handles success/failure in the UI.

- [ ] **Step 2: Write the failing handler test**

Test: a genuine Supabase error throws `SupabaseWriteError`. A successful update with `.select()` chained returning zero rows (the not-found case, if that's how this codebase would detect it — check `.update(...).eq('id', ...).select()` conventions elsewhere in this codebase) also throws, since the spec says this must dead-letter, not silently succeed. Decide the exact detection mechanism by reading how the codebase's other update calls check for "did this actually match a row" (if any do), or design the simplest correct check yourself and document the choice.

- [ ] **Step 3: Add the kind and implement the handler**

`MutationPayloadMap.updateFoodEntry: { entryId: string; quantityG: number; calories: number; carbsG: number; proteinG: number; fatG: number; fibreG: number }` (match the real field list from Step 1).

- [ ] **Step 4: Wire the edit flow's offline path**

On the direct update's error, `enqueue(userId, 'updateFoodEntry', payload)` and update the local nutritionDay cache's entry for that id immediately (find or add whatever `nutritionDay.ts` action is appropriate — check if one already exists for editing an entry's fields locally, similar to `removeEntryLocal`; if none exists, add a small `updateEntryLocal(recordedOn, entryId, patch)` action following that function's exact pattern).

- [ ] **Step 5: Verify, commit**

Run: `cd mobile && npx jest __tests__/lib/outbox/handlers/updateFoodEntry.test.ts && npm test && npx tsc --noEmit`

```bash
git add mobile/src/lib/outbox.ts mobile/src/lib/outbox/handlers/updateFoodEntry.ts mobile/__tests__/lib/outbox/handlers/updateFoodEntry.test.ts mobile/src/store/nutritionDay.ts
git commit -m "feat(offline): move food-entry edits onto the outbox"
```
(Adjust the `git add` list once you know the exact modal file's path.)

---

### Task 4: `saveMealCombo` outbox kind

**Context:** `mobile/app/(app)/(tabs)/nutrition.tsx`'s `handleSaveMeal` does `supabase.from('meal_combos').insert({user_id, name, meal_type, items_json})` — a plain `insert`, not an upsert, so a naive replay after a partial failure would create a duplicate combo. `meal_combos.id` is `uuid primary key default gen_random_uuid()`, which per this codebase's established pattern (check how `outbox.ts`'s own `makeOutboxId()` or any other client-generated-id write elsewhere in this codebase does it) means a CLIENT-generated UUID can be supplied at insert time and the write turned into an `upsert(..., {onConflict: 'id'})` for idempotent replay.

**Files:**
- Modify: `mobile/src/lib/outbox.ts`
- Create: `mobile/src/lib/outbox/handlers/saveMealCombo.ts`
- Test: `mobile/__tests__/lib/outbox/handlers/saveMealCombo.test.ts`
- Modify: `mobile/app/(app)/(tabs)/nutrition.tsx`

- [ ] **Step 1: Read `nutrition.tsx`'s `handleSaveMeal` in full**, and check how this codebase generates a client-side UUID elsewhere (search for `crypto.randomUUID` or an existing UUID helper — do not add a new UUID-generation dependency if one is already used somewhere in this codebase).

- [ ] **Step 2: Write the failing handler test**

Test: the handler upserts on `id` (not a plain insert), so a replay with the same `id` doesn't duplicate. Confirm this against a real `meal_combos` schema check (the `id` column must genuinely be settable by the client and not overridden by a trigger — verify via the migration files if any doubt, or ask if genuinely unclear).

- [ ] **Step 3: Add the kind and implement the handler**

`MutationPayloadMap.saveMealCombo: { id: string; user_id: string; name: string; meal_type: string; items_json: unknown }`. Handler upserts on `{onConflict: 'id'}`.

- [ ] **Step 4: Wire `nutrition.tsx`'s offline path**

Generate the client-side `id` BEFORE attempting the direct write (so the same id is used whether the direct write succeeds or the fallback enqueue happens — this is what makes the eventual outbox replay match what may have already partially landed). On failure, `enqueue(userId, 'saveMealCombo', payload)` and apply whatever local state update makes the newly-saved combo appear in the UI immediately (check how the screen currently updates its combo list on a successful save, and do the same thing on the offline-queued path).

- [ ] **Step 5: Verify, commit**

Run: `cd mobile && npx jest __tests__/lib/outbox/handlers/saveMealCombo.test.ts && npm test && npx tsc --noEmit`

```bash
git add mobile/src/lib/outbox.ts mobile/src/lib/outbox/handlers/saveMealCombo.ts mobile/__tests__/lib/outbox/handlers/saveMealCombo.test.ts "mobile/app/(app)/(tabs)/nutrition.tsx"
git commit -m "feat(offline): move meal-combo saving onto the outbox"
```

---

### Task 5: `toggleFavourite` outbox kind

**Context:** `mobile/src/lib/recipes.ts`'s `toggleFavourite` does an `upsert`/`delete` against `recipe_favourites` (primary key `(user_id, recipe_id)` — already idempotent as spec'd). J2 already wrapped this in an OPTIMISTIC update layer in `mobile/src/store/recipes.ts`, with its own revert-on-ANY-failure semantics (read that store's current `toggleFavourite` action in full — this is the one task in this plan with an EXISTING optimistic pattern to reconcile, similar in spirit to what J1 Hardening had to do for `sessionStore`'s completion tracking).

The behavioral change this task makes: today, ANY failure (network or permanent) reverts the optimistic UI change immediately. After this task, only a PERMANENT failure (the item dead-lettering) should revert it — a transient/network failure should queue the toggle and KEEP the optimistic state, exactly like `applyLocalCompletion`/`revertLocalCompletion` does for workout completions in `sessionStore.ts` (read that pair of functions as your pattern reference for "apply now, only undo on dead-letter, never undo on a mere retry").

**Files:**
- Modify: `mobile/src/lib/outbox.ts`
- Create: `mobile/src/lib/outbox/handlers/toggleFavourite.ts`
- Test: `mobile/__tests__/lib/outbox/handlers/toggleFavourite.test.ts`
- Modify: `mobile/src/store/recipes.ts`
- Modify: `mobile/src/lib/recipes.ts` (only if its existing `toggleFavourite` function needs to change shape — read first)

**Interfaces:**
- Consumes: the `syncPending`/dead-letter-reconciliation pattern from `mobile/src/lib/syncPending.ts` (built in J1 Hardening) — this task's dead-letter reversion should follow the SAME shape as that file's existing `completeWorkout` dead-letter handling (a small `revertLocalToggle`-style action on the `recipes` store, called from `syncPending.ts` for any dead-lettered `toggleFavourite` item, mirroring `sessionStore.revertLocalCompletion`'s guard-and-revert pattern).

- [ ] **Step 1: Read `mobile/src/store/recipes.ts`'s current `toggleFavourite` action, `mobile/src/lib/recipes.ts`'s `toggleFavourite` function, `mobile/src/lib/syncPending.ts`'s dead-letter reconciliation loop for `completeWorkout`, and `sessionStore.ts`'s `applyLocalCompletion`/`revertLocalCompletion` pair, all in full**

- [ ] **Step 2: Write the failing tests**

For the handler: mirrors the existing `toggleFavourite` write, throws on error. For the store: a toggle that fails with a RETRYABLE error keeps the optimistic `favouriteIds` change (no revert); a toggle whose outbox item DEAD-LETTERS reverts it (via a new store action, called from `syncPending`'s reconciliation loop — write a test for `syncPending.ts` proving it calls this new action for a dead-lettered `toggleFavourite` item, following the exact structure of its existing `completeWorkout` dead-letter test).

- [ ] **Step 3: Add the kind and implement the handler**

`MutationPayloadMap.toggleFavourite: { recipeId: string; desiredState: boolean }` (or whatever shape fits the existing `toggleFavourite` function's real signature).

- [ ] **Step 4: Change `recipes.ts`'s store action**

Instead of calling `toggleFavouriteApi` directly and reverting on any failure, apply the optimistic update immediately, then `enqueue(userId, 'toggleFavourite', payload)` (which drains immediately if online, same as every other kind) — NOT "try direct, enqueue on failure" this time, since this task ALSO needs to change how reverts work regardless of online/offline, and going through the outbox unconditionally is the cleanest way to get consistent dead-letter-triggered reverts either way. (This is the one kind in this plan that deviates from the "try direct first" pattern established elsewhere — document why in a code comment: the existing optimistic-revert-on-any-failure behavior is exactly the bug this task fixes, so routing online AND offline through the same outbox path is what makes the fix uniform.)

- [ ] **Step 5: Wire dead-letter reversion**

In `mobile/src/lib/syncPending.ts`, extend the existing dead-letter reconciliation loop (which currently only handles `completeWorkout` items) to also handle `toggleFavourite` items: call the new `recipes` store revert action for any dead-lettered item of this kind.

- [ ] **Step 6: Verify, commit**

Run: `cd mobile && npx jest __tests__/lib/outbox/handlers/toggleFavourite.test.ts __tests__/store/recipes.test.ts __tests__/lib/syncPending.test.ts && npm test && npx tsc --noEmit`

```bash
git add mobile/src/lib/outbox.ts mobile/src/lib/outbox/handlers/toggleFavourite.ts mobile/__tests__/lib/outbox/handlers/toggleFavourite.test.ts mobile/src/store/recipes.ts mobile/src/lib/recipes.ts mobile/src/lib/syncPending.ts mobile/__tests__/store/recipes.test.ts mobile/__tests__/lib/syncPending.test.ts
git commit -m "feat(offline): move favourite-toggling onto the outbox, revert only on dead-letter"
```

---

### Task 6: The dead-letter sheet

**Context:** `readDeadLetters`/`dismissDeadLetter` exist in `outbox.ts` and have ZERO callers anywhere in the app today — confirmed by a pre-plan investigation (`grep -rln "dismissDeadLetter\|readDeadLetters" app/ src/components/` returns nothing outside the outbox itself). `mobile/src/components/SyncPill.tsx` is purely passive (`pointerEvents="none"`, no `Pressable`) — tapping it does nothing. This task makes the "Unsaved" pill state actionable: tapping it opens a sheet listing dead-lettered items with a per-item Dismiss action, per spec §4.5 ("tap opens a sheet listing items with Dismiss").

**Files:**
- Create: `mobile/app/(app)/dead-letters.tsx` (or a modal component — your call on screen vs. modal presentation; a small `VirraModal`-based sheet, matching how other lightweight overlays in this codebase are built, e.g. `BreakModal.tsx`/`AddEventModal.tsx`, is probably the better fit than a full navigable screen, given spec's "tap opens a sheet" phrasing — check those files' patterns first)
- Modify: `mobile/src/components/SyncPill.tsx` (add a `Pressable` wrapper, only when state is `'failed'`)
- Test: a new test file for whichever component you build

- [ ] **Step 1: Read `SyncPill.tsx` in full, and one or two of this codebase's existing small modal/sheet components (`BreakModal.tsx`, `AddEventModal.tsx`) for the presentation pattern to follow**

- [ ] **Step 2: Write the failing tests**

A test that tapping the pill while in the `'failed'` state opens the sheet (and does nothing when tapped in any other state, or is simply not tappable then). A test that the sheet lists dead-lettered items (from `readDeadLetters(userId)`) with a human-readable description per item — decide what "human-readable" means per kind (e.g. "A workout from [date]" for `completeWorkout`, "A check-in from [date]" for `checkIn`, etc. — a small per-kind label function is reasonable; don't just dump raw JSON). A test that tapping Dismiss on an item calls `dismissDeadLetter(userId, item.id)` and removes it from the visible list.

- [ ] **Step 3: Implement**

The sheet reads `readDeadLetters(userId)` on open, renders each item with a short label (per the kind-to-label mapping you designed) and its `lastError` (kept brief, not a raw stack trace), and a "Dismiss" button per item calling `dismissDeadLetter`. `SyncPill.tsx` gains a `Pressable` (only rendered/active when `deriveState(...) === 'failed'`) that opens this sheet.

- [ ] **Step 4: Verify, commit**

Run: `cd mobile && npm test && npx tsc --noEmit`

```bash
git add mobile/app/\(app\)/dead-letters.tsx mobile/src/components/SyncPill.tsx mobile/__tests__
git commit -m "feat(offline): add the dead-letter sheet, the pill's first tap action"
```

---

## Self-Review

**Spec coverage against §4.3's J3 kinds table (this plan's slice):**
- ✅ `checkIn` — Task 1
- ✅ `deleteFoodEntry` — Task 2
- ✅ `updateFoodEntry` — Task 3
- ✅ `saveMealCombo` — Task 4
- ✅ `toggleFavourite` — Task 5
- ✅ Dead-letter sheet (§4.5) — Task 6

**Deliberately NOT in this plan (J3b's scope):**
- `logFoodEntries` — 5 separate write call sites across `food-search.tsx`, `describe-meal.tsx`, and `CopyMealFromDayModal.tsx`, needing consolidation before a single outbox kind can cover all of them. Larger effort than any task above.
- `dropSession`/`moveSession` — both already have pre-outbox optimistic-update patterns in `sessionStore.ts` with revert-on-any-error semantics (like Task 5's `toggleFavourite` was, before this plan fixed it) AND `moveSession`'s underlying write sequence (fetch → insert → update) is not naturally idempotent on replay, needing either a client-generated row id or a check-before-insert step. Both need their own design pass, not a copy of this plan's simpler tasks.
