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

// `mockDays` and `mockRemoveEntryLocal` are SINGLE, stable references shared
// across every `getState()` call (`handleSaveAll` calls `getState()` once per
// `removeEntryLocal` inside its `forEach`, plus once more for the stale-id
// read and once for `addEntryLocal` -- a fresh `jest.fn()` per call, as an
// earlier version of this mock had, would make call-count/call-args
// assertions across those calls meaningless). `mockAddEntryLocal` actually
// mutates `mockDays`, mirroring the real store's `addEntryLocal`, so replace-
// mode tests below can genuinely exercise the "capture stale ids BEFORE the
// new rows land in the cache" ordering in describe-meal.tsx, not just assert
// against a mock that never changes state.
const mockRemoveEntryLocal = jest.fn();
let mockDays: Record<string, { logId: string | null; entries: any[] }> = {};
const mockAddEntryLocal = jest.fn((recordedOn: string, rows: any[]) => {
  const day = mockDays[recordedOn];
  mockDays[recordedOn] = day
    ? { ...day, entries: [...day.entries, ...rows] }
    : { logId: rows[0]?.log_id ?? null, entries: rows };
});
jest.mock('@/store/nutritionDay', () => ({
  useNutritionDay: {
    getState: () => ({
      days:             mockDays,
      addEntryLocal:    (recordedOn: string, rows: any[]) => mockAddEntryLocal(recordedOn, rows),
      removeEntryLocal: (...args: any[]) => mockRemoveEntryLocal(...args),
    }),
  },
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
const mockDeleteResult = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: any[]) => mockInvoke(...args) },
    from:      () => ({
      insert: (rows: any) => mockInsert(rows),
      // `.delete().eq('log_id', ...).eq('haiku_input', ...)` -- only the
      // final `.eq()` call's resolved value matters to the handler.
      delete: () => ({ eq: () => ({ eq: (...args: any[]) => mockDeleteResult(...args) }) }),
    }),
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
  mockDays = {};
  mockInvoke.mockResolvedValue({
    data:  { items: [ESTIMATE_ITEM], overall_confidence: 0.8, notes: null },
    error: null,
  });
  mockInsert.mockResolvedValue({ error: null });
  mockDeleteResult.mockResolvedValue({ error: null });
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

describe('describe-meal replace mode (unedited re-estimate)', () => {
  const today = new Date().toISOString().split('T')[0];
  const OLD_ENTRY = {
    id: 'old-entry-1', log_id: 'log-1', haiku_input: 'Chicken katsu curry',
    meal_type: 'lunch', food_name: 'Chicken katsu curry', calories: 700,
    carbs_g: 80, protein_g: 30, fat_g: 20, fibre_g: 3, quantity_g: 400,
    quantity_unit: 'g', source: 'haiku',
  };

  function setUpReplaceRoute() {
    mockUseLocalSearchParams.mockReturnValue({
      logId: 'log-1', mealType: 'lunch',
      prefillHaikuInput: 'Chicken katsu curry', replaceHaikuInput: 'Chicken katsu curry',
    });
  }

  it('captures the stale entry id BEFORE addEntryLocal runs, then removes only that old row once the direct delete succeeds', async () => {
    mockDays[today] = { logId: 'log-1', entries: [{ ...OLD_ENTRY, id: 'old-entry-1' }] };
    setUpReplaceRoute();
    const { getByText, getByPlaceholderText } = render(<DescribeMealScreen />);

    await describeAndEstimate(getByText, getByPlaceholderText);
    await act(async () => {
      fireEvent.press(getByText('Replace with 1 item'));
    });

    // The new row landed in the cache (mockAddEntryLocal's mock impl actually
    // mutates mockDays, mirroring the real store).
    expect(mockAddEntryLocal).toHaveBeenCalledTimes(1);
    const newRows = mockAddEntryLocal.mock.calls[0][1];
    const newIds  = newRows.map((r: any) => r.id);
    expect(newIds).not.toContain('old-entry-1');

    // Exactly the old row is removed -- if `staleEntryIds` had instead been
    // captured AFTER `addEntryLocal` (a self-matching bug: the new rows carry
    // the SAME haiku_input as the old ones in this unedited-re-estimate case),
    // this would also have fired for every id in `newIds`.
    expect(mockRemoveEntryLocal).toHaveBeenCalledTimes(1);
    expect(mockRemoveEntryLocal).toHaveBeenCalledWith(today, 'old-entry-1');
    newIds.forEach((id: string) => {
      expect(mockRemoveEntryLocal).not.toHaveBeenCalledWith(today, id);
    });

    expect(mockBack).toHaveBeenCalled();
  });

  it('removes the old row when the direct delete fails but the save is enqueued with replaceCriteria', async () => {
    mockDays[today] = { logId: 'log-1', entries: [{ ...OLD_ENTRY, id: 'old-entry-2' }] };
    mockDeleteResult.mockResolvedValue({ error: { message: 'delete blip' } });
    mockInsert.mockResolvedValue({ error: { message: 'network unreachable' } });
    setUpReplaceRoute();
    const { getByText, getByPlaceholderText } = render(<DescribeMealScreen />);

    await describeAndEstimate(getByText, getByPlaceholderText);
    await act(async () => {
      fireEvent.press(getByText('Replace with 1 item'));
    });

    await waitFor(() => expect(mockEnqueue).toHaveBeenCalledWith(
      'user-1',
      'logFoodEntries',
      expect.objectContaining({
        replaceCriteria: { logId: 'log-1', haikuInput: 'Chicken katsu curry' },
      }),
    ));

    expect(mockRemoveEntryLocal).toHaveBeenCalledTimes(1);
    expect(mockRemoveEntryLocal).toHaveBeenCalledWith(today, 'old-entry-2');
  });

  it('leaves the old row in place when the direct delete fails but the direct insert succeeds (nothing tracks the removal)', async () => {
    mockDays[today] = { logId: 'log-1', entries: [{ ...OLD_ENTRY, id: 'old-entry-3' }] };
    mockDeleteResult.mockResolvedValue({ error: { message: 'delete blip' } });
    mockInsert.mockResolvedValue({ error: null });
    setUpReplaceRoute();
    const { getByText, getByPlaceholderText } = render(<DescribeMealScreen />);

    await describeAndEstimate(getByText, getByPlaceholderText);
    await act(async () => {
      fireEvent.press(getByText('Replace with 1 item'));
    });

    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockRemoveEntryLocal).not.toHaveBeenCalled();
  });
});
