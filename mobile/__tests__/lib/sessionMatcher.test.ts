import {
  sessionTarget,
  matchActivityToSession,
  SESSION_DURATION_MIN,
  type MatchActivity,
  type MatchSession,
} from '@/lib/sessionMatcher';

const runSession = (id: string, total_distance_m: number | null): MatchSession => ({
  id, modality: 'run', session_label: 'easy',
  run_structure: total_distance_m == null ? null : { total_distance_m },
});
const strengthSession = (id: string, label: string): MatchSession => ({
  id, modality: 'strength', session_label: label, run_structure: null,
});

describe('sessionTarget', () => {
  test('run target is structure distance in metres', () => {
    expect(sessionTarget(runSession('r', 10000))).toEqual({ id: 'r', metric: 'distance', target_value: 10000 });
  });
  test('run with no structure has null target', () => {
    expect(sessionTarget(runSession('r', null)).target_value).toBeNull();
  });
  test('strength target is label duration in seconds', () => {
    expect(sessionTarget(strengthSession('s', 'lower'))).toEqual({ id: 's', metric: 'duration', target_value: 45 * 60 });
    expect(sessionTarget(strengthSession('s', 'upper')).target_value).toBe(40 * 60);
  });
  test('unknown strength label falls back to 40 min', () => {
    expect(sessionTarget(strengthSession('s', 'mystery')).target_value).toBe(40 * 60);
  });
  test('swim and other have null target', () => {
    expect(sessionTarget({ id: 'w', modality: 'swim', session_label: '', run_structure: null }).target_value).toBeNull();
    expect(sessionTarget({ id: 'o', modality: 'other', session_label: '', run_structure: null }).target_value).toBeNull();
  });
  test('yoga target uses the yoga default duration', () => {
    expect(sessionTarget({ id: 'y', modality: 'yoga', session_label: '', run_structure: null }).target_value).toBe(SESSION_DURATION_MIN.yoga * 60);
  });
});

describe('matchActivityToSession', () => {
  const act = (over: Partial<MatchActivity>): MatchActivity => ({
    activity_type: 'run', duration_seconds: 0, distance_meters: null, ...over,
  });

  test('distance activity at exactly 90% passes the gate', () => {
    const c = [sessionTarget(runSession('r', 10000))];
    expect(matchActivityToSession(act({ distance_meters: 9000 }), c)).toBe('r');
  });
  test('distance activity below 90% matches nothing', () => {
    const c = [sessionTarget(runSession('r', 10000))];
    expect(matchActivityToSession(act({ distance_meters: 8999 }), c)).toBeNull();
  });
  test('duration activity at exactly 90% passes the gate', () => {
    const c = [sessionTarget(strengthSession('s', 'lower'))]; // target 2700s
    expect(matchActivityToSession(act({ activity_type: 'strength', duration_seconds: 2430 }), c)).toBe('s');
  });
  test('closest target wins: 50-min workout on upper/lower day completes lower', () => {
    const candidates = [
      sessionTarget(strengthSession('upper', 'upper')), // 2400s
      sessionTarget(strengthSession('lower', 'lower')), // 2700s
    ];
    // 3000s clears both gates; |2700-3000|=300 < |2400-3000|=600 -> lower
    expect(matchActivityToSession(act({ activity_type: 'strength', duration_seconds: 3000 }), candidates)).toBe('lower');
  });
  test('candidate with null target is skipped', () => {
    const c = [sessionTarget(runSession('r', null))];
    expect(matchActivityToSession(act({ distance_meters: 99999 }), c)).toBeNull();
  });
  test('measured value missing for the metric matches nothing', () => {
    const c = [sessionTarget(runSession('r', 10000))];
    expect(matchActivityToSession(act({ distance_meters: null }), c)).toBeNull();
  });
});
