import { supabase } from '@/lib/supabase';
import { useCycleStore } from '@/store/cycle';

function toYmd(d: Date): string {
  return d.toLocaleDateString('en-CA');
}

export async function resetCycleToToday(userId: string, today: Date = new Date()): Promise<void> {
  const { cycleLength, setPeriodStart } = useCycleStore.getState();
  const periodStart = toYmd(today);

  // Upsert, not insert. This inserted unconditionally, so tapping "my period
  // started today" twice produced two rows for the same date, and the store
  // reads the latest period_start with no tiebreaker: which cycle length the
  // app then used was down to the query planner. That is how Emma's account
  // ended up holding 2026-08-15 at both 28 and 27 days, three minutes apart.
  //
  // A second tap is a correction, not a new cycle, so it should overwrite.
  const { error } = await supabase
    .from('cycle_logs')
    .upsert(
      {
        user_id:           userId,
        period_start:      periodStart,
        cycle_length_days: cycleLength,
      },
      { onConflict: 'user_id,period_start' },
    );

  if (error) throw new Error(error.message);

  setPeriodStart(today);
}
