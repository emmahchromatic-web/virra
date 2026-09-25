import { supabase } from './supabase';

/**
 * When a plan is over, and what it came to.
 *
 * Card 255. A plan that reaches its end just stops: `getActiveBlocks` keeps
 * only blocks with `ends_on >= today`, so the block quietly drops out and
 * nothing is said. Leaving a plan is different — `clearSlot` and
 * `endTrainingBlock` both deactivate the `user_plans` row — so a row that is
 * still active with no open block is a plan the runner finished rather than
 * left. That is the signal this file reads.
 *
 * Emma reported it as a broken calendar: her run plan had ended on 26 August
 * and the empty weeks looked like a bug. The Training tab was worse than
 * silent — it went on calling the plan ACTIVE and counting weeks past the end
 * ("Week 14 of 9").
 */

export interface PlanRef {
  template_id: string | null;
  start_date:  string;
}

export interface BlockRef {
  template_id: string | null;
  ends_on:     string | null;
}

export type PlanState =
  /** Starts in the future; the runner chose a later start. */
  | 'not_started'
  /** A block of this plan is open, today or still to come. */
  | 'running'
  /** Every block of it has closed, and the runner never left it. */
  | 'finished';

export function planState(plan: PlanRef, openBlocks: BlockRef[], today: string): PlanState {
  if (plan.start_date > today) return 'not_started';
  const open = openBlocks.some((b) => b.template_id != null && b.template_id === plan.template_id);
  return open ? 'running' : 'finished';
}

export interface PlanFinish {
  /** The last day the plan covered. */
  endedOn:   string;
  /** Sessions the plan asked for, dropped ones excluded. */
  planned:   number;
  /** Sessions actually recorded. */
  completed: number;
}

/**
 * How a finished plan went: the day it ended and how much of it was done.
 *
 * Dropped sessions are left out of both figures. A session cleared by "skip
 * them and carry on" was never owed, so counting it as missed would make the
 * summary read worse than the runner's week actually was.
 */
export function summariseSessions(
  sessions: Array<{ status: string; scheduled_date: string }>,
): { planned: number; completed: number } {
  const live = sessions.filter((s) => s.status !== 'dropped' && s.status !== 'moved');
  return {
    planned:   live.length,
    completed: live.filter((s) => s.status === 'completed').length,
  };
}

/** The finished plan's block and what was done in it. Null if nothing closed. */
export async function loadPlanFinish(userId: string, templateId: string): Promise<PlanFinish | null> {
  const { data: blocks, error: blockErr } = await supabase
    .from('training_blocks')
    .select('id, ends_on')
    .eq('user_id', userId)
    .eq('template_id', templateId)
    .not('ends_on', 'is', null)
    .order('ends_on', { ascending: false })
    .limit(1);
  if (blockErr || !blocks || blocks.length === 0) return null;

  const block = blocks[0] as { id: string; ends_on: string };
  const { data: sessions, error: sessErr } = await supabase
    .from('planned_sessions')
    .select('status, scheduled_date')
    .eq('user_id', userId)
    .eq('block_id', block.id);
  if (sessErr) return { endedOn: block.ends_on, planned: 0, completed: 0 };

  return {
    endedOn: block.ends_on,
    ...summariseSessions((sessions ?? []) as Array<{ status: string; scheduled_date: string }>),
  };
}

/**
 * The runner has seen that the plan ended, so it stops being their plan.
 *
 * The same write leaving a plan makes, which is what keeps Browse and the plan
 * screen honest: without it a finished plan still reads as "you are on this
 * plan" for ever.
 */
export async function acknowledgeFinishedPlan(userId: string, templateId: string): Promise<void> {
  const { error } = await supabase
    .from('user_plans')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('template_id', templateId)
    .eq('is_active', true);
  if (error) throw new Error(error.message);
}
