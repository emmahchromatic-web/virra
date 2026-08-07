import { EXERCISE_LIBRARY } from './exerciseLibrary';
import type { SessionType } from './strengthTypes';
import type {
  StrengthWorkoutStructure, PlannedExercise, StrengthSetTarget,
} from './workoutStructure';
import type { CyclePhase } from './cycleEngine';

export interface GenerateStrengthInput {
  session_type:           SessionType;
  phase:                  CyclePhase | null;
  recent_primary_muscles: string[];
}

const SESSION_SIZE = 5;
const SECONDS_PER_SET = 45;

function makeIdFactory(): () => string {
  let i = 0;
  return () => `e${++i}`;
}

function setsForPhase(phase: CyclePhase | null): { sets: StrengthSetTarget[]; rest_seconds: number } {
  switch (phase) {
    case 'follicular':
    case 'ovulatory':
      return {
        sets: [
          { reps: 5, rpe: 7 },
          { reps: 5, rpe: 8 },
          { reps: 5, rpe: 8 },
          { reps: 5, rpe: 9 },
        ],
        rest_seconds: 120,
      };
    case 'luteal':
    case 'menstrual':
      return {
        sets: [
          { reps: 10, rpe: 6 },
          { reps: 10, rpe: 7 },
          { reps: 8,  rpe: 8 },
        ],
        rest_seconds: 90,
      };
    default:
      return {
        sets: [
          { reps: 8, rpe: 7 },
          { reps: 8, rpe: 7 },
          { reps: 8, rpe: 8 },
        ],
        rest_seconds: 90,
      };
  }
}

export function generateStrengthStructure(input: GenerateStrengthInput): StrengthWorkoutStructure {
  const id = makeIdFactory();
  // Defensive: an unmapped session_type must never throw — a thrown error here
  // propagates through session hydration and can break the whole today's-sessions
  // fetch. Callers should pass a normalised type (normalizeStrengthSessionType);
  // 'general' is the safe fallback if one slips through.
  const session_type = EXERCISE_LIBRARY[input.session_type] ? input.session_type : 'general';
  const pool = EXERCISE_LIBRARY[session_type];

  // Score each exercise by overlap with recently-worked muscles — lower is better.
  const scored = pool.map((ex, i) => {
    const overlap = ex.primaryMuscles.filter((m) => input.recent_primary_muscles.includes(m)).length;
    return { ex, score: overlap, idx: i };
  });
  scored.sort((a, b) => a.score - b.score || a.idx - b.idx);

  const chosen = scored.slice(0, SESSION_SIZE).map((s) => s.ex);
  const setsConfig = setsForPhase(input.phase);

  const exercises: PlannedExercise[] = chosen.map((ex) => ({
    id: id(),
    name: ex.name,
    primary_muscles: ex.primaryMuscles,
    target_sets: setsConfig.sets.map((s) => ({ ...s })),
    rest_seconds: setsConfig.rest_seconds,
  }));

  const estMinutes = Math.round(
    exercises.reduce((acc, ex) => {
      const setTime = ex.target_sets.length * (SECONDS_PER_SET + ex.rest_seconds);
      return acc + setTime;
    }, 0) / 60,
  );

  return {
    version: 1,
    session_type,
    exercises,
    estimated_minutes: estMinutes,
  };
}
