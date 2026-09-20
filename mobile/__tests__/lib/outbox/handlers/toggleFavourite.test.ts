const mockUpsert = jest.fn();
const mockDeleteEq2 = jest.fn();
const mockDeleteEq1 = jest.fn(() => ({ eq: mockDeleteEq2 }));
const mockDelete = jest.fn(() => ({ eq: mockDeleteEq1 }));

const mockFrom = jest.fn((table: string) => {
  if (table === 'recipe_favourites') return { upsert: mockUpsert, delete: mockDelete };
  throw new Error(`unexpected table ${table}`);
});

jest.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => mockFrom(t) } }));

import { handleToggleFavourite } from '@/lib/outbox/handlers/toggleFavourite';
import { SupabaseWriteError } from '@/lib/outbox/errors';
import type { MutationPayloadMap } from '@/lib/outbox';

beforeEach(() => {
  jest.clearAllMocks();
  mockUpsert.mockResolvedValue({ error: null, status: 200 });
  mockDeleteEq2.mockResolvedValue({ error: null, status: 200 });
});

const onPayload: MutationPayloadMap['toggleFavourite'] = {
  userId: 'u1', recipeId: 'r1', desiredState: true,
};
const offPayload: MutationPayloadMap['toggleFavourite'] = {
  userId: 'u1', recipeId: 'r1', desiredState: false,
};

describe('handleToggleFavourite', () => {
  it('upserts onto recipe_favourites, keyed on (user_id, recipe_id), when desiredState is true', async () => {
    await handleToggleFavourite(onPayload);

    expect(mockFrom).toHaveBeenCalledWith('recipe_favourites');
    expect(mockUpsert).toHaveBeenCalledWith(
      { user_id: 'u1', recipe_id: 'r1' },
      { onConflict: 'user_id,recipe_id' },
    );
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('deletes the row by (user_id, recipe_id) when desiredState is false', async () => {
    await handleToggleFavourite(offPayload);

    expect(mockFrom).toHaveBeenCalledWith('recipe_favourites');
    expect(mockDelete).toHaveBeenCalled();
    expect(mockDeleteEq1).toHaveBeenCalledWith('user_id', 'u1');
    expect(mockDeleteEq2).toHaveBeenCalledWith('recipe_id', 'r1');
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('resolves with no return value on success', async () => {
    await expect(handleToggleFavourite(onPayload)).resolves.toBeUndefined();
    await expect(handleToggleFavourite(offPayload)).resolves.toBeUndefined();
  });

  it('treats a delete matching no row (already off) as success, not a throw', async () => {
    mockDeleteEq2.mockResolvedValue({ error: null, status: 200 });
    await expect(handleToggleFavourite(offPayload)).resolves.toBeUndefined();
  });

  it('throws a SupabaseWriteError carrying status/code/message when the upsert fails', async () => {
    mockUpsert.mockResolvedValue({
      error: { message: 'boom', code: '42501' }, status: 403,
    });

    const err = await handleToggleFavourite(onPayload).catch((e) => e);

    expect(err).toBeInstanceOf(SupabaseWriteError);
    expect(err.status).toBe(403);
    expect(err.code).toBe('42501');
    expect(err.message).toBe('boom');
  });

  it('throws a SupabaseWriteError carrying status/code/message when the delete fails', async () => {
    mockDeleteEq2.mockResolvedValue({
      error: { message: 'boom', code: '42501' }, status: 403,
    });

    const err = await handleToggleFavourite(offPayload).catch((e) => e);

    expect(err).toBeInstanceOf(SupabaseWriteError);
    expect(err.status).toBe(403);
    expect(err.code).toBe('42501');
    expect(err.message).toBe('boom');
  });
});
