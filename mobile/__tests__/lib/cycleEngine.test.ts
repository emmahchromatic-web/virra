import { getCyclePhase, getCycleInfo, deriveCycleMode } from '@/lib/cycleEngine';

const day = (n: number, from: Date) => {
  const d = new Date(from);
  d.setDate(d.getDate() + n);
  return d;
};

describe('getCyclePhase', () => {
  const start = new Date('2025-01-01');
  const len28 = 28;

  // ── Menstrual (days 1–5) ──────────────────────────────────────────
  it('returns menstrual on day 1 (period start)', () => {
    expect(getCyclePhase(start, len28, start)).toBe('menstrual');
  });

  it('returns menstrual on day 5 (last bleed day)', () => {
    expect(getCyclePhase(start, len28, day(4, start))).toBe('menstrual');
  });

  // ── Follicular (days 6 – ovulation-2) ───────────────────────────
  it('returns follicular on day 6', () => {
    expect(getCyclePhase(start, len28, day(5, start))).toBe('follicular');
  });

  it('returns follicular on day 12 (day before ovulatory window, 28-day cycle)', () => {
    expect(getCyclePhase(start, len28, day(11, start))).toBe('follicular');
  });

  // ── Ovulatory (ovulation day ±1, ovulation = cycleLength − 14) ───
  it('returns ovulatory on day 13 (start of window, 28-day cycle)', () => {
    expect(getCyclePhase(start, len28, day(12, start))).toBe('ovulatory');
  });

  it('returns ovulatory on day 14 (peak, 28-day cycle)', () => {
    expect(getCyclePhase(start, len28, day(13, start))).toBe('ovulatory');
  });

  it('returns ovulatory on day 15 (end of window, 28-day cycle)', () => {
    expect(getCyclePhase(start, len28, day(14, start))).toBe('ovulatory');
  });

  // ── Luteal (after ovulatory → end of cycle) ──────────────────────
  it('returns luteal on day 16', () => {
    expect(getCyclePhase(start, len28, day(15, start))).toBe('luteal');
  });

  it('returns luteal on day 28 (last day of cycle)', () => {
    expect(getCyclePhase(start, len28, day(27, start))).toBe('luteal');
  });

  // ── Multi-cycle wrapping ──────────────────────────────────────────
  it('wraps into next cycle correctly (day 29 = day 1 of cycle 2)', () => {
    expect(getCyclePhase(start, len28, day(28, start))).toBe('menstrual');
  });

  it('handles 3 full cycles elapsed', () => {
    expect(getCyclePhase(start, len28, day(84, start))).toBe('menstrual');
  });

  // ── Non-standard cycle lengths ────────────────────────────────────
  it('returns ovulatory at correct window for 30-day cycle (ovulation = day 16)', () => {
    expect(getCyclePhase(start, 30, day(15, start))).toBe('ovulatory');
  });

  it('returns luteal from day 18 in a 30-day cycle', () => {
    expect(getCyclePhase(start, 30, day(17, start))).toBe('luteal');
  });

  it('returns follicular correctly in a 35-day cycle', () => {
    expect(getCyclePhase(start, 35, day(10, start))).toBe('follicular');
  });
});

describe('deriveCycleMode', () => {
  test('natural → flow', () => {
    expect(deriveCycleMode('natural', null)).toBe('flow');
  });
  test('irregular → flow', () => {
    expect(deriveCycleMode('irregular', null)).toBe('flow');
  });
  test('hormonal + has_placebo_week true → pack', () => {
    expect(deriveCycleMode('hormonal', true)).toBe('pack');
  });
  test('hormonal + has_placebo_week false → steady', () => {
    expect(deriveCycleMode('hormonal', false)).toBe('steady');
  });
  test('hormonal + has_placebo_week null → steady', () => {
    expect(deriveCycleMode('hormonal', null)).toBe('steady');
  });
  // Card 238, changed deliberately. Perimenopause means cycles are CHANGING,
  // not absent: periods still come, irregularly. It used to fall through to
  // steady alongside menopause and share its copy word for word.
  test('perimenopause → flow, like irregular', () => {
    expect(deriveCycleMode('perimenopause', null)).toBe('flow');
  });
  test('menopause → steady', () => {
    expect(deriveCycleMode('menopause', null)).toBe('steady');
  });
  test('pregnant_postpartum → steady', () => {
    expect(deriveCycleMode('pregnant_postpartum', null)).toBe('steady');
  });
  test('prefer_not_to_say → steady', () => {
    expect(deriveCycleMode('prefer_not_to_say', null)).toBe('steady');
  });
});

