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

export interface ProposedLink { activityId: string; sessionId: string; }

// Pure matching step: given activities + sessions, return the proposed
// activity→session links using local-date + modality keying and the existing
// sessionTarget / matchActivityToSession scoring. No I/O; safe to reuse from
// the sessionStore optimistic-update path.
export function proposeLinks(activities: ActivityRow[], sessions: SessionRow[]): ProposedLink[] {
  const byKey = new Map<string, SessionRow[]>();
  for (const s of sessions) {
    const k = `${s.scheduled_date}|${s.modality}`;
    const arr = byKey.get(k);
    if (arr) arr.push(s);
    else byKey.set(k, [s]);
  }

  const out: ProposedLink[] = [];
  for (const a of activities) {
    // Match on the activity's LOCAL calendar day; that's the day the user
    // perceives they trained, and scheduled_date is a tz-agnostic calendar
    // label. Do NOT switch this to the UTC date: it would mislink evening
    // workouts in negative-UTC zones to the next day's session.
    const k = `${isoLocal(new Date(a.started_at))}|${a.activity_type}`;
    const pool = byKey.get(k);
    if (!pool?.length) continue;
    const candidates = pool.map(sessionTarget);
    const matchedId = matchActivityToSession(
      { activity_type: a.activity_type, duration_seconds: a.duration_seconds, distance_meters: a.distance_meters },
      candidates,
    );
    if (!matchedId) continue;
    out.push({ activityId: a.id, sessionId: matchedId });
    byKey.set(k, pool.filter((s) => s.id !== matchedId)); // consume so it isn't reused this pass
  }
  return out;
}

// Link unlinked activities to matching planned sessions in [from,to].
// Additive only: turns planned -> completed, never the reverse. Idempotent.
export async function reconcileSessions(userId: string, fromISO: string, toISO: string): Promise<number> {
  // started_at is a UTC instant; the window is built from local calendar dates.
  // Widen by ±1 day so a workout whose UTC instant sits just outside [from,to]
  // but whose *local* day is inside still gets fetched. Precise day-matching
  // happens below against each activity's local calendar date.
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

  const links = proposeLinks(acts as ActivityRow[], sess as SessionRow[]);
  for (const { sessionId, activityId } of links) {
    await _commitLink(sessionId, activityId);
  }
  return links.length;
}
