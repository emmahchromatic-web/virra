import {
  EXPECTED_BAND, classifyReading, STEADY_BAND, classifySteady,
  personalBandForPhase, buildPhaseBands, bandFor, quantile,
} from '@/lib/weightBand';

describe('EXPECTED_BAND', () => {
  it('defines a band for every phase', () => {
    expect(EXPECTED_BAND.menstrual).toEqual({ lower: -0.3, upper: 0.6 });
    expect(EXPECTED_BAND.follicular).toEqual({ lower: -0.2, upper: 0.5 });
    expect(EXPECTED_BAND.ovulatory).toEqual({ lower:  0.0, upper: 1.0 });
    expect(EXPECTED_BAND.luteal).toEqual({ lower:  0.5, upper: 2.0 });
  });
});

describe('classifyReading', () => {
  it('returns in_band when delta is at the lower edge of the phase band', () => {
    expect(classifyReading(0.5, 'luteal')).toBe('in_band');
  });

  it('returns in_band when delta is at the upper edge of the phase band', () => {
    expect(classifyReading(2.0, 'luteal')).toBe('in_band');
  });

  it('returns below when delta is below the lower edge', () => {
    expect(classifyReading(0.4, 'luteal')).toBe('below');
  });

  it('returns above when delta exceeds the upper edge', () => {
    expect(classifyReading(2.1, 'luteal')).toBe('above');
  });

  it('uses the follicular band by default for follicular phase', () => {
    expect(classifyReading(0.3, 'follicular')).toBe('in_band');
    expect(classifyReading(-0.3, 'follicular')).toBe('below');
    expect(classifyReading(0.6, 'follicular')).toBe('above');
  });
});

describe('STEADY_BAND', () => {
  it('is fixed at ±0.5 kg', () => {
    expect(STEADY_BAND).toEqual({ lower: -0.5, upper: 0.5 });
  });
});

describe('classifySteady', () => {
  it('returns in_band at the lower edge', () => {
    expect(classifySteady(-0.5)).toBe('in_band');
  });
  it('returns in_band at the upper edge', () => {
    expect(classifySteady(0.5)).toBe('in_band');
  });
  it('returns in_band at zero', () => {
    expect(classifySteady(0)).toBe('in_band');
  });
  it('returns below when delta is below the lower edge', () => {
    expect(classifySteady(-0.6)).toBe('below');
  });
  it('returns above when delta exceeds the upper edge', () => {
    expect(classifySteady(0.6)).toBe('above');
  });
});

describe('quantile', () => {
  it('interpolates between points', () => {
    expect(quantile([0, 1, 2, 3, 4], 0.5)).toBeCloseTo(2);
    expect(quantile([0, 10], 0.1)).toBeCloseTo(1);
  });
  it('handles single and empty arrays', () => {
    expect(quantile([5], 0.9)).toBe(5);
    expect(Number.isNaN(quantile([], 0.5))).toBe(true);
  });
});

describe('personalBandForPhase', () => {
  it('returns null below the minimum sample count', () => {
    expect(personalBandForPhase([0, 0.1, -0.1])).toBeNull(); // only 3
  });

  it('learns a tight band near zero for a flat cycle (the reported bug)', () => {
    // Deltas cluster around 0 — a woman with no luteal water gain. The population
    // luteal band (+0.5..+2.0) would wrongly flag her; her personal band should
    // sit around zero.
    const band = personalBandForPhase([-0.2, -0.1, 0, 0.1, 0.2, 0.1, -0.1, 0]);
    expect(band).not.toBeNull();
    expect(band!.lower).toBeLessThanOrEqual(-0.4);
    expect(band!.upper).toBeGreaterThanOrEqual(0.4);
    expect(band!.lower).toBeGreaterThan(-1.0);
    expect(band!.upper).toBeLessThan(1.0);
  });

  it('learns a raised band for someone who really does gain in luteal', () => {
    const band = personalBandForPhase([0.9, 1.2, 1.5, 1.4, 1.8, 1.1, 1.6, 1.3]);
    expect(band!.lower).toBeGreaterThan(0.3);
    expect(band!.upper).toBeGreaterThan(1.5);
  });

  it('is never narrower than ±0.5 around the median', () => {
    const band = personalBandForPhase([0, 0, 0, 0, 0, 0]);
    expect(band).toEqual({ lower: -0.5, upper: 0.5 });
  });
});

describe('buildPhaseBands + bandFor', () => {
  it('omits phases with too little data and falls back to the population band', () => {
    const bands = buildPhaseBands({
      luteal:    [-0.1, 0, 0.1, 0.2, 0.1, -0.1], // enough → learned
      menstrual: [0, 0.1],                        // too few → omitted
    });
    expect(bands.luteal).toBeDefined();
    expect(bands.menstrual).toBeUndefined();
    // bandFor uses the learned luteal band...
    expect(bandFor('luteal', bands)).toBe(bands.luteal);
    // ...but falls back to population for menstrual and for a null map.
    expect(bandFor('menstrual', bands)).toEqual(EXPECTED_BAND.menstrual);
    expect(bandFor('luteal', null)).toEqual(EXPECTED_BAND.luteal);
  });

  it('classifyReading uses the personal band when supplied', () => {
    const flatLuteal = personalBandForPhase([-0.1, 0, 0.1, 0.1, 0, -0.1])!;
    const bands = { luteal: flatLuteal };
    // +0.1 kg in luteal: BELOW the population band (+0.5 floor) but IN her band.
    expect(classifyReading(0.1, 'luteal')).toBe('below');
    expect(classifyReading(0.1, 'luteal', bands)).toBe('in_band');
  });
});
