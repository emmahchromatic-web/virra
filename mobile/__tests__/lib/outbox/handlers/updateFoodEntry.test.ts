const mockSelect = jest.fn();
const mockEq     = jest.fn(() => ({ select: mockSelect }));
const mockUpdate = jest.fn(() => ({ eq: mockEq }));

const mockFrom = jest.fn((table: string) => {
  if (table === 'food_entries') return { update: mockUpdate };
  throw new Error(`unexpected table ${table}`);
});

jest.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => mockFrom(t) } }));

import { handleUpdateFoodEntry } from '@/lib/outbox/handlers/updateFoodEntry';
import { SupabaseWriteError } from '@/lib/outbox/errors';
import type { MutationPayloadMap } from '@/lib/outbox';

beforeEach(() => {
  jest.clearAllMocks();
  mockSelect.mockResolvedValue({ data: [{ id: 'entry-1' }], error: null, status: 200 });
});

const payload: MutationPayloadMap['updateFoodEntry'] = {
  entryId:   'entry-1',
  quantityG: 150,
  calories:  300,
  carbsG:    40,
  proteinG:  10,
  fatG:      5,
  fibreG:    4,
};

describe('handleUpdateFoodEntry', () => {
  it('updates the row on food_entries by id with the macro fields', async () => {
    await handleUpdateFoodEntry(payload);

    expect(mockFrom).toHaveBeenCalledWith('food_entries');
    expect(mockUpdate).toHaveBeenCalledWith({
      quantity_g: 150,
      calories:   300,
      carbs_g:    40,
      protein_g:  10,
      fat_g:      5,
      fibre_g:    4,
    });
    expect(mockEq).toHaveBeenCalledWith('id', 'entry-1');
    expect(mockSelect).toHaveBeenCalledWith('id');
  });

  it('resolves with no return value on success', async () => {
    await expect(handleUpdateFoodEntry(payload)).resolves.toBeUndefined();
  });

  it('throws a SupabaseWriteError carrying status/code/message when the update fails', async () => {
    mockSelect.mockResolvedValue({
      data: null, error: { message: 'boom', code: '42501' }, status: 403,
    });

    const err = await handleUpdateFoodEntry(payload).catch((e) => e);

    expect(err).toBeInstanceOf(SupabaseWriteError);
    expect(err.status).toBe(403);
    expect(err.code).toBe('42501');
    expect(err.message).toBe('boom');
  });

  it('throws a SupabaseWriteError (not a silent success) when the update matches no row', async () => {
    // Unlike a delete, there is nothing left to converge on when the target
    // row is already gone -- this must dead-letter, not be swallowed.
    mockSelect.mockResolvedValue({ data: [], error: null, status: 200 });

    const err = await handleUpdateFoodEntry(payload).catch((e) => e);

    expect(err).toBeInstanceOf(SupabaseWriteError);
    // Synthesized so the drain's classifier treats a not-found as permanent
    // (dead-letter immediately) rather than retrying forever.
    expect(err.status).toBe(404);
  });
});
