import {
  parseHoldTarget, isTimedHold, formatHold, heldSeconds, holdComplete,
  holdTargetFor, targetSecondsFor,
} from '@/lib/timedHold';

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
    expect(heldSeconds(T0, T0)).toBe(0);
    expect(heldSeconds(T0, T0 + 12_000)).toBe(12);
    expect(heldSeconds(T0, T0 + 39_900)).toBe(39);
  });

  it('keeps counting past the top of the range, so beating the target is recordable', () => {
    // It used to cap here, which filed every good day as par.
    expect(heldSeconds(T0, T0 + 40_000)).toBe(40);
    expect(heldSeconds(T0, T0 + 61_000)).toBe(61);
  });

  it('reports complete once the top of the range is reached, without stopping', () => {
    expect(holdComplete(19, target)).toBe(false);
    expect(holdComplete(39, target)).toBe(false);
    expect(holdComplete(40, target)).toBe(true);
    expect(holdComplete(75, target)).toBe(true);
  });

  it('survives the app being suspended mid-hold, because it counts from the clock', () => {
    // Backgrounded at 5s, back at 25s: the hold reads 25, not 5.
    expect(heldSeconds(T0, T0 + 25_000)).toBe(25);
  });

  it('formats as m:ss', () => {
    expect(formatHold(0)).toBe('0:00');
    expect(formatHold(9)).toBe('0:09');
    expect(formatHold(75)).toBe('1:15');
  });
});

describe('the authored unit decides, with the text as a fallback', () => {
  it('trusts an authored rep count even when the text mentions a duration', () => {
    // "8-10, 3s down" is a tempo note on a rep prescription, not a hold.
    expect(holdTargetFor('reps', '8-10, 3s down')).toBeNull();
  });

  it('reads the text when nothing was authored, for sessions scheduled earlier', () => {
    expect(holdTargetFor(null, '20-40 sec')).toEqual({ lowSeconds: 20, highSeconds: 40, eachSide: false });
    expect(holdTargetFor(undefined, '8-10')).toBeNull();
  });

  it('still times a hold authored with no number in it', () => {
    expect(holdTargetFor('seconds', 'max hold')).toEqual({ lowSeconds: 0, highSeconds: 0, eachSide: false });
  });

  it('counts both sides as one set', () => {
    expect(targetSecondsFor(parseHoldTarget('20-40s each side')!)).toBe(40);
    expect(targetSecondsFor(parseHoldTarget('20-40 sec')!)).toBe(20);
  });
});
