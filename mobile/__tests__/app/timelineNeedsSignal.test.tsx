import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => { const R = jest.requireActual('react'); R.useEffect(cb, []); },
}));
jest.mock('@/components/ui/ActivityRow', () => ({ ActivityRow: () => null }));
const mockAuth = { session: { user: { id: 'user-1' } } };
jest.mock('@/store/auth', () => ({ useAuthStore: () => mockAuth }));

const mockNet = { offline: true };
const mockActivities = [{ id: 'a1', activity_type: 'run', started_at: new Date().toISOString(), duration_seconds: 1800, distance_meters: 5000 }];
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            range: () => Promise.resolve(mockNet.offline
              ? { data: null, error: { message: 'TypeError: Network request failed' } }
              : { data: mockActivities, error: null }),
          }),
        }),
      }),
    }),
  },
}));

import TimelineScreen from '@/app/(app)/timeline';

beforeEach(() => { mockNet.offline = true; });

/**
 * Card 7 (offline sweep). A failed read of the first page fell through to
 * `data ?? []`, which read identically to a brand-new account: "No
 * activities yet. Complete a run or sync Apple Health to see your history
 * here." is a claim about the account, not a fact about the network.
 */
describe('Activity timeline with no signal', () => {
  it('says activity history needs signal instead of claiming there is none, and Try again reloads it', async () => {
    const utils = render(<TimelineScreen />);
    await waitFor(() => expect(utils.getByText('Your activity history needs signal to load.')).toBeTruthy());
    expect(utils.queryByText('No activities yet. Complete a run or sync Apple Health to see your history here.')).toBeNull();

    mockNet.offline = false;
    await act(async () => { fireEvent.press(utils.getByText('Try again')); });

    await waitFor(() => expect(utils.getByText('TODAY')).toBeTruthy());
    expect(utils.queryByText('Your activity history needs signal to load.')).toBeNull();
  });

  it('with signal and genuinely no history, still says so', async () => {
    mockNet.offline = false;
    mockActivities.length = 0;
    const utils = render(<TimelineScreen />);
    await waitFor(() => expect(utils.getByText('No activities yet. Complete a run or sync Apple Health to see your history here.')).toBeTruthy());
    expect(utils.queryByText('Your activity history needs signal to load.')).toBeNull();
    mockActivities.push({ id: 'a1', activity_type: 'run', started_at: new Date().toISOString(), duration_seconds: 1800, distance_meters: 5000 });
  });
});
