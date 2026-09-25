import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { CopyMealFromDayModal } from '@/components/ui/CopyMealFromDayModal';

// The component's `dayLabel` is relative to the real current date, so the
// logged day has to be genuinely yesterday. A hardcoded date only reads as
// YESTERDAY on the day the test was written -- '2026-09-19' began rendering
// as SATURDAY once the calendar moved on, and every test in here timed out
// waiting for a label the component was right not to show.
//
// This is a function declaration, and it is called from inside the mock
// factory rather than from a `const` at module scope, because babel's
// jest-hoist lifts `jest.mock` above the file's other statements. It carries
// `const` fixtures up with it only while their initialisers are provably
// pure -- a plain literal like `entriesData` below qualifies, a call like
// this one does not, so a `const` here would still be in its temporal dead
// zone when the factory runs. Function declarations hoist unconditionally.
//
// Built from local date parts (not `Date.now() - 86400000`) to match the
// component's own `en-CA` local-date convention and stay correct across the
// DST boundary, where a day is not 24 hours long.
function mockIsoYesterday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('en-CA');
}

const entriesData = [
  {
    log_id: 'log-yesterday', food_name: 'Porridge', quantity_g: 250, quantity_unit: 'g',
    calories: 300, carbs_g: 50, protein_g: 10, fat_g: 5, fibre_g: 4, source: 'manual',
  },
  {
    log_id: 'log-yesterday', food_name: 'Coffee', quantity_g: null, quantity_unit: null,
    calories: 5, carbs_g: 1, protein_g: 0, fat_g: 0, fibre_g: 0, source: 'haiku',
  },
];

jest.mock('@/lib/supabase', () => {
  const order      = jest.fn(async () => ({
    data:  [{ id: 'log-yesterday', recorded_on: mockIsoYesterday() }],
    error: null,
  }));
  const lt         = jest.fn(() => ({ order }));
  const gte        = jest.fn(() => ({ lt }));
  const eqLogs     = jest.fn(() => ({ gte }));
  const selectLogs = jest.fn(() => ({ eq: eqLogs }));

  const eqEntries    = jest.fn().mockResolvedValue({ data: entriesData, error: null });
  const inEntries    = jest.fn(() => ({ eq: eqEntries }));
  const selectEntries = jest.fn(() => ({ in: inEntries }));

  const insert = jest.fn().mockResolvedValue({ error: null });

  const from = jest.fn((table: string) => {
    if (table === 'nutrition_logs') return { select: selectLogs };
    if (table === 'food_entries')   return { select: selectEntries, insert };
    throw new Error(`unexpected table ${table}`);
  });

  return { supabase: { from }, __insert: insert };
});

jest.mock('@/lib/outbox', () => ({ enqueue: jest.fn() }));
jest.mock('@/lib/syncPending', () => ({ syncPending: jest.fn() }));

const mockAddEntryLocal = jest.fn();
jest.mock('@/store/nutritionDay', () => ({
  useNutritionDay: { getState: () => ({ addEntryLocal: mockAddEntryLocal }) },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const supabaseMock = require('@/lib/supabase');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { enqueue } = require('@/lib/outbox');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { syncPending } = require('@/lib/syncPending');

async function renderModal(onCopied = jest.fn(), onClose = jest.fn()) {
  const utils = render(
    <CopyMealFromDayModal
      visible={true}
      userId="u1"
      mealType="breakfast"
      targetLogId="log-today"
      onClose={onClose}
      onCopied={onCopied}
    />
  );
  await waitFor(() => expect(utils.getByText('YESTERDAY')).toBeTruthy());
  return { ...utils, onCopied, onClose };
}

beforeEach(() => {
  jest.clearAllMocks();
  supabaseMock.__insert.mockResolvedValue({ error: null });
});

describe('CopyMealFromDayModal', () => {
  it('copies directly and calls onCopied/onClose when the insert succeeds', async () => {
    const { getByLabelText, onCopied, onClose } = await renderModal();

    fireEvent.press(getByLabelText('Copy breakfast from YESTERDAY'));

    await waitFor(() => expect(onCopied).toHaveBeenCalled());
    expect(supabaseMock.__insert).toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(mockAddEntryLocal).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([expect.objectContaining({ food_name: 'Porridge' })]),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('queues the copy onto the outbox when the direct insert fails, and still reads as done', async () => {
    supabaseMock.__insert.mockResolvedValue({ error: { message: 'offline', code: undefined } });
    const { getByLabelText, onCopied, onClose } = await renderModal();

    fireEvent.press(getByLabelText('Copy breakfast from YESTERDAY'));

    await waitFor(() => expect(enqueue).toHaveBeenCalled());
    expect(enqueue).toHaveBeenCalledWith(
      'u1',
      'logFoodEntries',
      expect.objectContaining({
        rows: expect.arrayContaining([
          expect.objectContaining({ id: expect.any(String), food_name: 'Porridge' }),
          expect.objectContaining({ id: expect.any(String), food_name: 'Coffee' }),
        ]),
      }),
    );
    // Every row got a client-generated id, not just the one asserted above.
    const [, , payload] = enqueue.mock.calls[0];
    expect(payload.rows).toHaveLength(2);
    for (const row of payload.rows) {
      expect(typeof row.id).toBe('string');
      expect(row.id.length).toBeGreaterThan(0);
    }

    expect(syncPending).toHaveBeenCalledWith('u1');
    // Still reads as copied -- onCopied()'s only effect (nutrition.tsx's
    // reloadEntries -> refresh()) is safe to fire even though the write is
    // only queued, since refresh() overlays queued rows rather than
    // clobbering the optimistic local entry.
    expect(onCopied).toHaveBeenCalled();
    expect(mockAddEntryLocal).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('does nothing when userId is missing', async () => {
    const onCopied = jest.fn();
    const { getByLabelText } = await (async () => {
      const utils = render(
        <CopyMealFromDayModal
          visible={true}
          userId={null as unknown as string}
          mealType="breakfast"
          targetLogId="log-today"
          onClose={() => {}}
          onCopied={onCopied}
        />
      );
      await waitFor(() => expect(utils.getByText('YESTERDAY')).toBeTruthy());
      return utils;
    })();

    fireEvent.press(getByLabelText('Copy breakfast from YESTERDAY'));

    await new Promise((r) => setTimeout(r, 0));
    expect(supabaseMock.__insert).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(onCopied).not.toHaveBeenCalled();
  });
});
