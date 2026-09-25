import { planState, summariseSessions } from '@/lib/planLifecycle';

/**
 * Card 255. A plan that reaches its end stops being returned by
 * getActiveBlocks and nothing says so. Leaving a plan deactivates the
 * user_plans row, so a still-active row with no open block is a plan that
 * finished rather than one the runner walked away from.
 */
const TODAY = '2026-09-21'; // a Monday
const plan = (over: Partial<{ template_id: string | null; start_date: string }> = {}) =>
  ({ template_id: 'tmpl-5k', start_date: '2026-07-06', ...over });

describe('planState', () => {
  it('is running while a block of the plan is still open', () => {
    expect(planState(plan(), [{ template_id: 'tmpl-5k', ends_on: '2026-10-04' }], TODAY)).toBe('running');
  });

  it('is running for an open-ended plan, which has no end date at all', () => {
    expect(planState(plan(), [{ template_id: 'tmpl-5k', ends_on: null }], TODAY)).toBe('running');
  });

  it('is finished once every block of it has closed', () => {
    // Emma's case: the run plan ended on 26 August and the calendar went quiet.
    expect(planState(plan(), [], TODAY)).toBe('finished');
  });

  it('is finished even while another plan is still running', () => {
    // The strength plan kept going; the run plan was the one that ended.
    expect(planState(plan(), [{ template_id: 'tmpl-strength', ends_on: '2026-11-06' }], TODAY)).toBe('finished');
  });

  it('is not finished before it begins: a plan starting Monday has no open block yet', () => {
    expect(planState(plan({ start_date: '2026-09-28' }), [], TODAY)).toBe('not_started');
  });

  it('counts a block starting later as running, so a restart is not read as an ending', () => {
    expect(planState(plan(), [{ template_id: 'tmpl-5k', ends_on: '2026-12-01' }], TODAY)).toBe('running');
  });

  it('never matches blocks that carry no template', () => {
    // A one-off mobility block has no template_id; neither does an ad-hoc block.
    expect(planState(plan({ template_id: null }), [{ template_id: null, ends_on: null }], TODAY)).toBe('finished');
  });
});

describe('summariseSessions', () => {
  const s = (status: string, scheduled_date = '2026-08-10') => ({ status, scheduled_date });

  it('counts what was asked for and what was done', () => {
    expect(summariseSessions([s('completed'), s('completed'), s('planned')]))
      .toEqual({ planned: 3, completed: 2 });
  });

  it('leaves dropped and moved sessions out of both figures', () => {
    // "Skip them and carry on" clears sessions that were never owed after that,
    // so counting them as missed would read worse than the runner's week was.
    expect(summariseSessions([s('completed'), s('dropped'), s('moved'), s('planned')]))
      .toEqual({ planned: 2, completed: 1 });
  });

  it('handles a plan with nothing recorded', () => {
    expect(summariseSessions([])).toEqual({ planned: 0, completed: 0 });
  });
});
