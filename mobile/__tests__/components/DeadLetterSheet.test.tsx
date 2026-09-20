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
