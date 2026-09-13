import type { CycleProfile } from '@/store/cycle';
import { supabase } from './supabase';
import { generateAndSaveSchedule, type WeekSession, type GenerateContext } from './scheduleGenerator';
import { applyRaceToSchedule } from './raceSchedule';
import { loadRunnerModel } from './runProgramme/runnerModel';
import { generateRunPlan, phaseForWeek } from './runProgramme/generatePlan';
import { archetypeForTemplate, raceDistanceFor } from './runProgramme/archetypes';

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

/**
 * A lower-priority race run INSIDE another race's build rather than given one
 * of its own. A half five weeks before a marathon is a rehearsal for the
 * marathon, not a second goal: raced all-out it costs recovery the marathon
 * cannot spare, run as a controlled effort it is simply that week's long run.
 */
export interface TuneUp {
  event_id:      string;
  event_date:    string;
  distance_goal: string | null;
  priority:      Priority;
}

export interface ChainBlock {
  event_id:        string;
  modality:        string;
  /** The goal race's distance. Chooses the plan, which the engine used to ignore. */
  distance_goal:   string | null;
  starts_on:       string;
  ends_on:         string;
  priority:        Priority;
  phase_segments:  PhaseSegment[];
  tune_ups:        TuneUp[];
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

/** 0 = Monday … 6 = Sunday, matching planned_sessions.day_of_week. */
export function dayIndexOf(iso: string): number {
  return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
}

function mondayOf(iso: string): string {
  return addDays(iso, -dayIndexOf(iso));
}

function mondayOnOrAfter(iso: string): string {
  const dow = dayIndexOf(iso);
  return dow === 0 ? iso : addDays(iso, 7 - dow);
}

/**
 * Where a block's generated sessions start, and how many weeks they span, so
 * that the LAST week is race week.
 *
 * The schedule generator lays week N at `mondayOf(start) + 7N`. Passing the
 * block's own start meant a Sunday start snapped back to the previous Monday
 * and leaked sessions before the block began. Starting on the Monday on or after
 * it keeps every session inside the block, and counting through the Monday of
 * race week makes the plan end on the race rather than wherever its template
 * happened to stop.
 */
export function generationWindow(startsOn: string, raceDate: string): { start: string; weeks: number } {
  const start = mondayOnOrAfter(startsOn);
  const raceWeek = mondayOf(raceDate);
  const weeks = Math.round(diffDays(start, raceWeek) / 7) + 1;
  // A block shorter than a week still has a race in it.
  if (weeks < 1) return { start: raceWeek, weeks: 1 };
  return { start, weeks };
}

/**
 * Training days for a season build, with the long run on the race's weekday.
 *
 * A season has no day picker: the user added races, not a schedule. So these
 * are defaults, and they are no less personal than what they replace, which was
 * the template's own ordering.
 *
 * The one thing that is NOT a default is the long-run day. It is the weekday the
 * race falls on, because applyRaceToSchedule turns the run planned on race day
 * into the race, and there is nothing to turn if no run is planned that day.
 */
export function seasonTrainingDays(distanceGoal: string | null, raceDate: string): { days: number[]; longRunDay: number } {
  const raceDay = dayIndexOf(raceDate);
  const base = distanceGoal === 'marathon' || distanceGoal === 'ultra'
    ? [1, 2, 4]   // Tue, Wed, Fri
    : [1, 3];     // Tue, Thu
  const days = [...new Set([...base, raceDay])].sort((a, b) => a - b);
  return { days, longRunDay: raceDay };
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
    // ends_on to ends_on - 1. Do NOT subtract a "race day week" from remainingWks
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

/**
 * The A-race whose build a lower-priority race falls inside, if any.
 *
 * "Inside" means within that A-race's own standard prep window, measured from
 * its date, NOT within whatever block the sequential chain would have given it.
 * That distinction is the whole rule. A progressive ladder (10K in April, half
 * in June, marathon in October) keeps every stepping stone as its own build,
 * because June is before the marathon's sixteen-week window opens. A half five
 * weeks before a marathon sits well inside it, and folds.
 *
 * A-races never fold, however close together: two marathons are two goals.
 */
function hostAFor(
  idx:        number,
  future:     { event: SeasonEvent; priority: Priority }[],
): number | null {
  const { event, priority } = future[idx];
  if (priority === 1) return null;
  // Only the FIRST A-race after it can host it. Searching past that one would
  // let a race before one marathon be claimed by a later marathon, across the
  // first. That cannot currently happen, because every A-race shares the longest
  // distance and so the same prep length, which keeps their windows in order.
  // Stating the rule beats depending on that staying true.
  const j = future.findIndex((x, k) => k > idx && x.priority === 1);
  if (j === -1) return null;
  const host        = future[j];
  const prepWeeks   = STANDARD_PREP_WEEKS[host.event.distance_goal ?? 'marathon'] ?? 16;
  const windowOpens = addDays(host.event.event_date, -prepWeeks * 7);
  return event.event_date >= windowOpens && event.event_date < host.event.event_date ? j : null;
}

export function buildSeasonChain(input: SeasonChainInput): ChainBlock[] {
  const events = [...input.events].sort((a, b) => a.event_date.localeCompare(b.event_date));
  if (events.length < 2) return [];

  // Priorities are judged across every event, past ones included, so a past
  // marathon still counts when deciding what today's races are relative to.
  const priorities = assignPriorities(events);
  const future = events
    .map((event, i) => ({ event, priority: priorities[i] }))
    .filter((x) => x.event.event_date >= input.today);

  // Which races get a build of their own, and which are tune-ups inside one.
  const hostOf = future.map((_, i) => hostAFor(i, future));
  const tuneUpsFor = new Map<number, TuneUp[]>();
  hostOf.forEach((host, i) => {
    if (host == null) return;
    const { event, priority } = future[i];
    const list = tuneUpsFor.get(host) ?? [];
    list.push({ event_id: event.id, event_date: event.event_date, distance_goal: event.distance_goal, priority });
    tuneUpsFor.set(host, list);
  });

  const out: ChainBlock[] = [];
  // The previous race that got a BLOCK. A folded tune-up is not a boundary: the
  // build it sits inside began before it and runs through it, so treating it as
  // the end of one block and the start of the next is exactly what gave
  // Emma's marathon a five-week "build" beginning the day after her half.
  let priorAnchor: SeasonEvent | null = null;

  for (let i = 0; i < future.length; i++) {
    if (hostOf[i] != null) continue;
    const { event, priority } = future[i];

    const prepWeeks  = STANDARD_PREP_WEEKS[event.distance_goal ?? 'marathon'] ?? 16;
    const isFirst    = priorAnchor === null;
    const recoveryIn = isFirst ? 0 : (RECOVERY_WEEKS[priorAnchor!.distance_goal ?? 'marathon'] ?? 3);

    let starts_on: string;
    if (isFirst) {
      const standardStart = addDays(event.event_date, -prepWeeks * 7);
      starts_on = standardStart < input.today ? input.today : standardStart;
    } else {
      starts_on = addDays(priorAnchor!.event_date, 1);
    }

    out.push({
      event_id:       event.id,
      modality:       event.modality,
      distance_goal:  event.distance_goal,
      starts_on,
      ends_on:        event.event_date,
      priority,
      phase_segments: distributePhases(starts_on, event.event_date, isFirst, recoveryIn),
      tune_ups:       tuneUpsFor.get(i) ?? [],
    });

    priorAnchor = event;
  }

  return out;
}

interface SeasonTemplate {
  id:            string;
  name:          string | null;
  distance_goal: string | null;
  sessions_json: unknown;
}

/**
 * The template for a block: the one written for its race distance.
 *
 * Falls back to the first template for the modality only when no template
 * exists for that distance at all, so a season is never left without a plan.
 * That fallback is also exactly what the old query did for every race, which is
 * why it is now the last resort rather than the only path.
 */
async function templateForBlock(block: ChainBlock): Promise<SeasonTemplate | null> {
  if (block.distance_goal) {
    const { data } = await supabase
      .from('plan_templates')
      .select('id, name, distance_goal, sessions_json')
      .eq('sport_type', block.modality)
      .eq('distance_goal', block.distance_goal)
      .order('sort_order', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data) return data as SeasonTemplate;
  }
  const { data } = await supabase
    .from('plan_templates')
    .select('id, name, distance_goal, sessions_json')
    .eq('sport_type', block.modality)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as SeasonTemplate | null) ?? null;
}

/**
 * The run plan for a season block, built the same way single-plan enrolment
 * builds one in trainingBlocks: the runner model, the archetype for the race,
 * and the generator, sized to the weeks the block actually holds.
 *
 * Deliberately mirrors that path rather than refactoring it into a shared
 * helper. trainingBlocks and the generator are both mid-change in open stacked
 * PRs (#52, #55), and pulling shared code out from under them would turn a
 * season fix into a merge conflict for someone else's work.
 */
async function generateSeasonRunPlan(
  userId: string,
  block:  ChainBlock,
  tmpl:   SeasonTemplate,
  weeks:  number,
) {
  try {
    const model     = await loadRunnerModel(userId);
    const goal      = raceDistanceFor(block.distance_goal);
    const archetype = archetypeForTemplate({
      distanceGoal: block.distance_goal ?? tmpl.distance_goal,
      name:         tmpl.name,
      hasEventDate: true,
    });
    const { days, longRunDay } = seasonTrainingDays(block.distance_goal, block.ends_on);

    const plan = generateRunPlan({
      archetype,
      goal,
      weeks,
      tier:                model.tier,
      preset:              model.preset,
      difficulty:          model.difficulty,
      currentWeeklyKm:     model.currentWeeklyKm,
      currentLongestRunKm: model.currentLongestRunKm,
      days,
      longRunDay,
    });
    if (!plan.weeks.length) return null;

    const buildOrDown = plan.curve.filter((x) => x.kind === 'build' || x.kind === 'down').length;
    const context: GenerateContext = {
      baseline_pace_secs: model.thresholdSecs,
      runPlan: {
        goal,
        intensity: archetype.forceDifficulty ?? model.difficulty,
        phases:    plan.curve.map((w, i) => phaseForWeek(w, i, buildOrDown)),
        longRunKm: plan.curve.map((w) => w.longRunKm),
        walkRun:   plan.walkRun,
      },
    };

    return { weeks: plan.weeks, weekSlots: plan.weekSlots, context };
  } catch (e) {
    console.warn('[seasonEngine] run plan generation failed, using template', e);
    return null;
  }
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
    // Another concurrent call won the race; refetch the existing active season
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
    // A tune-up has no block of its own but is still part of the season, and
    // still has a priority worth recording.
    const block  = chain.find((b) => b.event_id === event.id);
    const tuneUp = chain.flatMap((b) => b.tune_ups).find((t) => t.event_id === event.id);
    const priority = block?.priority ?? tuneUp?.priority;
    if (priority == null) continue;
    await supabase
      .from('user_events')
      .update({
        season_id,
        sequence_position: i + 1,
        priority,  // integer 1|2|3
      })
      .eq('id', event.id);
  }

