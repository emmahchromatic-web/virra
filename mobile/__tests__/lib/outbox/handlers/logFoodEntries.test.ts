import { handler } from '@/lib/outbox/handlers/logFoodEntries';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

describe('logFoodEntries handler', () => {
  const row = {
    id: 'e1', log_id: 'log1', meal_type: 'lunch', food_name: 'Apple',
    quantity_g: 150, quantity_unit: 'g', calories: 80, carbs_g: 20,
    protein_g: 0, fat_g: 0, fibre_g: 4, nutritionix_id: null,
    source: 'off', haiku_input: null, confidence: null,
  };

  it('upserts every row on id, not a plain insert', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    (supabase.from as jest.Mock).mockReturnValue({ upsert });
    await handler({ rows: [row] });
    expect(upsert).toHaveBeenCalledWith([row], { onConflict: 'id' });
  });

  it('a replay with the same id does not duplicate (idempotent upsert)', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    (supabase.from as jest.Mock).mockReturnValue({ upsert });
    await handler({ rows: [row] });
    await handler({ rows: [row] });
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenNthCalledWith(1, [row], { onConflict: 'id' });
    expect(upsert).toHaveBeenNthCalledWith(2, [row], { onConflict: 'id' });
  });

  it('throws SupabaseWriteError on a genuine failure', async () => {
    const upsert = jest.fn().mockResolvedValue({
      error: { message: 'row-level security policy violation', code: '42501' },
    });
    (supabase.from as jest.Mock).mockReturnValue({ upsert });
    await expect(handler({ rows: [row] })).rejects.toMatchObject({
      name: 'SupabaseWriteError',
      code: '42501',
    });
  });
});
