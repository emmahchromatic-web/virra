import { supabase } from '@/lib/supabase';
import type { StrengthWorkoutStructureV2, StrengthV2Exercise } from '@/lib/workoutStructure';
import type { CyclePhase } from '@/lib/cycleEngine';

/**
 * Pilates-style range-of-movement sessions, card 264.
 *
 * The useful thing here is what it does NOT add. A mobility session is turned
 * into the same persisted v2 structure an authored strength session produces,
 * with every move in a single `mobility` section. Everything downstream then
 * works with no change at all: the workout screen renders it, the rest timer
 * already stays silent for mobility moves, the finish path already tolerates a
 * missing planned session, and an interrupted session already resumes from its
 * draft.
 *
 * So "do a one-off" is a loading problem, not a workout problem.
 */

export type MobilityIntensity = 'gentle' | 'moderate' | 'strong';

export interface MobilitySessionSummary {
  id:        string;
  name:      string;
  focus:     string | null;
  minutes:   number;
  intensity: MobilityIntensity;
  phases:    CyclePhase[];
}

interface MoveRow {
  name:        string;
  description: string | null;
  reps:        string | null;
  sets:        number | null;
  cue:         string | null;
}

/** Every active session, longest-standing order first within each length. */
export async function listMobilitySessions(): Promise<MobilitySessionSummary[]> {
  const { data, error } = await supabase
    .from('mobility_sessions')
    .select('id, name, focus, minutes, intensity, phases')
    .eq('is_active', true)
    .order('minutes')
    .order('position');

  if (error) {
    console.warn('[mobilitySessions] list failed:', error.message);
    return [];
  }
  return (data ?? []) as MobilitySessionSummary[];
}

/**
 * Sessions that suit a phase, most specific first.
 *
 * A session tagged with one phase is a better answer for that phase than one
 * tagged with all four, so the narrower tagging sorts ahead. Phase is a
 * preference rather than a filter: if nothing matches we return everything
 * rather than an empty tab, because a woman looking for ten minutes of hip work
 * should not be told there is none because of where she is in her cycle.
 */
export function rankForPhase(
  sessions: MobilitySessionSummary[],
  phase:    CyclePhase | null,
): MobilitySessionSummary[] {
  if (!phase) return sessions;
  const matching = sessions.filter((s) => s.phases.includes(phase));
  if (matching.length === 0) return sessions;
  return [...matching].sort((a, b) => a.phases.length - b.phases.length);
}

/**
 * One session, as the structure the workout screen already knows how to run.
 *
 * `sets` is left null for anything the author did not make repeat, which is
 * almost everything: that is what makes the app's own estimate 30 seconds a
 * move, and what keeps the stated minutes and the timer agreeing.
 */
export async function loadMobilityStructure(
  sessionId: string,
): Promise<{ name: string; structure: StrengthWorkoutStructureV2 } | null> {
  const [sessionRes, movesRes] = await Promise.all([
    supabase
      .from('mobility_sessions')
      .select('id, name, minutes')
      .eq('id', sessionId)
      .maybeSingle(),
    supabase
      .from('mobility_session_moves')
      .select('name, description, reps, sets, cue')
      .eq('session_id', sessionId)
      .order('position'),
  ]);

  const session = sessionRes.data as { id: string; name: string; minutes: number } | null;
  if (sessionRes.error || !session) return null;
  if (movesRes.error) return null;

  const moves = (movesRes.data ?? []) as MoveRow[];
  // A session with no moves is a content mistake, not something to render: the
  // screen would open on an empty workout with a finish button.
  if (moves.length === 0) return null;

  const exercises: StrengthV2Exercise[] = moves.map((m) => ({
    name:        m.name,
    // The cue is the part a reader acts on, so it goes last and on its own.
    description: [m.description, m.cue].filter(Boolean).join(' ') || null,
    sets:        m.sets ?? null,
    reps:        m.reps ?? null,
    // Mobility carries neither, and the app already treats both as absent.
    tempo:       null,
    rest:        null,
  }));

  return {
    name: session.name,
    structure: {
      version:           2,
      session_type:      'general',
      sections:          [{ section: 'mobility', label: 'Mobility', exercises }],
      estimated_minutes: session.minutes,
    },
  };
}
