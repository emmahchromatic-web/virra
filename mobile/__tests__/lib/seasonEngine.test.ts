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

  test('bridge block has recovery → build → taper → race', () => {
    const phases = chain[1].phase_segments.map((s) => s.phase);
    // Brighton → Leeds is 5 weeks; 3wk marathon recovery leaves 2 weeks for
    // build + taper. Taper must be present — race day is a single day captured
    // by clamping, not a phase-week reservation.
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

  // This used to produce two blocks, and the second was a seven-day marathon
  // "build" starting the day after the 5K. The 5K was treated as a boundary
  // when it sits inside the marathon's taper. It is a tune-up of that build.
  test('the marathon gets one build, not a seven-day block after the 5K', () => {
    expect(chain).toHaveLength(1);
    expect(chain[0].event_id).toBe('e2');
    expect(chain[0].priority).toBe(1);
    expect(chain[0].ends_on).toBe('2026-10-18');
  });

  test('the 5K is still downgraded to priority 3 (C), and kept as a tune-up', () => {
    expect(chain[0].tune_ups).toEqual([
      { event_id: 'e1', event_date: '2026-10-11', distance_goal: '5k', priority: 3 },
    ]);
  });
});

describe('buildSeasonChain — a half as a training race inside a marathon build (card 265)', () => {
  // Emma's own season, verbatim. Built as two sequential blocks, it gave the half
  // a 12-week window and the marathon the five weeks left over, starting the day
  // after the half. Both then got an 8-week 5K plan: the half's packed into the
  // front with March empty, the marathon's running two weeks past race day.
  const events: SeasonEvent[] = [
    { id: 'sheffield', event_date: '2027-04-04', modality: 'run', distance_goal: 'half_marathon' },
    { id: 'leeds',     event_date: '2027-05-09', modality: 'run', distance_goal: 'marathon' },
  ];
  const chain = buildSeasonChain({ events, cycle_profile: 'natural', today: '2026-09-13' });

  test('one build, for the marathon', () => {
    expect(chain).toHaveLength(1);
    expect(chain[0].event_id).toBe('leeds');
    expect(chain[0].distance_goal).toBe('marathon');
    expect(chain[0].priority).toBe(1);
  });

  test('a full sixteen weeks of marathon preparation ending on race day', () => {
    // 9 May 2027 minus 16 weeks. Not 5 April, the day after the half.
    expect(chain[0].starts_on).toBe('2027-01-17');
    expect(chain[0].ends_on).toBe('2027-05-09');
    // A first block gets a real base phase, not a recovery phase from the half.
    expect(chain[0].phase_segments[0].phase).toBe('base');
  });

  test('Sheffield is a tune-up inside it', () => {
    expect(chain[0].tune_ups).toEqual([
      { event_id: 'sheffield', event_date: '2027-04-04', distance_goal: 'half_marathon', priority: 2 },
    ]);
  });
});

