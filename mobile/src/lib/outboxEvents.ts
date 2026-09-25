/**
 * What the outbox announces once a queued write has actually landed.
 *
 * Card 253. A workout finished with no signal is marked completed on the phone
 * straight away, with a placeholder activity id, and queued. When the queue
 * drains, the screens holding that placeholder need the real id — otherwise
 * the Training tab, which reads the cached week and stays mounted as a tab,
 * goes on saying TO DO while the dashboard, which re-queries on focus, says
 * DONE. Same session, two answers, until the app is killed.
 *
 * It lives apart from both the outbox and the session store on purpose:
 *
 * - the store already imports the outbox (to queue its own drops and moves),
 *   so a handler importing the store would close a cycle at module-init time;
 * - a leaf module with no imports of its own can be imported by either side
 *   without one mocking the other out from under it in tests.
 */
type SessionCompletedListener = (sessionId: string, activityId: string) => void;

let listener: SessionCompletedListener | null = null;

/** Register the one listener. Passing null unregisters, which tests rely on. */
export function setSessionCompletedListener(fn: SessionCompletedListener | null): void {
  listener = fn;
}

/**
 * Announce that a queued completion reached the server.
 *
 * Best-effort by design: a listener that throws must not fail the drain. The
 * server is already right either way, and the cache catches up on the next
 * refresh — a stale pill is never worth re-queueing a workout that landed.
 */
export function notifySessionCompleted(sessionId: string, activityId: string): void {
  try {
    listener?.(sessionId, activityId);
  } catch (e) {
    console.warn('[outbox] session-completed listener threw', e);
  }
}
