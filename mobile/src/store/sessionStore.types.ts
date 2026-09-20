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
  /**
   * Tracks sessions with a locally-applied, not-yet-server-confirmed drop or
   * move -- the `pendingOps` role for drop/move is the same one the
   * `local_`-prefixed `activity_id` placeholder plays for completions
   * (see `LOCAL_ACTIVITY_PREFIX`), kept as a separate map because drop/move
   * have no spare field on `PlannedSessionRow` to overload that way.
   * `refresh()` uses this to avoid clobbering a pending drop/move with stale
   * server data, and `revertLocalDrop`/`revertLocalMove` use it to know what
   * to undo on a dead letter. Persisted (see `partialize`) so an app restart
   * between an optimistic mutation and the outbox draining doesn't silently
   * lose track of it.
   *
   * A pending MOVE is keyed by the ORIGINAL session's id only; the
   * replacement row it names in `newSessionId` has no entry of its own. Any
   * code that asks "is this row still unconfirmed?" about an arbitrary id
   * therefore has to scan the VALUES of this map for `newSessionId` as well
   * as looking the id up as a key -- see `refresh()`, where missing that is
   * how an optimistically-inserted replacement row gets silently deleted by
   * a refresh of the week it landed in.
   */
  pendingOps: Record<SessionId, { op: 'drop' } | { op: 'move'; newSessionId: SessionId }>;
}

export interface SessionStoreActions {
  // lifecycle
  ensureLoaded(from: DateISO, to: DateISO): Promise<void>;
  refresh(from: DateISO, to: DateISO):      Promise<void>;

  // mutations
  markComplete(sessionId: SessionId, activityId: string): Promise<void>;
  /**
   * Marks a session completed in the local cache only, with no remote write.
   * Used when a completion has been queued to the outbox rather than
   * confirmed by the server — the activity id is a local placeholder, and
   * the next `refresh()` of this date range replaces the row with server
   * truth (real id included).
   */
  applyLocalCompletion(sessionId: SessionId, activityId: string): void;
  /**
   * The inverse of `applyLocalCompletion`: reverts a session's optimistic
   * local completion back to `planned`, and clears the placeholder
   * `activity_id`. A no-op if the row's activity_id is no longer a local
   * placeholder (the server has since confirmed it) -- this must never
   * undo a real completion.
   *
   * Returns whether it actually reverted anything, so `syncPending`'s
   * dead-letter sweep can tell "undone" apart from "nothing to undo" and only
   * mark the former reconciled (see `OutboxItem.reconciledAt`).
   */
  revertLocalCompletion(sessionId: SessionId): boolean;
  /**
   * Optimistically flips a session to `dropped` and tries the direct write
   * immediately. A merely transient failure is queued to the outbox and the
   * optimistic state (and the `pendingOps` marker) is KEPT, not reverted --
   * only a genuine dead letter reverts it, via `revertLocalDrop` below. A
   * deterministic/permanent failure (classified via `isPermanentError`) is
   * the one exception: it reverts immediately and re-throws the existing
   * friendly error, since a write that can never succeed must not be queued.
   *
   * `userId` is an explicit param (not fetched internally via
   * `supabase.auth.getUser()`), matching the convention `recipes.ts`'s
   * `toggleFavourite(userId, recipeId, next)` established.
   */
  dropSession(userId: string, sessionId: SessionId):      Promise<void>;
  /**
   * The inverse of `dropSession`'s optimistic drop: reverts a session's
   * status back to `planned` and clears its `pendingOps` marker. A no-op
   * unless `pendingOps[sessionId]` is still a pending `drop` -- this must
   * never undo a drop the server has already confirmed (which clears the
   * marker itself, see `dropSession`) nor a drop that has already been
   * reverted.
   *
   * Returns whether it actually reverted anything, so `syncPending`'s
   * dead-letter sweep can tell "undone" apart from "nothing to undo" and only
   * mark the former reconciled (see `OutboxItem.reconciledAt`).
   */
  revertLocalDrop(sessionId: SessionId): boolean;
  /**
   * Relocates a planned session to `newDate`: inserts a replacement row
   * there and marks the original `moved`. Same optimistic/outbox contract as
   * `dropSession` -- a transient failure queues the write and KEEPS the
   * optimistic move (only a dead letter undoes it, via `revertLocalMove`), a
   * permanent one reverts and re-throws immediately.
   *
   * Returns the replacement row's id, which is generated client-side before
   * any write and is final from the start -- there is no temp id, and no
   * later swap, so callers can rely on it even when the write only got as
   * far as the outbox.
   *
   * The permanent case that matters here is a 23505 clash on
   * `planned_sessions_no_clash_idx` (the target day already has an identical
   * session): it throws the same specific message it always has, so the call
   * sites' `catch -> appAlert` keeps working unchanged.
   */
  moveSession(userId: string, sessionId: SessionId, newDate: DateISO): Promise<SessionId>;
  /**
   * The inverse of `moveSession`'s optimistic move, undoing BOTH halves:
   * removes the replacement row from `byId`/`idsByDate` and restores the
   * original row's `status`/`moved_to_id`. A no-op (returns `false`) unless
   * `pendingOps[sessionId]` is still a pending `move`, so it can never undo
   * a move the server has already confirmed nor one already reverted.
   *
   * Returns whether it actually reverted anything, so `syncPending`'s
   * dead-letter sweep can tell "undone" apart from "nothing to undo" and only
   * mark the former reconciled (see `OutboxItem.reconciledAt`).
   */
  revertLocalMove(sessionId: SessionId): boolean;
  linkActivity(activityId: string, sessionId: SessionId): Promise<void>;

  // background reconciliation
  reconcileFromActivities(): Promise<{ linked: number }>;

  // diagnostics
  clearCache(): Promise<void>;
}

export type SessionStore = SessionStoreState & SessionStoreActions;
