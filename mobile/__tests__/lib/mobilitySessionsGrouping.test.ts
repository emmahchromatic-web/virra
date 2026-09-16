jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

import { groupByLength, type MobilitySessionSummary } from '@/lib/mobilitySessions';

const s = (
  id: string,
  minutes: number,
  phases: MobilitySessionSummary['phases'],
  intensity: MobilitySessionSummary['intensity'] = 'gentle',
): MobilitySessionSummary => ({ id, name: id, focus: null, minutes, intensity, phases });

const ALL: MobilitySessionSummary['phases'] = ['menstrual', 'follicular', 'ovulatory', 'luteal'];

/**
 * Card 264. The list screen groups by length and ranks for the phase inside
 * each group without ever hiding a session. These pin the two things a reader
 * of that screen would notice if they broke.
 */
describe('mobility sessions grouped by length', () => {
  const sessions = [
    s('strong-and-supple', 30, ['follicular', 'ovulatory'], 'strong'),
    s('wake-up',           10, ALL),
    s('wind-down',         10, ['menstrual', 'luteal']),
    s('hips',              20, ['luteal', 'menstrual'], 'moderate'),
    s('post-run',          10, ALL),
    s('deep-release',      30, ['menstrual', 'luteal']),
  ];

  it('buckets shortest first, keeping the authored order when there is no phase', () => {
    const groups = groupByLength(sessions, null);
    expect(groups.map((g) => g.minutes)).toEqual([10, 20, 30]);
    expect(groups[0].sessions.map((x) => x.id)).toEqual(['wake-up', 'wind-down', 'post-run']);
  });

  it('puts the sessions that suit the phase first, narrowest tagging first, and keeps the rest', () => {
    const groups = groupByLength(sessions, 'luteal');
    // wind-down (2 phases) beats wake-up and post-run (4 phases); nothing dropped.
    expect(groups[0].sessions.map((x) => x.id)).toEqual(['wind-down', 'wake-up', 'post-run']);
    // deep-release suits luteal; strong-and-supple does not, but still shows.
    expect(groups[2].sessions.map((x) => x.id)).toEqual(['deep-release', 'strong-and-supple']);
  });

  it('never removes a session because of the phase', () => {
    const groups = groupByLength(sessions, 'ovulatory');
    const shown = groups.flatMap((g) => g.sessions.map((x) => x.id)).sort();
    expect(shown).toEqual(sessions.map((x) => x.id).sort());
  });

  it('returns nothing for nothing', () => {
    expect(groupByLength([], 'luteal')).toEqual([]);
  });
});
