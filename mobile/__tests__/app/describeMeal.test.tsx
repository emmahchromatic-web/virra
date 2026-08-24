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
  useAuthStore: () => ({ user: { id: 'user-1' } }),
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

describe('describe-meal save failure', () => {
  it('shows a dismissible inline banner instead of a global alert, and stays interactive', async () => {
    mockUseLocalSearchParams.mockReturnValue({ logId: 'log-1', mealType: 'lunch' });
    mockInsert.mockResolvedValue({ error: { message: 'network unreachable' } });
    const { getByText, queryByText, getByPlaceholderText, getByLabelText } = render(<DescribeMealScreen />);

    await describeAndEstimate(getByText, getByPlaceholderText);
    await act(async () => {
      fireEvent.press(getByText('Save 1 item'));
    });

    // Error surfaces in-tree, not via a second native modal stacked on top of
    // the food-search modal this screen is pushed inside of.
    expect(getByText('COULD NOT SAVE')).toBeTruthy();
    expect(getByText('network unreachable')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();

    // The screen must remain interactive after a failed save — dismiss the
    // banner and confirm the Save button is still there to retry.
    fireEvent.press(getByLabelText('Dismiss'));
    await waitFor(() => expect(queryByText('COULD NOT SAVE')).toBeNull());
    expect(getByText('Save 1 item')).toBeTruthy();
  });
});
