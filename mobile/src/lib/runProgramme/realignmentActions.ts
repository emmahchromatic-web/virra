import { supabase } from '@/lib/supabase';
import type { RealignmentAction } from './realignment';

/**
 * Carrying out what the runner chose.
 *
 * Every one of these is destructive in the sense that matters: it changes a plan
 * someone is following. So each is a single deliberate act, taken only after the
 * runner picked it by name, and each says what it did afterwards.
 *
 * The rebuild actions are not implemented here. Rebuilding means running the
 * generator again with the runner's current state, which needs the enrolment
 * context — the archetype, the days, the goal — that lives with the block. They
 * hand back `needsRebuild` and the caller routes to the plan screen, where that
 * context exists and the runner sees what they are about to get. Silently
 * regenerating someone's training from a modal would be the same mistake the
 * redistributor made, in a new place.
 */

export interface ApplyInput {
  userId:  string;
  blockId: string;
  /** ISO yyyy-mm-dd. Injected for testability. */
  today:   string;
}

export interface ApplyResult {
  /** What happened, in words the runner can be shown. */
  summary:      string;
  /** The caller should route to plan selection or setup rather than staying put. */
  needsRebuild: boolean;
  changedCount: number;
}

/** Sessions that were scheduled before today and never recorded. */
async function fetchMissed(input: ApplyInput): Promise<Array<{ id: string; scheduled_date: string }>> {
  const { data, error } = await supabase
    .from('planned_sessions')
    .select('id, scheduled_date')
    .eq('user_id', input.userId)
    .eq('block_id', input.blockId)
    .eq('status', 'planned')
    .lt('scheduled_date', input.today);
  if (error) {
    console.warn('[realignment] could not read missed sessions', error.message);
    return [];
  }
  return (data ?? []) as Array<{ id: string; scheduled_date: string }>;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The dates left in the runner's current week, today included. */
function remainingDaysThisWeek(today: string): string[] {
  const d = new Date(`${today}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;       // 0 = Monday
  return Array.from({ length: 7 - dow }, (_, i) => addDaysIso(today, i));
}

export async function applyRealignment(
  action: RealignmentAction,
  input:  ApplyInput,
): Promise<ApplyResult> {
  switch (action) {
    case 'skip_and_continue': {
      const missed = await fetchMissed(input);
      if (missed.length === 0) return { summary: 'Nothing to skip.', needsRebuild: false, changedCount: 0 };
      const { error } = await supabase
        .from('planned_sessions')
        .update({ status: 'dropped' })
        .in('id', missed.map((m) => m.id));
      if (error) throw new Error(error.message);
      return {
        summary: `${missed.length} missed ${missed.length === 1 ? 'session' : 'sessions'} cleared. Your plan carries on unchanged.`,
        needsRebuild: false,
        changedCount: missed.length,
      };
    }

    case 'rearrange_into_week': {
      const missed = await fetchMissed(input);
      const slots  = remainingDaysThisWeek(input.today);

      // Only as many as the week can actually hold. Moving five sessions onto
      // three days would be worse than dropping two of them, and pretending
      // otherwise is how people get hurt trying to catch up.
      const { data: occupied } = await supabase
        .from('planned_sessions')
        .select('scheduled_date')
        .eq('user_id', input.userId)
        .eq('block_id', input.blockId)
        .in('status', ['planned', 'completed'])
        .gte('scheduled_date', input.today);

      const taken = new Set((occupied ?? []).map((r: { scheduled_date: string }) => r.scheduled_date));
      const free  = slots.filter((d) => !taken.has(d));

      const moving  = missed.slice(0, free.length);
      const dropped = missed.slice(free.length);

      for (let i = 0; i < moving.length; i++) {
        const newDate = free[i];
        const jsDay   = new Date(`${newDate}T00:00:00Z`).getUTCDay();
        const { error } = await supabase
          .from('planned_sessions')
          .update({ scheduled_date: newDate, day_of_week: jsDay === 0 ? 6 : jsDay - 1 })
          .eq('id', moving[i].id);
        if (error) throw new Error(error.message);
      }

      if (dropped.length > 0) {
        await supabase
          .from('planned_sessions')
          .update({ status: 'dropped' })
          .in('id', dropped.map((m) => m.id));
      }

      return {
        summary: dropped.length > 0
          ? `${moving.length} moved into the rest of this week. ${dropped.length} would not fit, so ${dropped.length === 1 ? 'it has' : 'they have'} been cleared.`
          : `${moving.length} moved into the rest of this week.`,
        needsRebuild: false,
        changedCount: moving.length,
      };
    }

    case 'extend_plan': {
      const missed = await fetchMissed(input);
      if (missed.length === 0) return { summary: 'Nothing to move.', needsRebuild: false, changedCount: 0 };

      const oldest = missed.reduce((a, m) => (m.scheduled_date < a ? m.scheduled_date : a), missed[0].scheduled_date);
      const days   = Math.max(7, Math.round(
        (Date.parse(`${input.today}T00:00:00Z`) - Date.parse(`${oldest}T00:00:00Z`)) / 86_400_000,
      ));
      // Whole weeks only: shifting by four days would land every session on a
      // different weekday from the one the runner chose.
      const shift = Math.round(days / 7) * 7;

      const { data: future, error: futureErr } = await supabase
        .from('planned_sessions')
        .select('id, scheduled_date')
        .eq('user_id', input.userId)
        .eq('block_id', input.blockId)
        .eq('status', 'planned')
        .gte('scheduled_date', input.today);
      if (futureErr) throw new Error(futureErr.message);

      for (const row of (future ?? []) as Array<{ id: string; scheduled_date: string }>) {
        const { error } = await supabase
          .from('planned_sessions')
          .update({ scheduled_date: addDaysIso(row.scheduled_date, shift) })
          .eq('id', row.id);
        if (error) throw new Error(error.message);
      }

      // The missed weeks themselves are cleared; they are not being made up.
      await supabase
        .from('planned_sessions')
        .update({ status: 'dropped' })
        .in('id', missed.map((m) => m.id));

      const { data: block } = await supabase
        .from('training_blocks')
        .select('ends_on')
        .eq('id', input.blockId)
        .maybeSingle();
      if (block?.ends_on) {
        await supabase
          .from('training_blocks')
          .update({ ends_on: addDaysIso(block.ends_on as string, shift) })
          .eq('id', input.blockId);
      }

      return {
        summary: `Your plan has moved back ${shift / 7} ${shift === 7 ? 'week' : 'weeks'}. Everything else is as it was.`,
        needsRebuild: false,
        changedCount: (future ?? []).length,
      };
    }

    case 'continue_unchanged': {
      // Deliberately does nothing to the plan. The runner was told what that
      // means and chose it anyway; overriding them would be worse than the risk.
      return {
        summary: 'Your plan is unchanged. Ease into the first week back.',
        needsRebuild: false,
        changedCount: 0,
      };
    }

    case 'rebuild_to_date':
    case 'rebuild_from_today':
    case 'restart_plan':
    case 'start_new_plan':
      return {
        summary: 'Building a new plan from where you are now.',
        needsRebuild: true,
        changedCount: 0,
      };
  }
}
