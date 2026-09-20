const mockEq     = jest.fn();
const mockUpdate = jest.fn(() => ({ eq: mockEq }));

const mockFrom = jest.fn((table: string) => {
  if (table === 'planned_sessions') return { update: mockUpdate };
  throw new Error(`unexpected table ${table}`);
});

jest.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => mockFrom(t) } }));

import { handleDropSession } from '@/lib/outbox/handlers/dropSession';
import { SupabaseWriteError } from '@/lib/outbox/errors';
import type { MutationPayloadMap } from '@/lib/outbox';

beforeEach(() => {
  jest.clearAllMocks();
  mockEq.mockResolvedValue({ error: null });
});

const payload: MutationPayloadMap['dropSession'] = { sessionId: 'session-1' };

describe('handleDropSession', () => {
  it('updates planned_sessions status to dropped by id', async () => {
    await handleDropSession(payload);

    expect(mockFrom).toHaveBeenCalledWith('planned_sessions');
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'dropped' });
    expect(mockEq).toHaveBeenCalledWith('id', 'session-1');
  });

  it('resolves with no return value on success', async () => {
    await expect(handleDropSession(payload)).resolves.toBeUndefined();
  });

  it('treats an update matching no row (already gone/dropped) as success, not a throw', async () => {
    // Postgres/PostgREST does not error an UPDATE that affects zero rows --
    // exactly what replaying this item looks like when the direct write in
    // sessionStore.ts already landed before the network dropped the response,
    // or when this same item replays twice.
    mockEq.mockResolvedValue({ error: null, status: 200 });

    await expect(handleDropSession(payload)).resolves.toBeUndefined();
  });

  it('throws a SupabaseWriteError carrying status/code/message when the update fails', async () => {
    mockEq.mockResolvedValue({
      error: { message: 'boom', code: '42501' }, status: 403,
    });

    const err = await handleDropSession(payload).catch((e) => e);

    expect(err).toBeInstanceOf(SupabaseWriteError);
    expect(err.status).toBe(403);
    expect(err.code).toBe('42501');
    expect(err.message).toBe('boom');
  });
});
