import type { CycleProfile } from '@/store/cycle';
import { supabase } from './supabase';
import { generateAndSaveSchedule, type WeekSession } from './scheduleGenerator';

export type BlockPhase = 'recovery' | 'base' | 'build' | 'peak' | 'taper' | 'race';
export type Priority   = 1 | 2 | 3;

export interface SeasonEvent {
  id:            string;
  event_date:    string;          // ISO date (YYYY-MM-DD)
  modality:      string;
  distance_goal: string | null;   // '5k' | '10k' | 'half_marathon' | 'marathon' | 'ultra'
}

export interface PhaseSegment {
  phase:     BlockPhase;
  starts_on: string;
  ends_on:   string;
  weeks:     number;
}

export interface ChainBlock {
  event_id:        string;
  modality:        string;
  starts_on:       string;
  ends_on:         string;
  priority:        Priority;
  phase_segments:  PhaseSegment[];
}

// Reserved for Task 5: per-phase modulation will hook in here
export interface SeasonChainInput {
  events:        SeasonEvent[];
  cycle_profile: CycleProfile;
  today:         string;
}

const STANDARD_PREP_WEEKS: Record<string, number> = {
  '5k':            8,
  '10k':           10,
  'half_marathon': 12,
  'marathon':      16,
  'ultra':         20,
};

const RECOVERY_WEEKS: Record<string, number> = {
  '5k':            1,
  '10k':           1,
  'half_marathon': 2,
  'marathon':      3,
  'ultra':         4,
};

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
}

function diffDays(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime())
    / (1000 * 60 * 60 * 24),
  );
}

/**
 * Emit a phase segment only if it has at least one day (starts_on <= ends_on).
 * Advances the cursor by `weeks` weeks and returns the new cursor.
 */
function tryPushSegment(
  segments: PhaseSegment[],
  phase: BlockPhase,
  cursor: string,
  weeks: number,
): string {
  if (weeks <= 0) return cursor;
  const segEnd = addDays(cursor, weeks * 7 - 1);
  segments.push({ phase, starts_on: cursor, ends_on: segEnd, weeks });
  return addDays(cursor, weeks * 7);
}

function distributePhases(
  starts_on:    string,
  ends_on:      string,            // race date
  is_first:     boolean,           // first event has full base; bridges compress
  recovery_in:  number,            // recovery weeks at front (post-prior-event)
): PhaseSegment[] {
  const totalDays = diffDays(starts_on, ends_on) + 1;
  const totalWks  = Math.max(1, Math.round(totalDays / 7));
  const segments: PhaseSegment[] = [];

  if (is_first) {
    // If the block is too short for the full base/build/peak/taper structure
    // (minimum sum of floors would be 2+2+1+1=6 plus race day = 7 weeks needed),
    // collapse to a bridge-style structure: build → taper → race.
    if (totalWks < 7) {
      // Simplified: build takes most, taper gets 1 week (or 0 if no room)
      const taperWks = totalWks >= 2 ? 1 : 0;
      const buildWks = totalWks - taperWks - 1; // subtract 1 for race day
      let cursor = starts_on;
      cursor = tryPushSegment(segments, 'build', cursor, buildWks);
      cursor = tryPushSegment(segments, 'taper', cursor, taperWks);
    } else {
      // Full first-block structure: base 35%, build 40%, peak 10%, taper fills remainder
      const baseWks  = Math.max(2, Math.floor(totalWks * 0.35));
      const buildWks = Math.max(2, Math.floor(totalWks * 0.40));
      const peakWks  = Math.max(1, Math.floor(totalWks * 0.10));
      // Clamp taperWks so cursor never overshoots ends_on
      const taperWks = Math.max(0, totalWks - baseWks - buildWks - peakWks - 1);
      let cursor = starts_on;
      cursor = tryPushSegment(segments, 'base',  cursor, baseWks);
      cursor = tryPushSegment(segments, 'build', cursor, buildWks);
      cursor = tryPushSegment(segments, 'peak',  cursor, peakWks);
      cursor = tryPushSegment(segments, 'taper', cursor, taperWks);
    }
  } else {
    // Bridge: recovery → build → taper (no full base, no full peak)
    // Cap recovery so at least the race day remains.
    const cappedRecovery = Math.min(recovery_in, Math.max(0, totalWks - 1));
    // Race day is a single day captured by clamping the final non-race segment's
    // ends_on to ends_on - 1. Do NOT subtract a "race day week" from remainingWks —
    // that would double-count it and cause the taper to be incorrectly dropped on
    // normal-length bridges (e.g. Brighton→Leeds 5-week bridge).
    const remainingWks = totalWks - cappedRecovery;
    let cursor = starts_on;
    cursor = tryPushSegment(segments, 'recovery', cursor, cappedRecovery);

    if (remainingWks <= 1) {
      // Only enough room for a minimal build; skip taper
      cursor = tryPushSegment(segments, 'build', cursor, remainingWks);
    } else {
      const taperWks = remainingWks <= 4 ? 1 : Math.min(2, Math.floor(remainingWks * 0.25));
      const buildWks = Math.max(0, remainingWks - taperWks);
      cursor = tryPushSegment(segments, 'build', cursor, buildWks);
      cursor = tryPushSegment(segments, 'taper', cursor, taperWks);
      // Clamp taper's ends_on to ends_on - 1 so it never eats the race day.
      const lastSeg = segments[segments.length - 1];
      if (lastSeg && lastSeg.phase === 'taper') {
        lastSeg.ends_on = addDays(ends_on, -1);
      }
    }
  }

  // Race day: single day, weeks=0 by design. Guard division-by-zero in downstream consumers.
  segments.push({ phase: 'race', starts_on: ends_on, ends_on: ends_on, weeks: 0 });
  return segments;
}

