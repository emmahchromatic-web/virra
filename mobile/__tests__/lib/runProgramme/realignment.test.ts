import {
  detectRealignment,
  missedSessions,
  isExpectedCycleDip,
  type DetectInput,
  type MissedSession,
} from '@/lib/runProgramme/realignment';
import type { CyclePhase } from '@/lib/cycleEngine';

const TODAY = '2026-03-30';

function session(date: string, status = 'planned'): MissedSession {
  return { scheduled_date: date, status };
}

/**
 * n sessions every other day, the most recent `endingDaysAgo` before today.
 * n therefore sets how far back the run reaches: n sessions span 2n days.
 */
function run(n: number, endingDaysAgo: number): MissedSession[] {
  const end = Date.parse(`${TODAY}T00:00:00Z`) - endingDaysAgo * 86_400_000;
  return Array.from({ length: n }, (_, i) =>
    session(new Date(end - i * 2 * 86_400_000).toISOString().slice(0, 10)));
}

/** Reaches back a fortnight (oldest ~15 days ago). */
const twoWeeksOff  = () => run(8, 1);
/** Reaches back beyond a month (oldest ~33 days ago). */
const monthOff     = () => run(17, 1);

const detect = (over: Partial<DetectInput> = {}) =>
  detectRealignment({ sessions: [], today: TODAY, hasRaceDate: false, ...over });

describe('missedSessions', () => {
  it('counts a past session nobody recorded anything against', () => {
    expect(missedSessions([session('2026-03-20')], TODAY)).toHaveLength(1);
  });

  it('does not count a completed one', () => {
    expect(missedSessions([session('2026-03-20', 'completed')], TODAY)).toHaveLength(0);
  });

  it('does not count one the runner dropped or moved on purpose', () => {
    expect(missedSessions([session('2026-03-20', 'dropped'), session('2026-03-21', 'moved')], TODAY))
      .toHaveLength(0);
  });

  it('does not count today or the future', () => {
    expect(missedSessions([session(TODAY), session('2026-04-02')], TODAY)).toHaveLength(0);
  });
});

describe('detectRealignment — when it stays quiet', () => {
  it('says nothing when nothing was missed', () => {
    expect(detect()).toBeNull();
  });

  it('says nothing for one missed run', () => {
    // One missed run is not an event. Treating it as one teaches people the app
    // is anxious.
    expect(detect({ sessions: run(1, 2) })).toBeNull();
  });

  it('says nothing for two missed runs inside the week', () => {
    expect(detect({ sessions: run(2, 1) })).toBeNull();
  });
});

describe('detectRealignment — a few sessions', () => {
  const prompt = () => detect({ sessions: run(3, 1) })!;

  it('prompts once three have gone by', () => {
    expect(prompt().trigger).toBe('few_sessions');
  });

  it('offers skipping or fitting them back into the week', () => {
    expect(prompt().options.map((o) => o.action)).toEqual(['skip_and_continue', 'rearrange_into_week']);
  });

  it('does not offer anything drastic for three missed runs', () => {
    const actions = prompt().options.map((o) => o.action);
    expect(actions).not.toContain('restart_plan');
    expect(actions).not.toContain('rebuild_from_today');
  });

  it('says nothing is broken, because nothing is', () => {
    expect(prompt().headline).toMatch(/nothing is broken/i);
  });
});

describe('detectRealignment — weeks off', () => {
  it('escalates past a fortnight', () => {
    expect(detect({ sessions: twoWeeksOff() })!.trigger).toBe('weeks');
  });

  it('offers rebuilding to the race day when there is one', () => {
    const p = detect({ sessions: twoWeeksOff(), hasRaceDate: true })!;
    expect(p.options.map((o) => o.action)).toContain('rebuild_to_date');
  });

  it('offers extending instead when there is no fixed date', () => {
    const p = detect({ sessions: twoWeeksOff(), hasRaceDate: false })!;
    expect(p.options.map((o) => o.action)).toContain('extend_plan');
    expect(p.options.map((o) => o.action)).not.toContain('rebuild_to_date');
  });

  it('never offers the same option twice', () => {
    const actions = detect({ sessions: twoWeeksOff(), hasRaceDate: true })!.options.map((o) => o.action);
    expect(new Set(actions).size).toBe(actions.length);
  });
});

describe('detectRealignment — a long absence', () => {
  const prompt = () => detect({ sessions: monthOff() })!;

  it('escalates past a month', () => {
    expect(prompt().trigger).toBe('long_absence');
  });

  it('offers starting from where the runner actually is', () => {
    expect(prompt().options.map((o) => o.action)).toContain('rebuild_from_today');
  });

  it('marks carrying on unchanged as the risky one', () => {
    const carryOn = prompt().options.find((o) => o.action === 'continue_unchanged')!;
    expect(carryOn.risky).toBe(true);
    expect(carryOn.consequence).toMatch(/a lot to come back to/i);
  });

  it('gives every option a consequence, in plain words', () => {
    for (const o of prompt().options) {
      expect(o.consequence.length).toBeGreaterThan(20);
      expect(o.label.length).toBeGreaterThan(0);
    }
  });
});

describe('the menstrual-week exception', () => {
  const menstrual = (): ((d: string) => CyclePhase | null) => () => 'menstrual';
  const follicular = (): ((d: string) => CyclePhase | null) => () => 'follicular';

  it('stays quiet when a short dip falls in the menstrual week', () => {
    // The plan already eases that week. Prompting someone to rebuild their
    // training because their period arrived is both wrong and unkind.
    expect(detect({ sessions: run(3, 1), phaseOn: menstrual() })).toBeNull();
  });

  it('still prompts when the same dip falls anywhere else', () => {
    expect(detect({ sessions: run(3, 1), phaseOn: follicular() })).not.toBeNull();
  });

  it('still prompts for a real absence, whatever the phase', () => {
    // A fortnight off is a fortnight off.
    expect(detect({ sessions: twoWeeksOff(), phaseOn: menstrual() })).not.toBeNull();
  });

  it('is not applied to a runner who does not track a cycle', () => {
    expect(isExpectedCycleDip({ sessions: [], today: TODAY, hasRaceDate: false }, run(3, 1))).toBe(false);
  });

  it('needs the dip to be mostly menstrual, not incidentally so', () => {
    const mixed = (d: string): CyclePhase => (d.endsWith('7') ? 'menstrual' : 'follicular');
    const sessions = run(4, 1);
    expect(isExpectedCycleDip(
      { sessions, today: TODAY, hasRaceDate: false, phaseOn: mixed }, sessions,
    )).toBe(false);
  });
});
