import { dedupe, pendingKeyFor, type PendingCompletion } from '@/lib/pendingCompletions';
import { USER_CACHE_PREFIXES } from '@/lib/localCaches';

const run = (startedAt: string): PendingCompletion => ({
  kind: 'run', queuedAt: '2026-08-31T09:00:00Z', sessionId: null,
  activity: { user_id: 'u1', started_at: startedAt }, runDetails: {},
});

describe('pending completions queue — card 253', () => {
  it('treats the same workout queued twice as one', () => {
    // Finish, fail, reopen, finish again: without this the user syncs two
    // copies of one session the moment signal returns.
    expect(dedupe([run('2026-08-31T08:00:00Z'), run('2026-08-31T08:00:00Z')])).toHaveLength(1);
  });

  it('keeps genuinely different workouts', () => {
    expect(dedupe([run('2026-08-31T08:00:00Z'), run('2026-08-31T18:00:00Z')])).toHaveLength(2);
  });

  it('does not collapse a run and a strength session that started together', () => {
    const strength: PendingCompletion = {
      kind: 'strength', queuedAt: '2026-08-31T09:00:00Z', sessionId: null,
      activity: { user_id: 'u1', started_at: '2026-08-31T08:00:00Z' }, setRows: [], details: null,
    };
    expect(dedupe([run('2026-08-31T08:00:00Z'), strength])).toHaveLength(2);
  });

  it('preserves order, so the oldest workout syncs first', () => {
    const q = [run('2026-08-31T08:00:00Z'), run('2026-08-31T18:00:00Z')];
    expect(dedupe(q).map((i) => i.activity.started_at)).toEqual([
      '2026-08-31T08:00:00Z', '2026-08-31T18:00:00Z',
    ]);
  });

  it('is namespaced per user and cleared on sign-out', () => {
    // The lesson from the ask-once markers: per-user state left off this list
    // leaks to whoever signs in next. Here that would mean syncing one person's
    // workout into another person's account.
    expect(pendingKeyFor('user-1')).not.toBe(pendingKeyFor('user-2'));
    expect(USER_CACHE_PREFIXES.some((p) => pendingKeyFor('user-1').startsWith(p))).toBe(true);
  });
});
