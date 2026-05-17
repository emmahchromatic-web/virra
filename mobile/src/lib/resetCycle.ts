import { supabase } from '@/lib/supabase';
import { useCycleStore } from '@/store/cycle';

function toYmd(d: Date): string {
  return d.toLocaleDateString('en-CA');
}

export async function resetCycleToToday(userId: string, today: Date = new Date()): Promise<void> {
  const { cycleLength, setPeriodStart } = useCycleStore.getState();
  const periodStart = toYmd(today);

  const { error } = await supabase
    .from('cycle_logs')
    .insert({
      user_id:           userId,
      period_start:      periodStart,
      cycle_length_days: cycleLength,
    });

  if (error) throw new Error(error.message);

  setPeriodStart(today);
}
