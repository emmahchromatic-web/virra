import {
  parseFiveKToPaceSecPerKm,
  seedBaselinePace,
  DERIVED_FIVE_K_PACE_BY_LEVEL,
  WEEKLY_KM_BY_BRACKET,
} from '@/lib/completeOnboarding';
import { thresholdPaceFromFiveKPace } from '@/lib/runProgramme/paceModel';

describe('parseFiveKToPaceSecPerKm', () => {
  it('converts a 25:00 5K to 300 s/km', () => {
    expect(parseFiveKToPaceSecPerKm('25:00')).toBe(300);
  });

  it('converts a 22:00 5K to 264 s/km', () => {
    expect(parseFiveKToPaceSecPerKm('22:00')).toBe(264);
  });

  it('returns null for a blank field', () => {
    expect(parseFiveKToPaceSecPerKm('')).toBeNull();
  });

  it('returns null for a half-typed time', () => {
    expect(parseFiveKToPaceSecPerKm('25')).toBeNull();
    expect(parseFiveKToPaceSecPerKm('mm:ss')).toBeNull();
  });
});

describe('seedBaselinePace', () => {
  // What gets persisted is THRESHOLD pace, not the 5K pace the runner typed —
  // that is what every band is a ratio of. A 22:00 5K is 264 s/km, whose
  // threshold equivalent is 279 s/km. See card 228 and paceModel.ts.
  it('prefers a stated 5K time over the runner\'s level', () => {
    expect(seedBaselinePace('22:00', 'beginner')).toEqual({ secs: 279, source: 'stated' });
  });

  it('converts the stated time to threshold rather than storing it raw', () => {
    const stated = seedBaselinePace('22:00', null)!;
    expect(stated.secs).toBe(thresholdPaceFromFiveKPace(264));
    expect(stated.secs).toBeGreaterThan(264);
  });

  it('falls back to the level when the 5K is left blank', () => {
    // The whole point of card 227: this case used to persist nothing, so the
    // runner silently trained at the 360 s/km default instead.
    expect(seedBaselinePace('', 'recreational')).toEqual({ secs: 361, source: 'derived' });
  });

  it('falls back when the 5K is unparseable rather than trusting it', () => {
    expect(seedBaselinePace('abc', 'intermediate')).toEqual({ secs: 290, source: 'derived' });
  });

  it('returns null only when there is neither a time nor a level', () => {
    expect(seedBaselinePace('', null)).toBeNull();
  });

  it('covers every fitness level the profile allows', () => {
    const levels = ['beginner', 'recreational', 'intermediate', 'advanced', 'returning'] as const;
    for (const level of levels) {
      expect(seedBaselinePace('', level)).toEqual({
        secs:   thresholdPaceFromFiveKPace(DERIVED_FIVE_K_PACE_BY_LEVEL[level]),
        source: 'derived',
      });
    }
  });

  it('orders the derived paces so a stronger level is never slower', () => {
    const { advanced, intermediate, recreational, returning, beginner } = DERIVED_FIVE_K_PACE_BY_LEVEL;
    expect(advanced).toBeLessThan(intermediate);
    expect(intermediate).toBeLessThan(recreational);
    expect(recreational).toBeLessThan(returning);
    expect(returning).toBeLessThan(beginner);
  });

  it('keeps every derived pace inside a plausible human range', () => {
    // 3:00/km would be world class, 9:00/km is slower than most people walk-run.
    for (const secs of Object.values(DERIVED_FIVE_K_PACE_BY_LEVEL)) {
      expect(secs).toBeGreaterThan(180);
      expect(secs).toBeLessThan(540);
    }
  });
});

describe('WEEKLY_KM_BY_BRACKET', () => {
  it('maps each bracket to a volume inside it', () => {
    expect(WEEKLY_KM_BY_BRACKET['<5']).toBeLessThan(5);
    expect(WEEKLY_KM_BY_BRACKET['5-15']).toBeGreaterThanOrEqual(5);
    expect(WEEKLY_KM_BY_BRACKET['5-15']).toBeLessThan(15);
    expect(WEEKLY_KM_BY_BRACKET['15-30']).toBeGreaterThanOrEqual(15);
    expect(WEEKLY_KM_BY_BRACKET['15-30']).toBeLessThan(30);
    expect(WEEKLY_KM_BY_BRACKET['30+']).toBeGreaterThanOrEqual(30);
  });

  it('rises with the bracket', () => {
    expect(WEEKLY_KM_BY_BRACKET['<5']).toBeLessThan(WEEKLY_KM_BY_BRACKET['5-15']);
    expect(WEEKLY_KM_BY_BRACKET['5-15']).toBeLessThan(WEEKLY_KM_BY_BRACKET['15-30']);
    expect(WEEKLY_KM_BY_BRACKET['15-30']).toBeLessThan(WEEKLY_KM_BY_BRACKET['30+']);
  });
});