function assignPriorities(events: SeasonEvent[]): Priority[] {
  const distanceRank: Record<string, number> = {
    'ultra':         5,
    'marathon':      4,
    'half_marathon': 3,
    '10k':           2,
    '5k':            1,
  };
  const ranks = events.map((e) => distanceRank[e.distance_goal ?? ''] ?? 0);
  const max   = Math.max(...ranks);

  // First pass: assign A/B based on whether each event has the max distance rank
  const priorities: Priority[] = events.map((e, i) => (ranks[i] === max ? 1 : 2) as Priority);

  // Second pass: detect conflicts (any pair <14 days apart) and downgrade the SHORTER event to C
  for (let i = 1; i < events.length; i++) {
    const gap = diffDays(events[i - 1].event_date, events[i].event_date);
    if (gap > 0 && gap < 14) {
      const shorterIdx = ranks[i - 1] <= ranks[i] ? i - 1 : i;
      priorities[shorterIdx] = 3 as Priority;
    }
  }

  return priorities;
}

export function buildSeasonChain(input: SeasonChainInput): ChainBlock[] {
  const events = [...input.events].sort((a, b) => a.event_date.localeCompare(b.event_date));
  if (events.length < 2) return [];

  const priorities = assignPriorities(events);
  const out: ChainBlock[] = [];

  // Track whether we've emitted the first future block, so past events at the
  // start of the sorted array don't cause the first future event to be treated
  // as a bridge with recovery phases.
  let hasBuiltFirstBlock = false;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.event_date < input.today) continue;

    const prepWeeks  = STANDARD_PREP_WEEKS[event.distance_goal ?? 'marathon'] ?? 16;
    const isFirst    = !hasBuiltFirstBlock;
    const priorIdx   = i - 1;
    const recoveryIn = isFirst ? 0 : (RECOVERY_WEEKS[events[priorIdx].distance_goal ?? 'marathon'] ?? 3);

    let starts_on: string;
    if (isFirst) {
      const standardStart = addDays(event.event_date, -prepWeeks * 7);
      starts_on = standardStart < input.today ? input.today : standardStart;
    } else {
      starts_on = addDays(events[priorIdx].event_date, 1);
    }

    const phase_segments = distributePhases(starts_on, event.event_date, isFirst, recoveryIn);

    out.push({
      event_id:        event.id,
      modality:        event.modality,
      starts_on,
      ends_on:         event.event_date,
      priority:        priorities[i],
      phase_segments,
    });

    hasBuiltFirstBlock = true;
  }

  return out;
}

