import { generateRunStructure } from './runWorkoutGenerator';
import { generateStrengthStructure } from './strengthWorkoutGenerator';
import type { RunWorkoutStructure, StrengthWorkoutStructure } from './workoutStructure';
import { normalizeStrengthSessionType } from './strengthTypes';

export interface HydrateContext {
  baseline_pace_secs: number;
  weekly_km: number;
}

export interface HydrateInput {
  id: string;
  modality: string;
  session_label: string;
  run_structure: RunWorkoutStructure | null;
  strength_structure: StrengthWorkoutStructure | null;
}

export interface HydrateOutput extends HydrateInput {
  __hydrated?: boolean;
}

/**
 * Generate workout structure for rows that are missing it. Pure function —
 * returns new rows with `__hydrated: true` on those that were filled in.
 * Rows that already have structure are passed through unchanged.
 *
 * Legacy distance estimation is intentionally simple: divides the weekly
 * total by 3 (typical run-session count per week) and floors at 3km. The
 * primary case (new rows) goes through `scheduleGenerator` and never hits
 * this code path.
 */
export function hydratePlannedSessionStructures(
  rows: HydrateInput[],
  context: HydrateContext,
): HydrateOutput[] {
  return rows.map((row) => {
    if (row.modality === 'run' && !row.run_structure) {
      const distance_km = Math.max(3, Math.round(context.weekly_km / 3));
      const run_structure = generateRunStructure({
        session_label: row.session_label,
        baseline_pace_secs: context.baseline_pace_secs,
        distance_km,
      });
      return { ...row, run_structure, __hydrated: true };
    }
    if (row.modality === 'strength' && !row.strength_structure) {
      const strength_structure = generateStrengthStructure({
        session_type: normalizeStrengthSessionType(row.session_label),
        phase: null,
        recent_primary_muscles: [],
      });
      return { ...row, strength_structure, __hydrated: true };
    }
    return row;
  });
}

/**
 * Persist hydrated rows back to Supabase. Fire-and-forget — callers should
 * not block UI rendering on this. Failures are logged, not thrown.
 */
export async function persistHydratedRows(
  rows: HydrateOutput[],
  supabaseClient: { from: (table: string) => any },
): Promise<void> {
  const hydrated = rows.filter((r) => r.__hydrated);
  if (!hydrated.length) return;
  for (const row of hydrated) {
    const patch: Record<string, unknown> = {};
    if (row.run_structure) patch.run_structure = row.run_structure;
    if (row.strength_structure) patch.strength_structure = row.strength_structure;
    const { error } = await supabaseClient
      .from('planned_sessions')
      .update(patch)
      .eq('id', row.id);
    if (error) console.warn('[hydratePlannedSessions] persist failed', row.id, error.message);
  }
}
