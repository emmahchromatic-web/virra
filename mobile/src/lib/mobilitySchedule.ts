import { supabase } from '@/lib/supabase';
import { loadMobilityStructure } from '@/lib/mobilitySessions';
import { SLOT_LOAD, clearSlot, endTrainingBlock, type TrainingBlock } from '@/lib/trainingBlocks';
import { useSessionStore } from '@/store/sessionStore';
import type { AnyStrengthStructure } from '@/lib/workoutStructure';

/**
 * A mobility session in the week, card 264.
 *
 * Emma's shape, 2026-09-16: "programme Deep Release as part of the stack and do
 * it weekly on a Sunday, but also just go in and do Wind Down on days you feel
 * like you need it." So the session IS the plan. There is no template and no
 * twelve-week arc: one mobility block holds whichever sessions have been given
 * a weekday, and each of them is written into `planned_sessions` for the next
 * eight weeks and topped up as the weeks pass. The one-off list is untouched.
 *
 * One block, many sessions. The week has one mobility slot (card 231), and
 * "Deep Release on Sundays and Wake Up on Wednesdays" is one habit with two
 * parts, not two plans competing for the slot.
 */

/** How far ahead a weekly session is written. */
export const HORIZON_WEEKS = 8;
/** Top up once fewer than this many weeks remain, so the habit never runs out. */
export const TOP_UP_BELOW_WEEKS = 4;

/** Index 0 = Monday, matching `planned_sessions.day_of_week` and DAY_TEMPLATES. */
export const WEEKDAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export const WEEKDAY_SHORT  = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

export function weekdayPlural(day: number): string {
  return `${WEEKDAY_LABELS[day] ?? 'day'}s`;
}

// --- dates, all as ISO yyyy-mm-dd strings so comparisons are string comparisons -------

export function todayISO(): string {
  return new Date().toLocaleDateString('en-CA');
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The Monday on or before the date. Weeks are Monday-start everywhere in the app. */
export function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  return addDaysISO(iso, -offset);
}

/** 0 = Monday … 6 = Sunday, matching WEEKDAY_LABELS. */
export function weekdayOf(iso: string): number {
  return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
}

// --- the rows -------------------------------------------------------------------------

export interface PlannedMobilityInsert {
  user_id:            string;
  block_id:           string;
  scheduled_date:     string;
  week_number:        number;
  day_of_week:        number;
  modality:           'mobility';
  session_label:      string;
  status:             'planned';
  strength_structure: AnyStrengthStructure;
}

export interface WeeklyRowsInput {
  userId:        string;
  blockId:       string;
  /** The block's starts_on; week numbers count from the Monday of that week. */
  blockStartsOn: string;
  sessionName:   string;
  structure:     AnyStrengthStructure;
  weekday:       number;
  /** First date that may be written (inclusive). Nothing lands in the past. */
  from:          string;
  /** Last date that may be written (inclusive). */
  until:         string;
}

/**
 * One row per week on the chosen weekday, between `from` and `until`.
 *
 * Pure, so it can be tested without a database. The structure is embedded on
 * every row, as an authored strength session is at enrol time: the workout
 * screen reads `strength_structure` off the planned row and needs nothing else.
 */
export function buildWeeklyRows(input: WeeklyRowsInput): PlannedMobilityInsert[] {
  const rows: PlannedMobilityInsert[] = [];
  const blockMonday = mondayOf(input.blockStartsOn);
  let date = addDaysISO(mondayOf(input.from), input.weekday);
  if (date < input.from) date = addDaysISO(date, 7);
  while (date <= input.until) {
    const daysFromBlock = Math.round(
      (new Date(`${date}T00:00:00Z`).getTime() - new Date(`${blockMonday}T00:00:00Z`).getTime()) / 86400000,
    );
    rows.push({
      user_id:            input.userId,
      block_id:           input.blockId,
      scheduled_date:     date,
      week_number:        Math.floor(daysFromBlock / 7) + 1,
      day_of_week:        input.weekday,
      modality:           'mobility',
      session_label:      input.sessionName,
      status:             'planned',
      strength_structure: input.structure,
    });
    date = addDaysISO(date, 7);
  }
  return rows;
}

// --- reading --------------------------------------------------------------------------

