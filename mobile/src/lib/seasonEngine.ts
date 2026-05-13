import type { CycleProfile } from '@/store/cycle';

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
