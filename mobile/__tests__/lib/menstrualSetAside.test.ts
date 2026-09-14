import {
  isCoreLed, isExplosive, isSetAsideCandidate, setAsideReason,
} from '@/lib/menstrualSetAside';

describe('isCoreLed', () => {
  // The whole point: 'core' as a stabiliser is not core work. Six of the eleven
  // library exercises that mention core are squats, pull-ups and carries.
  it('does not treat a squat as core work because core stabilises it', () => {
    expect(isCoreLed(['quads', 'glutes', 'core'])).toBe(false);
    expect(isCoreLed(['quads', 'glutes', 'hamstrings', 'core'])).toBe(false);
    expect(isCoreLed(['lats', 'biceps', 'core'])).toBe(false);
    expect(isCoreLed(['forearms', 'traps', 'core'])).toBe(false);
  });

  it('recognises the exercises that actually lead with core', () => {
    expect(isCoreLed(['core', 'transverse abdominis'])).toBe(true);  // Plank
    expect(isCoreLed(['core', 'shoulders', 'glutes'])).toBe(true);   // Turkish Get-up
  });

  it('handles a missing muscle list', () => {
    expect(isCoreLed(undefined)).toBe(false);
    expect(isCoreLed([])).toBe(false);
  });
});

describe('isExplosive', () => {
  it('reads the library\'s own tempo convention rather than guessing from names', () => {
    expect(isExplosive('explosive')).toBe(true);
    expect(isExplosive('EXPLOSIVE')).toBe(true);
    expect(isExplosive('3-1-1')).toBe(false);
    expect(isExplosive('hold')).toBe(false);
    expect(isExplosive(null)).toBe(false);
  });
});

describe('isSetAsideCandidate', () => {
  it('catches Box Jump on tempo and Plank on muscles, and leaves Back Squat alone', () => {
    expect(isSetAsideCandidate(['quads', 'glutes', 'calves'], 'explosive')).toBe(true);
    expect(isSetAsideCandidate(['core', 'transverse abdominis'], 'hold')).toBe(true);
    expect(isSetAsideCandidate(['quads', 'glutes', 'hamstrings', 'core'], '3-1-1')).toBe(false);
  });
});

describe('setAsideReason', () => {
  const cramps = { energy: 4, symptoms: ['Cramps'] };

  it('does nothing outside the menstrual phase, however rough the day', () => {
    expect(setAsideReason('luteal', 3, cramps)).toBeNull();
    expect(setAsideReason('follicular', 1, { energy: 1, symptoms: ['Cramps'] })).toBeNull();
    expect(setAsideReason(null, 1, cramps)).toBeNull();
  });

  it('names the symptom she logged, so the app is visibly listening', () => {
    expect(setAsideReason('menstrual', 4, cramps)).toBe('You logged cramps today.');
    expect(setAsideReason('menstrual', 4, { energy: 4, symptoms: ['Cramps', 'Back pain'] }))
      .toBe('You logged cramps and back pain today.');
  });

  it('ignores symptoms that are real but are not reasons to pull a plank', () => {
    expect(setAsideReason('menstrual', 4, { energy: 4, symptoms: ['Low mood', 'Insomnia'] })).toBeNull();
  });

  it('falls back to low energy, then to the heaviest days', () => {
    expect(setAsideReason('menstrual', 5, { energy: 2, symptoms: [] })).toBe('You logged low energy today.');
    // Days 1-3 with no check-in at all: the calendar is all we have. Roughly
    // 90% of total blood loss falls in the first three days.
    expect(setAsideReason('menstrual', 1, null)).toBe('These are usually the heaviest days.');
    expect(setAsideReason('menstrual', 2, null)).toBe('These are usually the heaviest days.');
    expect(setAsideReason('menstrual', 3, null)).toBe('These are usually the heaviest days.');
  });

  // Pinned explicitly, because this number is a judgement call rather than a
  // fact and the next person to change it should have to change a test that
  // says so. Day 3 is in, day 4 is out.
  it('draws the line after day 3, not through the whole bleed', () => {
    expect(setAsideReason('menstrual', 3, null)).not.toBeNull();
    expect(setAsideReason('menstrual', 4, null)).toBeNull();
  });

  it('leaves the later bleed days alone when she has said nothing is wrong', () => {
    // Emma asked for the heaviest days, not the whole bleed.
    expect(setAsideReason('menstrual', 4, null)).toBeNull();
    expect(setAsideReason('menstrual', 5, { energy: 4, symptoms: [] })).toBeNull();
  });

  // The fallback is the ONLY thing that changed: a logged symptom still wins on
  // any menstrual day, so day 4 is covered when she says it is bad, and day 1
  // is not forced on someone who says she is fine.
  it('still lets what she logged override the calendar in both directions', () => {
    expect(setAsideReason('menstrual', 5, { energy: 4, symptoms: ['Cramps'] })).toBe('You logged cramps today.');
    expect(setAsideReason('menstrual', 1, { energy: 5, symptoms: [] })).toBe('These are usually the heaviest days.');
  });
});
