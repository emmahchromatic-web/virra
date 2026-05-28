import { useEffect, useMemo } from 'react';
import { useSessionStore } from '@/store/sessionStore';
import type { DateISO, PlannedSessionRow } from '@/store/sessionStore.types';

/**
 * Returns sessions whose scheduled_date falls within [fromDate, toDate] (inclusive).
 * Triggers ensureLoaded for the range on mount or when the range changes.
 *
 * Use when the consumer wants an arbitrary window (e.g. 14-day lookahead) that
 * doesn't fit `useWeekSessions` (7 days) or `useMonthSessions` (calendar month).
 */
export function useDateRangeSessions(fromDate: DateISO, toDate: DateISO): {
  byDate:     Record<DateISO, PlannedSessionRow[]>;
  isFetching: boolean;
} {
  useEffect(() => {
    useSessionStore.getState().ensureLoaded(fromDate, toDate);
  }, [fromDate, toDate]);

  const byId      = useSessionStore((s) => s.byId);
  const idsByDate = useSessionStore((s) => s.idsByDate);
  const fetching  = useSessionStore((s) => s.fetching);

  return useMemo(() => {
    const byDate: Record<DateISO, PlannedSessionRow[]> = {};
    for (const [date, ids] of Object.entries(idsByDate)) {
      if (date >= fromDate && date <= toDate) {
        byDate[date] = ids.map((id) => byId[id]).filter(Boolean);
      }
    }
    return { byDate, isFetching: fetching.has(`${fromDate}..${toDate}`) };
  }, [fromDate, toDate, byId, idsByDate, fetching]);
}
