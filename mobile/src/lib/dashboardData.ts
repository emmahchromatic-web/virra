import { supabase } from '@/lib/supabase';
import { resolveNutritionTargets } from '@/lib/nutritionTargets';
import type { CyclePhase } from '@/store/cycle';
import type { TrainingLoad, PersonalMetrics } from '@/lib/nutritionTargets';

export interface MonthlyStats {
  sessionsCompleted: number;
  adherencePct:      number;
}

export interface NutritionTotals {
  caloriesLogged:  number;
  caloriesTarget:  number;
  carbsLogged:     number;
  carbsTarget:     number;
  proteinLogged:   number;
  proteinTarget:   number;
  fatLogged:       number;
  fatTarget:       number;
}

export interface TodayCheckin {
  done:   boolean;
  energy: number | null;
  mood:   number | null;
  sleep:  number | null;
}

export async function getMonthlyStats(userId: string, today?: string): Promise<MonthlyStats> {
  const base = today ? new Date(today) : new Date();
  base.setDate(1);
  const monthStartStr = base.toLocaleDateString('en-CA');

  const { data } = await supabase
    .from('planned_sessions')
    .select('status')
    .eq('user_id', userId)
    .gte('scheduled_date', monthStartStr)
    .in('status', ['planned', 'completed', 'dropped']);

  if (!data || data.length === 0) return { sessionsCompleted: 0, adherencePct: 0 };

  const completed    = data.filter((r: { status: string }) => r.status === 'completed').length;
  const adherencePct = Math.round((completed / data.length) * 100);

  return { sessionsCompleted: completed, adherencePct };
}

export async function getTodayNutritionTotals(
  userId:       string,
  today:        string,
  phase:        CyclePhase | null,
  inferredLoad: TrainingLoad,
  metrics:      PersonalMetrics | null = null,
): Promise<NutritionTotals> {
  const fallbackTargets = resolveNutritionTargets(metrics, phase, inferredLoad);

  const { data: log } = await supabase
    .from('nutrition_logs')
    .select('id, targets_json')
    .eq('user_id', userId)
    .eq('recorded_on', today)
    .maybeSingle();

  const effectiveTargets =
    (log as { targets_json?: typeof fallbackTargets } | null)?.targets_json ?? fallbackTargets;

  const base: NutritionTotals = {
    caloriesLogged: 0, caloriesTarget: effectiveTargets.calories,
    carbsLogged:    0, carbsTarget:    effectiveTargets.carbs_g,
    proteinLogged:  0, proteinTarget:  effectiveTargets.protein_g,
    fatLogged:      0, fatTarget:      effectiveTargets.fat_g,
  };

  if (!log) return base;

  const { data: entries } = await supabase
    .from('food_entries')
    .select('calories, carbs_g, protein_g, fat_g')
    .eq('log_id', (log as { id: string }).id);

  if (!entries) return base;

  for (const e of entries as { calories: number; carbs_g: number; protein_g: number; fat_g: number }[]) {
    base.caloriesLogged += e.calories  ?? 0;
    base.carbsLogged    += e.carbs_g   ?? 0;
    base.proteinLogged  += e.protein_g ?? 0;
    base.fatLogged      += e.fat_g     ?? 0;
  }

  return base;
}

export async function getTodayCheckin(userId: string, today: string): Promise<TodayCheckin> {
  const { data } = await supabase
    .from('symptom_logs')
    .select('energy, mood, sleep_quality')
    .eq('user_id', userId)
    .eq('recorded_on', today)
    .maybeSingle();

  if (!data) return { done: false, energy: null, mood: null, sleep: null };

  const d = data as { energy: number; mood: number; sleep_quality: number };
  return { done: true, energy: d.energy, mood: d.mood, sleep: d.sleep_quality };
}
