import { supabase } from '@/lib/supabase';
import type { WorkoutPreference } from '@/store/profile';

/**
 * Reads an authored Get Strong session from the content tables seeded in
 * migration 20260819000000 (programmes → programme_days → programme_exercises).
 *
 * This is the read-path that replaces the runtime exercise GENERATION in
 * `strengthWorkoutGenerator.ts`: instead of picking from a hardcoded pool, a
 * strength session is now the exact set of exercises Emma authored for a given
 * programme, day, equipment variant, and 12-week block.
 *
 * The cycle-aware layer (light load/RPE nudging, and cycle-driven deload timing
 * for users who track a cycle) is applied on TOP of this by the caller — this
 * module just returns the authored prescription verbatim.
 */

export type ProgrammeVariant = 'gym' | 'dumbbells' | 'bodyweight';
export type ProgrammeSection = 'mobility' | 'activation' | 'strength' | 'power_core' | 'accessory';

/** Fixed display order of the sections within a session. */
export const SECTION_ORDER: ProgrammeSection[] = [
  'mobility', 'activation', 'strength', 'power_core', 'accessory',
];

export const SECTION_LABEL: Record<ProgrammeSection, string> = {
  mobility:   'Mobility',
  activation: 'Activation',
  strength:   'Strength',
  power_core: 'Power & Core',
  accessory:  'Accessory',
};

export interface AuthoredExercise {
  name:        string;
  description: string | null;
  sets:        number | null;
  reps:        string | null;
  /** 4-part tempo, e.g. "3-1-1-0"; null for mobility / power / core moves. */
  tempo:       string | null;
  rest:        string | null;
}

export interface AuthoredSectionGroup {
  section:   ProgrammeSection;
  label:     string;
  exercises: AuthoredExercise[];
}

export interface AuthoredSession {
  programmeId: string;
  dayIndex:    number;
  variant:     ProgrammeVariant;
  block:       1 | 2 | 3;
  sections:    AuthoredSectionGroup[];
}

/** Map the user's stored equipment preference to a programme variant. */
export function variantForPreference(pref: WorkoutPreference): ProgrammeVariant {
  switch (pref) {
    case 'home_dumbbells':  return 'dumbbells';
    case 'home_bodyweight': return 'bodyweight';
    case 'gym_full':
    default:                return 'gym';
  }
}

/**
 * Which 12-week block a training week falls in: weeks 1–4 → 1, 5–8 → 2, 9–12 → 3.
 * Weeks past 12 hold at block 3 (the programme is a 12-week cycle; repeating it
 * keeps the peak block until a new plan is chosen).
 */
export function blockForWeek(weekNumber: number): 1 | 2 | 3 {
  const b = Math.ceil(Math.max(1, weekNumber) / 4);
  return Math.min(3, Math.max(1, b)) as 1 | 2 | 3;
}

/** Deterministic programme_days id, mirroring the seed generator. */
function dayId(programmeId: string, dayIndex: number): string {
  return `${programmeId}-d${dayIndex}`;
}

type Row = {
  section:  ProgrammeSection;
  position: number;
  sets:     number | null;
  reps:     string | null;
  tempo:    string | null;
  rest:     string | null;
  // supabase returns the joined row as an object (or array, depending on the
  // relationship inference); normalise both.
  exercises: { name: string; description: string | null }
           | { name: string; description: string | null }[]
           | null;
};

/**
 * Load the authored session for a programme day + equipment + block, grouped
 * into ordered sections. Returns null if nothing is seeded for that
 * combination (the caller should fall back rather than show an empty session).
 */
export async function getAuthoredSession(
  programmeId: string,
  dayIndex:    number,
  variant:     ProgrammeVariant,
  block:       1 | 2 | 3,
): Promise<AuthoredSession | null> {
  const { data, error } = await supabase
    .from('programme_exercises')
    .select('section, position, sets, reps, tempo, rest, exercises(name, description)')
    .eq('programme_day_id', dayId(programmeId, dayIndex))
    .eq('variant', variant)
    .eq('block', block)
    .order('position');

  if (error) {
    console.warn('[getStrongSession] load failed:', error.message);
    return null;
  }
  if (!data || data.length === 0) return null;

  const buckets = new Map<ProgrammeSection, AuthoredExercise[]>();
  for (const raw of data as Row[]) {
    const ex = Array.isArray(raw.exercises) ? raw.exercises[0] : raw.exercises;
    if (!ex) continue;
    const list = buckets.get(raw.section) ?? [];
    list.push({
      name:        ex.name,
      description: ex.description,
      sets:        raw.sets,
      reps:        raw.reps,
      tempo:       raw.tempo,
      rest:        raw.rest,
    });
    buckets.set(raw.section, list);
  }

  const sections: AuthoredSectionGroup[] = SECTION_ORDER
    .filter((s) => buckets.has(s))
    .map((s) => ({ section: s, label: SECTION_LABEL[s], exercises: buckets.get(s)! }));

  if (sections.length === 0) return null;

  return { programmeId, dayIndex, variant, block, sections };
}
