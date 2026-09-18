import {
  limitSetInput, isBigJump, isWithinWeightLimit, formatKg,
  MAX_REPS, MAX_HOLD_SECONDS, MAX_WEIGHT_KG,
} from '@/lib/setInputLimits';

describe('limitSetInput: reps', () => {
  it('accepts up to the limit', () => {
    expect(limitSetInput('reps', '5', '50')).toEqual({ value: '50', hint: null });
  });

  it('refuses the keystroke that goes over, keeping what was there', () => {
    expect(limitSetInput('reps', '5', '51')).toEqual({ value: '5', hint: `Max ${MAX_REPS} reps` });
    expect(limitSetInput('reps', '9', '99')).toEqual({ value: '9', hint: 'Max 50 reps' });
  });

  it('drops anything that is not a digit, without a hint', () => {
    expect(limitSetInput('reps', '1', '1.')).toEqual({ value: '1', hint: null });
    expect(limitSetInput('reps', '', '-')).toEqual({ value: '', hint: null });
  });

  it('lets the field be cleared', () => {
    expect(limitSetInput('reps', '8', '')).toEqual({ value: '', hint: null });
  });
});

describe('limitSetInput: timed holds', () => {
  it('allows a hold far longer than any rep count', () => {
    expect(limitSetInput('seconds', '9', '90')).toEqual({ value: '90', hint: null });
    expect(limitSetInput('seconds', '30', '300')).toEqual({ value: '300', hint: null });
  });

  it('refuses past five minutes', () => {
    expect(limitSetInput('seconds', '30', '301')).toEqual({ value: '30', hint: `Max ${MAX_HOLD_SECONDS} s` });
  });
});

describe('limitSetInput: weight', () => {
  it('stops 2500 at 250', () => {
    expect(limitSetInput('weight', '250', '2500')).toEqual({ value: '250', hint: `Max ${MAX_WEIGHT_KG} kg` });
  });

  it('allows exactly the limit and plate-step decimals', () => {
    expect(limitSetInput('weight', '25', '250')).toEqual({ value: '250', hint: null });
    expect(limitSetInput('weight', '22.2', '22.25')).toEqual({ value: '22.25', hint: null });
  });

  it('refuses a third decimal place', () => {
    expect(limitSetInput('weight', '22.25', '22.255')).toEqual({ value: '22.25', hint: 'Up to 2 decimal places' });
  });

  it('refuses a weight a hair over the limit', () => {
    expect(limitSetInput('weight', '250.0', '250.01').hint).toBe('Max 250 kg');
  });

  it('cannot hold a second decimal point', () => {
    expect(limitSetInput('weight', '12.5', '12.5.')).toEqual({ value: '12.5', hint: null });
  });

  it('reads a comma as the decimal point', () => {
    expect(limitSetInput('weight', '12', '12,5')).toEqual({ value: '12.5', hint: null });
  });

  it('allows a bare leading point while typing', () => {
    expect(limitSetInput('weight', '', '.')).toEqual({ value: '.', hint: null });
  });
});

describe('isBigJump', () => {
  it('fires above double AND at least 10 kg heavier', () => {
    expect(isBigJump(85, 40)).toBe(true);
    expect(isBigJump(250, 25)).toBe(true);
  });

  it('does not fire at exactly double', () => {
    expect(isBigJump(80, 40)).toBe(false);
  });

  it('does not fire for ordinary progress or light kit', () => {
    expect(isBigJump(50, 40)).toBe(false);
    expect(isBigJump(10, 4)).toBe(false);   // 2.5x but only 6 kg
    expect(isBigJump(15, 5)).toBe(true);    // 3x and 10 kg
  });

  it('never fires without a previous weight, or for a drop', () => {
    expect(isBigJump(85, undefined)).toBe(false);
    expect(isBigJump(85, null)).toBe(false);
    expect(isBigJump(85, 0)).toBe(false);
    expect(isBigJump(20, 40)).toBe(false);
  });
});

describe('isWithinWeightLimit / formatKg', () => {
  it('bounds a pre-fill the field could not have accepted', () => {
    expect(isWithinWeightLimit(250)).toBe(true);
    expect(isWithinWeightLimit(800)).toBe(false);
    expect(isWithinWeightLimit(-1)).toBe(false);
  });

  it('formats without trailing zeros', () => {
    expect(formatKg(40)).toBe('40');
    expect(formatKg(22.25)).toBe('22.25');
  });
});
