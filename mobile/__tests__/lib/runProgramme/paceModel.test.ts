import {
  RIEGEL_EXPONENT,
  BAND_RATIOS,
  riegelPredict,
  thresholdPaceFromReference,
  thresholdPaceFromFiveKPace,
  paceForBand,
  goalRacePace,
} from '@/lib/runProgramme/paceModel';

// The worked example from card 228, used throughout: a 25:00 5K runner.
const FIVE_K_PACE = 300;      // s/km, what the old model stored as the baseline
const THRESHOLD   = 315;      // s/km, 5:15/km — what it should have been

describe('riegelPredict', () => {
  it('returns the reference time when target and reference match', () => {
    expect(riegelPredict(5000, 1500, 5000)).toBeCloseTo(1500, 5);
  });

  it('predicts a slower pace over a longer distance', () => {
    const tenK = riegelPredict(5000, 1500, 10000)!;
    expect(tenK).toBeGreaterThan(3000);        // slower than double the 5K
    expect(tenK / 10).toBeGreaterThan(1500 / 5);
  });

  it('predicts a 25:00 5K as a 52:07 10K', () => {
    // 1500 × 2^1.06 = 3127s
    expect(Math.round(riegelPredict(5000, 1500, 10000)!)).toBe(3127);
  });

  it('predicts a 25:00 5K as roughly a 3:51 marathon', () => {
    const marathon = riegelPredict(5000, 1500, 42195)!;
    expect(marathon / 3600).toBeGreaterThan(3.5);
    expect(marathon / 3600).toBeLessThan(4.2);
  });

  it('uses the classic exponent', () => {
    expect(RIEGEL_EXPONENT).toBe(1.06);
  });

  it('returns null rather than NaN for unusable input', () => {
    expect(riegelPredict(0, 1500, 10000)).toBeNull();
    expect(riegelPredict(5000, 0, 10000)).toBeNull();
    expect(riegelPredict(5000, 1500, 0)).toBeNull();
    expect(riegelPredict(-5000, 1500, 10000)).toBeNull();
  });
});

describe('thresholdPaceFromReference', () => {
  it('turns a 25:00 5K into 5:15/km threshold', () => {
    expect(thresholdPaceFromReference(5000, 1500)).toBe(THRESHOLD);
  });

  it('is slower than the reference pace, because threshold is an hour of work', () => {
    const t = thresholdPaceFromReference(5000, 1500)!;
    expect(t).toBeGreaterThan(FIVE_K_PACE);
  });

  it('is self-consistent: an hour-long reference is its own threshold', () => {
    // Someone who races 12km in exactly 60:00 has a threshold pace of 5:00/km.
    expect(thresholdPaceFromReference(12000, 3600)).toBe(300);
  });

  it('agrees whichever distance the same runner is measured over', () => {
    const fromFiveK = thresholdPaceFromReference(5000, 1500)!;
    const tenKTime  = riegelPredict(5000, 1500, 10000)!;
    const fromTenK  = thresholdPaceFromReference(10000, tenKTime)!;
    expect(Math.abs(fromFiveK - fromTenK)).toBeLessThanOrEqual(1); // rounding only
  });

  it('returns null for unusable input', () => {
    expect(thresholdPaceFromReference(0, 1500)).toBeNull();
    expect(thresholdPaceFromReference(5000, 0)).toBeNull();
  });
});

describe('thresholdPaceFromFiveKPace', () => {
  it('matches the full reference conversion', () => {
    expect(thresholdPaceFromFiveKPace(FIVE_K_PACE)).toBe(THRESHOLD);
  });

  it('mirrors the SQL in the re-anchor migration', () => {
    // 3600 / (5 × (720/P)^(1/1.06)), computed independently of the implementation.
    for (const p of [240, 275, 300, 346, 367, 406]) {
      const expected = Math.round(3600 / (5 * Math.pow(720 / p, 1 / 1.06)));
      expect(thresholdPaceFromFiveKPace(p)).toBe(expected);
    }
  });

  it('returns null for unusable input', () => {
    expect(thresholdPaceFromFiveKPace(0)).toBeNull();
    expect(thresholdPaceFromFiveKPace(-300)).toBeNull();
  });
});

describe('paceForBand', () => {
  it('gives the card 228 worked example for a 25:00 5K runner', () => {
    expect(paceForBand(THRESHOLD, 'recovery')).toBe(410);  // 6:50/km
    expect(paceForBand(THRESHOLD, 'easy')).toBe(378);      // 6:18/km
    expect(paceForBand(THRESHOLD, 'tempo')).toBe(321);     // 5:21/km
    expect(paceForBand(THRESHOLD, 'threshold')).toBe(315); // 5:15/km
    expect(paceForBand(THRESHOLD, 'vo2')).toBe(296);       // 4:56/km
  });

  it('puts every band in the right order, easiest slowest', () => {
    const order = ['recovery', 'easy', 'steady', 'tempo', 'threshold', 'vo2'] as const;
    const paces = order.map((b) => paceForBand(THRESHOLD, b));
    for (let i = 1; i < paces.length; i++) {
      expect(paces[i]).toBeLessThan(paces[i - 1]);
    }
  });

  it('returns threshold itself for the threshold band', () => {
    expect(paceForBand(THRESHOLD, 'threshold')).toBe(THRESHOLD);
    expect(BAND_RATIOS.threshold).toBe(1);
  });

  it('keeps easy runs genuinely easy — slower than the runner\'s 5K pace', () => {
    // The bug in card 228: easy came out at 5:45/km for a runner whose 5K pace
    // was 5:00/km, which is not an easy run.
    expect(paceForBand(THRESHOLD, 'easy')).toBeGreaterThan(FIVE_K_PACE + 60);
  });

  it('keeps interval pace near 5K pace rather than far faster', () => {
    const vo2 = paceForBand(THRESHOLD, 'vo2');
    expect(Math.abs(vo2 - FIVE_K_PACE)).toBeLessThan(15);
  });
});

describe('goalRacePace', () => {
  it('returns the reference pace at the reference distance', () => {
    expect(goalRacePace(5000, 1500, 5000)).toBe(FIVE_K_PACE);
  });

  it('predicts a slower pace for a marathon than for a 5K', () => {
    const marathon = goalRacePace(5000, 1500, 42195)!;
    expect(marathon).toBeGreaterThan(FIVE_K_PACE);
  });

  it('sits marathon pace slightly slower than threshold, as it should', () => {
    const marathon = goalRacePace(5000, 1500, 42195)!;
    expect(marathon).toBeGreaterThan(THRESHOLD);
    expect(marathon).toBeLessThan(THRESHOLD * 1.15);
  });

  it('returns null for unusable input', () => {
    expect(goalRacePace(5000, 0, 10000)).toBeNull();
  });
});
