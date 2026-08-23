import { generateRunStructure } from './runWorkoutGenerator';
import { generateStrengthStructure } from './strengthWorkoutGenerator';
import type { RunWorkoutStructure, AnyStrengthStructure } from './workoutStructure';
import { normalizeStrengthSessionType } from './strengthTypes';
import { getAuthoredSession, blockForWeek, variantForPreference } from './getStrongSession';
import { buildProgrammeStructure } from './strengthProgramme';
import type { WorkoutPreference } from '@/store/profile';

export interface HydrateContext {
  baseline_pace_secs: number;
  weekly_km: number;
}

export interface HydrateInput {
  id: string;
  modality: string;
  session_label: string;
  run_structure: RunWorkoutStructure | null;
  strength_structure: AnyStrengthStructure | null;
}

export interface HydrateOutput extends HydrateInput {
  __hydrated?: boolean;
}

/**
 * Generate workout structure for rows that are missing it. Pure function
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
 * Recover an authored v2 structure for a programme session that was saved
 * without one (a rare backfill; enrol-time normally populates it). We only
 * have block_id + session_label + week_number, so join
 * block → training_blocks.template_id → plan_templates.programme_id, then read
 * the authored session for that focus + equipment variant + 12-week block.
 * Returns null for non-programme sessions (caller falls back to v1).
 */
export async function recoverProgrammeStructure(
  row: { session_label: string; week_number: number; block_id: string | null },
  userId: string,
  supabaseClient: { from: (table: string) => any },
): Promise<AnyStrengthStructure | null> {
  if (!row.block_id) return null;

  const { data: blockRow } = await supabaseClient
    .from('training_blocks')
    .select('template_id')
    .eq('id', row.block_id)
    .maybeSingle();
  if (!blockRow?.template_id) return null;

  const { data: tmpl } = await supabaseClient
    .from('plan_templates')
    .select('programme_id')
    .eq('id', blockRow.template_id)
    .maybeSingle();
  const programmeId: string | null = tmpl?.programme_id ?? null;
  if (!programmeId) return null;

  // focus → day_index (1:1 within a programme)
  const { data: days } = await supabaseClient
    .from('programme_days')
    .select('day_index, focus')
    .eq('programme_id', programmeId);
  const dayIndex = (days ?? []).find((d: any) => d.focus === row.session_label)?.day_index;
  if (dayIndex == null) return null;

  const { data: profileRow } = await supabaseClient
    .from('user_profiles')
    .select('workout_preference')
    .eq('id', userId)
    .maybeSingle();
  const variant = variantForPreference((profileRow?.workout_preference as WorkoutPreference | undefined) ?? 'gym_full');
  const block   = blockForWeek(row.week_number);

  const authored = await getAuthoredSession(programmeId, dayIndex, variant, block);
  if (!authored) return null;

  return buildProgrammeStructure(authored.sections, {
    programmeId,
    dayIndex,
    variant,
    block,
    focus: row.session_label,
  });
}

/**
 * Persist hydrated rows back to Supabase. Fire-and-forget; callers should
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
