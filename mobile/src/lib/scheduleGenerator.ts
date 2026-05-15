import { supabase } from './supabase';
import type { BlockPhase, PhaseSegment } from './seasonEngine';
import { generateRunStructure } from './runWorkoutGenerator';
import { generateStrengthStructure } from './strengthWorkoutGenerator';
import type { RunWorkoutStructure, StrengthWorkoutStructure } from './workoutStructure';
import type { SessionType as StrengthSessionType } from './strengthTypes';

export const DAY_TEMPLATES: Record<number, number[]> = {
  1: [0],
  2: [0, 3],
  3: [0, 2, 5],
  4: [0, 2, 4, 6],
  5: [0, 1, 3, 4, 6],
  6: [0, 1, 2, 4, 5, 6],
  7: [0, 1, 2, 3, 4, 5, 6],
};

export interface SessionSlot {
  key:   string; // unique identifier for picker rows, e.g. "lower_0", "upper_1", "lower_2"
  label: string; // actual session_label written to DB
  day:   number; // 0=Mon … 6=Sun
}

// Returns ordered slots for the day-assignment picker.
// When maxSessionsPerWeek exceeds the number of unique labels in the template,
// labels are cycled (lower→upper→lower…) so the picker always shows the right count.
export function computeDefaultDayAssignment(
  sessionsJson:        WeekSession[],
  maxSessionsPerWeek?: number,
): SessionSlot[] {
  const seen:   Set<string> = new Set();
  const unique: string[]    = [];
  for (const week of sessionsJson) {
    const anchors  = week.sessions.filter((s) => ANCHOR_LAST.has(s));
    const regulars = week.sessions.filter((s) => !ANCHOR_LAST.has(s));
    for (const label of [...regulars, ...anchors]) {
      if (!seen.has(label)) { seen.add(label); unique.push(label); }
    }
  }

  const count    = maxSessionsPerWeek ?? unique.length;
  const template = DAY_TEMPLATES[Math.min(count, 7)] ??
    Array.from({ length: count }, (_, i) => i);
  const occurrences: Record<string, number> = {};
  return Array.from({ length: count }, (_, i) => {
    const label = unique.length > 0 ? unique[i % unique.length] : 'general';
    const occ   = occurrences[label] ?? 0;
    occurrences[label] = occ + 1;
    return { key: `${label}_${occ}`, label, day: template[i] };
  });
}

const ANCHOR_LAST = new Set(['long', 'race']);

export interface WeekSession {
  week:     number;
  km:       number;
  label:    string;
  sessions: string[];
}

export interface PlannedSessionInsert {
  user_id:        string;
  block_id:       string;
  scheduled_date: string;
  week_number:    number;
  day_of_week:    number;
  modality:       string;
  session_label:  string;
  status:         'planned';
  run_structure?:      RunWorkoutStructure;
  strength_structure?: StrengthWorkoutStructure;
}

export interface GenerateContext {
  baseline_pace_secs: number;
}

export function generateSchedule(
  userId:           string,
  blockId:          string,
  modality:         string,
  startsOn:         string,
  sessionsJson:     WeekSession[],
  slotAssignments?: SessionSlot[],
  maxWeeks?:        number,
  context?:         GenerateContext,
): PlannedSessionInsert[] {
  const origin  = mondayOf(startsOn);
  const rows: PlannedSessionInsert[] = [];
  const limited = maxWeeks != null ? sessionsJson.slice(0, maxWeeks) : sessionsJson;

  limited.forEach((week, weekIndex) => {
    // Use provided slot assignments; fall back to default template ordering
    const slots: SessionSlot[] = slotAssignments ?? (() => {
      const anchors  = week.sessions.filter((s) => ANCHOR_LAST.has(s));
      const regulars = week.sessions.filter((s) => !ANCHOR_LAST.has(s));
      const ordered  = [...regulars, ...anchors];
      const tmpl     = DAY_TEMPLATES[Math.min(ordered.length, 7)] ??
        Array.from({ length: ordered.length }, (_, i) => i);
      return ordered.map((label, i) => ({ key: `${label}_${i}`, label, day: tmpl[i] }));
    })();

    if (slots.length === 0) return;
    slots.forEach((slot) => {
      const row: PlannedSessionInsert = {
        user_id:        userId,
        block_id:       blockId,
        scheduled_date: toISO(addDays(origin, weekIndex * 7 + slot.day)),
        week_number:    week.week,
        day_of_week:    slot.day,
        modality,
        session_label:  slot.label,
        status:         'planned',
      };

      if (context) {
        if (modality === 'run') {
          // Estimate this session's distance from the week's total.
          // Long runs take ~35% of weekly volume; the rest split evenly.
          const sessions = week.sessions;
          const hasLong  = sessions.includes('long');
          const runSessionCount = sessions.filter(
            (s) => !['lower', 'upper', 'general'].includes(s),
          ).length || 1;
          const longShare = hasLong ? week.km * 0.35 : 0;
          const otherCount = hasLong ? runSessionCount - 1 : runSessionCount;
          const distance_km =
            slot.label === 'long'
              ? Math.round(longShare * 10) / 10
              : Math.max(3, Math.round(((week.km - longShare) / Math.max(1, otherCount)) * 10) / 10);
          row.run_structure = generateRunStructure({
            session_label:      slot.label,
            baseline_pace_secs: context.baseline_pace_secs,
            distance_km,
          });
        } else if (modality === 'strength') {
          row.strength_structure = generateStrengthStructure({
            session_type:           slot.label as StrengthSessionType,
            phase:                  null,
            recent_primary_muscles: [],
          });
        }
      }

      rows.push(row);
    });
  });
  return rows;
}