describe('buildSeasonChain — what does NOT fold', () => {
  test('a stepping stone before the A-race window keeps its own build', () => {
    // The progressive ladder above depends on this: June is before the October
    // marathon's sixteen-week window opens, so the half is its own goal.
    const chain = buildSeasonChain({ events: tenHalfMara, cycle_profile: 'natural', today: TODAY });
    expect(chain.map((b) => b.event_id)).toEqual(['e1', 'e2', 'e3']);
    expect(chain.every((b) => b.tune_ups.length === 0)).toBe(true);
  });

  test('an A-race never folds into another, however close', () => {
    // Two marathons are two goals. Brighton sits inside Leeds's window by date,
    // and must still get its own block.
    const chain = buildSeasonChain({ events: brightonLeeds, cycle_profile: 'natural', today: TODAY });
    expect(chain).toHaveLength(2);
    expect(chain.every((b) => b.tune_ups.length === 0)).toBe(true);
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

describe('buildSeasonChain — phase segment invariants for short blocks', () => {
  test('all emitted phase segments satisfy starts_on <= ends_on across edge block sizes', () => {
    // 3-week, 4-week, 5-week, 6-week first-events; 1-, 2-, 3-week bridges
    const scenarios: { events: SeasonEvent[]; today: string }[] = [
      // First block too short (3 weeks total)
      { today: '2026-04-01', events: [
          { id: 'a', event_date: '2026-04-22', modality: 'run', distance_goal: '5k' },
          { id: 'b', event_date: '2026-05-15', modality: 'run', distance_goal: '5k' },
      ]},
      // Bridge of 1 week (recovery 1 + 0 left)
      { today: '2025-12-21', events: [
          { id: 'a', event_date: '2026-04-12', modality: 'run', distance_goal: '10k' },
          { id: 'b', event_date: '2026-04-19', modality: 'run', distance_goal: '10k' },
      ]},
      // Bridge where recovery_in exceeds total bridge weeks
      { today: '2025-12-21', events: [
          { id: 'a', event_date: '2026-04-12', modality: 'run', distance_goal: 'marathon' },
          { id: 'b', event_date: '2026-04-26', modality: 'run', distance_goal: 'marathon' },
      ]},
    ];

    for (const scenario of scenarios) {
      const chain = buildSeasonChain({ events: scenario.events, cycle_profile: 'natural', today: scenario.today });
      for (const block of chain) {
        for (const seg of block.phase_segments) {
          expect(seg.starts_on <= seg.ends_on).toBe(true);
        }
        // Final segment must end exactly on the race date
        const last = block.phase_segments[block.phase_segments.length - 1];
        expect(last.ends_on).toBe(block.ends_on);
      }
    }
  });
});

describe('buildSeasonChain — past events at start of array', () => {
  test('first future event gets first-block phases even when array starts with past events', () => {
    const events: SeasonEvent[] = [
      { id: 'past', event_date: '2025-11-01', modality: 'run', distance_goal: '10k' },
      { id: 'future1', event_date: '2026-04-12', modality: 'run', distance_goal: 'marathon' },
      { id: 'future2', event_date: '2026-05-17', modality: 'run', distance_goal: 'marathon' },
    ];
    const chain = buildSeasonChain({ events, cycle_profile: 'natural', today: '2025-12-21' });
    expect(chain).toHaveLength(2);
    // First future event (Brighton) should have base phase, not recovery
    expect(chain[0].phase_segments[0].phase).toBe('base');
  });
});

describe('buildSeasonChain — empty and unsorted inputs', () => {
  test('returns empty chain for empty events array', () => {
    expect(buildSeasonChain({ events: [], cycle_profile: 'natural', today: TODAY })).toHaveLength(0);
  });

  test('defensive sort: caller passes events out of order, engine still produces correct chain', () => {
    const reversed = [...brightonLeeds].reverse();
    const chain = buildSeasonChain({ events: reversed, cycle_profile: 'natural', today: TODAY });
    expect(chain[0].ends_on).toBe('2026-04-12'); // Brighton first by date
    expect(chain[1].ends_on).toBe('2026-05-17'); // Leeds second
  });
});

import { generationWindow, seasonTrainingDays, dayIndexOf } from '@/lib/seasonEngine';

describe('laying a build so it finishes on race day (card 265)', () => {
  test("both of Emma's races are Sundays", () => {
    expect(dayIndexOf('2027-04-04')).toBe(6);
    expect(dayIndexOf('2027-05-09')).toBe(6);
  });

  test('the Leeds build is sixteen weeks, starting on a Monday, ending in race week', () => {
    // The block starts Sunday 17 Jan. Generating from that date used to snap
    // back to Monday 11 Jan and leak sessions before the block began.
    expect(generationWindow('2027-01-17', '2027-05-09')).toEqual({ start: '2027-01-18', weeks: 16 });
  });

  test('a block starting on a Monday starts there', () => {
    expect(generationWindow('2027-01-18', '2027-05-09')).toEqual({ start: '2027-01-18', weeks: 16 });
  });

  test('a block shorter than a week still gets its race week', () => {
    expect(generationWindow('2027-05-08', '2027-05-09')).toEqual({ start: '2027-05-03', weeks: 1 });
  });
});

describe('training days for a season build', () => {
  test("the long run is on the race's weekday, so there is a run to turn into the race", () => {
    const { days, longRunDay } = seasonTrainingDays('marathon', '2027-05-09');
    expect(longRunDay).toBe(6);
    expect(days).toContain(6);
  });

  test('a marathon build trains four days, a half three', () => {
    expect(seasonTrainingDays('marathon', '2027-05-09').days).toEqual([1, 2, 4, 6]);
    expect(seasonTrainingDays('half_marathon', '2027-04-04').days).toEqual([1, 3, 6]);
  });

  test('a race on a fixed training day is not double counted', () => {
    // Tuesday race: Tuesday is already a base day.
    expect(seasonTrainingDays('10k', '2027-03-02').days).toEqual([1, 3]);
  });
});
