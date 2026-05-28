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
