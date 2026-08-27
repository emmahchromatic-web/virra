import type { CyclePhase } from '@/lib/cycleEngine';

/**
 * What to do when someone misses training.
 *
 * The read-time redistributor this replaces reshuffled volume the runner never
 * saw, silently inflating later weeks by up to 30% to make the totals add up.
 * It was reassuring arithmetic performed on someone else's behalf.
 *
 * This does the opposite: it notices, says what it noticed, and offers named
 * choices with their consequences attached. The runner decides. Nothing here
 * changes a plan on its own.
 */

export type RealignmentTrigger =
  | 'few_sessions'    // three or more missed, or a whole week untouched
  | 'weeks'           // two weeks or more
  | 'long_absence';   // more than a month

export type RealignmentAction =
  | 'skip_and_continue'
  | 'rearrange_into_week'
  | 'extend_plan'
  | 'rebuild_to_date'
  | 'rebuild_from_today'
  | 'restart_plan'
  | 'start_new_plan'
  | 'continue_unchanged';

export interface RealignmentOption {
  action:      RealignmentAction;
  label:       string;
  /** What it does to the plan, said plainly. */
  consequence: string;
  /** Shown with a warning treatment: this one carries a real risk. */
  risky?:      boolean;
}

export interface RealignmentPrompt {
  trigger:      RealignmentTrigger;
  missedCount:  number;
  weeksMissed:  number;
  headline:     string;
  options:      RealignmentOption[];
}

export interface MissedSession {
  /** ISO date, yyyy-mm-dd. */
  scheduled_date: string;
  status:         string;
}

export interface DetectInput {
  sessions:   MissedSession[];
  today:      string;
  /** Whether this plan has a fixed end date to rebuild towards. */
  hasRaceDate: boolean;
  /** The cycle phase predicted for a date, where the runner tracks one. */
  phaseOn?:   (isoDate: string) => CyclePhase | null;
}

/** Missed means the day has passed and nothing was recorded against it. */
export function missedSessions(sessions: MissedSession[], today: string): MissedSession[] {
  return sessions.filter((s) => s.status === 'planned' && s.scheduled_date < today);
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000,
  );
}

/**
 * A dip in the menstrual week is expected, and the plan already eases that week.
 * Prompting someone to rebuild their training because their period arrived is
 * both wrong and unkind, so a short run of missed sessions concentrated there
 * does not trigger anything. A longer absence still does — a fortnight off is a
 * fortnight off whatever the reason.
 */
export function isExpectedCycleDip(input: DetectInput, missed: MissedSession[]): boolean {
  if (!input.phaseOn || missed.length === 0) return false;
  if (missed.length > 3) return false;
  const menstrual = missed.filter((s) => input.phaseOn!(s.scheduled_date) === 'menstrual');
  return menstrual.length >= Math.ceil(missed.length * 0.5);
}

const OPTIONS: Record<RealignmentAction, RealignmentOption> = {
  skip_and_continue: {
    action: 'skip_and_continue', label: 'Skip them and carry on',
    consequence: 'Those sessions are marked as missed. The rest of your plan is unchanged.',
  },
  rearrange_into_week: {
    action: 'rearrange_into_week', label: 'Fit them into the rest of the week',
    consequence: 'The sessions move to your remaining days this week. It will be a fuller week than planned.',
  },
  extend_plan: {
    action: 'extend_plan', label: 'Add the time back on the end',
    consequence: 'Your plan gets longer by the time you missed, and nothing else changes.',
  },
  rebuild_to_date: {
    action: 'rebuild_to_date', label: 'Rebuild towards the same race day',
    consequence: 'A new plan from today to your race, built for where you are now. The old weeks are gone.',
  },
  rebuild_from_today: {
    action: 'rebuild_from_today', label: 'Rebuild from today',
    consequence: 'A new plan of the same length, starting now from your current fitness.',
  },
  restart_plan: {
    action: 'restart_plan', label: 'Start this plan again',
    consequence: 'Back to week one, with the same settings.',
  },
  start_new_plan: {
    action: 'start_new_plan', label: 'Choose a different plan',
    consequence: 'Takes you back to the plans, so you can pick something that fits where you are.',
  },
  continue_unchanged: {
    action: 'continue_unchanged', label: 'Carry on as though nothing happened',
    consequence: 'Your plan picks up where it is, at the volume it had reached. After this long off, that is a lot to come back to.',
    risky: true,
  },
};

/**
 * Whether to prompt, and with what.
 *
 * Deliberately does not fire on a single missed session — one missed run is
 * not an event, and treating it as one teaches people the app is anxious.
 */
export function detectRealignment(input: DetectInput): RealignmentPrompt | null {
  const missed = missedSessions(input.sessions, input.today);
  if (missed.length === 0) return null;

  const oldest = missed.reduce((a, s) => (s.scheduled_date < a ? s.scheduled_date : a), missed[0].scheduled_date);
  const daysSince  = daysBetween(oldest, input.today);
  const weeksMissed = Math.floor(daysSince / 7);

  if (missed.length < 3 && weeksMissed < 1) return null;
  if (isExpectedCycleDip(input, missed)) return null;

  if (daysSince > 31) {
    return {
      trigger: 'long_absence', missedCount: missed.length, weeksMissed,
      headline: `You have been away about ${Math.round(daysSince / 7)} weeks. Let's start from where you actually are.`,
      options: [
        OPTIONS.rebuild_from_today,
        OPTIONS.restart_plan,
        OPTIONS.start_new_plan,
        OPTIONS.continue_unchanged,
      ],
    };
  }

  if (weeksMissed >= 2) {
    return {
      trigger: 'weeks', missedCount: missed.length, weeksMissed,
      headline: `You have missed about ${weeksMissed} weeks. There are a few ways to pick this up.`,
      options: [
        ...(input.hasRaceDate ? [OPTIONS.rebuild_to_date] : [OPTIONS.extend_plan]),
        OPTIONS.extend_plan,
        OPTIONS.skip_and_continue,
      ].filter((o, i, all) => all.findIndex((x) => x.action === o.action) === i),
    };
  }

  return {
    trigger: 'few_sessions', missedCount: missed.length, weeksMissed,
    headline: missed.length >= 3
      ? `${missed.length} sessions went by. Nothing is broken — what would you like to do?`
      : 'Last week did not go to plan. What would you like to do?',
    options: [OPTIONS.skip_and_continue, OPTIONS.rearrange_into_week],
  };
}
