import { describe, it, expect } from 'vitest';
import {
  secsToHMS,
  secsToMMSS,
  parseHMS,
  distanceToKm,
  kmToMiles,
  calcTime,
  calcPace,
  calcDistance,
  buildSplits,
  riegelPredict,
  cameronPredict,
  getCurrentPhase,
  applyPaceModifier,
  daysBetween,
} from './calculator';

describe('secsToHMS', () => {
  it('formats sub-hour times as M:SS', () => {
    expect(secsToHMS(312)).toBe('5:12');
  });
  it('formats over-hour times as H:MM:SS', () => {
    expect(secsToHMS(3723)).toBe('1:02:03');
  });
  it('pads single-digit seconds', () => {
    expect(secsToHMS(65)).toBe('1:05');
  });
});

describe('parseHMS', () => {
  it('parses M:SS', () => {
    expect(parseHMS('5:12')).toBe(312);
  });
  it('parses H:MM:SS', () => {
    expect(parseHMS('1:02:03')).toBe(3723);
  });
  it('throws on invalid input', () => {
    expect(() => parseHMS('abc')).toThrow();
  });
});

describe('distanceToKm', () => {
  it('returns km unchanged', () => {
    expect(distanceToKm(10, 'km')).toBe(10);
  });
  it('converts miles to km', () => {
    expect(distanceToKm(1, 'mi')).toBeCloseTo(1.60934);
  });
});

describe('calcTime', () => {
  it('calculates total time from distance and pace', () => {
    expect(calcTime(10, 312)).toBe(3120);
  });
});

describe('calcPace', () => {
  it('calculates pace from distance and time', () => {
    expect(calcPace(10, 3120)).toBe(312);
  });
});

describe('calcDistance', () => {
  it('calculates distance from time and pace', () => {
    expect(calcDistance(3120, 312)).toBeCloseTo(10);
  });
});

describe('buildSplits', () => {
  it('generates one split per km for a 3km run', () => {
    const splits = buildSplits(3, 312, 'km');
    expect(splits).toHaveLength(3);
    expect(splits[0].label).toBe('1 km');
    expect(splits[0].paceDisplay).toBe('5:12');
  });
  it('includes remainder split', () => {
    const splits = buildSplits(3.5, 300, 'km');
    expect(splits).toHaveLength(4);
    expect(splits[3].label).toContain('+0.50');
  });
});

describe('riegelPredict', () => {
  it('predicts marathon from half marathon with Riegel formula', () => {
    const halfTimeSecs = 2 * 3600; // 2:00:00
    const prediction = riegelPredict(halfTimeSecs, 21.0975, 42.195);
    expect(prediction).toBeGreaterThan(4 * 3600);
    expect(prediction).toBeLessThan(4.5 * 3600);
  });
  it('returns same time for same distance', () => {
    expect(riegelPredict(3600, 10, 10)).toBeCloseTo(3600);
  });
});

describe('cameronPredict', () => {
  it('predicts a 10K time from a 5K result', () => {
    const fiveKSecs = 25 * 60;
    const prediction = cameronPredict(fiveKSecs, 5, 10);
    expect(prediction).toBeGreaterThan(50 * 60);
    expect(prediction).toBeLessThan(60 * 60);
  });
});

describe('getCurrentPhase', () => {
  it('returns menstrual for day 1', () => {
    const start = new Date('2026-05-01');
    const today = new Date('2026-05-01');
    const result = getCurrentPhase(start, 28, today);
    expect(result.phase).toBe('menstrual');
    expect(result.dayInPhase).toBe(1);
  });
  it('returns follicular for day 6', () => {
    const start = new Date('2026-05-01');
    const today = new Date('2026-05-06');
    const result = getCurrentPhase(start, 28, today);
    expect(result.phase).toBe('follicular');
  });
  it('returns ovulatory around day 14', () => {
    const start = new Date('2026-05-01');
    const today = new Date('2026-05-14');
    const result = getCurrentPhase(start, 28, today);
    expect(result.phase).toBe('ovulatory');
  });
  it('returns luteal for day 17', () => {
    const start = new Date('2026-05-01');
    const today = new Date('2026-05-17');
    const result = getCurrentPhase(start, 28, today);
    expect(result.phase).toBe('luteal');
  });
  it('wraps correctly at cycle boundary', () => {
    const start = new Date('2026-04-01');
    const today = new Date('2026-05-01');
    const result = getCurrentPhase(start, 30, today);
    expect(result.dayInCycle).toBe(0);
    expect(result.phase).toBe('menstrual');
  });
});

describe('applyPaceModifier', () => {
  it('increases pace seconds (slows down) with negative modifier', () => {
    const adjusted = applyPaceModifier(300, -0.10);
    expect(adjusted).toBeCloseTo(330);
  });
  it('decreases pace seconds (speeds up) with positive modifier', () => {
    const adjusted = applyPaceModifier(300, 0.05);
    expect(adjusted).toBeCloseTo(285);
  });
});
