import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

const mockUpdates: Array<{ table: string; payload: Record<string, unknown>; id: unknown }> = [];
const mockInserts: Array<{ table: string; row: Record<string, unknown> }> = [];

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn((table: string) => {
      const chain: Record<string, any> = {};
      for (const m of ['select', 'eq', 'order', 'limit', 'gte']) chain[m] = jest.fn(() => chain);
      chain.maybeSingle = jest.fn(() => Promise.resolve({ data: { id: 'log-9' }, error: null }));
      chain.then = (resolve: (r: unknown) => void) => resolve({ data: [], error: null });
      chain.update = jest.fn((payload: Record<string, unknown>) => ({
        eq: jest.fn((_col: string, id: unknown) => {
          mockUpdates.push({ table, payload, id });
          return Promise.resolve({ error: null });
        }),
      }));
      chain.insert = jest.fn((row: Record<string, unknown>) => {
        mockInserts.push({ table, row });
        return Promise.resolve({ data: null, error: null });
      });
      return chain;
    }),
  },
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/store/auth', () => ({ useAuthStore: () => ({ session: { user: { id: 'user-1' } } }) }));
jest.mock('@/components/ui/VirraAlert', () => ({ appAlert: jest.fn(), appPrompt: jest.fn(), VirraAlertHost: () => null }));
jest.mock('@/lib/weightBaselineDispatcher', () => ({ recomputeBaseline: jest.fn().mockResolvedValue(undefined) }));

import CycleDetailScreen from '@/app/(app)/cycle-detail';
import { AddWeightModal } from '@/components/ui/AddWeightModal';
import { useCycleStore } from '@/store/cycle';
import { appAlert } from '@/components/ui/VirraAlert';

const alertMock = appAlert as jest.Mock;

/** Today is day 4 of a period that started three days ago. */
function onDay4() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 3);
  useCycleStore.setState({
    cycleProfile: 'natural', cycleMode: 'flow', cycleLength: 28,
    periodDays: 5, periodDaysLogged: false, recentPeriodDays: [],
    hasPlaceboWeek: null, currentPackStart: null, contraceptionType: null,
  });
  useCycleStore.getState().setPeriodStart(start);
}

beforeEach(() => {
  mockUpdates.length = 0;
  mockInserts.length = 0;
  alertMock.mockClear();
  onDay4();
});

/**
 * Card 304, tested at the boundary rather than the helper: the length has to
 * travel from a tap on Your Cycle, into cycle_logs, into the store, and out
 * again as the phase stamped on the next thing saved.
 */
describe('logging when a period ended', () => {
  it('saves the length on the period row and turns day 4 follicular', async () => {
    const utils = render(<CycleDetailScreen />);
    expect(utils.getByText('PERIOD · ASSUMING 5 DAYS')).toBeTruthy();
    expect(utils.getByText('MENSTRUAL PHASE')).toBeTruthy();

    fireEvent.press(utils.getByLabelText('My period ended'));
    const [title, , buttons] = alertMock.mock.calls[0];
    expect(title).toBe('When did your period end?');
    expect(buttons.map((b: { text: string }) => b.text)).toEqual([
      'Today · day 4', 'Yesterday · day 3', '2 days ago · day 2', 'Cancel',
    ]);

    await act(async () => { await buttons[1].onPress(); });   // ended yesterday, day 3

    expect(mockUpdates).toEqual([{ table: 'cycle_logs', payload: { period_length_days: 3 }, id: 'log-9' }]);
    await waitFor(() => expect(utils.getByText('PERIOD · LOGGED 3 DAYS')).toBeTruthy());
    expect(utils.getByText('FOLLICULAR PHASE')).toBeTruthy();
    expect(utils.getByLabelText('Change when my period ended')).toBeTruthy();
  });

  it('stamps a weight saved afterwards as follicular, and one saved before as menstrual', async () => {
    const before = render(<AddWeightModal visible userId="user-1" onClose={() => {}} />);
    fireEvent.changeText(before.getByPlaceholderText('kg'), '60');
    fireEvent.press(before.getByText(/Save/i));
    await waitFor(() => expect(mockInserts).toHaveLength(1));
    expect(mockInserts[0].row.cycle_phase_at_time).toBe('menstrual');
    before.unmount();

    useCycleStore.getState().setLoggedPeriodDays(3);

    const after = render(<AddWeightModal visible userId="user-1" onClose={() => {}} />);
    fireEvent.changeText(after.getByPlaceholderText('kg'), '60');
    fireEvent.press(after.getByText(/Save/i));
    await waitFor(() => expect(mockInserts).toHaveLength(2));
    expect(mockInserts[1].row.cycle_phase_at_time).toBe('follicular');
    expect(mockInserts[1].row.cycle_day_at_time).toBe(4);
  });
});
