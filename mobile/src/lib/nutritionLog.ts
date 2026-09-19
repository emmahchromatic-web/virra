import { supabase } from '@/lib/supabase';
import { resolveTargetsForTier, type NutritionTargets, type PersonalMetrics, type TrainingLoad } from '@/lib/nutritionTargets';
import type { CyclePhase } from '@/store/cycle';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type FoodEntrySource = 'manual' | 'common' | 'off' | 'barcode' | 'haiku' | 'recipe';

/** Mirrors the columns the Nutrition tab has always selected off `food_entries`. */
export interface FoodEntryRow {
  id:            string;
  meal_type:     MealType;
  food_name:     string;
  calories:      number;
  carbs_g:       number;
  protein_g:     number;
  fat_g:         number;
  fibre_g:       number;
  quantity_g:    number | null;
  quantity_unit: string | null;
  source:        FoodEntrySource;
  haiku_input:   string | null;
  log_id:        string;
}

const FOOD_ENTRY_COLUMNS =
  'id, meal_type, food_name, calories, carbs_g, protein_g, fat_g, fibre_g, quantity_g, quantity_unit, source, haiku_input, log_id';

export interface NutritionDaySnapshot {
  logId:        string | null;
  trainingLoad: TrainingLoad | null;
  inferredLoad: TrainingLoad | null;
  targetsJson:  NutritionTargets | null;
  entries:      FoodEntryRow[];
}

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
  /** Card 298. Free tier snapshots the flat table. Defaults to Pro so the
   *  older call sites keep their behaviour until each passes the tier. */
  isPro?:        boolean;
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
  const targets = resolveTargetsForTier(ctx.isPro ?? true, ctx.metrics, ctx.phase, ctx.load);

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

/**
 * Pure READ of one day's `nutrition_logs` row (if any) plus its `food_entries`
 * -- the query the Nutrition tab has always run for display, extracted here
 * so `nutritionDay.ts`'s store can wrap it as a cache-first refresh without
 * duplicating the query logic, and without going anywhere near
 * `getOrCreateTodayLogId`'s upsert.
 *
 * A day with no logged row yet is a legitimate, successful "nothing here"
 * result -- not an error -- and resolves with `logId: null` and `entries: []`.
 * A genuine Supabase error throws, so a caller (the store's `refresh()`) can
 * tell "no data" apart from "the read failed" and leave its cache untouched
 * on the latter.
 */
export async function getNutritionDay(userId: string, recordedOn: string): Promise<NutritionDaySnapshot> {
  const { data: log, error: logError } = await supabase
    .from('nutrition_logs')
    .select('id, training_load, inferred_load, targets_json')
    .eq('user_id', userId)
    .eq('recorded_on', recordedOn)
    .maybeSingle();

  if (logError) throw new Error(logError.message);

  if (!log) {
    return { logId: null, trainingLoad: null, inferredLoad: null, targetsJson: null, entries: [] };
  }

  const { data: entries, error: entriesError } = await supabase
    .from('food_entries')
    .select(FOOD_ENTRY_COLUMNS)
    .eq('log_id', log.id);

  if (entriesError) throw new Error(entriesError.message);

  return {
    logId:        log.id,
    trainingLoad: (log.training_load as TrainingLoad | null) ?? null,
    inferredLoad: (log.inferred_load as TrainingLoad | null) ?? null,
    targetsJson:  (log.targets_json as NutritionTargets | null) ?? null,
    entries:      (entries ?? []) as unknown as FoodEntryRow[],
  };
}
