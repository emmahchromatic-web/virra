import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-blur', () => ({ BlurView: ({ children }: any) => children }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: class {} }));
jest.mock('@react-navigation/native', () => ({ useFocusEffect: () => {} }));

jest.mock('@/lib/trainingBlocks', () => ({ getActiveBlocks: jest.fn().mockResolvedValue([]) }));
jest.mock('@/lib/healthKitWeight', () => ({
  enableWeightTracking:     jest.fn().mockResolvedValue(3),
  readWeightSyncDiagnostic: jest.fn().mockResolvedValue(null),
}));
jest.mock('@/components/ui/BreakModal', () => ({ BreakModal: () => null }));
jest.mock('@/components/ui/WeightExplainerModal', () => ({ WeightExplainerModal: () => null }));
jest.mock('@/components/ui/VirraAlert', () => ({ appAlert: jest.fn(), appPrompt: jest.fn(), VirraAlertHost: () => null }));

jest.mock('@/store/auth', () => ({
  useAuthStore: () => ({ session: { user: { id: 'user-1', email: 'a@b.com' } }, signOut: jest.fn() }),
}));
jest.mock('@/store/subscription', () => ({ useSubscriptionStore: () => ({ status: 'active' }) }));
jest.mock('@/store/cycle', () => ({
  useCycleStore: () => ({
    cycleInfo: null, periodStart: null, cycleLength: 28,
    setCycleLength: jest.fn(), setPeriodStart: jest.fn(), cycleProfile: 'natural',
  }),
}));

const mockSave = jest.fn().mockResolvedValue(undefined);
let mockTrackWeight = true;
jest.mock('@/store/profile', () => ({
  useProfileStore: () => ({
    firstName: 'Emma', lastName: 'Harrison', avatarUrl: null,
    stepsTarget: 8000, workoutPreference: 'gym_full',
    save: mockSave, trackWeight: mockTrackWeight,
    weightExplainerDismissedAt: '2026-09-01', bumpWeightDataVersion: jest.fn(),
  }),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
        }),
      }),
    }),
    auth:      { getSession: () => Promise.resolve({ data: { session: { user: { id: 'user-1' } } } }) },
    functions: { invoke: jest.fn().mockResolvedValue({ error: null }) },
  },
}));

import ProfileScreen from '@/app/(app)/(tabs)/profile';
import { appAlert } from '@/components/ui/VirraAlert';
import { enableWeightTracking } from '@/lib/healthKitWeight';

const alertMock = appAlert as jest.Mock;

async function renderProfile() {
  const utils = render(<ProfileScreen />);
  await act(async () => {});
  return utils;
}

beforeEach(() => {
  mockSave.mockClear();
  alertMock.mockClear();
  (enableWeightTracking as jest.Mock).mockClear();
});

/** Card 307: turning weight tracking off asks first, and says what coming back does. */
describe('Profile: turning weight tracking off', () => {
  it('asks before saving anything', async () => {
    mockTrackWeight = true;
    const utils = await renderProfile();
    await act(async () => { fireEvent(utils.getByLabelText('Track weight'), 'valueChange', false); });

    expect(mockSave).not.toHaveBeenCalled();
    expect(alertMock).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = alertMock.mock.calls[0];
    expect(title).toBe('Turn off weight tracking?');
    expect(message).toMatch(/kept but hidden/);
    expect(message).toMatch(/re-imports your last year/);
    expect(buttons.map((b: { text: string; style?: string }) => [b.text, b.style])).toEqual([
      ['Keep tracking', 'cancel'],
      ['Turn off', 'destructive'],
    ]);
  });

  it('Keep tracking saves nothing; Turn off saves off without importing', async () => {
    mockTrackWeight = true;
    const utils = await renderProfile();
    await act(async () => { fireEvent(utils.getByLabelText('Track weight'), 'valueChange', false); });
    const buttons = alertMock.mock.calls[0][2];

    await act(async () => { buttons[0].onPress?.(); });
    expect(mockSave).not.toHaveBeenCalled();

    await act(async () => { buttons[1].onPress(); });
    expect(mockSave).toHaveBeenCalledWith('user-1', { trackWeight: false });
    expect(enableWeightTracking).not.toHaveBeenCalled();
  });

  it('turning it on asks nothing and imports as before', async () => {
    mockTrackWeight = false;
    const utils = await renderProfile();
    await act(async () => { fireEvent(utils.getByLabelText('Track weight'), 'valueChange', true); });

    expect(alertMock).not.toHaveBeenCalled();
    expect(mockSave).toHaveBeenCalledWith('user-1', { trackWeight: true });
    expect(enableWeightTracking).toHaveBeenCalledTimes(1);
  });
});
