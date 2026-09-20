import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

const mockBack = jest.fn();
const mockUseLocalSearchParams = jest.fn();
jest.mock('expo-router', () => ({
  router: { back: (...args: any[]) => mockBack(...args), push: jest.fn() },
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const mockCancelNutritionReminderForMeal = jest.fn();
jest.mock('@/lib/notifications', () => ({
  cancelNutritionReminderForMeal: (...args: any[]) => mockCancelNutritionReminderForMeal(...args),
}));

jest.mock('@/store/auth', () => ({
  // Every selector call resolves to this fixed shape regardless of the
  // selector passed in -- both `s.user?.id` (truthy check only) and
  // `s.session` (needs `.user.id` for `enqueue`) happen to read correctly
  // off it since `session.user.id` and `user.id` are the same value here.
  useAuthStore: () => ({ user: { id: 'user-1' } }),
}));

const mockEnqueue = jest.fn();
jest.mock('@/lib/outbox', () => ({ enqueue: (...args: any[]) => mockEnqueue(...args) }));

const mockSyncPending = jest.fn();
jest.mock('@/lib/syncPending', () => ({ syncPending: (...args: any[]) => mockSyncPending(...args) }));

const mockAddEntryLocal = jest.fn();
jest.mock('@/store/nutritionDay', () => ({
  useNutritionDay: { getState: () => ({ addEntryLocal: (...args: any[]) => mockAddEntryLocal(...args), removeEntryLocal: jest.fn(), days: {} }) },
}));
jest.mock('@/store/profile', () => ({
  // Acknowledged, so the one-time disclosure card never blocks the flow below.
  useProfileStore: () => ({
    haikuDisclosureAcknowledgedAt: '2026-01-01T00:00:00Z',
    acknowledgeHaikuDisclosure:    jest.fn(),
  }),
}));

const mockInvoke = jest.fn();
const mockInsert = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: any[]) => mockInvoke(...args) },
    from:      () => ({ insert: (rows: any) => mockInsert(rows) }),
  },
}));

import DescribeMealScreen from '@/app/(app)/describe-meal';

const ESTIMATE_ITEM = {
  food_name:  'Chicken katsu curry',
  quantity_g: 450,
  calories:   780,
  carbs_g:    90,
  protein_g:  38,
  fat_g:      28,
  fibre_g:    4,
  confidence: 0.8,
};

async function describeAndEstimate(getByText: any, getByPlaceholderText: any) {
  fireEvent.changeText(
    getByPlaceholderText('e.g. Pulled pork BBQ burger with chips and a Diet Coke'),
    'Chicken katsu curry',
  );
  await act(async () => {
    fireEvent.press(getByText('Estimate'));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockInvoke.mockResolvedValue({
    data:  { items: [ESTIMATE_ITEM], overall_confidence: 0.8, notes: null },
    error: null,
  });
  mockInsert.mockResolvedValue({ error: null });
});

describe('describe-meal save, meal type resilience', () => {
  it('saves with the meal type the route sent', async () => {
    mockUseLocalSearchParams.mockReturnValue({ logId: 'log-1', mealType: 'lunch' });
    const { getByText, getByPlaceholderText } = render(<DescribeMealScreen />);

    await describeAndEstimate(getByText, getByPlaceholderText);
    await act(async () => {
      fireEvent.press(getByText('Save 1 item'));
    });

    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({ meal_type: 'lunch', log_id: 'log-1' }),
    ]);
    expect(mockBack).toHaveBeenCalled();
  });

  // Regression test for the bug where food-search.tsx sent the route param as
  // `activeMeal` instead of `mealType`: describe-meal read `mealType` as
  // undefined, so every insert violated food_entries.meal_type's NOT NULL
  // constraint and Save silently failed. Whatever the cause of a missing or
  // invalid param, the screen must still produce a valid meal_type rather
  // than a guaranteed-failing insert.
  it('falls back to a valid meal type when the route param is missing, instead of sending an invalid insert', async () => {
    mockUseLocalSearchParams.mockReturnValue({ logId: 'log-1' }); // no mealType
    const { getByText, getByPlaceholderText } = render(<DescribeMealScreen />);

    await describeAndEstimate(getByText, getByPlaceholderText);
    await act(async () => {
      fireEvent.press(getByText('Save 1 item'));
    });

    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({ meal_type: 'snack' }),
    ]);
    const savedRow = mockInsert.mock.calls[0][0][0];
    expect(savedRow.meal_type).not.toBeUndefined();
    expect(mockBack).toHaveBeenCalled();
  });

  it('falls back to a valid meal type when the route param is not a recognised meal', async () => {
    mockUseLocalSearchParams.mockReturnValue({ logId: 'log-1', mealType: 'brunch' });
    const { getByText, getByPlaceholderText } = render(<DescribeMealScreen />);

    await describeAndEstimate(getByText, getByPlaceholderText);
    await act(async () => {
      fireEvent.press(getByText('Save 1 item'));
    });

    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({ meal_type: 'snack' }),
    ]);
  });
});

describe('describe-meal save failure (offline / transient)', () => {
  // A failed direct insert now matches Task 1's convention (food-search.tsx's
  // handleAdd/handleAddManual/handleAddCombo): queue it on the outbox and let
  // the user carry on, rather than surfacing an inline error and blocking.
  it('queues the write via the outbox and still navigates back, without a plain (non-replace) replaceCriteria', async () => {
    mockUseLocalSearchParams.mockReturnValue({ logId: 'log-1', mealType: 'lunch' });
    mockInsert.mockResolvedValue({ error: { message: 'network unreachable' } });
    const { getByText, queryByText, getByPlaceholderText } = render(<DescribeMealScreen />);

    await describeAndEstimate(getByText, getByPlaceholderText);
    await act(async () => {
      fireEvent.press(getByText('Save 1 item'));
    });

    expect(queryByText('COULD NOT SAVE')).toBeNull();
    await waitFor(() => expect(mockEnqueue).toHaveBeenCalledWith(
      'user-1',
      'logFoodEntries',
      expect.objectContaining({
        rows: [expect.objectContaining({ meal_type: 'lunch', log_id: 'log-1', source: 'haiku' })],
        replaceCriteria: undefined,
      }),
    ));
    expect(mockSyncPending).toHaveBeenCalledWith('user-1');
    expect(mockAddEntryLocal).toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalled();
  });
});
