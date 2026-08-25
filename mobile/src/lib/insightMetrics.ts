import { supabase } from './supabase';

export interface PhasePace {
  phase:           string;
  avgPaceSecPerKm: number;
  activityCount:   number;
}

export interface SymptomTrend {
  energy: number;
  mood:   number;
  sleep:  number;
}

export interface FuellingAlignment {
  daysOverTarget:  number;
  daysUnderTarget: number;
  daysOnTarget:    number;
  /** Where the shortfall actually is. Null when nothing is meaningfully short. */
  gap:             FuellingGap | null;
}

export type MacroKey  = 'carbs_g' | 'protein_g' | 'fat_g' | 'fibre_g';
export type MealSlot  = 'breakfast' | 'lunch' | 'dinner';

export interface FuellingGap {
  /** The macro furthest below target, as a share of its own target. */
  macro:            MacroKey;
  /** Average grams short per under-fuelled day. */
  avgShortfallG:    number;
  /** That shortfall as a percentage of the daily target. */
  shortfallPct:     number;
  /** The meal that most often holds the least of this macro. */
  meal:             MealSlot;
  daysUnderTarget:  number;
}

/**
 * Days within this band of target count as on track. Being exactly on target
 * every day is neither realistic nor the goal, and reporting a 4% miss as a
 * failure trains people to distrust the number.
 */
export const FUELLING_MARGIN = 0.10;

export interface InsightMetrics {
  streakDays:              number;
  weeklyKm:                number;
  monthlyKm:               number;
  totalKm:                 number;
  consistencyPct:          number;
  phasePaces:              PhasePace[];
  activitiesThisWeek:      number;
  trainingAdherencePct:    number | null;
  droppedByModality:       Record<string, number> | null;
  nutritionCompliancePct:  number | null;
  symptomTrend:            SymptomTrend | null;
  fuellingAlignment:       FuellingAlignment | null;
}

