import {
  authoredSessionCount,
  sessionCountBounds,
  GENERATED_PLAN_MAX_SESSIONS,
} from '@/lib/sessionCountBounds';

describe('authoredSessionCount', () => {
  it('counts distinct labels, not occurrences', () => {
    const weeks = [
      { sessions: ['lower', 'upper'] },
      { sessions: ['lower', 'upper'] },
    ];
    expect(authoredSessionCount(weeks)).toBe(2);
  });

  it('is empty-safe', () => {
    expect(authoredSessionCount([])).toBe(0);
    expect(authoredSessionCount(null)).toBe(0);
    expect(authoredSessionCount([{}])).toBe(0);
  });
});

describe('sessionCountBounds', () => {
  // The original bug: 2-day programme stretched to 3 gave lower/upper/lower.
  it('does not let a 2-day strength programme be stretched', () => {
    expect(sessionCountBounds(true, 2).max).toBe(2);
  });

  // The half that shipped unfixed: squashing keeps only the first label, so a
  // lower/upper programme at 1/wk is lower every week and never upper.
  it('does not let a 2-day strength programme be squashed', () => {
    expect(sessionCountBounds(true, 2).min).toBe(2);
  });

  it('pins a programme-backed strength plan to exactly its authored count', () => {
    for (const authored of [1, 2, 3, 4, 6]) {
      const { min, max } = sessionCountBounds(true, authored);
      expect(min).toBe(authored);
      expect(max).toBe(authored);
    }
  });

  it('leaves generated run plans genuinely adjustable', () => {
    expect(sessionCountBounds(false, 0)).toEqual({ min: 1, max: GENERATED_PLAN_MAX_SESSIONS });
    // A run plan is not authored, so its label count must not pin the stepper.
    expect(sessionCountBounds(false, 3)).toEqual({ min: 1, max: GENERATED_PLAN_MAX_SESSIONS });
  });

  it('falls back to the adjustable range when a strength plan authors nothing', () => {
    // Defensive: a strength plan with no sessions_json must not pin to 0 and
    // leave the user unable to start anything.
    expect(sessionCountBounds(true, 0)).toEqual({ min: 1, max: GENERATED_PLAN_MAX_SESSIONS });
  });
});
