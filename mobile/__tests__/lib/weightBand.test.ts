import { EXPECTED_BAND, classifyReading, STEADY_BAND, classifySteady } from '@/lib/weightBand';

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
