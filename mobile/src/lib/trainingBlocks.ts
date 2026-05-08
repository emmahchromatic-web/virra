import { supabase } from './supabase';

// Cycle phase multipliers: follicular = peak adaptation window, menstrual/luteal = reduced capacity.
const PHASE_MULTIPLIER: Record<string, number> = {
  menstrual:  0.85,
  follicular: 1.10,
  ovulatory:  1.05,
  luteal:     0.90,
};

const MAX_TOTAL_LOAD = 1.8; // ceiling for combined block load (relative to one full plan)
const MIN_RUN_LOAD   = 0.5; // run block never drops below 50% — plan remains meaningful

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

// Pure function — run blocks scale down when supplement load fills the cycle-phase capacity.
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

// Adding a primary block closes all existing primary blocks (ends_on = today).
// Supplementary blocks (is_primary=false) are additive — any number can coexist.
export async function addBlock(
  userId: string,
  opts: {
    templateId:   string;
    modality:     BlockModality;
    startsOn:     string;
    endsOn:       string | null;
    loadModifier: number;
    isPrimary:    boolean;
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
  return (data as { id: string }).id;
}

export async function removeBlock(blockId: string): Promise<void> {
  await supabase.from('training_blocks').delete().eq('id', blockId);
}
