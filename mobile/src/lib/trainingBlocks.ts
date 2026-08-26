import { supabase } from './supabase';
import { generateAndSaveSchedule, type SessionSlot, type GenerateContext, type ProgrammeContext } from './scheduleGenerator';
import { recomputeSeasonForUser } from './seasonEngine';
import { useCycleStore } from '@/store/cycle';
import { loadProgrammeSessions, loadProgrammeMeta, variantForPreference } from './getStrongSession';
import type { WorkoutPreference } from '@/store/profile';

// Cycle phase multipliers: follicular = peak adaptation window, menstrual/luteal = reduced capacity.
const PHASE_MULTIPLIER: Record<string, number> = {
  menstrual:  0.85,
  follicular: 1.10,
  ovulatory:  1.05,
  luteal:     0.90,
};

const MAX_TOTAL_LOAD = 1.8; // ceiling for combined block load (relative to one full plan)
const MIN_RUN_LOAD   = 0.5; // run block never drops below 50%; plan remains meaningful

export type BlockModality = 'run' | 'strength' | 'swim' | 'yoga' | 'other';

export interface TrainingBlock {
  id:            string;
  user_id:       string;
  template_id:   string | null;
  starts_on:     string;
  ends_on:       string | null;
  load_modifier: number;
  modality:      BlockModality;
  is_primary:    boolean;
  event_id:      string | null;
  template?:     { name: string; duration_weeks: number; distance_goal: string | null; sport_type: string } | null;
}

export interface ComputedBlock extends TrainingBlock {
  effective_load: number;
}

// Pure function: run blocks scale down when supplement load fills the cycle-phase capacity.
// Supplement blocks (non-run) are never scaled; they represent fixed commitments.
export function computeBlockLoad(
  blocks: Array<{ modality: string; load_modifier: number }>,
  cyclePhase: string,
): Array<{ modality: string; load_modifier: number; effective_load: number }> {
  if (blocks.length === 0) return [];

  const capacity  = MAX_TOTAL_LOAD * (PHASE_MULTIPLIER[cyclePhase] ?? 1.0);
  const suppLoad  = blocks.filter((b) => b.modality !== 'run').reduce((s, b) => s + b.load_modifier, 0);
  const runBudget = Math.max(0, capacity - suppLoad);
  const rawRun    = blocks.filter((b) => b.modality === 'run').reduce((s, b) => s + b.load_modifier, 0);
  const runScale  = rawRun > 0 ? Math.min(1.0, runBudget / rawRun) : 1.0;

  return blocks.map((b) => ({
    ...b,
    effective_load: b.modality === 'run'
      ? Math.max(MIN_RUN_LOAD, Math.round(b.load_modifier * runScale * 100) / 100)
      : b.load_modifier,
  }));
}

export function inferModality(sportType: string): BlockModality {
  const s = sportType.toLowerCase();
  if (s === 'run' || s === 'running') return 'run';
  if (s.includes('strength') || s === 'gym') return 'strength';
  if (s === 'swim' || s === 'swimming') return 'swim';
  if (s === 'yoga') return 'yoga';
  return 'other';
}

export async function getActiveBlocks(userId: string): Promise<TrainingBlock[]> {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase
    .from('training_blocks')
    .select('id, user_id, template_id, starts_on, ends_on, load_modifier, modality, is_primary, event_id, template:plan_templates(name, duration_weeks, distance_goal, sport_type)')
    .eq('user_id', userId)
    .lte('starts_on', today)
    .or(`ends_on.is.null,ends_on.gte.${today}`)
    .order('is_primary', { ascending: false });
  return (data ?? []) as unknown as TrainingBlock[];
}

/**
 * How a newly started plan enters the stack.
 *
 * Two cases, and the only thing that separates them is whether the runner
 * already has a primary block of this modality:
 *
 *   no  — this is their main plan for that modality. Primary, full load.
 *   yes — they are adding a second plan alongside one they already run.
 *         Not primary, half load, and the existing primary stays open.
 *
 * The load half of this was inverted between a4b582a and now: 0.5 came from
 * the old "ADD SUPPLEMENTARY BLOCK" button, and when that button was folded
 * into this CTA the ternary kept the supplementary value on the wrong branch.
 * The effect was that a runner's FIRST and only plan was written at
 * load_modifier 0.5 and the Training tab told them it was running at "50%
 * load", while a genuinely supplementary second plan got 1.0. Verified
 * against prod: a brand-new account's sole primary strength block was stored
 * at 0.5.
 */
export function blockEntry(hasSameModalityPrimary: boolean): { isPrimary: boolean; loadModifier: number } {
  return hasSameModalityPrimary
    ? { isPrimary: false, loadModifier: 0.5 }
    : { isPrimary: true,  loadModifier: 1.0 };
}

