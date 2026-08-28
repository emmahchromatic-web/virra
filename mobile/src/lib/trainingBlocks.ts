import { supabase } from './supabase';
import { generateAndSaveSchedule, type SessionSlot, type GenerateContext, type ProgrammeContext } from './scheduleGenerator';
import { recomputeSeasonForUser } from './seasonEngine';
import { useCycleStore } from '@/store/cycle';
import { loadProgrammeSessions, loadProgrammeMeta, variantForPreference } from './getStrongSession';
import { loadRunnerModel } from './runProgramme/runnerModel';
import { generateRunPlan } from './runProgramme/generatePlan';
import { archetypeForTemplate, raceDistanceFor } from './runProgramme/archetypes';
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
 * Plan slots. A runner holds at most one plan in each: one run plan, one
 * strength plan, and one mobility/misc plan. Starting a plan in an occupied
 * slot replaces whatever is in it. Emma's rule, 26 Aug.
 *
 * swim, yoga and 'other' share the support slot deliberately — they are the
 * "and some mobility work" of a week, not three separate commitments.
 */
export type PlanSlot = 'run' | 'strength' | 'support';

/**
 * The date to stamp on a block you are closing.
 *
 * Yesterday, never today. getActiveBlocks keeps anything with
 * `ends_on >= today`, so a block closed with today's date stays in the stack
 * until tomorrow and the plan it was meant to replace goes on counting for the
 * rest of the day. endTrainingBlock got this right; addBlock did not, and
 * clearSlot inherited the mistake from addBlock. Caught by verifying the
 * backfill against prod — the duplicate block it was supposed to close was
 * still open afterwards. One helper so there is nowhere left to get it wrong.
 */
export function blockCloseDate(now: Date = new Date()): string {
  return new Date(now.getTime() - 86400000).toISOString().split('T')[0];
}

export function planSlot(modality: BlockModality): PlanSlot {
  if (modality === 'run')      return 'run';
  if (modality === 'strength') return 'strength';
  return 'support';
}

export const SLOT_LABEL: Record<PlanSlot, string> = {
  run:      'RUN',
  strength: 'STRENGTH',
  support:  'MOBILITY',
};

/**
 * What a slot costs against MAX_TOTAL_LOAD.
 *
 * Previously this was a primary/supplementary flag, which produced the wrong
 * answer twice over: a runner's first and only plan was written at 0.5 and the
 * Training tab told them it was at "50% load", while a genuinely supplementary
 * plan got 1.0 and counted for as much as the plan it supplemented.
 *
 * Under the one-per-slot rule the question is no longer "is this the main one"
 * — every plan owns its slot — but "what does this kind of training cost".
 * These numbers are chosen so the full allowed setup fits: 1.0 + 0.5 + 0.25 =
 * 1.75, just inside the 1.8 ceiling, so someone running the maximum permitted
 * three plans is at capacity but not over it, and the run block is not scaled
 * down for doing exactly what the rules allow.
 *
 * They are a starting point, not a finding. Worth Emma's eye.
 */
export const SLOT_LOAD: Record<PlanSlot, number> = {
  run:      1.0,
  strength: 0.5,
  support:  0.25,
};

/**
 * Close whatever currently occupies a slot, in BOTH tables.
 *
 * user_plans and training_blocks are two records of the same fact, and before
 * this they were maintained by two different pieces of code with two different
 * rules: starting a plan deactivated EVERY user_plans row (a replace) while
 * only closing a training_block when the new one was primary (an add). So the
 * plan screen could show one plan while the stack still counted two blocks.
 * One function, one rule, both tables.
 *
 * Returns the template ids that were displaced, so the caller can say what it
 * did rather than silently dropping someone's half-finished plan.
 */
export async function clearSlot(userId: string, slot: PlanSlot): Promise<string[]> {
  const today      = new Date().toISOString().split('T')[0];
  const closedOn   = blockCloseDate();
  const modalities = (['run', 'strength', 'swim', 'yoga', 'other'] as BlockModality[])
    .filter((m) => planSlot(m) === slot);

  const { data: open } = await supabase
    .from('training_blocks')
    .select('id, template_id')
    .eq('user_id', userId)
    .in('modality', modalities)
    .or(`ends_on.is.null,ends_on.gte.${today}`);

  const displaced = (open ?? []) as { id: string; template_id: string | null }[];
  if (displaced.length === 0) return [];

  await supabase
    .from('training_blocks')
    .update({ ends_on: closedOn })
    .in('id', displaced.map((b) => b.id));

  const templateIds = displaced.map((b) => b.template_id).filter(Boolean) as string[];
  if (templateIds.length > 0) {
    await supabase
      .from('user_plans')
      .update({ is_active: false })
      .eq('user_id', userId)
      .in('template_id', templateIds);
  }
  return templateIds;
}

