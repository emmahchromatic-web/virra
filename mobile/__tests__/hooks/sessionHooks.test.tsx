import React from 'react';
import { Text } from 'react-native';
import { render, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@/lib/supabase', () => {
  const rows = [
    { id: 's1', scheduled_date: '2026-05-25', modality: 'run', session_label: 'Easy', status: 'planned',
      block_id: null, activity_id: null, moved_to_id: null, week_number: 0, day_of_week: 0, created_at: '2026-05-20T00:00:00Z' },
    { id: 's2', scheduled_date: '2026-05-27', modality: 'strength', session_label: 'Lower', status: 'planned',
      block_id: null, activity_id: null, moved_to_id: null, week_number: 0, day_of_week: 2, created_at: '2026-05-20T00:00:00Z' },
  ];
  const builder = {
    select: () => builder, eq: () => builder, gte: () => builder, lte: () => builder,
    in: () => builder, is: () => builder, neq: () => builder,
    order: () => Promise.resolve({ data: rows, error: null }),
  };
  return {
    supabase: {
      from: () => builder,
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    },
  };
});

import { useSessionStore } from '@/store/sessionStore';
import { useWeekSessions } from '@/hooks/useWeekSessions';
import { useMonthSessions } from '@/hooks/useMonthSessions';
import { useSessionById } from '@/hooks/useSessionById';
import { useDateRangeSessions } from '@/hooks/useDateRangeSessions';

beforeEach(async () => {
  await AsyncStorage.clear();
  useSessionStore.setState({
    byId: {}, idsByDate: {}, loadedRanges: [], fetching: new Set(),
    hasHydrated: true, lastError: null,
  });
});

function WeekProbe({ start }: { start: string }) {
  const { days } = useWeekSessions(start);
  return <Text testID="week">{days.map((d) => `${d.date}:${d.sessions.length}`).join('|')}</Text>;
}

function MonthProbe({ y, m }: { y: number; m: number }) {
  const { byDate } = useMonthSessions(y, m);
  return <Text testID="month">{Object.keys(byDate).sort().join(',')}</Text>;
}

function ByIdProbe({ id }: { id: string | null }) {
  const row = useSessionById(id);
  return <Text testID="byId">{row ? `${row.id}:${row.status}` : 'null'}</Text>;
}

describe('selector hooks', () => {
  it('useWeekSessions fetches the requested 7-day range and exposes per-day arrays', async () => {
    const view = render(<WeekProbe start="2026-05-25" />);
    await waitFor(() => {
      const t = view.getByTestId('week').props.children;
      expect(t).toContain('2026-05-25:1');
      expect(t).toContain('2026-05-27:1');
    });
  });

  it('useMonthSessions covers the full month range', async () => {
    const view = render(<MonthProbe y={2026} m={5} />);
    await waitFor(() => {
      const t = view.getByTestId('month').props.children;
      expect(t).toContain('2026-05-25');
      expect(t).toContain('2026-05-27');
    });
  });

  it('useSessionById returns null until session is loaded then returns row', async () => {
    const view = render(<ByIdProbe id="s1" />);
    expect(view.getByTestId('byId').props.children).toBe('null');
    await act(async () => {
      await useSessionStore.getState().ensureLoaded('2026-05-25', '2026-05-25');
    });
    await waitFor(() => expect(view.getByTestId('byId').props.children).toBe('s1:planned'));
  });

  it('useSessionById returns null when given a null id', () => {
    const view = render(<ByIdProbe id={null} />);
    expect(view.getByTestId('byId').props.children).toBe('null');
  });
});

function RangeProbe({ from, to }: { from: string; to: string }) {
  const { byDate } = useDateRangeSessions(from, to);
  const keys = Object.keys(byDate).sort();
  return <Text testID="range">{keys.map((k) => `${k}:${byDate[k].length}`).join('|')}</Text>;
}

describe('useDateRangeSessions', () => {
  it('returns sessions within an arbitrary inclusive window', async () => {
    const view = render(<RangeProbe from="2026-05-20" to="2026-05-30" />);
    await waitFor(() => {
      const t = view.getByTestId('range').props.children;
      expect(t).toContain('2026-05-25:1');
      expect(t).toContain('2026-05-27:1');
    });
  });

  it('respects start boundary inclusively (start date matches)', async () => {
    const view = render(<RangeProbe from="2026-05-25" to="2026-05-26" />);
    await waitFor(() => {
      const t = view.getByTestId('range').props.children;
      expect(t).toContain('2026-05-25:1');
      expect(t).not.toContain('2026-05-27');
    });
  });

  it('respects end boundary inclusively (end date matches)', async () => {
    const view = render(<RangeProbe from="2026-05-26" to="2026-05-27" />);
    await waitFor(() => {
      const t = view.getByTestId('range').props.children;
      expect(t).toContain('2026-05-27:1');
      expect(t).not.toContain('2026-05-25');
    });
  });
});