// Regression: every reading dated before the most recent period start used to
// come back "menstrual". JavaScript's remainder keeps the sign of the dividend,
// so `elapsed % cycleLength` went negative and slipped past the day <= 5 test.
// In practice this mislabelled 38 of one user's 40 weight readings, leaving the
// cycle weight band permanently calibrating because the baseline needs five
// follicular readings and only ever saw two.
describe('getCycleInfo for dates before the period start', () => {
  const start = new Date('2025-03-05');
  const len28 = 28;
  const before = (n: number) => {
    const d = new Date(start);
    d.setDate(d.getDate() - n);
    return d;
  };

  it('wraps backwards into the previous cycle instead of going negative', () => {
    expect(getCycleInfo(start, len28, before(1)).dayOfCycle).toBe(28);
    expect(getCycleInfo(start, len28, before(10)).dayOfCycle).toBe(19);
    expect(getCycleInfo(start, len28, before(28)).dayOfCycle).toBe(1);
    expect(getCycleInfo(start, len28, before(29)).dayOfCycle).toBe(28);
  });

  it('never reports a dayOfCycle outside 1..cycleLength, however far back', () => {
    for (let n = 0; n <= 200; n++) {
      const { dayOfCycle } = getCycleInfo(start, len28, before(n));
      expect(dayOfCycle).toBeGreaterThanOrEqual(1);
      expect(dayOfCycle).toBeLessThanOrEqual(len28);
    }
  });

  it('spreads back-dated readings across all four phases rather than calling them all menstrual', () => {
    const phases = new Set<string>();
    for (let n = 0; n < 28; n++) phases.add(getCycleInfo(start, len28, before(n)).phase);
    expect(phases).toEqual(new Set(['menstrual', 'follicular', 'ovulatory', 'luteal']));
  });

  it('mirrors the equivalent day of a forward cycle', () => {
    // 10 days before a start is the same point in the cycle as 18 days after
    // the previous start, i.e. day 19 either way.
    expect(getCycleInfo(start, len28, before(10)).phase)
      .toBe(getCycleInfo(new Date('2025-02-05'), len28, new Date('2025-02-23')).phase);
  });

  it('leaves forward dates exactly as they were', () => {
    const on = (n: number) => {
      const d = new Date(start);
      d.setDate(d.getDate() + n);
      return d;
    };
    expect(getCycleInfo(start, len28, on(0)).dayOfCycle).toBe(1);
    expect(getCycleInfo(start, len28, on(5)).dayOfCycle).toBe(6);
    expect(getCycleInfo(start, len28, on(27)).dayOfCycle).toBe(28);
    expect(getCycleInfo(start, len28, on(28)).dayOfCycle).toBe(1);
    expect(getCycleInfo(start, len28, on(56)).dayOfCycle).toBe(1);
  });
});

// Regression: both ends of the elapsed-days calculation are local midnights, so
// a clock change between them left the difference an hour short of a whole
// number of days. Flooring that reported the cycle a day behind for everyone
// for the week after the clocks went forward.
describe('getCycleInfo across a daylight saving change', () => {
  it('counts whole days when the clocks go forward mid-cycle', () => {
    const start = new Date('2025-03-05');        // UK clocks go forward 30 March
    const on = (n: number) => {
      const d = new Date(start);
      d.setDate(d.getDate() + n);
      return d;
    };
    expect(getCycleInfo(start, 28, on(27)).dayOfCycle).toBe(28);
    expect(getCycleInfo(start, 28, on(28)).dayOfCycle).toBe(1);
  });

  it('counts whole days when the clocks go back mid-cycle', () => {
    const start = new Date('2025-10-15');        // UK clocks go back 26 October
    const on = (n: number) => {
      const d = new Date(start);
      d.setDate(d.getDate() + n);
      return d;
    };
    expect(getCycleInfo(start, 28, on(20)).dayOfCycle).toBe(21);
    expect(getCycleInfo(start, 28, on(27)).dayOfCycle).toBe(28);
  });
});
