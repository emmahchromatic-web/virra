const mockUpsert = jest.fn();

const mockFrom = jest.fn((table: string) => {
  if (table === 'meal_combos') return { upsert: mockUpsert };
  throw new Error(`unexpected table ${table}`);
});

jest.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => mockFrom(t) } }));

import { handleSaveMealCombo } from '@/lib/outbox/handlers/saveMealCombo';
import { SupabaseWriteError } from '@/lib/outbox/errors';
import type { MutationPayloadMap } from '@/lib/outbox';

beforeEach(() => {
  jest.clearAllMocks();
  mockUpsert.mockResolvedValue({ error: null });
});

const payload: MutationPayloadMap['saveMealCombo'] = {
  id:         'combo-1',
  user_id:    'u1',
  name:       'Post-run porridge',
  meal_type:  'breakfast',
  items_json: [{ food_name: 'Oats', quantity_g: 80 }],
};

describe('handleSaveMealCombo', () => {
  it('upserts the combo onto meal_combos, keyed on id (not a plain insert)', async () => {
    await handleSaveMealCombo(payload);

    expect(mockFrom).toHaveBeenCalledWith('meal_combos');
    expect(mockUpsert).toHaveBeenCalledWith(payload, { onConflict: 'id' });
  });

  it('resolves with no return value on success', async () => {
    await expect(handleSaveMealCombo(payload)).resolves.toBeUndefined();
  });

  it('replaying the same id does not duplicate -- it upserts, not inserts', async () => {
    await handleSaveMealCombo(payload);
    await handleSaveMealCombo(payload);

    expect(mockUpsert).toHaveBeenCalledTimes(2);
    for (const call of mockUpsert.mock.calls) {
      expect(call).toEqual([payload, { onConflict: 'id' }]);
    }
  });

  it('throws a SupabaseWriteError carrying status/code/message when the upsert fails', async () => {
    mockUpsert.mockResolvedValue({
      error: { message: 'boom', code: '23505' }, status: 409,
    });

    const err = await handleSaveMealCombo(payload).catch((e) => e);

    expect(err).toBeInstanceOf(SupabaseWriteError);
    expect(err.status).toBe(409);
    expect(err.code).toBe('23505');
    expect(err.message).toBe('boom');
  });
});
