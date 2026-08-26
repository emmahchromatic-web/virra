const mockUpsert      = jest.fn();
const mockMaybeSingle = jest.fn();
const mockEqSelect     = jest.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect       = jest.fn(() => ({ eq: mockEqSelect }));
const mockEqDelete     = jest.fn();
const mockDelete       = jest.fn(() => ({ eq: mockEqDelete }));
const mockFrom = jest.fn((_name: string) => ({ upsert: mockUpsert, select: mockSelect, delete: mockDelete }));

jest.mock('@/lib/supabase', () => ({
  supabase: { from: (name: string) => mockFrom(name) },
}));

import { saveWorkoutDraft, loadWorkoutDraft, deleteWorkoutDraft } from '@/lib/workoutDrafts';

describe('saveWorkoutDraft', () => {
  beforeEach(() => jest.clearAllMocks());

  it('upserts on user_id with the mapped column names', async () => {
    mockUpsert.mockResolvedValue({ error: null });
    await saveWorkoutDraft('user-1', 'sess-1', 'strength', '2026-08-25T10:00:00.000Z', 30, { logged: {} });

    expect(mockFrom).toHaveBeenCalledWith('workout_drafts');
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id:            'user-1',
        planned_session_id: 'sess-1',
        modality:           'strength',
        started_at:         '2026-08-25T10:00:00.000Z',
        paused_seconds:      30,
        draft_json:          { logged: {} },
      }),
      { onConflict: 'user_id' },
    );
  });

  it('logs but does not throw on a save error', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockUpsert.mockResolvedValue({ error: { message: 'boom' } });
    await expect(saveWorkoutDraft('user-1', null, 'run', '2026-08-25T10:00:00.000Z', 0, {})).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('loadWorkoutDraft', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns null when no draft exists', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await loadWorkoutDraft('user-1')).toBeNull();
  });

  it('maps db columns back to the WorkoutDraft shape', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: 'draft-1', planned_session_id: 'sess-1', modality: 'strength',
        started_at: '2026-08-25T10:00:00.000Z', paused_seconds: 12, draft_json: { logged: { a: [] } },
      },
      error: null,
    });
    expect(await loadWorkoutDraft('user-1')).toEqual({
      id: 'draft-1', plannedSessionId: 'sess-1', modality: 'strength',
      startedAt: '2026-08-25T10:00:00.000Z', pausedSeconds: 12, draft: { logged: { a: [] } },
    });
  });

  it('returns null on a load error', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await loadWorkoutDraft('user-1')).toBeNull();
    spy.mockRestore();
  });
});

describe('deleteWorkoutDraft', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes by user_id', async () => {
    mockEqDelete.mockResolvedValue({ error: null });
    await deleteWorkoutDraft('user-1');
    expect(mockDelete).toHaveBeenCalled();
    expect(mockEqDelete).toHaveBeenCalledWith('user_id', 'user-1');
  });
});