/**
 * Persists a chain: creates the season, links user_events, creates training_blocks,
 * generates planned_sessions with phase per session. Returns the new season_id.
 */
export async function applySeasonChain(
  userId:        string,
  events:        SeasonEvent[],
  chain:         ChainBlock[],
  season_name:   string,
): Promise<string> {
  if (chain.length === 0) throw new Error('applySeasonChain: empty chain');

  // 1. Create season row
  const { data: season, error: seasonErr } = await supabase
    .from('seasons')
    .insert({
      user_id:   userId,
      name:      season_name,
      starts_on: chain[0].starts_on,
      ends_on:   chain[chain.length - 1].ends_on,
      status:    'active',
    })
    .select('id')
    .single();
  if (seasonErr) {
    // Another concurrent call won the race — refetch the existing active season
    if (seasonErr.code === '23505') {
      const { data: existing } = await supabase
        .from('seasons')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle();
      if (existing) return existing.id;
    }
    throw new Error(seasonErr.message ?? 'season insert failed');
  }
  if (!season) throw new Error('season insert failed');
  const season_id = season.id;

  // 2. Update user_events: link to season + write priority + sequence_position
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const block = chain.find((b) => b.event_id === event.id);
    if (!block) continue;
    await supabase
      .from('user_events')
      .update({
        season_id,
        sequence_position: i + 1,
        priority:          block.priority,  // integer 1|2|3
      })
      .eq('id', event.id);
  }

  // 3. For each block, find a matching plan_template + create training_block + generate sessions
  for (const block of chain) {
    const { data: tmpl } = await supabase
      .from('plan_templates')
      .select('id, sessions_json')
      .eq('sport_type', block.modality)
      .order('sort_order', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!tmpl) {
      console.warn('[seasonEngine] no plan_template for modality', block.modality);
      continue;
    }

    const { data: blockRow, error: blockErr } = await supabase
      .from('training_blocks')
      .insert({
        user_id:       userId,
        template_id:   tmpl.id,
        starts_on:     block.starts_on,
        ends_on:       block.ends_on,
        modality:      block.modality,
        load_modifier: 1.0,
        event_id:      block.event_id,
        season_id,
      })
      .select('id')
      .single();
    if (blockErr || !blockRow) {
      console.warn('[seasonEngine] training_blocks insert failed', blockErr?.message, 'block:', block);
      continue;
    }

    await generateAndSaveSchedule(
      userId,
      blockRow.id,
      block.modality,
      block.starts_on,
      tmpl.sessions_json as WeekSession[],
      /* slotAssignments */ undefined,
      /* maxWeeks */         undefined,
      block.phase_segments,
    );
  }

  return season_id;
}

/**
 * Detects 2+ future events without an active season; if found, builds and applies
 * the chain. Idempotent — returns existing season_id if one is already active.
 */
export async function recomputeSeasonForUser(
  userId:        string,
  today:         string,
  cycle_profile: CycleProfile,
): Promise<{ season_id: string | null }> {
  const { data: existing } = await supabase
    .from('seasons')
    .select('id')
    .eq('user_id', userId)
    .eq('status',  'active')
    .maybeSingle();
  if (existing) return { season_id: existing.id };

  const { data: events } = await supabase
    .from('user_events')
    .select('id, event_date, distance_goal')
    .eq('user_id', userId)
    .gte('event_date', today)
    .order('event_date');
  if (!events || events.length < 2) return { season_id: null };

  const seasonEvents: SeasonEvent[] = events.map((e) => ({
    id:            e.id,
    event_date:    e.event_date,
    modality:      'run',                       // default — races are runs in MVP
    distance_goal: e.distance_goal,
  }));

  const chain = buildSeasonChain({ events: seasonEvents, cycle_profile, today });
  if (chain.length === 0) return { season_id: null };

  const name = seasonEvents
    .map((e) => (e.distance_goal ?? 'event').toUpperCase().replace(/_/g, ' '))
    .join(' → ');

  const season_id = await applySeasonChain(userId, seasonEvents, chain, name);
  return { season_id };
}