  // 3. Fetch baseline pace once for workout structure generation
  const { data: profileRow } = await supabase
    .from('user_profiles')
    .select('baseline_pace_seconds_per_km')
    .eq('id', userId)
    .maybeSingle();
  const generateContext: GenerateContext = {
    baseline_pace_secs: profileRow?.baseline_pace_seconds_per_km ?? 360,
  };

  // 4. Each block gets a plan for ITS race, generated for this runner and laid
  //    out to finish on race day.
  //
  //    Card 265. This used to take `.eq('sport_type', modality).order('sort_order')
  //    .limit(1)`: the first run template by sort order, which was Beginner 5K,
  //    for every race of every season. It never read the distance. Three lines
  //    up it did use the distance to size the block, so a half got a correct
  //    twelve-week window and then a 5K plan inside it.
  //
  //    It also passed no week limit, so the template was laid forward from the
  //    block's START regardless of its END: an eight-week plan front-loaded a
  //    twelve-week window and left the weeks before the race empty, and overran
  //    a five-week window by three weeks. And it read sessions straight off the
  //    template, bypassing the run generator entirely, so seasons never got what
  //    PR #50 gave single plans.
  for (const block of chain) {
    const tmpl = await templateForBlock(block);
    if (!tmpl) {
      console.warn('[seasonEngine] no plan_template for', block.modality, block.distance_goal);
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

    const { start, weeks } = generationWindow(block.starts_on, block.ends_on);

    const generated = block.modality === 'run'
      ? await generateSeasonRunPlan(userId, block, tmpl, weeks)
      : null;

    if (generated) {
      await generateAndSaveSchedule(
        userId,
        blockRow.id,
        block.modality,
        start,
        generated.weeks,
        /* slotAssignments */ undefined,
        generated.weeks.length,
        block.phase_segments,
        generated.context,
        generated.weekSlots,
      );
    } else {
      // No generated plan (a non-run block, or a goal the generator does not
      // cover). Still never lay more weeks than the block holds.
      await generateAndSaveSchedule(
        userId,
        blockRow.id,
        block.modality,
        start,
        (tmpl.sessions_json ?? []) as WeekSession[],
        /* slotAssignments */ undefined,
        weeks,
        block.phase_segments,
        generateContext,
      );
    }

    // Make the plan agree with the calendar: the goal race, and any tune-up run
    // inside this build, become race sessions on their dates. The long-run day
    // was anchored to the race weekday so there is a run to convert.
    if (block.modality === 'run') {
      await applyRaceToSchedule(userId, { event_date: block.ends_on, distance_goal: block.distance_goal });
      for (const t of block.tune_ups) {
        await applyRaceToSchedule(userId, { event_date: t.event_date, distance_goal: t.distance_goal });
      }
    }
  }

  return season_id;
}

/**
 * Detects 2+ future events without an active season; if found, builds and applies
 * the chain. Idempotent: returns existing season_id if one is already active.
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
    modality:      'run',                       // default; races are runs in MVP
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