export interface ScheduledMobility {
  blockId:   string;
  label:     string;
  weekday:   number;
  /** The next planned date, so the list can say "next Sunday 21 Sep". */
  nextDate:  string;
  /** How many future rows exist; the top-up watches this. */
  remaining: number;
  lastDate:  string;
}

interface FutureRow {
  session_label:      string;
  day_of_week:        number;
  scheduled_date:     string;
  strength_structure: AnyStrengthStructure | null;
}

export async function openMobilityBlock(userId: string): Promise<{ id: string; starts_on: string } | null> {
  const today = todayISO();
  const { data } = await supabase
    .from('training_blocks')
    .select('id, starts_on')
    .eq('user_id', userId)
    .eq('modality', 'mobility')
    .or(`ends_on.is.null,ends_on.gte.${today}`)
    .order('starts_on', { ascending: false })
    .limit(1);
  const row = (data ?? [])[0] as { id: string; starts_on: string } | undefined;
  return row ?? null;
}

async function futureRows(blockId: string): Promise<FutureRow[]> {
  const { data } = await supabase
    .from('planned_sessions')
    .select('session_label, day_of_week, scheduled_date, strength_structure')
    .eq('block_id', blockId)
    .eq('status', 'planned')
    .gte('scheduled_date', todayISO())
    .order('scheduled_date');
  return (data ?? []) as FutureRow[];
}

function groupScheduled(blockId: string, rows: FutureRow[]): ScheduledMobility[] {
  const byKey = new Map<string, ScheduledMobility>();
  for (const r of rows) {
    const key = `${r.session_label}|${r.day_of_week}`;
    const entry = byKey.get(key);
    if (entry) {
      entry.remaining += 1;
      if (r.scheduled_date > entry.lastDate) entry.lastDate = r.scheduled_date;
    } else {
      byKey.set(key, {
        blockId,
        label:     r.session_label,
        weekday:   r.day_of_week,
        nextDate:  r.scheduled_date,
        remaining: 1,
        lastDate:  r.scheduled_date,
      });
    }
  }
  return [...byKey.values()].sort((a, b) => a.weekday - b.weekday);
}

/** What is in the week right now, one entry per session-and-weekday. */
export async function listScheduledMobility(userId: string): Promise<ScheduledMobility[]> {
  const block = await openMobilityBlock(userId);
  if (!block) return [];
  return groupScheduled(block.id, await futureRows(block.id));
}

/**
 * The stack shows a block by its template's name, and a mobility block has no
 * template. Its name is what is in it: "Deep Release on Sundays".
 */
export async function attachMobilityLabels(blocks: TrainingBlock[]): Promise<TrainingBlock[]> {
  const out = [...blocks];
  for (let i = 0; i < out.length; i++) {
    const b = out[i];
    if (b.modality !== 'mobility' || b.template_id) continue;
    const entries = groupScheduled(b.id, await futureRows(b.id));
    out[i] = {
      ...b,
      label: entries.length
        ? entries.map((e) => `${e.label} on ${weekdayPlural(e.weekday)}`).join(', ')
        : 'Mobility',
    };
  }
  return out;
}

// --- writing --------------------------------------------------------------------------

function refreshCalendar(from: string, to: string): void {
  // The calendar and week screens read planned sessions through the store, and
  // the store only refetches a range it thinks is stale. Tell it.
  void useSessionStore.getState().refresh(from, to);
}

