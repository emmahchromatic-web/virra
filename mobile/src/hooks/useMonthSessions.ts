import { useEffect, useMemo } from 'react';
import { useSessionStore } from '@/store/sessionStore';
import type { DateISO, PlannedSessionRow } from '@/store/sessionStore.types';

function monthRange(year: number, month: number): { from: DateISO; to: DateISO } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const from = `${year}-${pad(month)}-01`;
  // Date(year, month, 0) returns the last day of the previous month at index `month`.
  // Since `month` here is 1-indexed (1=Jan..12=Dec), Date.UTC(year, month, 0) gives
  // the last day of month `month` itself.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const to = `${year}-${pad(month)}-${pad(lastDay)}`;
  return { from, to };
}

export function useMonthSessions(year: number, month: number): {
  byDate:     Record<DateISO, PlannedSessionRow[]>;
  isFetching: boolean;
} {
  const { from, to } = useMemo(() => monthRange(year, month), [year, month]);

  useEffect(() => {
    useSessionStore.getState().ensureLoaded(from, to);
  }, [from, to]);

  const byId      = useSessionStore((s) => s.byId);
  const idsByDate = useSessionStore((s) => s.idsByDate);
  const fetching  = useSessionStore((s) => s.fetching);

  return useMemo(() => {
    const byDate: Record<DateISO, PlannedSessionRow[]> = {};
    for (const [date, ids] of Object.entries(idsByDate)) {
      if (date >= from && date <= to) {
        byDate[date] = ids.map((id) => byId[id]).filter(Boolean);
      }
    }
    return { byDate, isFetching: fetching.has(`${from}..${to}`) };
  }, [from, to, byId, idsByDate, fetching]);
}
