import { getCycleInfo, type CyclePhase, type CycleMode } from '@/lib/cycleEngine';
import { phaseRankForSession } from '@/lib/cycleModulation';
import type { DayIndex } from './weekComposer';

/**
 * The cycle stops being a correction applied to a finished plan and becomes
 * part of how the plan is built.
 *
 * Two things move. The back-off week goes where the runner's own physiology
 * already wants one, rather than landing on an arbitrary week number. And hard
 * sessions are placed in the phase that suits them — which `anchorKeySession`
 * has known how to do since it was written, fully unit-tested, without ever
 * being called by anything. This is its first caller.
 *
 * Read-time modulation stays exactly as it is. It now corrects a plan that was
 * already the right shape, so its corrections get smaller.
 */

/** Phases a back-off week belongs in, best first. */
const BACK_OFF_PHASES: CyclePhase[] = ['menstrual', 'luteal'];

/** How far a down week may be nudged to find one, in weeks. */
const MAX_NUDGE_WEEKS = 1;

export interface CycleContext {
  mode:        CycleMode;
  periodStart: Date | null;
  cycleLength: number;
}

/**
 * Whether to shape a plan around the cycle at all, and how far to trust it.
 *
 * `steady` means the runner does not track a cycle, or is on a pack that
 * flattens it: shaping would be inventing a rhythm they do not have. Irregular
 * cycles get the coarse half only — moving a back-off week by seven days is
 * forgiving if the prediction is off, whereas placing a specific hard session
 * on a specific day is not.
 */
export function shapingStrength(ctx: CycleContext, isIrregular: boolean): 'none' | 'coarse' | 'full' {
  if (ctx.mode === 'steady' || !ctx.periodStart) return 'none';
  return isIrregular ? 'coarse' : 'full';
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

/** The phase predicted for a given date. */
export function phaseOn(ctx: CycleContext, date: Date): CyclePhase | null {
  if (!ctx.periodStart) return null;
  return getCycleInfo(ctx.periodStart, ctx.cycleLength, date)?.phase ?? null;
}

/**
 * Back-off weeks, nudged onto the cycle.
 *
 * Starts from the plain every-fourth-week rhythm and moves each one by at most
 * a week to land in a menstrual or late-luteal week. Never moves one past its
 * neighbour, and never onto a week that already backs off — a plan with two
 * down weeks in a row has stopped being a plan.
 */
export function cycleAlignedDownWeeks(
  planStart:  Date,
  ctx:        CycleContext,
  candidates: number[],
): number[] {
  const taken = new Set<number>();
  const out: number[] = [];

  for (const week of candidates) {
    let best = week;
    let bestRank = Number.POSITIVE_INFINITY;

    for (let delta = -MAX_NUDGE_WEEKS; delta <= MAX_NUDGE_WEEKS; delta++) {
      const w = week + delta;
      if (w < 1 || taken.has(w)) continue;
      // Midweek is the fairest single sample of a week's phase.
      const phase = phaseOn(ctx, addDays(planStart, (w - 1) * 7 + 3));
      const rank  = phase ? BACK_OFF_PHASES.indexOf(phase) : -1;
      const score = rank === -1 ? 99 : rank;
      // Ties go to the original week: do not move one for no gain.
      if (score < bestRank || (score === bestRank && w === week)) {
        bestRank = score;
        best = w;
      }
    }

    taken.add(best);
    out.push(best);
  }

  return out.sort((a, b) => a - b);
}

/**
 * Ranks the days of a plan week for hard work, lowest first.
 *
 * Uses the same table `anchorKeySession` does — long and tempo prefer the
 * follicular phase, sharp interval work prefers the ovulatory window. Ranking
 * rather than choosing, because the composer has spacing and recovery rules of
 * its own that outrank the cycle: this only breaks ties between days that are
 * equally good for recovery.
 */
export function rankHardDay(
  planStart: Date,
  ctx:       CycleContext,
): (day: DayIndex, weekIndex: number) => number {
  return (day: DayIndex, weekIndex: number) =>
    phaseRankForSession('tempo', phaseOn(ctx, addDays(planStart, weekIndex * 7 + day)));
}