function isoWeekKey(d = new Date()): string {
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const weekNum = Math.ceil(((d.getTime() - startOfWeek1.getTime()) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function currentPeriodKeys(): { weekKey: string; monthKey: string } {
  return { weekKey: isoWeekKey(), monthKey: monthKey() };
}

export async function computeInsightMetrics(userId: string): Promise<InsightMetrics> {
  const now       = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const window28   = new Date(now.getTime() - 28 * 86400000);
  const window7    = new Date(now.getTime() - 7 * 86400000);
  const window7ISO  = window7.toISOString().split('T')[0];
  const window28ISO = window28.toISOString().split('T')[0];
  const todayISO    = now.toISOString().split('T')[0];

  const [weekRes, monthRes, totalRes, window28Res, paceRes,
         sessionsWindowRes, nutritionLogsRes, symptomLogsRes] = await Promise.all([
    supabase
      .from('activities')
      .select('distance_meters')
      .eq('user_id', userId)
      .gte('started_at', weekStart.toISOString()),

    supabase
      .from('activities')
      .select('distance_meters')
      .eq('user_id', userId)
      .gte('started_at', monthStart.toISOString()),

    supabase
      .from('activities')
      .select('distance_meters')
      .eq('user_id', userId)
      .limit(5000), // MVP cap; replace with aggregate when history grows

    supabase
      .from('activities')
      .select('started_at')
      .eq('user_id', userId)
      .gte('started_at', window28.toISOString()),

    supabase
      .from('activities')
      .select('phase_at_time, run_details(avg_pace_seconds_per_km)')
      .eq('user_id', userId)
      .eq('activity_type', 'run')
      .not('phase_at_time', 'is', null),

    supabase
      .from('planned_sessions')
      .select('status, modality')
      .eq('user_id', userId)
      .gte('scheduled_date', window28ISO)
      .lte('scheduled_date', todayISO)
      .neq('status', 'moved'),

    supabase
      .from('nutrition_logs')
      .select('recorded_on, targets_json, inferred_load, food_entries(meal_type, calories, carbs_g, protein_g, fat_g, fibre_g)')
      .eq('user_id', userId)
      .gte('recorded_on', window7ISO)
      .order('recorded_on'),

    supabase
      .from('symptom_logs')
      .select('energy, mood, sleep_quality')
      .eq('user_id', userId)
      .order('recorded_on', { ascending: false })
      .limit(7),
  ]);

  if (weekRes.error)          throw weekRes.error;
  if (monthRes.error)         throw monthRes.error;
  if (totalRes.error)         throw totalRes.error;
  if (window28Res.error)      throw window28Res.error;
  if (paceRes.error)          throw paceRes.error;
  if (sessionsWindowRes.error) throw sessionsWindowRes.error;
  if (nutritionLogsRes.error)  throw nutritionLogsRes.error;
  if (symptomLogsRes.error)    throw symptomLogsRes.error;

  const sumKm = (rows: any[]) =>
    rows.reduce((acc, r) => acc + (r.distance_meters ?? 0), 0) / 1000;

  const weeklyKm  = sumKm(weekRes.data ?? []);
  const monthlyKm = sumKm(monthRes.data ?? []);
  const totalKm   = sumKm(totalRes.data ?? []);

  // Streak is capped at 28 days; the window of this query. Sufficient for motivation display.
  const allDates = [...new Set(
    (window28Res.data ?? []).map((r: any) =>
      new Date(r.started_at).toISOString().split('T')[0]
    )
  )].sort((a, b) => (a > b ? -1 : 1));

  const todayStr     = now.toISOString().split('T')[0];
  const yesterdayStr = new Date(now.getTime() - 86400000).toISOString().split('T')[0];

  let streakDays = 0;
  if (allDates.length > 0 && (allDates[0] === todayStr || allDates[0] === yesterdayStr)) {
    let cursor = new Date(allDates[0]);
    for (const dateStr of allDates) {
      const d = new Date(dateStr);
      const diffDays = Math.round((cursor.getTime() - d.getTime()) / 86400000);
      if (diffDays <= 1) {
        streakDays++;
        cursor = d;
      } else {
        break;
      }
    }
  }

  const consistencyPct = Math.min(100, Math.round((allDates.length / 28) * 100));

  // Training adherence
  const sessionWindow      = sessionsWindowRes.data ?? [];
  const completedSessions  = sessionWindow.filter((s: any) => s.status === 'completed').length;
  const droppedSessions    = sessionWindow.filter((s: any) => s.status === 'dropped').length;
  const trainingAdherencePct = completedSessions + droppedSessions > 0
    ? Math.round((completedSessions / (completedSessions + droppedSessions)) * 100)
    : null;
  const droppedByModality: Record<string, number> | null = droppedSessions === 0
    ? null
    : (sessionWindow as any[])
        .filter((s) => s.status === 'dropped')
        .reduce((acc: Record<string, number>, s: any) => {
          acc[s.modality] = (acc[s.modality] ?? 0) + 1;
          return acc;
        }, {});

  // Nutrition compliance: per-day score weighted by how close to target the
  // day landed, then averaged. On-target = 1.0; at the 10% threshold = 0.0
  // beyond = 0.0 (clipped). This rewards days that hit the goal more strongly
  // than days that scrape into the threshold band, and produces a smoother
  // signal than a binary in/out-of-10% count.
  const COMPLIANCE_THRESHOLD = 0.10;
  const nutritionLogs = nutritionLogsRes.data ?? [];
  let complianceScoreSum = 0;
  let loggedDays         = 0;
  for (const log of nutritionLogs as any[]) {
    const targetCal: number = (log.targets_json as any)?.calories ?? 0;
    if (!targetCal) continue;
    const actualCal = (log.food_entries as any[])
      .reduce((s: number, e: any) => s + (e.calories ?? 0), 0);
    if (actualCal > 0) {
      loggedDays++;
      const pctOff   = Math.abs(actualCal - targetCal) / targetCal;
      const dayScore = Math.max(0, 1 - pctOff / COMPLIANCE_THRESHOLD);
      complianceScoreSum += dayScore;
    }
  }
  const nutritionCompliancePct = loggedDays > 0
    ? Math.round((complianceScoreSum / loggedDays) * 100)
    : null;

  // Fuelling alignment: compares actual intake against inferred_load target (not user-selected)
  const alignedLogs = (nutritionLogs as any[]).filter((l: any) => l.inferred_load);
  let fuellingAlignment: FuellingAlignment | null = null;
  if (alignedLogs.length >= 3) {
    let over = 0, under = 0, onTarget = 0;
    const underDays: any[] = [];
    for (const log of alignedLogs) {
      const targetCal: number = (log.targets_json as any)?.calories ?? 0;
      if (!targetCal) continue;
      const actualCal = (log.food_entries as any[])
        .reduce((s: number, e: any) => s + (e.calories ?? 0), 0);
      if (actualCal <= 0) continue;
      const ratio = actualCal / targetCal;
      if (ratio > 1 + FUELLING_MARGIN) over++;
      else if (ratio < 1 - FUELLING_MARGIN) { under++; underDays.push(log); }
      else onTarget++;
    }
    fuellingAlignment = {
      daysOverTarget: over,
      daysUnderTarget: under,
      daysOnTarget: onTarget,
      gap: computeFuellingGap(underDays),
    };
  }

  // Symptom trend: 7-entry average
  const symptomRows = symptomLogsRes.data ?? [];
  let symptomTrend: SymptomTrend | null = null;
  if (symptomRows.length > 0) {
    const avg = (key: string) =>
      Math.round(
        (symptomRows as any[]).reduce((s: number, r: any) => s + (r[key] ?? 0), 0) /
          symptomRows.length * 10
      ) / 10;
    symptomTrend = { energy: avg('energy'), mood: avg('mood'), sleep: avg('sleep_quality') };
  }

  const phaseMap = new Map<string, number[]>();
  for (const row of (paceRes.data ?? []) as any[]) {
    const phase = row.phase_at_time as string;
    const pace = row.run_details?.[0]?.avg_pace_seconds_per_km ?? null; // PostgREST returns 1:many arrays even for 1:1 joins
    if (pace !== null && pace > 0 && pace < 1800) {
      if (!phaseMap.has(phase)) phaseMap.set(phase, []);
      phaseMap.get(phase)!.push(pace);
    }
  }
  const phasePaces: PhasePace[] = Array.from(phaseMap.entries()).map(([phase, paces]) => ({
    phase,
    avgPaceSecPerKm: Math.round(paces.reduce((a, b) => a + b, 0) / paces.length),
    activityCount:   paces.length,
  }));

  return {
    streakDays,
    weeklyKm:              Math.round(weeklyKm * 10) / 10,
    monthlyKm:             Math.round(monthlyKm * 10) / 10,
    totalKm:               Math.round(totalKm * 10) / 10,
    consistencyPct,
    phasePaces,
    activitiesThisWeek:    weekRes.data?.length ?? 0,
    trainingAdherencePct,
    droppedByModality,
    nutritionCompliancePct,
    symptomTrend,
    fuellingAlignment,
  };
}

export function formatPaceMmSs(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.floor(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

// ---------------------------------------------------------------------------
// Fuelling diagnosis
// ---------------------------------------------------------------------------
// "You fuelled below target on 3 days" tells someone a fact they already knew
// and gives them nothing to do about it. Raised in build 11 UAT, card 34: the
// insight has to name the macro that is actually short, the meal where the gap
// keeps opening, and why it matters, or it is just scorekeeping.

const MACROS: MacroKey[]  = ['carbs_g', 'protein_g', 'fat_g', 'fibre_g'];
const MEALS:  MealSlot[]  = ['breakfast', 'lunch', 'dinner'];

/**
 * Find the macro furthest below target across under-fuelled days, and the meal
 * that most often holds the least of it.
 *
 * The macro is chosen by shortfall as a share of its own target, not by raw
 * grams: 20g short on fat is a much bigger deal than 20g short on carbs, and
 * comparing grams would surface carbohydrate every single time.
 *
 * Attribution deliberately looks only at the three main meals. Telling someone
 * their gap is "snack" is not an action, and a day with no snack logged is not
 * evidence of anything.
 */
export function computeFuellingGap(underDays: any[]): FuellingGap | null {
  if (underDays.length === 0) return null;

  let best: { macro: MacroKey; pct: number; grams: number } | null = null;

  for (const macro of MACROS) {
    let shortfallSum = 0, pctSum = 0, counted = 0;
    for (const log of underDays) {
      const target = (log.targets_json as any)?.[macro] ?? 0;
      if (!target) continue;
      const actual = (log.food_entries as any[])
        .reduce((s: number, e: any) => s + (e[macro] ?? 0), 0);
      const shortfall = Math.max(0, target - actual);
      shortfallSum += shortfall;
      pctSum       += shortfall / target;
      counted++;
    }
    if (counted === 0) continue;
    const pct = pctSum / counted;
    if (!best || pct > best.pct) {
      best = { macro, pct, grams: shortfallSum / counted };
    }
  }

  // Inside the margin on every macro: the calorie total was low but the shape
  // of the diet is fine, so there is no useful single thing to change.
  if (!best || best.pct < FUELLING_MARGIN) return null;

  // Which meal most often holds least of the offending macro.
  const tally: Record<string, number> = {};
  for (const log of underDays) {
    let lowest: { meal: MealSlot; amount: number } | null = null;
    for (const meal of MEALS) {
      const amount = (log.food_entries as any[])
        .filter((e: any) => e.meal_type === meal)
        .reduce((s: number, e: any) => s + (e[best!.macro] ?? 0), 0);
      if (!lowest || amount < lowest.amount) lowest = { meal, amount };
    }
    if (lowest) tally[lowest.meal] = (tally[lowest.meal] ?? 0) + 1;
  }
  const meal = (Object.entries(tally).sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'lunch') as MealSlot;

  return {
    macro:           best.macro,
    avgShortfallG:   Math.round(best.grams),
    shortfallPct:    Math.round(best.pct * 100),
    meal,
    daysUnderTarget: underDays.length,
  };
}

const MACRO_LABEL: Record<MacroKey, string> = {
  carbs_g:   'carbohydrate',
  protein_g: 'protein',
  fat_g:     'fat',
  fibre_g:   'fibre',
};

/** What to add, in food rather than in grams. */
const MACRO_FOODS: Record<MacroKey, string> = {
  carbs_g:   'a slice of toast, a banana, or a bigger portion of rice or potatoes',
  protein_g: 'Greek yoghurt, eggs, or a palm-sized portion of chicken, fish or tofu',
  fat_g:     'a handful of nuts, half an avocado, or a spoonful of nut butter',
  fibre_g:   'beans or lentils, a pear, or swapping to a wholegrain version',
};

/** Why it matters. The part that turns a number into a reason to act. */
const MACRO_WHY: Record<MacroKey, string> = {
  carbs_g:   'Carbohydrate is what hard sessions actually run on, so going short shows up as the back half feeling harder than it should.',
  protein_g: 'Protein is what turns the training you have already done into adaptation, so going short costs you recovery rather than effort.',
  fat_g:     'Fat underpins hormonal health, and sustained low intake is one of the clearest routes to cycle disruption in female athletes.',
  fibre_g:   'Fibre steadies digestion and appetite, so going short tends to surface as energy dips and late-evening cravings.',
};

const MEAL_LABEL: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch:     'Lunch',
  dinner:    'Dinner',
};

/**
 * Turn the alignment into something a person can act on this week.
 * Returns null when there is nothing worth saying.
 */
export function describeFuelling(a: FuellingAlignment | null): string | null {
  if (!a) return null;
  const total = a.daysOverTarget + a.daysUnderTarget + a.daysOnTarget;
  if (total === 0) return null;

  if (a.gap && a.daysUnderTarget >= 2) {
    const { macro, avgShortfallG, meal, daysUnderTarget } = a.gap;
    const dayWord = daysUnderTarget === 1 ? 'day' : 'days';
    return (
      `You fuelled below your training on ${daysUnderTarget} ${dayWord} this week, and ` +
      `${MACRO_LABEL[macro]} was the biggest gap at around ${avgShortfallG}g short a day. ` +
      `${MEAL_LABEL[meal]} is usually where it opens up, so try adding ${MACRO_FOODS[macro]} there. ` +
      `${MACRO_WHY[macro]}`
    );
  }

  if (a.daysUnderTarget >= 3) {
    return (
      `You fuelled below your training on ${a.daysUnderTarget} days this week, though no single ` +
      `macro stands out, so it is total volume rather than the shape of your diet. Slightly ` +
      `bigger portions across the day will do more than adding any one food.`
    );
  }

  if (a.daysOverTarget >= 3) {
    return (
      `You ate above your targets on ${a.daysOverTarget} days this week. Worth a look if it is ` +
      `not deliberate, though appetite runs ahead of training on some weeks and that is normal.`
    );
  }

  return 'Fuelling is well matched to your training this week. Anything within 10% of target counts as on track.';
}
