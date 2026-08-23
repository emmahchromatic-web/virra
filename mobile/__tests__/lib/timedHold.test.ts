import { parseHoldTarget, isTimedHold, formatHold, heldSeconds, holdComplete } from '@/lib/timedHold';

describe('parseHoldTarget', () => {
  it('reads the three formats the Get Strong content actually uses', () => {
    expect(parseHoldTarget('20-40 sec')).toEqual({ lowSeconds: 20, highSeconds: 40, eachSide: false });
    expect(parseHoldTarget('20-40s each side')).toEqual({ lowSeconds: 20, highSeconds: 40, eachSide: true });
    expect(parseHoldTarget('15-30 sec each side')).toEqual({ lowSeconds: 15, highSeconds: 30, eachSide: true });
  });

  it('handles a single duration, with the range collapsing to one value', () => {
    expect(parseHoldTarget('30s')).toEqual({ lowSeconds: 30, highSeconds: 30, eachSide: false });
    expect(parseHoldTarget('45 seconds')).toEqual({ lowSeconds: 45, highSeconds: 45, eachSide: false });
  });

  it('converts minutes to seconds so callers deal in one unit', () => {
    expect(parseHoldTarget('1 min')).toEqual({ lowSeconds: 60, highSeconds: 60, eachSide: false });
    expect(parseHoldTarget('2-3 mins')).toEqual({ lowSeconds: 120, highSeconds: 180, eachSide: false });
  });

  it('treats the sheet en-dash as a range separator', () => {
    expect(parseHoldTarget('20–40 sec')).toEqual({ lowSeconds: 20, highSeconds: 40, eachSide: false });
  });

  it('orders the bounds even if the range is written backwards', () => {
    expect(parseHoldTarget('40-20 sec')).toEqual({ lowSeconds: 20, highSeconds: 40, eachSide: false });
  });

  it('returns null for rep counts, so they keep the numeric box', () => {
    expect(parseHoldTarget('8-10')).toBeNull();
    expect(parseHoldTarget('10 each side')).toBeNull();
    expect(parseHoldTarget('12')).toBeNull();
    expect(parseHoldTarget('3x5 into 5')).toBeNull();
    expect(parseHoldTarget('')).toBeNull();
    expect(parseHoldTarget(null)).toBeNull();
  });

  it('isTimedHold agrees with the parser', () => {
    expect(isTimedHold('20-40 sec')).toBe(true);
    expect(isTimedHold('8-10')).toBe(false);
  });
});

describe('the running hold', () => {
  const T0     = 1_700_000_000_000;
  const target = parseHoldTarget('20-40 sec')!;

  it('counts up from zero', () => {
    expect(heldSeconds(T0, T0, target)).toBe(0);
    expect(heldSeconds(T0, T0 + 12_000, target)).toBe(12);
    expect(heldSeconds(T0, T0 + 39_900, target)).toBe(39);
  });

  it('caps at the top of the range rather than running on', () => {
    expect(heldSeconds(T0, T0 + 40_000, target)).toBe(40);
    expect(heldSeconds(T0, T0 + 300_000, target)).toBe(40);
  });

  it('reports complete only once the top of the range is reached', () => {
    expect(holdComplete(T0, T0 + 19_000, target)).toBe(false);
    expect(holdComplete(T0, T0 + 39_000, target)).toBe(false);
    expect(holdComplete(T0, T0 + 40_000, target)).toBe(true);
  });

  it('survives the app being suspended mid-hold, because it counts from the clock', () => {
    // Backgrounded at 5s, back at 25s: the hold reads 25, not 5.
    expect(heldSeconds(T0, T0 + 25_000, target)).toBe(25);
  });

  it('formats as m:ss', () => {
    expect(formatHold(0)).toBe('0:00');
    expect(formatHold(9)).toBe('0:09');
    expect(formatHold(75)).toBe('1:15');
  });
});
