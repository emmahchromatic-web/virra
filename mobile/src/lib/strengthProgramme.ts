import type { AuthoredSectionGroup } from './getStrongSession';
import { normalizeStrengthSessionType } from './strengthTypes';
import type {
  StrengthWorkoutStructureV2, StrengthV2Section, StrengthV2Exercise,
} from './workoutStructure';

/**
 * Pure builders for authored Get Strong sessions. Everything here is
 * side-effect free (no Supabase) so it can be unit tested: the read-path in
 * getStrongSession.ts fetches the authored sections, these functions turn them
 * into the persisted v2 StrengthWorkoutStructure and apply the deload
 * modulation for users who do not track a menstrual cycle.
 */

const SECONDS_PER_SET  = 45;   // working time for one strength set (mirrors v1)
const SECONDS_PER_MOVE = 30;   // mobility / activation move with no set count

/** Parse an authored rest string ("90s", "2 min", "60-90s") into seconds. */
export function parseRestSeconds(rest: string | null): number {
  if (!rest) return 0;
  const min = rest.match(/(\d+)\s*(?:min|m\b)/i);
  if (min) return parseInt(min[1], 10) * 60;
  const sec = rest.match(/(\d+)/);
  return sec ? parseInt(sec[1], 10) : 0;
}

/** Rough minutes for a session; set volume plus rest, rounded like v1. */
export function estimateProgrammeMinutes(sections: StrengthV2Section[]): number {
  const total = sections.reduce((acc, sec) => {
    return acc + sec.exercises.reduce((exAcc, ex) => {
      const sets = ex.sets ?? 1;
      const work = ex.sets ? SECONDS_PER_SET : SECONDS_PER_MOVE;
      return exAcc + sets * (work + parseRestSeconds(ex.rest));
    }, 0);
  }, 0);
  return Math.round(total / 60);
}

function toV2Exercise(ex: AuthoredSectionGroup['exercises'][number]): StrengthV2Exercise {
  return {
    name:        ex.name,
    description: ex.description,
    sets:        ex.sets,
    reps:        ex.reps,
    tempo:       ex.tempo,
    rest:        ex.rest,
  };
}

/**
 * Build a v2 structure from the authored sections of one programme day.
 * `focus` (the day's session label) picks a v1-compatible session_type so the
 * relational logging (strength_details / strength_set_logs) keeps its
 * lower/upper/general classification.
 */
export function buildProgrammeStructure(
  authored: AuthoredSectionGroup[],
  meta: { programmeId: string; dayIndex: number; variant: string; block: 1 | 2 | 3; focus: string },
): StrengthWorkoutStructureV2 {
  const sections: StrengthV2Section[] = authored.map((g) => ({
    section:   g.section,
    label:     g.label,
    exercises: g.exercises.map(toV2Exercise),
  }));

  return {
    version:           2,
    session_type:      normalizeStrengthSessionType(meta.focus),
    sections,
    estimated_minutes: estimateProgrammeMinutes(sections),
    programme:         { id: meta.programmeId, day_index: meta.dayIndex, variant: meta.variant, block: meta.block },
  };
}

/**
 * Deload modulation for users who do NOT track a cycle (weeks 4, 8, 12).
 * Pure: returns a new structure, never mutates the input:
 *   - strength + power lifts drop to at most 2 sets (~60% load is coaching, not
 *     a structural change, and is carried in the surfaced deload_note),
 *   - the Power & Core section is halved (plyo / power volume cut),
 *   - mobility, activation and accessory work are kept as authored.
 * The deload_note is attached so the UI can explain the lighter week.
 */
export function applyDeloadModulation(
  structure: StrengthWorkoutStructureV2,
  deloadNote: string | null,
): StrengthWorkoutStructureV2 {
  const sections: StrengthV2Section[] = structure.sections.map((sec) => {
    if (sec.section === 'power_core') {
      // Halve the power volume; keep the first half of the movements.
      const kept = sec.exercises.slice(0, Math.max(1, Math.ceil(sec.exercises.length / 2)));
      return {
        ...sec,
        exercises: kept.map((ex) => ({
          ...ex,
          sets: ex.sets != null ? Math.min(ex.sets, 2) : ex.sets,
        })),
      };
    }
    if (sec.section === 'strength') {
      return {
        ...sec,
        exercises: sec.exercises.map((ex) => ({
          ...ex,
          sets: ex.sets != null ? Math.min(ex.sets, 2) : ex.sets,
        })),
      };
    }
    // mobility / activation / accessory kept as authored
    return { ...sec, exercises: sec.exercises.map((ex) => ({ ...ex })) };
  });

  return {
    ...structure,
    sections,
    estimated_minutes: estimateProgrammeMinutes(sections),
    deload_note:       deloadNote,
  };
}
