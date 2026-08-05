import { supabase } from '@/lib/supabase';
import { resolveNutritionTargets, type PersonalMetrics, type TrainingLoad } from '@/lib/nutritionTargets';
import type { CyclePhase } from '@/store/cycle';

export interface TodayLogContext {
  userId:        string;
  today:         string;              // 'YYYY-MM-DD'
  phase:         CyclePhase | null;
  load:          TrainingLoad;
  metrics:       PersonalMetrics | null;
  inferredLoad?: TrainingLoad | null;
}

/**
 * Upsert today's `nutrition_logs` row and return its id.
 *
 * Mirrors the Nutrition tab's own upsert (nutrition.tsx `loadData`) so a log
 * created from anywhere — the home quick-log button, the nutrition tab — carries
 * the same phase/load/targets snapshot and resolves to the same row (unique on
 * user_id + recorded_on). Callers that only have a user id (e.g. the home food
 * button) can create the row before navigating into food-search, which requires
 * a logId to attach entries to. Returns null on failure.
 */
export async function getOrCreateTodayLogId(ctx: TodayLogContext): Promise<string | null> {
  const targets = resolveNutritionTargets(ctx.metrics, ctx.phase, ctx.load);

  const { data, error } = await supabase
    .from('nutrition_logs')
    .upsert({
      user_id:       ctx.userId,
      recorded_on:   ctx.today,
      phase_at_time: ctx.phase,
      training_load: ctx.load,
      inferred_load: ctx.inferredLoad ?? null,
      targets_json:  targets,
    }, { onConflict: 'user_id,recorded_on' })
    .select('id')
    .single();

  if (error) {
    console.warn('[nutritionLog] getOrCreateTodayLogId failed:', error.message);
    return null;
  }
  return data?.id ?? null;
}
