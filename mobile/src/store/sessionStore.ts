import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { uuid } from 'expo-modules-core';
import { supabase } from '@/lib/supabase';
import { _commitLink } from '@/lib/scheduleGenerator';
import { enqueue, isPermanentError } from '@/lib/outbox';
import { syncPending } from '@/lib/syncPending';
import { proposeLinks } from '@/lib/sessionReconciler';
import { asyncStorageAdapter } from './persistAdapter';
import type {
  SessionStore, SessionStoreState, PlannedSessionRow, DateISO, LoadedRange, SessionId,
} from './sessionStore.types';

const STORE_NAME = 'virra:sessions:v1';
const STALENESS_MS = 5 * 60 * 1000; // 5 minutes
const SESSION_COLUMNS =
  'id, scheduled_date, modality, session_label, status, block_id, activity_id, moved_to_id, week_number, day_of_week, run_structure, strength_structure, created_at';

function rangeKey(from: DateISO, to: DateISO): string {
  return `${from}..${to}`;
}

/**
 * Prefix of the placeholder activity id `applyLocalCompletion` is given when a
 * workout is finished with no signal and parked in the outbox.
 *
 * It is the tell `refresh()` uses to recognise a row still waiting on the
 * outbox for a COMPLETION specifically. Drop/move mutations have no spare
 * field on `PlannedSessionRow` to overload this way, so they use the
 * separate `pendingOps` map instead (see `SessionStoreState.pendingOps`).
 *
 * This store DOES import `enqueue`/`syncPending` directly (for
 * `dropSession`/`moveSession` routing a failed direct write through the
 * outbox) -- the "independent of
 * the write layer" framing this comment used to make is no longer accurate.
 * The resulting `sessionStore.ts` <-> `syncPending.ts` import cycle
 * (`syncPending.ts` already imports `useSessionStore`) resolves safely the
 * same way `recipes.ts`'s equivalent cycle with `syncPending.ts` does:
 * both references are only dereferenced inside action bodies, well after
 * module init, never at module-evaluation time.
 */
export const LOCAL_ACTIVITY_PREFIX = 'local_';

const isLocallyCompleted = (row: PlannedSessionRow | undefined): boolean =>
  !!row && row.status === 'completed' && typeof row.activity_id === 'string'
  && row.activity_id.startsWith(LOCAL_ACTIVITY_PREFIX);

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