export async function generateAndSaveSchedule(
  userId:           string,
  blockId:          string,
  modality:         string,
  startsOn:         string,
  sessionsJson:     WeekSession[],
  slotAssignments?: SessionSlot[],
  maxWeeks?:        number,
  phaseSegments?:   PhaseSegment[],
  context?:         GenerateContext,
): Promise<void> {
  if (!sessionsJson.length) return;
  const rows = generateSchedule(userId, blockId, modality, startsOn, sessionsJson, slotAssignments, maxWeeks, context);
  if (!rows.length) return;

  function resolvePhase(scheduled_date: string): BlockPhase | null {
    if (!phaseSegments) return null;
    return phaseSegments.find(
      (s) => scheduled_date >= s.starts_on && scheduled_date <= s.ends_on,
    )?.phase ?? null;
  }

  const rowsWithPhase = rows.map((row) => ({
    ...row,
    phase: resolvePhase(row.scheduled_date),
  }));

  for (let i = 0; i < rowsWithPhase.length; i += 200) {
    const { error } = await supabase.from('planned_sessions').insert(rowsWithPhase.slice(i, i + 200));
    if (error) console.warn('[scheduleGenerator] insert error', error.message);
  }
}

export async function dropSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('planned_sessions')
    .update({ status: 'dropped' })
    .eq('id', sessionId);
  if (error) throw new Error(error.message);
}

export async function moveSession(
  sessionId: string,
  newDate:   string,
  userId:    string,
): Promise<void> {
  const { data: orig, error: fetchErr } = await supabase
    .from('planned_sessions')
    .select('week_number, modality, session_label, block_id, run_structure, strength_structure')
    .eq('id', sessionId)
    .single();
  if (fetchErr || !orig) throw new Error(fetchErr?.message ?? 'Session not found');

  const [ny, nm, nd] = newDate.split('-').map(Number);
  const jsDay  = new Date(Date.UTC(ny, nm - 1, nd)).getUTCDay();
  const newDow = jsDay === 0 ? 6 : jsDay - 1;

  const { data: newRow, error: insertErr } = await supabase
    .from('planned_sessions')
    .insert({
      user_id:            userId,
      block_id:           (orig as any).block_id,
      scheduled_date:     newDate,
      week_number:        (orig as any).week_number,
      day_of_week:        newDow,
      modality:           (orig as any).modality,
      session_label:      (orig as any).session_label,
      status:             'planned',
      run_structure:      (orig as any).run_structure,
      strength_structure: (orig as any).strength_structure,
    })
    .select('id')
    .single();
  if (insertErr || !newRow) throw new Error(insertErr?.message ?? 'Could not create replacement');

  await supabase
    .from('planned_sessions')
    .update({ status: 'moved', moved_to_id: newRow.id })
    .eq('id', sessionId);
}

export async function closeBlock(blockId: string, endsOn: string): Promise<void> {
  await Promise.all([
    supabase.from('training_blocks').update({ ends_on: endsOn }).eq('id', blockId),
    supabase
      .from('planned_sessions')
      .update({ status: 'dropped' })
      .eq('block_id', blockId)
      .gt('scheduled_date', endsOn)
      .eq('status', 'planned'),
  ]);
}

