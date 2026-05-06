import {
  deriveFitnessLevel,
  deriveWeeklyMileageBracket,
  estimateCycleLength,
} from '@/lib/healthKitOnboarding';

describe('deriveFitnessLevel', () => {
  it('returns advanced for pace < 5:00/km (< 300 s/km)', () => {
    expect(deriveFitnessLevel(280)).toBe('advanced');
  });

  it('returns intermediate for pace 5:00–6:30/km (300–389)', () => {
    expect(deriveFitnessLevel(350)).toBe('intermediate');
  });

  it('returns recreational for pace 6:30–8:00/km (390–479)', () => {
    expect(deriveFitnessLevel(430)).toBe('recreational');
  });

  it('returns beginner for pace > 8:00/km (>= 480)', () => {
    expect(deriveFitnessLevel(510)).toBe('beginner');
  });

  it('returns null when no pace data', () => {
    expect(deriveFitnessLevel(null)).toBeNull();
  });
});

describe('deriveWeeklyMileageBracket', () => {
  it('returns <5 for weekly km under 5', () => {
    expect(deriveWeeklyMileageBracket(3)).toBe('<5');
  });

  it('returns 5-15 for weekly km 5–15', () => {
    expect(deriveWeeklyMileageBracket(10)).toBe('5-15');
  });

  it('returns 15-30 for weekly km 15–30', () => {
    expect(deriveWeeklyMileageBracket(22)).toBe('15-30');
  });

  it('returns 30+ for weekly km over 30', () => {
    expect(deriveWeeklyMileageBracket(45)).toBe('30+');
  });

  it('returns null when no data', () => {
    expect(deriveWeeklyMileageBracket(null)).toBeNull();
  });
});

describe('estimateCycleLength', () => {
  it('returns null with fewer than 2 entries', () => {
    expect(estimateCycleLength([new Date('2024-01-01')])).toBeNull();
  });

  it('returns average interval between period start dates', () => {
    const dates = [
      new Date('2024-01-01'),
      new Date('2024-01-29'),
      new Date('2024-02-26'),
    ];
    expect(estimateCycleLength(dates)).toBe(28);
  });

  it('clamps result to 40 when interval is too long', () => {
    expect(estimateCycleLength([new Date('2024-01-01'), new Date('2024-03-10')])).toBe(40);
  });

  it('clamps result to 21 when interval is too short', () => {
    expect(estimateCycleLength([new Date('2024-01-01'), new Date('2024-01-10')])).toBe(21);
  });
});