const initialState: SessionStoreState = {
  byId: {},
  idsByDate: {},
  loadedRanges: [],
  fetching: new Set(),
  hasHydrated: false,
  lastError: null,
  pendingOps: {},
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

          // Replace any session currently keyed within [from,to] with the fresh
          // server data -- EXCEPT rows finished offline and still sitting in the
          // outbox, and rows with a pending drop or move not yet confirmed by
          // the server.
          //
          // WHY. `applyLocalCompletion` marks a session completed the moment the
          // completion is queued, so the dashboard stops lagging behind what the
          // user just did. A focus-triggered refresh firing before the outbox has
          // drained would otherwise read "planned" off the server and flip it
          // straight back, and nothing would put it right again until the 5-minute
          // staleness window turned over. The spec's rule (§9, Risks): refresh()
          // keeps any local row still pending in the outbox. `dropSession` is the
          // same story via `pendingOps` instead of a placeholder id, since a drop
          // has no spare field on the row to overload that way.
          //
          // A pending MOVE is two rows, not one, and they can sit in different
          // weeks -- so they can be refreshed by two SEPARATE calls, minutes
          // apart, as the user scrolls the calendar. Both halves need covering
          // independently: the ORIGINAL row (keyed in `pendingOps`, waiting to
          // read back as `moved`) and the REPLACEMENT row (which has no
          // `pendingOps` key of its own -- it is only named in the original's
          // entry). Preserving just the original is the bug shape J3a's final
          // review caught for favourites: the half nobody thought to check gets
          // silently deleted by the next refresh of the week it landed in, and
          // the session the user just moved disappears.
          //
          // The moment the server agrees (completed / dropped / moved) the local
          // marker is dropped -- that is what keeps this from pinning a stale
          // local override in the cache forever once the drain has actually
          // landed.
          const existing = get();
          const nextById = { ...existing.byId };
          const nextIdsByDate = { ...existing.idsByDate };
          const nextPendingOps = { ...existing.pendingOps };

          const serverById = new Map(rows.map((r) => [r.id, r]));
          // Destination rows of not-yet-confirmed moves. They are values in
          // `pendingOps`, never keys, so a `pendingOps[id]` lookup misses them.
          const pendingMoveTargets = new Set<SessionId>();
          for (const op of Object.values(existing.pendingOps)) {
            if (op.op === 'move') pendingMoveTargets.add(op.newSessionId);
          }
          const preserved = new Set<string>();
          for (const [date, ids] of Object.entries(existing.idsByDate)) {
            if (date < from || date > to) continue;
            for (const id of ids) {
              if (isLocallyCompleted(existing.byId[id])) {
                if (serverById.get(id)?.status === 'completed') continue;  // server caught up
                preserved.add(id);
                continue;
              }
              const pendingOp = existing.pendingOps[id];
              if (pendingOp?.op === 'drop') {
                if (serverById.get(id)?.status === 'dropped') {
                  delete nextPendingOps[id];  // server caught up
                  continue;
                }
                preserved.add(id);
                continue;
              }
              if (pendingOp?.op === 'move') {
                const server = serverById.get(id);
                // The original half only counts as confirmed when the server
                // points it at OUR replacement id -- a bare `status:'moved'`
                // could be some earlier move of the same session.
                //
                // Clearing the marker here also settles the replacement half:
                // the handler writes the replacement row BEFORE marking the
                // original moved, so a server that reports `moved` necessarily
                // already holds the replacement too.
                if (server?.status === 'moved' && server.moved_to_id === pendingOp.newSessionId) {
                  delete nextPendingOps[id];
                  continue;
                }
                preserved.add(id);
                continue;
              }
              // The other half of a pending move: keep the optimistically
              // inserted replacement row until the server actually returns it.
              if (pendingMoveTargets.has(id) && !serverById.has(id)) preserved.add(id);
            }
          }

          for (const [date, ids] of Object.entries(existing.idsByDate)) {
            if (date >= from && date <= to) {
              const kept = ids.filter((id) => preserved.has(id));
              for (const id of ids) if (!preserved.has(id)) delete nextById[id];
              if (kept.length > 0) nextIdsByDate[date] = kept;
              else delete nextIdsByDate[date];
            }
          }
          for (const r of rows) {
            if (preserved.has(r.id)) continue;
            nextById[r.id] = r;
            (nextIdsByDate[r.scheduled_date] ??= []).push(r.id);
          }

          const nextLoaded = mergeRange(get().loadedRanges, { from, to, fetchedAt: Date.now() });
          set({
            byId: nextById, idsByDate: nextIdsByDate, loadedRanges: nextLoaded,
            pendingOps: nextPendingOps,
          });
        } finally {
          const after = new Set(get().fetching); after.delete(key);
          set({ fetching: after });
        }
      },

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
      applyLocalCompletion: (sessionId, activityId) => {
        const prev = get().byId[sessionId];
        if (!prev) return;
        set({
          byId: { ...get().byId, [sessionId]: { ...prev, status: 'completed', activity_id: activityId } },
        });
      },
      revertLocalCompletion: (sessionId) => {
        const prev = get().byId[sessionId];
        if (!prev) return false;
        if (typeof prev.activity_id !== 'string' || !prev.activity_id.startsWith(LOCAL_ACTIVITY_PREFIX)) return false;
        set({
          byId: { ...get().byId, [sessionId]: { ...prev, status: 'planned', activity_id: null } },
        });
        return true;
      },
      dropSession: async (userId, sessionId) => {
        // Guard on identity BEFORE any state mutation, same as
        // `recipes.ts`'s `toggleFavourite` -- a write can never succeed
        // without a session anyway (RLS scopes `planned_sessions` by
        // `auth.uid()`), and without this guard an empty `userId` would
        // still flip the optimistic UI and try (or queue) a write nothing
        // can ever authenticate.
        if (!userId) throw new Error('dropSession: no user id');
        const prev = get().byId[sessionId];
        if (!prev) return;
        set({
          byId: { ...get().byId, [sessionId]: { ...prev, status: 'dropped' } },
          pendingOps: { ...get().pendingOps, [sessionId]: { op: 'drop' } },
        });

        const { error, status } = await supabase
          .from('planned_sessions')
          .update({ status: 'dropped' })
          .eq('id', sessionId);

        if (error) {
          if (isPermanentError({ message: error.message, status, code: error.code })) {
            // Deterministic failure (RLS violation, malformed id, etc.) --
            // this can never succeed on replay, so revert the optimistic
            // drop immediately and surface the existing friendly error
            // rather than queueing a write that will just dead-letter later.
            // No realistic user path hits this for a drop today (there is
            // nothing to violate), but every write in this plan classifies
            // before enqueueing, for consistency -- see the plan's Global
            // Constraints.
            const revertedOps = { ...get().pendingOps };
            delete revertedOps[sessionId];
            set({
              byId: { ...get().byId, [sessionId]: prev },
              pendingOps: revertedOps,
              lastError: { at: Date.now(), op: 'dropSession', message: error.message },
            });
            throw new Error(error.message);
          }
          // Transient/offline failure -- queue it and keep going. Keep the
          // optimistic drop and the pendingOps marker -- do NOT revert here.
          // Only a genuine dead-letter (via syncPending's reconciliation,
          // see revertLocalDrop) reverts it.
          await enqueue(userId, 'dropSession', { sessionId });
          syncPending(userId);
        } else {
          const next = { ...get().pendingOps };
          delete next[sessionId];
          set({ pendingOps: next });
        }
      },
      /**
       * The inverse of `dropSession`'s optimistic drop: reverts a session's
       * status back to `planned` and clears its `pendingOps` marker. A no-op
       * unless `pendingOps[sessionId]` is still a pending `drop` -- this
       * must never undo a drop the server has already confirmed (which
       * clears the marker itself, see `dropSession`) nor a drop that has
       * already been reverted.
       *
       * Returns whether it actually reverted anything, so `syncPending`'s
       * dead-letter sweep can tell "undone" apart from "nothing to undo" and
       * only mark the former reconciled (see `OutboxItem.reconciledAt`).
       */
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
      moveSession: async (userId, sessionId, newDate) => {
        // Identity guard before any state mutation, same as `dropSession`.
        if (!userId) throw new Error('moveSession: no user id');
        const prev = get().byId[sessionId];
        if (!prev) throw new Error(`moveSession: session ${sessionId} not in cache`);

        // The replacement row's id is generated HERE, before anything is
        // written, and is final -- there is no temp id and no later swap.
        // That is what makes the queued replay idempotent (the handler
        // upserts on this id, so a replay lands on the same row instead of
        // putting a second copy of the session on the target date), and it
        // also means this function can return the real id even when the
        // write only got as far as the outbox.
        const newSessionId: SessionId = uuid.v4();
        const [ny, nm, nd] = newDate.split('-').map(Number);
        const jsDay = new Date(Date.UTC(ny, nm - 1, nd)).getUTCDay();
        const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1;   // 0=Mon .. 6=Sun

        const newRow: PlannedSessionRow = {
          ...prev,
          id: newSessionId, scheduled_date: newDate, day_of_week: dayOfWeek,
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

        // Everything the replacement row needs is already cached on `prev`
        // (see SESSION_COLUMNS) -- no SELECT, here or in the handler.
        const payload = {
          sessionId, newSessionId, newDate, userId,
          blockId:           prev.block_id,
          weekNumber:        prev.week_number,
          dayOfWeek,
          modality:          prev.modality as string,
          sessionLabel:      prev.session_label,
          runStructure:      prev.run_structure ?? null,
          strengthStructure: prev.strength_structure ?? null,
        };

        const failMove = (message: string): never => {
          get().revertLocalMove(sessionId);
          set({ lastError: { at: Date.now(), op: 'moveSession', message } });
          throw new Error(message);
        };

        // Step 1: the replacement row. Written first, so a failure between
        // the two steps can never leave the original pointing at a row that
        // does not exist (see the handler's header).
        const { error: upsertErr, status: upsertStatus } = await supabase
          .from('planned_sessions')
          .upsert({
            id:                 newSessionId,
            user_id:            userId,
            block_id:           payload.blockId,
            scheduled_date:     newDate,
            week_number:        payload.weekNumber,
            day_of_week:        dayOfWeek,
            modality:           payload.modality,
            session_label:      payload.sessionLabel,
            status:             'planned',
            run_structure:      payload.runStructure,
            strength_structure: payload.strengthStructure,
          }, { onConflict: 'id' });

        if (upsertErr && isPermanentError({ message: upsertErr.message, status: upsertStatus, code: upsertErr.code })) {
          // A clash is DETERMINISTIC and user-triggerable, not a
          // connectivity problem: queueing it would show the move as done
          // and then snap it back minutes later behind a generic "couldn't
          // save this one". Revert now and keep the specific message this
          // path has always shown.
          if (upsertErr.code === '23505') {
            return failMove(
              `That day already has a ${payload.modality} session (${payload.sessionLabel}). `
              + "Two identical sessions can't share a day. Move the existing one first.",
            );
          }
          return failMove(upsertErr.message);
        }

        if (!upsertErr) {
          // Step 2: point the original at the replacement.
          const { error: updateErr, status: updateStatus } = await supabase
            .from('planned_sessions')
            .update({ status: 'moved', moved_to_id: newSessionId })
            .eq('id', sessionId);

          if (!updateErr) {
            const nextOps = { ...get().pendingOps };
            delete nextOps[sessionId];
            set({ pendingOps: nextOps });
            return newSessionId;
          }
          if (isPermanentError({ message: updateErr.message, status: updateStatus, code: updateErr.code })) {
            // The replacement row IS on the server at this point, so the
            // revert leaves the cache briefly behind server truth -- the
            // next refresh of that date pulls it back. Better than pinning a
            // half-applied move nothing will ever finish.
            return failMove(updateErr.message);
          }
        }

        // Transient/offline on either step. Queue the WHOLE move (both steps
        // replay; both are idempotent) and keep the optimistic state -- only
        // a genuine dead letter reverts it, via `revertLocalMove`.
        await enqueue(userId, 'moveSession', payload);
        syncPending(userId);
        return newSessionId;
      },
      /**
       * The inverse of `moveSession`'s optimistic move, undoing BOTH halves.
       * A no-op unless `pendingOps[sessionId]` is still a pending `move`, so
       * it can never undo a move the server has confirmed (which clears the
       * marker itself) nor one already reverted.
       *
       * Returns whether it actually reverted anything, so `syncPending`'s
       * dead-letter sweep can tell "undone" apart from "nothing to undo" and
       * only mark the former reconciled (see `OutboxItem.reconciledAt`).
       */
      revertLocalMove: (sessionId) => {
        const prev    = get().byId[sessionId];
        const pending = get().pendingOps[sessionId];
        if (!prev || !pending || pending.op !== 'move') return false;
        const { newSessionId } = pending;

        const nextById      = { ...get().byId };
        const nextIdsByDate = { ...get().idsByDate };
        const newRow        = nextById[newSessionId];
        delete nextById[newSessionId];
        nextById[sessionId] = { ...prev, status: 'planned', moved_to_id: null };
        if (newRow) {
          const kept = (nextIdsByDate[newRow.scheduled_date] ?? []).filter((id) => id !== newSessionId);
          if (kept.length > 0) nextIdsByDate[newRow.scheduled_date] = kept;
          else delete nextIdsByDate[newRow.scheduled_date];
        }

        const nextOps = { ...get().pendingOps };
        delete nextOps[sessionId];
        // The replacement row is about to stop existing, so anything queued
        // against it has to stop being tracked too -- a drop applied to a
        // not-yet-confirmed moved session leaves a `pendingOps` entry keyed
        // by an id that is no longer in `byId`, which nothing would ever
        // clear (it would keep `refresh()` preserving a ghost forever).
        delete nextOps[newSessionId];

        set({ byId: nextById, idsByDate: nextIdsByDate, pendingOps: nextOps });
        return true;
      },
      linkActivity: async (activityId, sessionId) => {
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
            lastError: { at: Date.now(), op: 'linkActivity', message: e instanceof Error ? e.message : String(e) },
          });
          throw e;
        }
      },

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
        // Without this, an app restart between an optimistic drop (or move)
        // and the outbox draining loses the marker entirely: byId/idsByDate
        // ARE persisted (so the dropped-looking row survives restart), but
        // with no pendingOps entry the next refresh() immediately flips it
        // back to 'planned' before the queued item has a chance to land --
        // silently undoing the drop the user thinks already happened.
        pendingOps: s.pendingOps,
      }),
      version: 1,
      migrate: () => ({ byId: {}, idsByDate: {}, loadedRanges: [], pendingOps: {} }) as any,
      onRehydrateStorage: () => (state) => {
        if (state) state.hasHydrated = true;
      },
    },
  ),
);

/**
 * Whether `dateISO` falls within a loaded, non-stale range -- i.e. the store
 * has actually queried this date, as distinct from simply having no rows
 * cached for it. `refresh()` only creates an `idsByDate[date]` key for dates
 * that come back with >=1 row, so a date with zero planned sessions (a rest
 * day) never gets a key at all, loaded or not. Callers that need to tell
 * "confirmed rest day" apart from "not fetched yet" must check this instead
 * of `idsByDate[date]` presence.
 */
export function hasLoadedDate(dateISO: DateISO): boolean {
  return isCovered(useSessionStore.getState().loadedRanges, dateISO, dateISO, Date.now());
}
