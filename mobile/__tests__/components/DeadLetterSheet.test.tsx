import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { DeadLetterSheet, labelForDeadLetter } from '@/components/ui/DeadLetterSheet';
import type { OutboxItem } from '@/lib/outbox';

jest.mock('@/lib/outbox', () => ({
  readDeadLetters: jest.fn(),
  dismissDeadLetter: jest.fn().mockResolvedValue(undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readDeadLetters, dismissDeadLetter } = require('@/lib/outbox');

const workoutItem: OutboxItem = {
  id: 'ob_1', kind: 'completeWorkout', attempts: 3, createdAt: '2026-09-01T00:00:00.000Z',
  lastError: 'row-level security policy violation',
  payload: { kind: 'run', queuedAt: '2026-09-01T00:00:00.000Z', sessionId: null, activity: { started_at: '2026-09-01T12:00:00.000Z' }, runDetails: {} } as never,
};

const checkInItem: OutboxItem = {
  id: 'ob_2', kind: 'checkIn', attempts: 1, createdAt: '2026-09-02T00:00:00.000Z',
  lastError: 'duplicate key value violates unique constraint',
  payload: { user_id: 'u1', recorded_on: '2026-09-02', energy: 3, mood: 3, sleep_quality: 3, symptoms: [], notes: null } as never,
};

const logFoodEntriesItem: OutboxItem = {
  id: 'ob_3', kind: 'logFoodEntries', attempts: 1, createdAt: '2026-09-03T00:00:00.000Z',
  lastError: 'new row violates row-level security policy for table "food_entries"',
  payload: {
    rows: [{
      id: 'fe_1', log_id: 'log_1', meal_type: 'breakfast', food_name: 'Porridge',
      quantity_g: 200, quantity_unit: 'g', calories: 300, carbs_g: 50, protein_g: 10, fat_g: 5,
      fibre_g: 4, nutritionix_id: null, source: 'manual', haiku_input: null, confidence: null,
    }],
  } as never,
};

const logFoodEntriesMultiRowItem: OutboxItem = {
  id: 'ob_3b', kind: 'logFoodEntries', attempts: 1, createdAt: '2026-09-03T00:00:00.000Z',
  lastError: 'new row violates row-level security policy for table "food_entries"',
  payload: {
    rows: [
      {
        id: 'fe_2', log_id: 'log_1', meal_type: 'lunch', food_name: 'Chicken sandwich',
        quantity_g: 250, quantity_unit: 'g', calories: 450, carbs_g: 40, protein_g: 30, fat_g: 15,
        fibre_g: 3, nutritionix_id: null, source: 'haiku_estimate', haiku_input: 'chicken sandwich and crisps', confidence: 0.7,
      },
      {
        id: 'fe_3', log_id: 'log_1', meal_type: 'lunch', food_name: 'Crisps',
        quantity_g: 30, quantity_unit: 'g', calories: 160, carbs_g: 15, protein_g: 2, fat_g: 10,
        fibre_g: 1, nutritionix_id: null, source: 'haiku_estimate', haiku_input: 'chicken sandwich and crisps', confidence: 0.7,
      },
      {
        id: 'fe_4', log_id: 'log_1', meal_type: 'lunch', food_name: 'Apple juice',
        quantity_g: 200, quantity_unit: 'ml', calories: 90, carbs_g: 22, protein_g: 0, fat_g: 0,
        fibre_g: 0, nutritionix_id: null, source: 'haiku_estimate', haiku_input: 'chicken sandwich and crisps', confidence: 0.7,
      },
    ],
  } as never,
};

const dropSessionItem: OutboxItem = {
  id: 'ob_4', kind: 'dropSession', attempts: 1, createdAt: '2026-09-04T00:00:00.000Z',
  lastError: 'duplicate key value violates unique constraint',
  payload: { sessionId: 'sess_1' } as never,
};

const moveSessionItem: OutboxItem = {
  id: 'ob_5', kind: 'moveSession', attempts: 1, createdAt: '2026-09-05T00:00:00.000Z',
  lastError: 'duplicate key value violates unique constraint',
  payload: {
    sessionId: 'sess_1', newSessionId: 'sess_2', newDate: '2026-09-10', userId: 'u1',
    blockId: null, weekNumber: 1, dayOfWeek: 3, modality: 'run', sessionLabel: null,
    runStructure: null, strengthStructure: null,
  } as never,
};

beforeEach(() => {
  jest.clearAllMocks();
  readDeadLetters.mockResolvedValue([workoutItem, checkInItem]);
});

describe('DeadLetterSheet', () => {
  it('does not render when not visible', () => {
    const { queryByText } = render(<DeadLetterSheet visible={false} userId="u1" onClose={() => {}} />);
    expect(queryByText(/COULDN'T SAVE/i)).toBeNull();
  });

  it('lists dead-lettered items with a human-readable label', async () => {
    const { findByText } = render(<DeadLetterSheet visible={true} userId="u1" onClose={() => {}} />);

    await findByText('A workout from 1 Sept');
    expect(await findByText('A check-in from 2 Sept')).toBeTruthy();
  });

  // The raw `lastError` is a Postgres/PostgREST string. It stays ON the item
  // for diagnostics, but a runner gets a sentence, not a stack of internals.
  it('never shows the raw database error to the user', async () => {
    const { queryByText, findAllByText } = render(
      <DeadLetterSheet visible={true} userId="u1" onClose={() => {}} />
    );
    await findAllByText(/We couldn't save this one/);

    expect(queryByText('row-level security policy violation')).toBeNull();
    expect(queryByText('duplicate key value violates unique constraint')).toBeNull();
  });

  it('never dumps raw JSON as a label', () => {
    expect(labelForDeadLetter(workoutItem)).not.toMatch(/[{}]/);
    expect(labelForDeadLetter(checkInItem)).not.toMatch(/[{}]/);
    expect(labelForDeadLetter(logFoodEntriesItem)).not.toMatch(/[{}]/);
    expect(labelForDeadLetter(logFoodEntriesMultiRowItem)).not.toMatch(/[{}]/);
    expect(labelForDeadLetter(dropSessionItem)).not.toMatch(/[{}]/);
    expect(labelForDeadLetter(moveSessionItem)).not.toMatch(/[{}]/);
  });

  it('labels the three J3b kinds', () => {
    expect(labelForDeadLetter(logFoodEntriesItem)).toBe('A food entry from Porridge');
    expect(labelForDeadLetter(dropSessionItem)).toBe('A dropped training session');
    expect(labelForDeadLetter(moveSessionItem)).toBe('Moving a session to 10 Sept');
  });

  // A combo/describe-meal payload can carry several rows -- the label must use
  // the FIRST row's name, never the whole array and never the last row.
  it('labels a multi-row logFoodEntries payload using only the first row', () => {
    expect(labelForDeadLetter(logFoodEntriesMultiRowItem)).toBe('A food entry from Chicken sandwich');
    expect(labelForDeadLetter(logFoodEntriesMultiRowItem)).not.toMatch(/Crisps|Apple juice/);
  });

  it('renders the three J3b kinds in the sheet', async () => {
    readDeadLetters.mockResolvedValue([logFoodEntriesItem, dropSessionItem, moveSessionItem]);
    const { findByText } = render(<DeadLetterSheet visible={true} userId="u1" onClose={() => {}} />);

    await findByText('A food entry from Porridge');
    expect(await findByText('A dropped training session')).toBeTruthy();
    expect(await findByText('Moving a session to 10 Sept')).toBeTruthy();
  });

  it('dismisses an item, calling dismissDeadLetter(userId, id) and removing it from view', async () => {
    const { findByText, queryByText, getAllByLabelText } = render(
      <DeadLetterSheet visible={true} userId="u1" onClose={() => {}} />
    );
    await findByText('A workout from 1 Sept');

    fireEvent.press(getAllByLabelText(/^Dismiss:/)[0]);

    await waitFor(() => expect(dismissDeadLetter).toHaveBeenCalledWith('u1', 'ob_1'));
    await waitFor(() => expect(queryByText('A workout from 1 Sept')).toBeNull());
    // The other item is untouched.
    expect(await findByText('A check-in from 2 Sept')).toBeTruthy();
  });

  it('refuses to dismiss when userId is null, without calling dismissDeadLetter', async () => {
    readDeadLetters.mockResolvedValue([]);
    const { getByText, findByText } = render(
      <DeadLetterSheet visible={true} userId={null} onClose={() => {}} />
    );
    await findByText(/Nothing here/i);
    expect(readDeadLetters).not.toHaveBeenCalled();
    expect(dismissDeadLetter).not.toHaveBeenCalled();
    void getByText; // no dismiss buttons to press with an empty, unauthenticated list
  });
});
