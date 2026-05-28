import { useMemo } from 'react';
import { useWeekSessions } from './useWeekSessions';
import type { PlannedSessionRow } from '@/store/sessionStore.types';

function todayLocalISO(): string {
  return new Date().toLocaleDateString('en-CA');
}

function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().slice(0, 10);
}

export function useTodaySessions(): PlannedSessionRow[] {
  const today  = useMemo(() => todayLocalISO(), []);
  const monday = useMemo(() => mondayOf(today),  [today]);
  const { days } = useWeekSessions(monday);
  return days.find((d) => d.date === today)?.sessions ?? [];
}
