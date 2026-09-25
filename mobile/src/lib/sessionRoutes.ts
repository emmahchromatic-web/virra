import { isLocalActivityId } from '@/store/localActivity';

/**
 * Where tapping a session should go.
 *
 * Card 319: until now the only ways into a session were the dashboard hero's
 * play button and the tab bar's centre button, and each screen spelled the
 * destination out for itself. Tapping a session anywhere else did nothing at
 * all, which on the Training tab meant the whole list was inert.
 *
 * One place decides, so the rules cannot drift apart again:
 *
 * - a finished session opens the activity it produced, NOT the logger. Sending
 *   someone back into the logger for a workout they have already done invites
 *   them to log it twice.
 * - a run goes to the tracker, everything else to the workout screen.
 *
 * An activity finished offline carries a placeholder id until the queue drains
 * (see `isLocalActivityId`). There is no activity row to open yet, so the
 * session keeps its own screen rather than routing to a page that would 404.
 */
export interface RoutableSession {
  id:          string;
  modality:    string;
  status:      string;
  activity_id?: string | null;
}

export function sessionRoute(session: RoutableSession): string {
  const { id, modality, status, activity_id } = session;

  if (status === 'completed' && activity_id && !isLocalActivityId(activity_id)) {
    return `/(app)/activity/${activity_id}`;
  }

  return modality === 'run'
    ? `/(app)/run?sessionId=${id}`
    : `/(app)/workout-preview?sessionId=${id}`;
}
