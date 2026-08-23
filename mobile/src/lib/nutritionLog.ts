import { supabase } from '@/lib/supabase';
import { resolveNutritionTargets, type PersonalMetrics, type TrainingLoad } from '@/lib/nutritionTargets';
import type { CyclePhase } from '@/store/cycle';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/**
 * Pick a sensible default meal slot from the time of day, so a quick-log from
 * the dashboard lands in the right meal instead of always defaulting to snack.
 * Anything between the main meal windows (and overnight) defaults to a snack.
 * The user can still change it on the food-search screen.
 *
 *   05:00–10:00  breakfast
 *   10:00–12:00  snack
 *   12:00–14:30  lunch
 *   14:30–17:00  snack
 *   17:00–21:00  dinner
 *   21:00–05:00  snack
 */
export function defaultMealSlot(date: Date = new Date()): MealType {
  const mins = date.getHours() * 60 + date.getMinutes();
  if (mins >= 300  && mins < 600)  return 'breakfast'; // 05:00–09:59
  if (mins >= 720  && mins < 870)  return 'lunch';     // 12:00–14:29
  if (mins >= 1020 && mins < 1260) return 'dinner';    // 17:00–20:59
  return 'snack';                                      // all other times
}

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
 * created from anywhere: the home quick-log button, the nutrition tab; carries
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
