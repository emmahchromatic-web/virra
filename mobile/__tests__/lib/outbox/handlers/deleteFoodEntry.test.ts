const mockEq     = jest.fn();
const mockDelete = jest.fn(() => ({ eq: mockEq }));

const mockFrom = jest.fn((table: string) => {
  if (table === 'food_entries') return { delete: mockDelete };
  throw new Error(`unexpected table ${table}`);
});

jest.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => mockFrom(t) } }));

import { handleDeleteFoodEntry } from '@/lib/outbox/handlers/deleteFoodEntry';
import { SupabaseWriteError } from '@/lib/outbox/errors';
import type { MutationPayloadMap } from '@/lib/outbox';

beforeEach(() => {
  jest.clearAllMocks();
  mockEq.mockResolvedValue({ error: null });
});

const payload: MutationPayloadMap['deleteFoodEntry'] = { entryId: 'entry-1' };

describe('handleDeleteFoodEntry', () => {
  it('deletes the row on food_entries by id', async () => {
    await handleDeleteFoodEntry(payload);

    expect(mockFrom).toHaveBeenCalledWith('food_entries');
    expect(mockDelete).toHaveBeenCalled();
    expect(mockEq).toHaveBeenCalledWith('id', 'entry-1');
  });

  it('resolves with no return value on success', async () => {
    await expect(handleDeleteFoodEntry(payload)).resolves.toBeUndefined();
  });

  it('treats a delete matching no row (already gone) as success, not a throw', async () => {
    // Postgres/PostgREST does not error a DELETE that affects zero rows -- this
    // is exactly what replaying a delete for an entry the direct call already
    // removed (or that an earlier replay already removed) looks like on the
    // wire: `{ error: null }`, same as a delete that actually matched a row.
    mockEq.mockResolvedValue({ error: null, status: 200 });

    await expect(handleDeleteFoodEntry(payload)).resolves.toBeUndefined();
  });

  it('throws a SupabaseWriteError carrying status/code/message when the delete fails', async () => {
    mockEq.mockResolvedValue({
      error: { message: 'boom', code: '42501' }, status: 403,
    });

    const err = await handleDeleteFoodEntry(payload).catch((e) => e);

    expect(err).toBeInstanceOf(SupabaseWriteError);
    expect(err.status).toBe(403);
    expect(err.code).toBe('42501');
    expect(err.message).toBe('boom');
  });
});
