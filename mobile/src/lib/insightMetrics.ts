import { supabase } from './supabase';

export interface PhasePace {
  phase:           string;
  avgPaceSecPerKm: number;
  activityCount:   number;
}

export interface InsightMetrics {
  streakDays:         number;
  weeklyKm:           number;
  monthlyKm:          number;
  totalKm:            number;
  consistencyPct:     number;
  phasePaces:         PhasePace[];
  activitiesThisWeek: number;
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

  const [weekRes, monthRes, totalRes, window28Res, paceRes] = await Promise.all([
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
      .limit(5000), // MVP cap — replace with aggregate when history grows

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
  ]);

  if (weekRes.error)    throw weekRes.error;
  if (monthRes.error)   throw monthRes.error;
  if (totalRes.error)   throw totalRes.error;
  if (window28Res.error) throw window28Res.error;
  if (paceRes.error)    throw paceRes.error;

  const sumKm = (rows: any[]) =>
    rows.reduce((acc, r) => acc + (r.distance_meters ?? 0), 0) / 1000;

  const weeklyKm  = sumKm(weekRes.data ?? []);
  const monthlyKm = sumKm(monthRes.data ?? []);
  const totalKm   = sumKm(totalRes.data ?? []);

  // Streak is capped at 28 days — the window of this query. Sufficient for motivation display.
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
    weeklyKm:           Math.round(weeklyKm * 10) / 10,
    monthlyKm:          Math.round(monthlyKm * 10) / 10,
    totalKm:            Math.round(totalKm * 10) / 10,
    consistencyPct,
    phasePaces,
    activitiesThisWeek: weekRes.data?.length ?? 0,
  };
}

export function formatPaceMmSs(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.floor(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}