export async function linkActivityToSession(
  activityId:    string,
  userId:        string,
  dateISO:       string,
  activityType:  string,
  sessionLabel?: string,
): Promise<void> {
  if (activityType === 'strength' && sessionLabel) {
    const { data: exact, error: exactErr } = await supabase
      .from('planned_sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('scheduled_date', dateISO)
      .eq('modality', 'strength')
      .eq('session_label', sessionLabel)
      .eq('status', 'planned')
      .order('created_at')
      .limit(1);
    if (exactErr) console.warn('[scheduleGenerator] linkActivity strength-label query', exactErr.message);
    if (exact?.length) { await _commitLink(exact[0].id, activityId); return; }
  }

  const { data, error } = await supabase
    .from('planned_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('scheduled_date', dateISO)
    .eq('modality', activityType)
    .eq('status', 'planned')
    .order('created_at')
    .limit(1);
  if (error) console.warn('[scheduleGenerator] linkActivity query', error.message);
  if (data?.length) await _commitLink(data[0].id, activityId);
}

async function _commitLink(plannedSessionId: string, activityId: string): Promise<void> {
  const [r1, r2] = await Promise.all([
    supabase
      .from('planned_sessions')
      .update({ status: 'completed', activity_id: activityId })
      .eq('id', plannedSessionId),
    supabase
      .from('activities')
      .update({ planned_session_id: plannedSessionId })
      .eq('id', activityId),
  ]);
  if (r1.error) console.warn('[scheduleGenerator] _commitLink planned_sessions', r1.error.message);
  if (r2.error) console.warn('[scheduleGenerator] _commitLink activities', r2.error.message);
}

// ---- Break handling ----

export interface BreakMutations {
  toDropIds:  string[];
  toShiftIds: string[];
  shiftDays:  number;
}

export function computeBreakDays(
  sessions:   Array<{ id: string; scheduled_date: string }>,
  breakStart: string,
  breakEnd:   string,
  mode:       'reschedule' | 'skip',
): BreakMutations {
  const shiftDays = mode === 'reschedule' ? _daysBetween(breakStart, breakEnd) + 1 : 0;
  const toDropIds:  string[] = [];
  const toShiftIds: string[] = [];
  for (const s of sessions) {
    if (s.scheduled_date >= breakStart && s.scheduled_date <= breakEnd) {
      toDropIds.push(s.id);
    } else if (s.scheduled_date > breakEnd && mode === 'reschedule') {
      toShiftIds.push(s.id);
    }
  }
  return { toDropIds, toShiftIds, shiftDays };
}

export async function applyBreak(
  userId:     string,
  blockIds:   string[],
  breakStart: string,
  breakEnd:   string,
  mode:       'reschedule' | 'skip',
): Promise<void> {
  // Manipulate sessions only when blocks are selected
  if (blockIds.length > 0) {
    // Fetch all planned sessions in affected blocks from breakStart onward
    // ordered latest-first so shifts don't clash with each other
    const { data: sessions, error } = await supabase
      .from('planned_sessions')
      .select('id, scheduled_date')
      .in('block_id', blockIds)
      .gte('scheduled_date', breakStart)
      .eq('status', 'planned')
      .order('scheduled_date', { ascending: false });
    if (error) throw new Error(error.message);

    const { toDropIds, toShiftIds, shiftDays } = computeBreakDays(
      sessions ?? [],
      breakStart,
      breakEnd,
      mode,
    );

    // Drop sessions in the break window
    if (toDropIds.length > 0) {
      const { error: dropErr } = await supabase
        .from('planned_sessions')
        .update({ status: 'dropped' })
        .in('id', toDropIds);
      if (dropErr) throw new Error(`[scheduleGenerator] applyBreak drop: ${dropErr.message}`);
    }

    // Shift sessions after break window (reschedule mode) — latest-first to avoid unique clashes
    if (mode === 'reschedule' && shiftDays > 0) {
      const sessionsToShift = (sessions ?? []).filter((s) => toShiftIds.includes(s.id));
      for (const s of sessionsToShift) {
        const newDate = _addDaysISO(s.scheduled_date, shiftDays);
        const { error: shiftErr } = await supabase
          .from('planned_sessions')
          .update({ scheduled_date: newDate })
          .eq('id', s.id);
        if (shiftErr) console.warn(`[scheduleGenerator] applyBreak shift ${s.id}:`, shiftErr.message);
      }

      // Extend block.ends_on for each affected block
      for (const blockId of blockIds) {
        const { data: block } = await supabase
          .from('training_blocks')
          .select('ends_on')
          .eq('id', blockId)
          .single();
        if (block?.ends_on) {
          await supabase
            .from('training_blocks')
            .update({ ends_on: _addDaysISO(block.ends_on, shiftDays) })
            .eq('id', blockId);
        }
      }
    }
  }

  // Always record the break — even with no blocks affected
  const { error: insertErr } = await supabase.from('training_breaks').insert({
    user_id:     userId,
    break_start: breakStart,
    break_end:   breakEnd,
    mode,
    block_ids:   blockIds,
  });
  if (insertErr) throw new Error(`[scheduleGenerator] applyBreak record: ${insertErr.message}`);
}

function _daysBetween(startISO: string, endISO: string): number {
  const s = new Date(startISO + 'T00:00:00Z');
  const e = new Date(endISO   + 'T00:00:00Z');
  return Math.round((e.getTime() - s.getTime()) / 86400000);
}

function _addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function mondayOf(isoDate: string): Date {
  const [y, m, day] = isoDate.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, day));
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return d;
}

function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

function toISO(d: Date): string {
  return d.toISOString().split('T')[0];
}
