const mockSingle       = jest.fn();
const mockSelect       = jest.fn(() => ({ single: mockSingle }));
const mockUpsertAct    = jest.fn(() => ({ select: mockSelect }));
const mockUpsertOther  = jest.fn().mockResolvedValue({ error: null });
const mockInsert       = jest.fn().mockResolvedValue({ error: null });
const mockEqUpdate     = jest.fn().mockResolvedValue({ error: null });
const mockUpdate       = jest.fn(() => ({ eq: mockEqUpdate }));

const mockFrom = jest.fn((table: string) => {
  if (table === 'activities') return { upsert: mockUpsertAct };
  if (table === 'planned_sessions') return { update: mockUpdate };
  return { upsert: mockUpsertOther, insert: mockInsert };
});

jest.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => mockFrom(t) } }));

import { handleCompleteWorkout } from '@/lib/outbox/handlers/completeWorkout';
import type { PendingCompletion } from '@/lib/pendingCompletions';

beforeEach(() => jest.clearAllMocks());

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

  it('does not touch planned_sessions when the completion was not linked to one', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'act-2' }, error: null });
    const item: PendingCompletion = {
      kind: 'run', queuedAt: '2026-09-19T09:00:00Z', sessionId: null,
      activity: { user_id: 'u1', started_at: '2026-09-19T08:00:00Z' },
      runDetails: { avg_pace_seconds_per_km: 300 },
    };
    await handleCompleteWorkout(item);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
