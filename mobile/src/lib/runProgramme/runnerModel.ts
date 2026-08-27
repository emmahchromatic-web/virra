import { supabase } from '@/lib/supabase';
import type { AbilityTier, VolumePreset } from './volumeCurve';
import type { Difficulty } from './weekComposer';

/**
 * Everything the generator needs to know about a runner, resolved once.
 *
 * Stored with the plan it produced, so a regeneration months later — after a
 * missed fortnight, say — starts from the same understanding rather than
 * silently re-deriving a different one.
 */

export interface RunnerModel {
  tier:                AbilityTier;
  thresholdSecs:       number;
  currentWeeklyKm:     number;
  currentLongestRunKm: number;
  preset:              VolumePreset;
  difficulty:          Difficulty;
}

/**
 * `fitness_level` carries five values; the curve knows four tiers.
 * `returning` is a state rather than a rung on the ladder, and the safe reading
 * of it is the cautious one — a comeback runner's old fitness is not their
 * current fitness.
 */
export function tierForFitnessLevel(level: string | null | undefined): AbilityTier {
  switch (level) {
    case 'advanced':     return 'advanced';
    case 'intermediate': return 'intermediate';
    case 'recreational': return 'recreational';
    case 'returning':    return 'recreational';
    case 'beginner':     return 'beginner';
    default:             return 'recreational';
  }
}

/** Sensible starting long run when the runner has no history to read. */
export function assumedLongestRun(weeklyKm: number): number {
  return Math.max(2, Math.round(weeklyKm * 0.3 * 10) / 10);
}

const DEFAULT_THRESHOLD_SECS = 360;
const DEFAULT_WEEKLY_KM      = 20;

export interface LoadRunnerModelOptions {
  preset?:     VolumePreset;
  difficulty?: Difficulty;
  /** Injected in tests; defaults to today. */
  today?:      Date;
}

/**
 * Read the runner out of the database.
 *
 * The longest run is measured rather than asked for wherever there is history:
 * 90 days of activities is a better answer than a number someone types, and it
 * costs one query. Weekly volume prefers the profile's own figure, which
 * onboarding now writes, and falls back to measuring the last 28 days.
 */
export async function loadRunnerModel(
  userId: string,
  opts:   LoadRunnerModelOptions = {},
): Promise<RunnerModel> {
  const today = opts.today ?? new Date();
  const since90 = new Date(today.getTime() - 90 * 86_400_000).toISOString();
  const since28 = new Date(today.getTime() - 28 * 86_400_000).toISOString();

  const [profileRes, actsRes] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('baseline_pace_seconds_per_km, weekly_mileage_km, fitness_level')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('activities')
      .select('distance_meters, started_at')
      .eq('user_id', userId)
      .eq('activity_type', 'run')
      .gte('started_at', since90),
  ]);

  const profile = profileRes.data ?? null;
  const acts    = (actsRes.data ?? []) as Array<{ distance_meters: number | null; started_at: string }>;

  const longestM = acts.reduce((max, a) => Math.max(max, a.distance_meters ?? 0), 0);
  const recentKm = acts
    .filter((a) => a.started_at >= since28)
    .reduce((sum, a) => sum + (a.distance_meters ?? 0), 0) / 1000;

  const currentWeeklyKm =
    profile?.weekly_mileage_km ??
    (recentKm > 0 ? Math.round((recentKm / 4) * 10) / 10 : DEFAULT_WEEKLY_KM);

  return {
    tier:                tierForFitnessLevel(profile?.fitness_level),
    thresholdSecs:       profile?.baseline_pace_seconds_per_km ?? DEFAULT_THRESHOLD_SECS,
    currentWeeklyKm,
    currentLongestRunKm: longestM > 0
      ? Math.round(longestM / 100) / 10
      : assumedLongestRun(currentWeeklyKm),
    preset:              opts.preset     ?? 'steady',
    difficulty:          opts.difficulty ?? 'balanced',
  };
}
