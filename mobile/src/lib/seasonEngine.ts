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
    // First event: base 35%, build 40%, peak 10%, taper 15%, race day 0
    const baseWks  = Math.max(2, Math.floor(totalWks * 0.35));
    const buildWks = Math.max(2, Math.floor(totalWks * 0.40));
    const peakWks  = Math.max(1, Math.floor(totalWks * 0.10));
    const taperWks = Math.max(1, totalWks - baseWks - buildWks - peakWks - 1);
    let cursor = starts_on;
    segments.push({ phase: 'base',  starts_on: cursor, ends_on: addDays(cursor, baseWks  * 7 - 1), weeks: baseWks  });
    cursor = addDays(cursor, baseWks * 7);
    segments.push({ phase: 'build', starts_on: cursor, ends_on: addDays(cursor, buildWks * 7 - 1), weeks: buildWks });
    cursor = addDays(cursor, buildWks * 7);
    segments.push({ phase: 'peak',  starts_on: cursor, ends_on: addDays(cursor, peakWks  * 7 - 1), weeks: peakWks  });
    cursor = addDays(cursor, peakWks * 7);
    segments.push({ phase: 'taper', starts_on: cursor, ends_on: addDays(ends_on, -1),              weeks: taperWks });
  } else {
    // Bridge: recovery → build → taper (no full base, no full peak)
    const remainingWks = totalWks - recovery_in;
    const taperWks     = remainingWks <= 4 ? 1 : Math.min(2, Math.floor(remainingWks * 0.25));
    const buildWks     = Math.max(1, remainingWks - taperWks);
    let cursor = starts_on;
    segments.push({ phase: 'recovery', starts_on: cursor, ends_on: addDays(cursor, recovery_in * 7 - 1), weeks: recovery_in });
    cursor = addDays(cursor, recovery_in * 7);
    segments.push({ phase: 'build',    starts_on: cursor, ends_on: addDays(cursor, buildWks    * 7 - 1), weeks: buildWks    });
    cursor = addDays(cursor, buildWks * 7);
    segments.push({ phase: 'taper',    starts_on: cursor, ends_on: addDays(ends_on, -1),                 weeks: taperWks    });
  }

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

export function buildSeasonChain(input: {
  events:        SeasonEvent[];
  cycle_profile: CycleProfile;
  today:         string;
}): ChainBlock[] {
  const events = [...input.events].sort((a, b) => a.event_date.localeCompare(b.event_date));
  if (events.length < 2) return [];

  const priorities = assignPriorities(events);
  const out: ChainBlock[] = [];

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.event_date < input.today) continue;

    const prepWeeks   = STANDARD_PREP_WEEKS[event.distance_goal ?? 'marathon'] ?? 16;
    const isFirst     = i === 0;
    const recoveryIn  = i === 0 ? 0 : (RECOVERY_WEEKS[events[i - 1].distance_goal ?? 'marathon'] ?? 3);

    let starts_on: string;
    if (i === 0) {
      const standardStart = addDays(event.event_date, -prepWeeks * 7);
      starts_on = standardStart < input.today ? input.today : standardStart;
    } else {
      starts_on = addDays(events[i - 1].event_date, 1);
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
  }

  return out;
}
