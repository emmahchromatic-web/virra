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

import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveWorkoutDraft, loadWorkoutDraft, deleteWorkoutDraft } from '@/lib/workoutDrafts';

describe('saveWorkoutDraft', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    // `jest.clearAllMocks()` clears call history, not installed
    // implementations — an explicit default here means every test in every
    // describe below starts from a known-good upsert, not whatever the
    // previously-run describe block last set via `mockResolvedValue`.
    mockUpsert.mockResolvedValue({ error: null });
  });

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

  it('writes to local storage even when the Supabase upsert fails, so the draft survives with no signal', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockUpsert.mockResolvedValue({ error: { message: 'Network request failed' } });
    await saveWorkoutDraft('user-1', 'sess-1', 'strength', '2026-08-25T10:00:00.000Z', 30, { logged: { a: [1] } });

    const raw = await AsyncStorage.getItem('virra:workout_draft:v1:user-1');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).draft).toEqual({ logged: { a: [1] } });
    spy.mockRestore();
  });
});

describe('loadWorkoutDraft', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    // See `saveWorkoutDraft`'s beforeEach: this describe's last test calls
    // `saveWorkoutDraft` as setup, which fires the real upsert mock.
    mockUpsert.mockResolvedValue({ error: null });
  });

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

  it('reads the local draft without calling Supabase, when one exists', async () => {
    await saveWorkoutDraft('user-1', 'sess-1', 'run', '2026-08-25T10:00:00.000Z', 0, { splits: [1, 2] });
    mockMaybeSingle.mockClear();

    const draft = await loadWorkoutDraft('user-1');
    expect(draft?.draft).toEqual({ splits: [1, 2] });
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });
});

describe('deleteWorkoutDraft', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    // See `saveWorkoutDraft`'s beforeEach: this describe's last test calls
    // `saveWorkoutDraft` as setup, which fires the real upsert mock.
    mockUpsert.mockResolvedValue({ error: null });
  });

  it('deletes by user_id', async () => {
    mockEqDelete.mockResolvedValue({ error: null });
    await deleteWorkoutDraft('user-1');
    expect(mockDelete).toHaveBeenCalled();
    expect(mockEqDelete).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('removes the local draft as well as the remote row', async () => {
    await saveWorkoutDraft('user-1', 'sess-1', 'run', '2026-08-25T10:00:00.000Z', 0, {});
    mockEqDelete.mockResolvedValue({ error: null });
    await deleteWorkoutDraft('user-1');
    expect(await AsyncStorage.getItem('virra:workout_draft:v1:user-1')).toBeNull();
  });
});
