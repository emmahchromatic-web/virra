const mockSingle       = jest.fn();
const mockSelect       = jest.fn(() => ({ single: mockSingle }));
const mockUpsertAct    = jest.fn(() => ({ select: mockSelect }));
const mockUpsertOther  = jest.fn().mockResolvedValue({ error: null });
const mockInsert       = jest.fn().mockResolvedValue({ error: null });
const mockEqUpdate     = jest.fn().mockResolvedValue({ error: null });
const mockUpdate       = jest.fn(() => ({ eq: mockEqUpdate }));
const mockEqDelete     = jest.fn().mockResolvedValue({ error: null });
const mockDelete       = jest.fn(() => ({ eq: mockEqDelete }));

const mockFrom = jest.fn((table: string) => {
  if (table === 'activities') return { upsert: mockUpsertAct };
  if (table === 'planned_sessions') return { update: mockUpdate };
  return { upsert: mockUpsertOther, insert: mockInsert, delete: mockDelete };
});

jest.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => mockFrom(t) } }));

import { handleCompleteWorkout } from '@/lib/outbox/handlers/completeWorkout';
import type { PendingCompletion } from '@/lib/pendingCompletions';

// A stand-in for the `strength_set_logs` table, so "what is actually stored
// after a replay" is assertable rather than inferred from call counts.
const setLogRows: Record<string, unknown>[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  setLogRows.length = 0;
  mockEqDelete.mockImplementation(async (column: string, value: unknown) => {
    for (let i = setLogRows.length - 1; i >= 0; i -= 1) {
      if (setLogRows[i][column] === value) setLogRows.splice(i, 1);
    }
    return { error: null };
  });
  mockInsert.mockImplementation(async (rows: Record<string, unknown>[]) => {
    setLogRows.push(...rows);
    return { error: null };
  });
});

describe('handleCompleteWorkout', () => {
  it('replays a queued strength completion, stamping activity_id on every child row', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'act-1' }, error: null });
    const item: PendingCompletion = {
      kind: 'strength', queuedAt: '2026-09-19T09:00:00Z', sessionId: 'sess-1',
      activity: { user_id: 'u1', started_at: '2026-09-19T08:00:00Z' },
      setRows: [{ exercise: 'squat', reps: 8 }],
      details: { session_type: 'lower' },
    };
    await handleCompleteWorkout(item);

    expect(mockUpsertAct).toHaveBeenCalledWith(item.activity, { onConflict: 'user_id,started_at' });
    expect(mockInsert).toHaveBeenCalledWith([{ exercise: 'squat', reps: 8, activity_id: 'act-1' }]);
    // Same reasoning as the run case below: pin the table, not just the payload.
    expect(mockFrom).toHaveBeenCalledWith('strength_details');
    expect(mockFrom).not.toHaveBeenCalledWith('run_details');
    expect(mockUpsertOther).toHaveBeenCalledWith({ session_type: 'lower', activity_id: 'act-1' }, { onConflict: 'activity_id' });
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'completed', activity_id: 'act-1' });
    expect(mockEqUpdate).toHaveBeenCalledWith('id', 'sess-1');
  });

  it('throws when the activity upsert errors, so the outbox treats it as a failed drain step', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'Network request failed' } });
    const item: PendingCompletion = {
      kind: 'run', queuedAt: '2026-09-19T09:00:00Z', sessionId: null,
      activity: { user_id: 'u1', started_at: '2026-09-19T08:00:00Z' }, runDetails: {},
    };
    await expect(handleCompleteWorkout(item)).rejects.toThrow();
  });

  /**
   * The replay case is routine, not exotic: the activity upsert can succeed and
   * the process die (or the network drop) before the item leaves the outbox.
   * `strength_set_logs` has no unique key to upsert against, so without the
   * clear-first step every set would be logged again on the next drain.
   */
  it('is idempotent on replay: two runs leave exactly one copy of each set', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'act-1' }, error: null });
    const item: PendingCompletion = {
      kind: 'strength', queuedAt: '2026-09-19T09:00:00Z', sessionId: 'sess-1',
      activity: { user_id: 'u1', started_at: '2026-09-19T08:00:00Z' },
      setRows: [{ exercise: 'squat', reps: 8 }, { exercise: 'squat', reps: 6 }],
      details: { session_type: 'lower' },
    };

    await handleCompleteWorkout(item);
    expect(setLogRows).toHaveLength(2);

    await handleCompleteWorkout(item);
    expect(setLogRows).toHaveLength(2);
    expect(setLogRows).toEqual([
      { exercise: 'squat', reps: 8, activity_id: 'act-1' },
      { exercise: 'squat', reps: 6, activity_id: 'act-1' },
    ]);
    expect(mockEqDelete).toHaveBeenCalledWith('activity_id', 'act-1');
  });

  it('throws when clearing the old set logs fails, rather than half-writing the workout', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'act-1' }, error: null });
    mockEqDelete.mockResolvedValueOnce({ error: { message: 'Network request failed' }, status: 500 });
    const item: PendingCompletion = {
      kind: 'strength', queuedAt: '2026-09-19T09:00:00Z', sessionId: null,
      activity: { user_id: 'u1', started_at: '2026-09-19T08:00:00Z' },
      setRows: [{ exercise: 'squat', reps: 8 }],
      details: null,
    };
    await expect(handleCompleteWorkout(item)).rejects.toThrow(/Network request failed/);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('carries the Supabase status and code onto the thrown error, so the drain can classify it', async () => {
    mockSingle.mockResolvedValue({
      data: null, error: { message: 'boom', code: '57P01' }, status: 503,
    });
    const item: PendingCompletion = {
      kind: 'run', queuedAt: '2026-09-19T09:00:00Z', sessionId: null,
      activity: { user_id: 'u1', started_at: '2026-09-19T08:00:00Z' }, runDetails: {},
    };
    const err = await handleCompleteWorkout(item).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(503);
    expect(err.code).toBe('57P01');
  });

  it('does not touch planned_sessions when the completion was not linked to one', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'act-2' }, error: null });
    const item: PendingCompletion = {
      kind: 'run', queuedAt: '2026-09-19T09:00:00Z', sessionId: null,
      activity: { user_id: 'u1', started_at: '2026-09-19T08:00:00Z' },
      runDetails: { avg_pace_seconds_per_km: 300 },
    };
    await handleCompleteWorkout(item);
    // Right table AND right payload. `mockUpsertOther` is shared by every
    // table that isn't `activities` or `planned_sessions`, so the payload
    // assertion alone would still pass if the run details were written to
    // `strength_details` by mistake.
    expect(mockFrom).toHaveBeenCalledWith('run_details');
    expect(mockUpsertOther).toHaveBeenCalledWith(
      { avg_pace_seconds_per_km: 300, activity_id: 'act-2' },
      { onConflict: 'activity_id' },
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
