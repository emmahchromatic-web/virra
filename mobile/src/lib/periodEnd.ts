import { supabase } from '@/lib/supabase';
import { useCycleStore } from '@/store/cycle';
import { MAX_PERIOD_DAYS, MIN_PERIOD_DAYS } from '@/lib/cycleEngine';

/**
 * Logging when a period ended. Card 304.
 *
 * The menstrual phase used to be a fixed 5 days, so a 3-day period still read as
 * menstrual on days 4 and 5. The length is stored per period on its cycle_logs
 * row, and only affects what is worked out from now on: records already stamped
 * with a phase keep it (Emma's decision, 2026-09-17).
 */

const MS_PER_DAY = 86400000;

function midnight(d: Date): number {
  const o = new Date(d);
  o.setHours(0, 0, 0, 0);
  return o.getTime();
}

/** Days since the period started, where the start day is 0. Rounded across clock changes. */
export function daysSincePeriodStart(periodStart: Date, date: Date): number {
  return Math.round((midnight(date) - midnight(periodStart)) / MS_PER_DAY);
}

/** A period that started on day 1 and ended on `end` lasted this many days. */
export function periodDaysEndingOn(periodStart: Date, end: Date): number {
  return daysSincePeriodStart(periodStart, end) + 1;
}

export interface PeriodEndChoice {
  label:      string;
  periodDays: number;
}

/**
 * What the user can say about when her period ended, as of today: today,
 * yesterday or two days ago, never before day 1 and never past 10 days.
 *
 * Empty once the period is too far behind to still be ending, so the action
 * disappears rather than offering a length the app would refuse.
 */
export function periodEndChoices(periodStart: Date, today: Date = new Date()): PeriodEndChoice[] {
  const todayDays = periodDaysEndingOn(periodStart, today);
  if (todayDays < MIN_PERIOD_DAYS || todayDays > MAX_PERIOD_DAYS) return [];
  const labels = ['Today', 'Yesterday', '2 days ago'];
  return labels
    .map((label, back) => ({ label: `${label} · day ${todayDays - back}`, periodDays: todayDays - back }))
    .filter((c) => c.periodDays >= MIN_PERIOD_DAYS);
}

/**
 * Save the current period's length and apply it to the phase straight away.
 *
 * Resolves the row first and updates it by id, the same lesson as the cycle
 * length update in profile.tsx: update-with-order-and-limit rewrites every row.
 */
export async function logPeriodEnd(userId: string, periodDays: number): Promise<void> {
  if (!Number.isInteger(periodDays) || periodDays < MIN_PERIOD_DAYS || periodDays > MAX_PERIOD_DAYS) {
    throw new Error(`A period is logged as ${MIN_PERIOD_DAYS} to ${MAX_PERIOD_DAYS} days.`);
  }
  const { data: latest, error: readError } = await supabase
    .from('cycle_logs')
    .select('id')
    .eq('user_id', userId)
    .order('period_start', { ascending: false })
    .order('created_at',   { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!latest)   throw new Error('Log when your period started first.');

  const { error } = await supabase
    .from('cycle_logs')
    .update({ period_length_days: periodDays })
    .eq('id', latest.id);
  if (error) throw new Error(error.message);

  useCycleStore.getState().setLoggedPeriodDays(periodDays);
}
