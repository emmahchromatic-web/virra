import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { supabase } from '@/lib/supabase';
import {
  _commitLink,
  dropSession as dropSessionDb,
  moveSession as moveSessionDb,
  linkActivityToSession,
} from '@/lib/scheduleGenerator';
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

          // Replace any session currently keyed within [from,to] with the fresh server data.
          const existing = get();
          const nextById = { ...existing.byId };
          const nextIdsByDate = { ...existing.idsByDate };

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
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw new Error('moveSession: not authenticated');
          realId = await moveSessionDb(sessionId, newDate, user.id);
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
      linkActivity: async (activityId, sessionId) => {
        const prev = get().byId[sessionId];
        if (!prev) return;
        set({
          byId: { ...get().byId, [sessionId]: { ...prev, status: 'completed', activity_id: activityId } },
        });
        try {
          await linkActivityToSession(activityId as any, sessionId as any);
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
      }),
      version: 1,
      migrate: () => ({ byId: {}, idsByDate: {}, loadedRanges: [] }) as any,
      onRehydrateStorage: () => (state) => {
        if (state) state.hasHydrated = true;
      },
    },
  ),
);
