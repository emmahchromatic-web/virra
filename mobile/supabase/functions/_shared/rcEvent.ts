// Card 312. Turns a RevenueCat webhook event into a user_subscriptions row.
// Pure and Deno-free so it can be unit-tested with the app's Jest.
//
// RevenueCat sends every event as { api_version, event: {...} }. The fields we
// read are stable across their v1 webhook payload:
//   type              INITIAL_PURCHASE | RENEWAL | CANCELLATION | UNCANCELLATION |
//                     EXPIRATION | BILLING_ISSUE | PRODUCT_CHANGE | TRANSFER |
//                     SUBSCRIPTION_PAUSED | SUBSCRIPTION_EXTENDED | TEST | ...
//   app_user_id       our Supabase user id (configureRevenueCat(userId))
//   entitlement_ids   ['virra_pro']
//   period_type       TRIAL | NORMAL | INTRO | PROMOTIONAL
//   expiration_at_ms  when the current period ends (null for non-subscriptions)
//   event_timestamp_ms

export const ENTITLEMENT_ID = 'virra_pro';

export interface RcEvent {
  type:               string;
  app_user_id?:       string | null;
  entitlement_ids?:   string[] | null;
  period_type?:       string | null;
  product_id?:        string | null;
  store?:             string | null;
  environment?:       string | null;
  expiration_at_ms?:  number | null;
  event_timestamp_ms?: number | null;
}

export interface SubscriptionRow {
  user_id:         string;
  entitlement:     string;
  is_active:       boolean;
  period_type:     string | null;
  product_id:      string | null;
  store:           string | null;
  environment:     string | null;
  expires_at:      string | null;   // ISO
  last_event_type: string;
  last_event_at:   string;          // ISO
  source:          'revenuecat';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Events that say nothing about whether she holds the entitlement right now.
const IGNORED = new Set(['TEST', 'SUBSCRIBER_ALIAS', 'TRANSFER']);

/**
 * null means "nothing to write": a test ping, an anonymous RevenueCat id we
 * cannot map to a user, or an event about some other entitlement.
 */
export function rowFromEvent(event: RcEvent, nowMs: number = Date.now()): SubscriptionRow | null {
  if (!event || IGNORED.has(event.type)) return null;

  const userId = event.app_user_id ?? '';
  if (!UUID.test(userId)) return null;

  const ents = event.entitlement_ids ?? [];
  if (ents.length > 0 && !ents.includes(ENTITLEMENT_ID)) return null;

  const expiresMs = typeof event.expiration_at_ms === 'number' ? event.expiration_at_ms : null;

  // Active unless the event is the one that ends access, or the period it
  // describes is already over. CANCELLATION only turns auto-renew off; she
  // keeps access until expiration_at_ms, and EXPIRATION arrives then.
  const ended    = event.type === 'EXPIRATION';
  const isActive = !ended && (expiresMs === null || expiresMs > nowMs);

  return {
    user_id:         userId.toLowerCase(),
    entitlement:     ENTITLEMENT_ID,
    is_active:       isActive,
    period_type:     event.period_type ?? null,
    product_id:      event.product_id ?? null,
    store:           event.store ?? null,
    environment:     event.environment ?? null,
    expires_at:      expiresMs === null ? null : new Date(expiresMs).toISOString(),
    last_event_type: event.type,
    last_event_at:   new Date(event.event_timestamp_ms ?? nowMs).toISOString(),
    source:          'revenuecat',
  };
}

/** Webhooks can arrive out of order; an older event must not undo a newer row. */
export function isStale(row: SubscriptionRow, existingLastEventAt: string | null | undefined): boolean {
  if (!existingLastEventAt) return false;
  return new Date(row.last_event_at).getTime() < new Date(existingLastEventAt).getTime();
}
