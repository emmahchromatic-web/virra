import { buildSeasonChain, type SeasonEvent } from '@/lib/seasonEngine';

const TODAY = '2025-12-21';  // ~16 weeks before Brighton

const brightonLeeds: SeasonEvent[] = [
  { id: 'e1', event_date: '2026-04-12', modality: 'run', distance_goal: 'marathon' },
  { id: 'e2', event_date: '2026-05-17', modality: 'run', distance_goal: 'marathon' },
];

const tenHalfMara: SeasonEvent[] = [
  { id: 'e1', event_date: '2026-04-12', modality: 'run', distance_goal: '10k' },
  { id: 'e2', event_date: '2026-06-07', modality: 'run', distance_goal: 'half_marathon' },
  { id: 'e3', event_date: '2026-10-18', modality: 'run', distance_goal: 'marathon' },
];

const maraConflict: SeasonEvent[] = [
  { id: 'e1', event_date: '2026-10-11', modality: 'run', distance_goal: '5k' },
  { id: 'e2', event_date: '2026-10-18', modality: 'run', distance_goal: 'marathon' },
];

describe('buildSeasonChain — back-to-back marathon (Brighton + Leeds)', () => {
  const chain = buildSeasonChain({ events: brightonLeeds, cycle_profile: 'natural', today: TODAY });

  test('produces two blocks', () => {
    expect(chain).toHaveLength(2);
  });

  test('both blocks marked priority 1 (A) — same distance', () => {
    expect(chain[0].priority).toBe(1);
    expect(chain[1].priority).toBe(1);
  });

  test('first block ends on Brighton race date', () => {
    expect(chain[0].ends_on).toBe('2026-04-12');
  });

  test('second block (bridge) starts day after Brighton', () => {
    expect(chain[1].starts_on).toBe('2026-04-13');
  });

  test('bridge block begins with recovery phase', () => {
    expect(chain[1].phase_segments[0].phase).toBe('recovery');
    expect(chain[1].phase_segments[0].weeks).toBe(3); // marathon recovery
  });

  test('bridge block has no full base or peak — recovery → build → taper → race', () => {
    const phases = chain[1].phase_segments.map((s) => s.phase);
    expect(phases).toEqual(['recovery', 'build', 'taper', 'race']);
  });
});

describe('buildSeasonChain — progressive ladder (10K → Half → Marathon)', () => {
  const chain = buildSeasonChain({ events: tenHalfMara, cycle_profile: 'natural', today: TODAY });

  test('produces three blocks', () => {
    expect(chain).toHaveLength(3);
  });

  test('marathon (longest) is priority 1 (A); shorter stepping stones are priority 2 (B)', () => {
    expect(chain[0].priority).toBe(2); // 10K
    expect(chain[1].priority).toBe(2); // Half
    expect(chain[2].priority).toBe(1); // Marathon
  });

  test('first block (10K) starts with base phase', () => {
    expect(chain[0].phase_segments[0].phase).toBe('base');
  });

  test('half block (bridge from 10K) starts with 1 wk recovery', () => {
    expect(chain[1].phase_segments[0].phase).toBe('recovery');
    expect(chain[1].phase_segments[0].weeks).toBe(1);
  });

  test('marathon block (bridge from half) starts with 2 wk recovery', () => {
    expect(chain[2].phase_segments[0].phase).toBe('recovery');
    expect(chain[2].phase_segments[0].weeks).toBe(2);
  });
});

describe('buildSeasonChain — conflict (5K within marathon taper)', () => {
  const chain = buildSeasonChain({ events: maraConflict, cycle_profile: 'natural', today: TODAY });

  test('5K event 7 days before marathon is downgraded to priority 3 (C)', () => {
    // 5K is at index 0 (earlier date), marathon at index 1
    // assignPriorities checks gap to PRIOR event; for index 0 there's no prior, so it gets max-or-not
    // BUT for index 1 (marathon), gap from 5K is 7 days → marathon becomes C? Let's verify the logic
    // Actually rereading: the conflict-downgrade triggers on index > 0. So the later event gets C.
    // In maraConflict the later event is the marathon. That contradicts the design intent.
    // FIX REQUIRED: The conflict heuristic should downgrade the SHORTER event regardless of order.
    // Update assignPriorities accordingly before writing this test.
    expect(chain[0].priority).toBe(3);  // 5K downgraded
    expect(chain[1].priority).toBe(1);  // Marathon remains A
  });
});

describe('buildSeasonChain — single event', () => {
  test('returns empty chain for single event (no season needed)', () => {
    const chain = buildSeasonChain({
      events: [brightonLeeds[0]],
      cycle_profile: 'natural',
      today: TODAY,
    });
    expect(chain).toHaveLength(0);
  });
});
