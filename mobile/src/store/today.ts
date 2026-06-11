import { create } from 'zustand';
import type { TodaysSession } from '@/lib/todaysSession';

interface TodayState {
  todaySessions:    TodaysSession[];
  setTodaySessions: (sessions: TodaysSession[]) => void;
}

export const useTodayStore = create<TodayState>((set) => ({
  todaySessions:    [],
  setTodaySessions: (sessions) => set({ todaySessions: sessions }),
}));
