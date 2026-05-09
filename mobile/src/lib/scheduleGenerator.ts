import { supabase } from './supabase';

const DAY_TEMPLATES: Record<number, number[]> = {
  1: [0],
  2: [0, 3],
  3: [0, 2, 5],
  4: [0, 2, 4, 6],
  5: [0, 1, 3, 4, 6],
  6: [0, 1, 2, 4, 5, 6],
  7: [0, 1, 2, 3, 4, 5, 6],
};

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
): PlannedSessionInsert[] {
  const origin = mondayOf(startsOn);
  const rows: PlannedSessionInsert[] = [];

  sessionsJson.forEach((week, weekIndex) => {
    const sessions = [...week.sessions];
    if (sessions.length === 0) return;
    const template = DAY_TEMPLATES[Math.min(sessions.length, 7)] ??
      Array.from({ length: sessions.length }, (_, i) => i);
    const anchors  = sessions.filter((s) => ANCHOR_LAST.has(s));
    const regulars = sessions.filter((s) => !ANCHOR_LAST.has(s));
    const ordered  = [...regulars, ...anchors];

    ordered.forEach((label, i) => {
      const dayOffset = weekIndex * 7 + template[i];
      const date      = addDays(origin, dayOffset);
      rows.push({
        user_id:        userId,
        block_id:       blockId,
        scheduled_date: toISO(date),
        week_number:    week.week,
        day_of_week:    template[i],
        modality,
        session_label:  label,
        status:         'planned',
      });
    });
  });
  return rows;
}

export async function generateAndSaveSchedule(
  userId:       string,
  blockId:      string,
  modality:     string,
  startsOn:     string,
  sessionsJson: WeekSession[],
): Promise<void> {
  if (!sessionsJson.length) return;
  const rows = generateSchedule(userId, blockId, modality, startsOn, sessionsJson);
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
