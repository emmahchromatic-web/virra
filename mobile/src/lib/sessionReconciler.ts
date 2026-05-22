import { supabase } from './supabase';
import { _commitLink } from './scheduleGenerator';
import { sessionTarget, matchActivityToSession, type MatchSession, type MatchActivity } from './sessionMatcher';

interface ActivityRow {
  id:               string;
  started_at:       string;
  activity_type:    MatchActivity['activity_type'];
  duration_seconds: number;
  distance_meters:  number | null;
}
interface SessionRow extends MatchSession {
  scheduled_date: string;
  created_at:     string;
}

function isoLocal(d: Date): string {
  return d.toLocaleDateString('en-CA'); // YYYY-MM-DD in local zone
}

function shiftISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Date range to reconcile: full year on first install, current Mon-Sun thereafter.
export function reconcileRange(backfillDone: boolean, today: Date): { from: string; to: string } {
  if (!backfillDone) {
    const yearAgo = new Date(today);
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    return { from: isoLocal(yearAgo), to: isoLocal(today) };
  }
  const monday = new Date(today);
  const day = monday.getDay(); // 0=Sun … 6=Sat
  monday.setDate(monday.getDate() + (day === 0 ? -6 : 1 - day));
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  return { from: isoLocal(monday), to: isoLocal(sunday) };
}

// Link unlinked activities to matching planned sessions in [from,to].
// Additive only: turns planned -> completed, never the reverse. Idempotent.
export async function reconcileSessions(userId: string, fromISO: string, toISO: string): Promise<number> {
  const { data: acts, error: aErr } = await supabase
    .from('activities')
    .select('id, started_at, activity_type, duration_seconds, distance_meters')
    .eq('user_id', userId)
    .is('planned_session_id', null)
    .neq('activity_type', 'other')
    .gte('started_at', `${shiftISO(fromISO, -1)}T00:00:00.000Z`)
    .lte('started_at', `${shiftISO(toISO, 1)}T23:59:59.999Z`)
    .order('started_at');
  if (aErr) { console.warn('[sessionReconciler] activities', aErr.message); return 0; }
  if (!acts?.length) return 0;

  const { data: sess, error: sErr } = await supabase
    .from('planned_sessions')
    .select('id, scheduled_date, modality, session_label, run_structure, created_at')
    .eq('user_id', userId)
    .gte('scheduled_date', fromISO)
    .lte('scheduled_date', toISO)
    .eq('status', 'planned')
    .order('created_at');
  if (sErr) { console.warn('[sessionReconciler] sessions', sErr.message); return 0; }
  if (!sess?.length) return 0;

  // Index unconsumed planned sessions by `${localDate}|${modality}`.
  const byKey = new Map<string, SessionRow[]>();
  for (const s of sess as SessionRow[]) {
    const k = `${s.scheduled_date}|${s.modality}`;
    const arr = byKey.get(k);
    if (arr) arr.push(s);
    else byKey.set(k, [s]);
  }

  let linked = 0;
  for (const a of acts as ActivityRow[]) {
    const k = `${isoLocal(new Date(a.started_at))}|${a.activity_type}`;
    const pool = byKey.get(k);
    if (!pool?.length) continue;
    const candidates = pool.map(sessionTarget);
    const matchedId = matchActivityToSession(
      { activity_type: a.activity_type, duration_seconds: a.duration_seconds, distance_meters: a.distance_meters },
      candidates,
    );
    if (!matchedId) continue;
    await _commitLink(matchedId, a.id);
    byKey.set(k, pool.filter((s) => s.id !== matchedId)); // consume so it isn't reused this pass
    linked++;
  }
  return linked;
}