// Adding a primary block closes all existing primary blocks (ends_on = today).
// Supplementary blocks (is_primary=false) are additive; any number can coexist.
export async function addBlock(
  userId: string,
  opts: {
    templateId:   string | null;
    modality:     BlockModality;
    startsOn:     string;
    endsOn:       string | null;
    loadModifier: number;
    isPrimary:    boolean;
    slotAssignments?: SessionSlot[];
    maxWeeks?:        number;
  },
): Promise<string | null> {
  if (opts.isPrimary) {
    const today = new Date().toISOString().split('T')[0];
    await supabase
      .from('training_blocks')
      .update({ ends_on: today })
      .eq('user_id', userId)
      .eq('is_primary', true)
      .is('ends_on', null);
  }

  const { data, error } = await supabase
    .from('training_blocks')
    .insert({
      user_id:       userId,
      template_id:   opts.templateId,
      modality:      opts.modality,
      starts_on:     opts.startsOn,
      ends_on:       opts.endsOn,
      load_modifier: opts.loadModifier,
      is_primary:    opts.isPrimary,
    })
    .select('id')
    .single();

  if (error) return null;
  const blockId = (data as { id: string }).id;

  if (opts.templateId) {
    const { data: tmpl } = await supabase
      .from('plan_templates')
      .select('sessions_json, programme_id')
      .eq('id', opts.templateId)
      .single();
    if (tmpl?.sessions_json) {
      // Fetch baseline pace (run structures) + equipment preference (programmes).
      const { data: profileRow } = await supabase
        .from('user_profiles')
        .select('baseline_pace_seconds_per_km, workout_preference')
        .eq('id', userId)
        .maybeSingle();
      const baselinePaceSecs = profileRow?.baseline_pace_seconds_per_km ?? 360;

      // Get Strong programmes bridge through plan_templates.programme_id: pre-fetch
      // the authored sessions once so generateSchedule stays synchronous.
      let programme: ProgrammeContext | undefined;
      const programmeId = (tmpl as { programme_id?: string | null }).programme_id ?? null;
      if (programmeId) {
        const pref    = (profileRow?.workout_preference as WorkoutPreference | undefined) ?? 'gym_full';
        const variant = variantForPreference(pref);
        const [sessions, meta] = await Promise.all([
          loadProgrammeSessions(programmeId, variant),
          loadProgrammeMeta(programmeId),
        ]);
        // Cycle trackers (flow / pack) skip the fixed deload; the read-time cycle
        // layer eases them. Steady users (no phase tracking) get the week 4/8/12 deload.
        const tracksCycle = useCycleStore.getState().cycleMode !== 'steady';
        programme = {
          programmeId,
          variant,
          sessions,
          focusToDayIndex: meta.focusToDayIndex,
          applyDeload:     !tracksCycle,
          deloadNote:      meta.deloadNote,
        };
      }

      await generateAndSaveSchedule(
        userId,
        blockId,
        opts.modality,
        opts.startsOn,
        tmpl.sessions_json as any,
        opts.slotAssignments,
        opts.maxWeeks,
        undefined, // phaseSegments not used by this caller
        { baseline_pace_secs: baselinePaceSecs, programme } satisfies GenerateContext,
      );
    }
  }

  // Fire-and-forget: auto-create season if 2+ future events now exist
  const today = new Date().toLocaleDateString('en-CA');
  const cycleProfile = useCycleStore.getState().cycleProfile;
  recomputeSeasonForUser(userId, today, cycleProfile).catch((e) => {
    console.warn('[seasonEngine] recompute failed', e);
  });

  return blockId;
}

export async function removeBlock(blockId: string): Promise<void> {
  await supabase.from('training_blocks').delete().eq('id', blockId);
}

/**
 * Soft-drop a training block:
 *   1. Sets ends_on to yesterday so getActiveBlocks (filter:
 *      ends_on.is.null OR ends_on.gte.today) excludes it immediately.
 *   2. Drops every future planned session belonging to this block
 *      status='planned' rows with scheduled_date >= today flip to 'dropped'.
 *      Completed and past sessions are left untouched (history preserved).
 */
export async function endTrainingBlock(blockId: string): Promise<void> {
  const today     = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { error: sessErr } = await supabase
    .from('planned_sessions')
    .update({ status: 'dropped' })
    .eq('block_id', blockId)
    .eq('status', 'planned')
    .gte('scheduled_date', today);
  if (sessErr) throw new Error(`endTrainingBlock session-drop failed: ${sessErr.message}`);

  const { error } = await supabase
    .from('training_blocks')
    .update({ ends_on: yesterday })
    .eq('id', blockId);
  if (error) throw new Error(`endTrainingBlock failed: ${error.message}`);
}

export { closeBlock } from './scheduleGenerator';
