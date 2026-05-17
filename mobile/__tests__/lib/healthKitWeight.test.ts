import { gramsToKg, sampleToRow } from '@/lib/healthKitWeight';

describe('gramsToKg', () => {
  it('converts grams to kilograms with one decimal precision', () => {
    expect(gramsToKg(60000)).toBe(60.0);
    expect(gramsToKg(60450)).toBe(60.5);
    expect(gramsToKg(60444)).toBe(60.4);
  });

  it('returns null for non-positive values', () => {
    expect(gramsToKg(0)).toBeNull();
    expect(gramsToKg(-1)).toBeNull();
  });
});

describe('sampleToRow', () => {
  const periodStart = new Date('2025-01-01');
  const sample = {
    value:     60500,
    startDate: '2025-01-08T08:00:00.000Z',
    endDate:   '2025-01-08T08:00:00.000Z',
  };

  it('builds an upsert row with cycle metadata for a follicular date', () => {
    const row = sampleToRow('user-1', sample, periodStart, 28);
    expect(row).toEqual({
      user_id:             'user-1',
      recorded_on:         '2025-01-08',
      weight_kg:           60.5,
      source:              'healthkit',
      cycle_day_at_time:   8,
      cycle_phase_at_time: 'follicular',
    });
  });

  it('returns null when value is zero or negative', () => {
    expect(sampleToRow('u', { ...sample, value: 0 }, periodStart, 28)).toBeNull();
  });

  it('omits cycle metadata when periodStart is null', () => {
    const row = sampleToRow('user-1', sample, null, 28);
    expect(row).toEqual({
      user_id:             'user-1',
      recorded_on:         '2025-01-08',
      weight_kg:           60.5,
      source:              'healthkit',
      cycle_day_at_time:   null,
      cycle_phase_at_time: null,
    });
  });
});
