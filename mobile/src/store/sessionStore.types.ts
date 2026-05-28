import type { Modality } from '@/lib/dayState';

export type DateISO = string;     // 'YYYY-MM-DD' in user's local timezone
export type SessionId = string;   // planned_sessions.id

export type SessionStatus = 'planned' | 'completed' | 'dropped' | 'moved';

export interface PlannedSessionRow {
  id:                  SessionId;
  scheduled_date:      DateISO;
  modality:            Modality;
  session_label:       string | null;
  status:              SessionStatus;
  block_id:            string | null;
  activity_id:         string | null;
  moved_to_id:         SessionId | null;
  week_number:         number;
  day_of_week:         number;
  run_structure?:      unknown;
  strength_structure?: unknown;
  created_at?:         string;
}

export interface LoadedRange {
  from:      DateISO;
  to:        DateISO;
  fetchedAt: number;             // Date.now() at completion of fetch
}

export interface SessionStoreState {
  byId:         Record<SessionId, PlannedSessionRow>;
  idsByDate:    Record<DateISO, SessionId[]>;
  loadedRanges: LoadedRange[];
  fetching:     Set<string>;     // range keys 'YYYY-MM-DD..YYYY-MM-DD' in flight
  hasHydrated:  boolean;
  lastError:    { at: number; op: string; message: string } | null;
}

export interface SessionStoreActions {
  // lifecycle
  ensureLoaded(from: DateISO, to: DateISO): Promise<void>;
  refresh(from: DateISO, to: DateISO):      Promise<void>;

  // mutations
  markComplete(sessionId: SessionId, activityId: string): Promise<void>;
  dropSession(sessionId: SessionId):                      Promise<void>;
  moveSession(sessionId: SessionId, newDate: DateISO):    Promise<SessionId>;
  linkActivity(activityId: string, sessionId: SessionId): Promise<void>;

  // background reconciliation
  reconcileFromActivities(): Promise<{ linked: number }>;

  // diagnostics
  clearCache(): Promise<void>;
}

export type SessionStore = SessionStoreState & SessionStoreActions;
