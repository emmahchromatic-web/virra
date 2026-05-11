import { supabase } from './supabase';

export const DAY_TEMPLATES: Record<number, number[]> = {
  1: [0],
  2: [0, 3],
  3: [0, 2, 5],
  4: [0, 2, 4, 6],
  5: [0, 1, 3, 4, 6],
  6: [0, 1, 2, 4, 5, 6],
  7: [0, 1, 2, 3, 4, 5, 6],
};

// Returns a default label→day mapping for a plan's sessions_json.
// Maintains the same ordering (regulars first, anchor-last sessions last)
// and spreads them across the week using DAY_TEMPLATES.
export function computeDefaultDayAssignment(sessionsJson: WeekSession[]): Record<string, number> {
  const seen:    Set<string>    = new Set();
  const ordered: string[]       = [];
  for (const week of sessionsJson) {
    const anchors  = week.sessions.filter((s) => ANCHOR_LAST.has(s));
    const regulars = week.sessions.filter((s) => !ANCHOR_LAST.has(s));
    for (const label of [...regulars, ...anchors]) {
      if (!seen.has(label)) { seen.add(label); ordered.push(label); }
    }
  }
  const template = DAY_TEMPLATES[Math.min(ordered.length, 7)] ??
    Array.from({ length: ordered.length }, (_, i) => i);
  return Object.fromEntries(ordered.map((label, i) => [label, template[i]]));
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
}

export function generateSchedule(
  userId:       string,
  blockId:      string,
  modality:     string,
  startsOn:     string,
  sessionsJson: WeekSession[],
  dayOverrides?: Record<string, number>,
): PlannedSessionInsert[] {
  const origin = mondayOf(startsOn);
  const rows: PlannedSessionInsert[] = [];

  sessionsJson.forEach((week, weekIndex) => {
    const sessions = [...week.sessions];
    if (sessions.length === 0) return;
    const anchors  = sessions.filter((s) => ANCHOR_LAST.has(s));
    const regulars = sessions.filter((s) => !ANCHOR_LAST.has(s));
    const ordered  = [...regulars, ...anchors];
    const template = DAY_TEMPLATES[Math.min(ordered.length, 7)] ??
      Array.from({ length: ordered.length }, (_, i) => i);

    // Build day assignment: overrides take priority; remaining sessions fill free template slots
    const dayMap: Record<string, number> = {};
    if (dayOverrides) {
      const takenDays = new Set(
        ordered.filter((l) => dayOverrides[l] !== undefined).map((l) => dayOverrides[l]),
      );
      const freeDays = template.filter((d) => !takenDays.has(d));
      let freeIdx = 0;
      ordered.forEach((label) => {
        dayMap[label] = dayOverrides[label] ?? freeDays[freeIdx++] ?? template[template.length - 1];
      });
    } else {
      ordered.forEach((label, i) => { dayMap[label] = template[i]; });
    }

    ordered.forEach((label) => {
      const dayOfWeek = dayMap[label];
      const date      = addDays(origin, weekIndex * 7 + dayOfWeek);
      rows.push({
        user_id:        userId,
        block_id:       blockId,
        scheduled_date: toISO(date),
        week_number:    week.week,
        day_of_week:    dayOfWeek,
        modality,
        session_label:  label,
        status:         'planned',
      });
    });
  });
  return rows;
}

export async function generateAndSaveSchedule(
  userId:        string,
  blockId:       string,
  modality:      string,
  startsOn:      string,
  sessionsJson:  WeekSession[],
  dayOverrides?: Record<string, number>,
): Promise<void> {
  if (!sessionsJson.length) return;
  const rows = generateSchedule(userId, blockId, modality, startsOn, sessionsJson, dayOverrides);
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from('planned_sessions').insert(rows.slice(i, i + 200));
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
    .select('week_number, modality, session_label, block_id')
    .eq('id', sessionId)
    .single();
  if (fetchErr || !orig) throw new Error(fetchErr?.message ?? 'Session not found');

  const [ny, nm, nd] = newDate.split('-').map(Number);
  const jsDay  = new Date(Date.UTC(ny, nm - 1, nd)).getUTCDay();
  const newDow = jsDay === 0 ? 6 : jsDay - 1;

  const { data: newRow, error: insertErr } = await supabase
    .from('planned_sessions')
    .insert({
      user_id:        userId,
      block_id:       orig.block_id,
      scheduled_date: newDate,
      week_number:    orig.week_number,
      day_of_week:    newDow,
      modality:       orig.modality,
      session_label:  orig.session_label,
      status:         'planned',
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
  if (blockIds.length === 0) return;

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
    if (dropErr) console.warn('[scheduleGenerator] applyBreak drop:', dropErr.message);
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

  // Record the break
  await supabase.from('training_breaks').insert({
    user_id:     userId,
    break_start: breakStart,
    break_end:   breakEnd,
    mode,
    block_ids:   blockIds,
  });
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
