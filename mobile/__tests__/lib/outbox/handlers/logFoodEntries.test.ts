import { handler } from '@/lib/outbox/handlers/logFoodEntries';
import { supabase } from '@/lib/supabase';
import type { LogFoodEntryRow } from '@/lib/outbox';

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

describe('logFoodEntries handler', () => {
  const row: LogFoodEntryRow = {
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

  describe('replaceCriteria (describe-meal replace mode)', () => {
    const haikuRow: LogFoodEntryRow = {
      ...row, id: 'e2', source: 'haiku', haiku_input: 'a chicken katsu curry', confidence: 0.8,
    };

    function mockFrom({ deleteError, upsertError }: { deleteError?: { message: string }; upsertError?: unknown } = {}) {
      const eq2 = jest.fn().mockResolvedValue({ error: deleteError ?? null });
      const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
      const del = jest.fn().mockReturnValue({ eq: eq1 });
      const upsert = jest.fn().mockResolvedValue({ error: upsertError ?? null });
      (supabase.from as jest.Mock).mockReturnValue({ delete: del, upsert });
      return { del, eq1, eq2, upsert };
    }

    it('deletes by (log_id, haiku_input) before upserting, when replaceCriteria is present', async () => {
      const { del, eq1, eq2, upsert } = mockFrom();
      const callOrder: string[] = [];
      eq2.mockImplementation(async () => { callOrder.push('delete'); return { error: null }; });
      upsert.mockImplementation(async () => { callOrder.push('upsert'); return { error: null }; });

      await handler({
        rows: [haikuRow],
        replaceCriteria: { logId: 'log1', haikuInput: 'a chicken katsu curry' },
      });

      expect(del).toHaveBeenCalledTimes(1);
      expect(eq1).toHaveBeenCalledWith('log_id', 'log1');
      expect(eq2).toHaveBeenCalledWith('haiku_input', 'a chicken katsu curry');
      expect(upsert).toHaveBeenCalledWith([haikuRow], { onConflict: 'id' });
      expect(callOrder).toEqual(['delete', 'upsert']);
    });

    it('logs a warning on a delete failure but still runs the upsert, and does not throw', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const { upsert } = mockFrom({ deleteError: { message: 'network blip' } });

      await expect(handler({
        rows: [haikuRow],
        replaceCriteria: { logId: 'log1', haikuInput: 'a chicken katsu curry' },
      })).resolves.toBeUndefined();

      expect(warnSpy).toHaveBeenCalledWith('[logFoodEntries] failed to remove prior haiku rows:', 'network blip');
      expect(upsert).toHaveBeenCalledWith([haikuRow], { onConflict: 'id' });
      warnSpy.mockRestore();
    });

    it('does not call delete at all when replaceCriteria is absent', async () => {
      const del = jest.fn();
      const upsert = jest.fn().mockResolvedValue({ error: null });
      (supabase.from as jest.Mock).mockReturnValue({ delete: del, upsert });

      await handler({ rows: [row] });

      expect(del).not.toHaveBeenCalled();
      expect(upsert).toHaveBeenCalledWith([row], { onConflict: 'id' });
    });

    it('a delete failure does not prevent a genuine upsert error from throwing', async () => {
      const { } = mockFrom({
        deleteError: { message: 'network blip' },
        upsertError: { message: 'row-level security policy violation', code: '42501' },
      });
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      await expect(handler({
        rows: [haikuRow],
        replaceCriteria: { logId: 'log1', haikuInput: 'a chicken katsu curry' },
      })).rejects.toMatchObject({ name: 'SupabaseWriteError', code: '42501' });

      warnSpy.mockRestore();
    });

    it('replaying an unedited re-estimate (same haiku_input as the delete criteria) is idempotent', async () => {
      // Simulates: delete ran online, but the ack was lost before the outbox
      // recorded "sent", so this same item replays. The replay's delete
      // removes the just-inserted rows (same haiku_input), and the upsert
      // re-creates them with the same ids -- net idempotent, matching the
      // brief's stated common-case guarantee.
      const { del, eq1, eq2, upsert } = mockFrom();
      const payload = {
        rows: [haikuRow],
        replaceCriteria: { logId: 'log1', haikuInput: 'a chicken katsu curry' },
      };

      await handler(payload);
      await handler(payload);

      expect(del).toHaveBeenCalledTimes(2);
      expect(eq1).toHaveBeenNthCalledWith(1, 'log_id', 'log1');
      expect(eq1).toHaveBeenNthCalledWith(2, 'log_id', 'log1');
      expect(eq2).toHaveBeenNthCalledWith(1, 'haiku_input', 'a chicken katsu curry');
      expect(eq2).toHaveBeenNthCalledWith(2, 'haiku_input', 'a chicken katsu curry');
      expect(upsert).toHaveBeenNthCalledWith(1, [haikuRow], { onConflict: 'id' });
      expect(upsert).toHaveBeenNthCalledWith(2, [haikuRow], { onConflict: 'id' });
    });
  });
});