async function insertRows(rows: PlannedMobilityInsert[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from('planned_sessions').insert(rows.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }
}

/**
 * Put a session into the week on a weekday, every week.
 *
 * Creates the mobility block if there is none (displacing whatever else held
 * the support slot, as starting any plan does), refuses a weekday that already
 * has a mobility session, and writes the next eight weeks.
 */
export async function scheduleWeekly(
  userId:    string,
  sessionId: string,
  weekday:   number,
): Promise<ScheduledMobility> {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw new Error('Pick a day of the week.');
  }
  const loaded = await loadMobilityStructure(sessionId);
  if (!loaded) throw new Error('We could not load that session. Check your connection and try again.');

  const today = todayISO();
  let block = await openMobilityBlock(userId);
  if (!block) {
    await clearSlot(userId, 'support');
    const { data, error } = await supabase
      .from('training_blocks')
      .insert({
        user_id:       userId,
        template_id:   null,
        modality:      'mobility',
        starts_on:     today,
        ends_on:       null,            // a habit, not a block with an end
        load_modifier: SLOT_LOAD.support,
        is_primary:    true,
      })
      .select('id, starts_on')
      .single();
    if (error || !data) throw new Error(error?.message ?? 'Could not start your mobility plan.');
    block = data as { id: string; starts_on: string };
  } else {
    const taken = (await futureRows(block.id)).find((r) => r.day_of_week === weekday);
    if (taken) {
      throw new Error(
        taken.session_label === loaded.name
          ? `${loaded.name} is already in your week on ${weekdayPlural(weekday)}.`
          : `${weekdayPlural(weekday)} already have ${taken.session_label}. Remove it first, or pick another day.`,
      );
    }
  }

  const until = addDaysISO(today, HORIZON_WEEKS * 7 - 1);
  const rows = buildWeeklyRows({
    userId,
    blockId:       block.id,
    blockStartsOn: block.starts_on,
    sessionName:   loaded.name,
    structure:     loaded.structure,
    weekday,
    from:          today,
    until,
  });
  await insertRows(rows);
  refreshCalendar(today, until);

  return {
    blockId:   block.id,
    label:     loaded.name,
    weekday,
    nextDate:  rows[0]?.scheduled_date ?? today,
    remaining: rows.length,
    lastDate:  rows[rows.length - 1]?.scheduled_date ?? today,
  };
}

/**
 * Take a session out of the week. Future rows are dropped, past ones stay as
 * the record of what happened. If nothing is left in the block, the block ends.
 */
export async function unscheduleWeekly(entry: ScheduledMobility): Promise<void> {
  const today = todayISO();
  const { error } = await supabase
    .from('planned_sessions')
    .update({ status: 'dropped' })
    .eq('block_id', entry.blockId)
    .eq('session_label', entry.label)
    .eq('day_of_week', entry.weekday)
    .eq('status', 'planned')
    .gte('scheduled_date', today);
  if (error) throw new Error(error.message);

  const left = await futureRows(entry.blockId);
  if (left.length === 0) await endTrainingBlock(entry.blockId);
  refreshCalendar(today, addDaysISO(today, HORIZON_WEEKS * 7));
}

/**
 * Keep every weekly session written HORIZON_WEEKS ahead.
 *
 * Called when the training tab loads. Cheap when there is nothing to do (one
 * query for the block, one for its rows). New rows take the session as it is
 * NOW in `mobility_sessions`, so an edit in the admin console reaches the
 * habit within a few weeks without anyone re-adding it; if the session has
 * been renamed or retired, the last written row's structure is reused.
 */
export async function topUpMobilitySchedule(userId: string): Promise<number> {
  const block = await openMobilityBlock(userId);
  if (!block) return 0;
  const rows = await futureRows(block.id);
  if (rows.length === 0) return 0;

  const today = todayISO();
  const until = addDaysISO(today, HORIZON_WEEKS * 7 - 1);
  const threshold = addDaysISO(today, TOP_UP_BELOW_WEEKS * 7);
  let added = 0;

  for (const entry of groupScheduled(block.id, rows)) {
    if (entry.lastDate >= threshold) continue;

    const latest = rows
      .filter((r) => r.session_label === entry.label && r.day_of_week === entry.weekday)
      .sort((a, b) => (a.scheduled_date < b.scheduled_date ? 1 : -1))[0];

    const { data: current } = await supabase
      .from('mobility_sessions')
      .select('id')
      .eq('name', entry.label)
      .eq('is_active', true)
      .maybeSingle();
    const fresh = current ? await loadMobilityStructure((current as { id: string }).id) : null;
    const structure = fresh?.structure ?? latest?.strength_structure ?? null;
    if (!structure) continue;

    const newRows = buildWeeklyRows({
      userId,
      blockId:       block.id,
      blockStartsOn: block.starts_on,
      sessionName:   entry.label,
      structure,
      weekday:       entry.weekday,
      from:          addDaysISO(entry.lastDate, 1),
      until,
    });
    if (newRows.length === 0) continue;
    await insertRows(newRows);
    added += newRows.length;
  }

  if (added > 0) refreshCalendar(today, until);
  return added;
}
