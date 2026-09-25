import { sessionRoute } from '@/lib/sessionRoutes';
import { LOCAL_ACTIVITY_PREFIX } from '@/store/localActivity';

describe('sessionRoute', () => {
  it('sends a planned run to the tracker and everything else to the workout screen', () => {
    expect(sessionRoute({ id: 's1', modality: 'run', status: 'planned' }))
      .toBe('/(app)/run?sessionId=s1');
    expect(sessionRoute({ id: 's2', modality: 'strength', status: 'planned' }))
      .toBe('/(app)/workout-preview?sessionId=s2');
    expect(sessionRoute({ id: 's3', modality: 'mobility', status: 'planned' }))
      .toBe('/(app)/workout-preview?sessionId=s3');
  });

  it('sends a finished session to what it produced, not back into the logger', () => {
    // Reopening the logger on a completed workout invites logging it twice.
    expect(sessionRoute({ id: 's1', modality: 'run', status: 'completed', activity_id: 'act-9' }))
      .toBe('/(app)/activity/act-9');
    expect(sessionRoute({ id: 's2', modality: 'strength', status: 'completed', activity_id: 'act-9' }))
      .toBe('/(app)/activity/act-9');
  });

  it('keeps a session finished offline on its own screen until the queue drains', () => {
    // The placeholder id names no row on the server, so /activity/local_… would
    // open a page that cannot load.
    expect(sessionRoute({
      id: 's1', modality: 'run', status: 'completed', activity_id: `${LOCAL_ACTIVITY_PREFIX}123_abc`,
    })).toBe('/(app)/run?sessionId=s1');
  });

  it('falls back to the session when a completed row has no activity at all', () => {
    expect(sessionRoute({ id: 's1', modality: 'strength', status: 'completed', activity_id: null }))
      .toBe('/(app)/workout-preview?sessionId=s1');
  });
});