// Inserts a block. Slot clearing is the caller's job via clearSlot() — kept
// separate so the two writes can be ordered and reported on.
export interface AddBlockOptions {
  templateId:   string | null;
  modality:     BlockModality;
  startsOn:     string;
  endsOn:       string | null;
  loadModifier: number;
  isPrimary:    boolean;
  slotAssignments?: SessionSlot[];
  maxWeeks?:        number;
}

export async function addBlock(
  userId: string,
  opts:   AddBlockOptions,
): Promise<string | null> {
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
      .select('sessions_json, programme_id, distance_goal, name')
      .eq('id', opts.templateId)
      .single();
    // Run plans are generated for this runner rather than read off the
    // template. The template still supplies the goal, the name and the
    // presentation; what it no longer supplies is the week-by-week volume.
    if (opts.modality === 'run') {
      const generated = await buildGeneratedRunPlan(userId, opts, tmpl as TemplateRow | null);
      if (generated) {
        await generateAndSaveSchedule(
          userId,
          blockId,
          opts.modality,
          opts.startsOn,
          generated.plan.weeks,
          undefined,
          generated.plan.weeks.length,
          undefined,
          generated.context,
          generated.plan.weekSlots,
        );
        await recomputeSeasonAfter(userId);
        return blockId;
      }
      // Falling through means we could not build a plan for this runner — a
      // template with no goal we understand, say. Better the old behaviour than
      // no plan at all.
    }

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

  await recomputeSeasonAfter(userId);
  return blockId;
}

/** Fire-and-forget: auto-create a season if 2+ future events now exist. */
async function recomputeSeasonAfter(userId: string): Promise<void> {
  const today = new Date().toLocaleDateString('en-CA');
  const cycleProfile = useCycleStore.getState().cycleProfile;
  recomputeSeasonForUser(userId, today, cycleProfile).catch((e) => {
    console.warn('[seasonEngine] recompute failed', e);
  });
}

interface TemplateRow {
  sessions_json?: unknown;
  programme_id?:  string | null;
  distance_goal?: string | null;
  name?:          string | null;
}

/**
 * Build a plan for this runner, or null if we cannot.
 *
 * Everything the generator needs beyond the runner themselves comes from the
 * enrolment screen: which days, how many weeks, and whether a race date was
 * given. The template contributes the goal and its name.
 */
async function buildGeneratedRunPlan(
  userId: string,
  opts:   AddBlockOptions,
  tmpl:   TemplateRow | null,
) {
  const days = (opts.slotAssignments ?? []).map((s) => s.day);
  if (days.length === 0) return null;

  const model = await loadRunnerModel(userId);
  const archetype = archetypeForTemplate({
    distanceGoal: tmpl?.distance_goal ?? null,
    name:         tmpl?.name ?? null,
    hasEventDate: Boolean(opts.endsOn),
  });

  const plan = generateRunPlan({
    archetype,
    goal:                raceDistanceFor(tmpl?.distance_goal ?? null),
    weeks:               opts.maxWeeks ?? archetype.defaultWeeks,
    tier:                model.tier,
    preset:              model.preset,
    difficulty:          model.difficulty,
    currentWeeklyKm:     model.currentWeeklyKm,
    currentLongestRunKm: model.currentLongestRunKm,
    days,
    // The last day the runner has chosen is the long-run day unless they said
    // otherwise; most people put their long run at the weekend.
    longRunDay:          Math.max(...days),
  });

  const context: GenerateContext = {
    baseline_pace_secs: model.thresholdSecs,
    runPlan: {
      goal:      raceDistanceFor(tmpl?.distance_goal ?? null),
      intensity: archetype.forceDifficulty ?? model.difficulty,
      phases:    plan.weeks.map((w) => w.label.toLowerCase() as never),
      longRunKm: plan.curve.map((w) => w.longRunKm),
    },
  };

  return { plan, context };
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
  const yesterday = blockCloseDate();

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
