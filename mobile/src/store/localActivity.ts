/**
 * The marker on an activity id that exists only on this phone.
 *
 * A workout finished with no signal is queued, so there is no server activity
 * to point at yet. The session is marked completed straight away with a
 * placeholder id carrying this prefix, and the outbox swaps in the real one
 * when the queue drains.
 *
 * It lives in its own module so that code which only needs to ASK whether an id
 * is a placeholder (route decisions, card 319) does not have to import the
 * session store, and with it the network stack, to find out.
 */
export const LOCAL_ACTIVITY_PREFIX = 'local_';

/** True for an activity id that has not reached the server yet. */
export function isLocalActivityId(activityId: string | null | undefined): boolean {
  return typeof activityId === 'string' && activityId.startsWith(LOCAL_ACTIVITY_PREFIX);
}
