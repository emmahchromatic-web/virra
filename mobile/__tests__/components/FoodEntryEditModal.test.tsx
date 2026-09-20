import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { FoodEntryEditModal, type FoodEntry } from '@/components/ui/FoodEntryEditModal';

jest.mock('@/lib/supabase', () => {
  const eq     = jest.fn().mockResolvedValue({ error: null });
  const update = jest.fn(() => ({ eq }));
  return {
    supabase: { from: jest.fn(() => ({ update })) },
    __update: update,
    __eq:     eq,
  };
});

jest.mock('@/lib/outbox', () => ({ enqueue: jest.fn() }));
jest.mock('@/lib/syncPending', () => ({ syncPending: jest.fn() }));
jest.mock('@/store/nutritionDay', () => ({
  useNutritionDay: { getState: () => ({ updateEntryLocal: jest.fn() }) },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const supabaseMock = require('@/lib/supabase');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { enqueue } = require('@/lib/outbox');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { useNutritionDay } = require('@/store/nutritionDay');

const entry: FoodEntry = {
  id: 'entry-1', meal_type: 'lunch', food_name: 'Chicken salad', calories: 450,
  carbs_g: 20, protein_g: 40, fat_g: 15, fibre_g: 6, quantity_g: 350, quantity_unit: 'g',
};

beforeEach(() => {
  jest.clearAllMocks();
  supabaseMock.__eq.mockResolvedValue({ error: null });
});

describe('FoodEntryEditModal', () => {
  // Regression for the bug class b66b311 fixed for handleDeleteEntry:
  // attempting the write with no userId must not fall through to a silent
  // "looks saved" close -- it should refuse up front and say so.
  it('refuses to save and shows an error when userId is null, without writing or closing', async () => {
    const onSaved = jest.fn();
    const onClose = jest.fn();
    const { getByText, findByText } = render(
      <FoodEntryEditModal
        visible={true}
        entry={entry}
        userId={null}
        recordedOn="2026-09-19"
        onClose={onClose}
        onSaved={onSaved}
      />
    );

    fireEvent.press(getByText('SAVE'));

    await findByText(/Can.t save right now/i);
    expect(supabaseMock.__update).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('saves directly and closes when userId is present and the write succeeds', async () => {
    const onSaved = jest.fn();
    const onClose = jest.fn();
    const { getByText } = render(
      <FoodEntryEditModal
        visible={true}
        entry={entry}
        userId="u1"
        recordedOn="2026-09-19"
        onClose={onClose}
        onSaved={onSaved}
      />
    );

    fireEvent.press(getByText('SAVE'));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(supabaseMock.__update).toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('enqueues the edit when userId is present but the direct write fails', async () => {
    supabaseMock.__eq.mockResolvedValue({ error: { message: 'offline', code: undefined }, status: 0 });
    const onSaved = jest.fn();
    const { getByText } = render(
      <FoodEntryEditModal
        visible={true}
        entry={entry}
        userId="u1"
        recordedOn="2026-09-19"
        onClose={() => {}}
        onSaved={onSaved}
      />
    );

    fireEvent.press(getByText('SAVE'));

    await waitFor(() => expect(enqueue).toHaveBeenCalled());
    expect(enqueue).toHaveBeenCalledWith('u1', 'updateFoodEntry', expect.objectContaining({ entryId: 'entry-1' }));
    // Still reflects as saved locally/optimistically despite the queued write.
    expect(onSaved).toHaveBeenCalled();
  });
});
