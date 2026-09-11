import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'act-1' }),
  router: { back: jest.fn(), push: jest.fn() },
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: any) => children }));
jest.mock('@/store/auth', () => ({ useAuthStore: () => ({ session: { user: { id: 'user-1' } } }) }));

const mockMaybeSingle = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: () => mockMaybeSingle() }) }),
      }),
    }),
  },
}));

import ActivityDetailScreen from '@/app/(app)/activity/[id]';

const IMPORTED_RUN = {
  id: 'act-1',
  activity_type: 'run',
  sub_type: null,
  started_at: '2026-08-28T10:44:43.000Z',
  duration_seconds: 2700,
  distance_meters: 6090,
  phase_at_time: 'luteal',
  // No splits and no trace: this is what a HealthKit import looks like.
  run_details: [{
    avg_pace_seconds_per_km: 443,
    elevation_gain_meters: 62,
    hr_avg: 154,
    hr_max: 178,
    splits_json: [],
    gps_trace: null,
  }],
};

/**
 * Card 259. hr_avg and hr_max were written by both the import and the in-app
 * tracker and read by nothing: there was no detail route at all, and
 * ActivityRow was a plain View, so a run could be seen and never opened. This
 * is the screen that makes card 044 testable.
 */
describe('activity detail', () => {
  beforeEach(() => mockMaybeSingle.mockReset());

  it('shows the heart rate that card 044 has been importing all along', async () => {
    mockMaybeSingle.mockResolvedValue({ data: IMPORTED_RUN, error: null });

    const { getByText } = render(<ActivityDetailScreen />);

    await waitFor(() => expect(getByText('154')).toBeTruthy());
    expect(getByText('178')).toBeTruthy();
    expect(getByText('AVG HR')).toBeTruthy();
    expect(getByText('MAX HR')).toBeTruthy();
  });

  it('says an imported average covers the stops too', async () => {
    mockMaybeSingle.mockResolvedValue({ data: IMPORTED_RUN, error: null });

    const { getByText } = render(<ActivityDetailScreen />);

    await waitFor(() => expect(getByText(/Imported from Apple Health/i)).toBeTruthy());
  });

  it('explains a missing heart rate instead of showing a blank', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { ...IMPORTED_RUN, run_details: [{ ...IMPORTED_RUN.run_details[0], hr_avg: null, hr_max: null }] },
      error: null,
    });

    const { getByText, queryByText } = render(<ActivityDetailScreen />);

    await waitFor(() => expect(getByText(/No heart rate for this run/i)).toBeTruthy());
    // And the note about imported averages is gone: there is no average to
    // caveat, so it would be noise.
    expect(queryByText(/Imported from Apple Health/i)).toBeNull();
  });

  it('shows splits for a run Virra recorded, and no import caveat', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        ...IMPORTED_RUN,
        run_details: [{
          ...IMPORTED_RUN.run_details[0],
          splits_json: [{ km: 1, sec: 440 }, { km: 2, sec: 428 }],
          gps_trace: [{ lat: 1, lng: 1 }],
        }],
      },
      error: null,
    });

    const { getByText, queryByText } = render(<ActivityDetailScreen />);

    await waitFor(() => expect(getByText('SPLITS')).toBeTruthy());
    expect(getByText('KM 1')).toBeTruthy();
    expect(getByText('7:08/km')).toBeTruthy();
    expect(queryByText(/Imported from Apple Health/i)).toBeNull();
  });
});
