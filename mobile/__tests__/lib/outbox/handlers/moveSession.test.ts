const mockUpsert = jest.fn();
const mockEq     = jest.fn();
const mockUpdate = jest.fn(() => ({ eq: mockEq }));

const mockFrom = jest.fn((table: string) => {
  if (table === 'planned_sessions') return { upsert: mockUpsert, update: mockUpdate };
  throw new Error(`unexpected table ${table}`);
});

jest.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => mockFrom(t) } }));

import { handleMoveSession } from '@/lib/outbox/handlers/moveSession';
import { SupabaseWriteError } from '@/lib/outbox/errors';
import type { MutationPayloadMap } from '@/lib/outbox';

beforeEach(() => {
  jest.clearAllMocks();
  mockUpsert.mockResolvedValue({ error: null, status: 201 });
  mockEq.mockResolvedValue({ error: null, status: 200 });
});

const payload: MutationPayloadMap['moveSession'] = {
  sessionId:         'orig-1',
  newSessionId:      'new-1',
  newDate:           '2026-05-20',   // a Wednesday
  userId:            'u1',
  blockId:           'b1',
  weekNumber:        2,
  dayOfWeek:         2,
  modality:          'run',
  sessionLabel:      'tempo',
  runStructure:      { version: 1, workout_type: 'tempo', total_distance_m: 8000, steps: [] },
  strengthStructure: null,
};

describe('handleMoveSession', () => {
  it('upserts the replacement row on the client-generated id, then marks the original moved', async () => {
    await handleMoveSession(payload);

    expect(mockFrom).toHaveBeenCalledWith('planned_sessions');
    expect(mockUpsert).toHaveBeenCalledWith({
      id:                 'new-1',
      user_id:            'u1',
      block_id:           'b1',
      scheduled_date:     '2026-05-20',
      week_number:        2,
      day_of_week:        2,
      modality:           'run',
      session_label:      'tempo',
      status:             'planned',
      run_structure:      payload.runStructure,
      strength_structure: null,
    }, { onConflict: 'id' });
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'moved', moved_to_id: 'new-1' });
    expect(mockEq).toHaveBeenCalledWith('id', 'orig-1');
  });

  it('writes the replacement row BEFORE marking the original moved', async () => {
    const order: string[] = [];
    mockUpsert.mockImplementation(async () => { order.push('upsert'); return { error: null }; });
    mockEq.mockImplementation(async () => { order.push('update'); return { error: null }; });

    await handleMoveSession(payload);

    // The other order would, on a crash between the two, leave the original
    // pointing at a row that does not exist -- a session that has vanished.
    expect(order).toEqual(['upsert', 'update']);
  });

  it('never SELECTs: every field the replacement row needs travels in the payload', async () => {
    await handleMoveSession(payload);

    // `from('planned_sessions')` is only ever handed `upsert`/`update` above;
    // a `.select()` would throw `undefined is not a function` before this.
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  /**
   * The whole point of the client-generated id: replaying the SAME item must
   * land on the SAME row, not put a second copy of the session on the target
   * date the way the old SELECT/INSERT/UPDATE version did.
   */
  it('is idempotent on replay -- a second run upserts the identical id, creating no second row', async () => {
    await handleMoveSession(payload);
    await handleMoveSession(payload);

    expect(mockUpsert).toHaveBeenCalledTimes(2);
    expect(mockUpsert.mock.calls[0][0].id).toBe('new-1');
    expect(mockUpsert.mock.calls[1][0].id).toBe('new-1');
    expect(mockUpsert.mock.calls[0][0]).toEqual(mockUpsert.mock.calls[1][0]);
  });

  it('resolves with no return value on success', async () => {
    await expect(handleMoveSession(payload)).resolves.toBeUndefined();
  });

  it('throws a SupabaseWriteError carrying the 23505 code when the upsert clashes', async () => {
    mockUpsert.mockResolvedValue({
      error: { message: 'duplicate key value violates unique constraint "planned_sessions_no_clash_idx"', code: '23505' },
      status: 409,
    });

    const err = await handleMoveSession(payload).catch((e) => e);

    expect(err).toBeInstanceOf(SupabaseWriteError);
    expect(err.code).toBe('23505');   // must survive for isPermanentError
    expect(err.status).toBe(409);
    // The original is left alone -- no half-applied move.
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('throws a SupabaseWriteError when the second (mark-moved) step fails', async () => {
    mockEq.mockResolvedValue({ error: { message: 'boom', code: '42501' }, status: 403 });

    const err = await handleMoveSession(payload).catch((e) => e);

    expect(err).toBeInstanceOf(SupabaseWriteError);
    expect(err.status).toBe(403);
    expect(err.code).toBe('42501');
    expect(err.message).toBe('boom');
  });
});
