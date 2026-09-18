// Card 312. The RevenueCat webhook's mapping, tested without Deno.
import { rowFromEvent, isStale } from '../../supabase/functions/_shared/rcEvent';

const USER = '5f3a1c2e-9b4d-4e6f-8a7b-0c1d2e3f4a5b';
const NOW  = Date.parse('2026-09-18T10:00:00Z');
const later  = NOW + 14 * 86400_000;
const earlier = NOW - 3600_000;

const base = (over: Record<string, unknown> = {}) => ({
  type: 'INITIAL_PURCHASE',
  app_user_id: USER,
  entitlement_ids: ['virra_pro'],
  period_type: 'TRIAL',
  product_id: 'com.pauldickenson.virra.pro.month',
  store: 'APP_STORE',
  environment: 'SANDBOX',
  expiration_at_ms: later,
  event_timestamp_ms: NOW,
  ...over,
});

describe('rowFromEvent', () => {
  it('a trial start is active until its expiry', () => {
    const row = rowFromEvent(base(), NOW)!;
    expect(row).toMatchObject({
      user_id: USER, entitlement: 'virra_pro', is_active: true, period_type: 'TRIAL',
      last_event_type: 'INITIAL_PURCHASE', source: 'revenuecat',
    });
    expect(row.expires_at).toBe(new Date(later).toISOString());
  });

  it('CANCELLATION keeps access until the period ends: auto-renew off is not access off', () => {
    expect(rowFromEvent(base({ type: 'CANCELLATION' }), NOW)!.is_active).toBe(true);
  });

  it('EXPIRATION ends access, and so does a period that is already over', () => {
    expect(rowFromEvent(base({ type: 'EXPIRATION', expiration_at_ms: earlier }), NOW)!.is_active).toBe(false);
    expect(rowFromEvent(base({ type: 'RENEWAL', expiration_at_ms: earlier }), NOW)!.is_active).toBe(false);
  });

  it('RENEWAL and UNCANCELLATION with a future expiry are active', () => {
    expect(rowFromEvent(base({ type: 'RENEWAL', period_type: 'NORMAL' }), NOW)!.is_active).toBe(true);
    expect(rowFromEvent(base({ type: 'UNCANCELLATION' }), NOW)!.is_active).toBe(true);
  });

  it('ignores test pings, anonymous ids and other entitlements', () => {
    expect(rowFromEvent(base({ type: 'TEST' }), NOW)).toBeNull();
    expect(rowFromEvent(base({ app_user_id: '$RCAnonymousID:abc123' }), NOW)).toBeNull();
    expect(rowFromEvent(base({ app_user_id: null }), NOW)).toBeNull();
    expect(rowFromEvent(base({ entitlement_ids: ['something_else'] }), NOW)).toBeNull();
  });

  it('an event with no entitlement list is still written (RevenueCat omits it on some types)', () => {
    expect(rowFromEvent(base({ entitlement_ids: null }), NOW)).not.toBeNull();
  });

  it('a promotional grant with no expiry is active', () => {
    const row = rowFromEvent(base({ store: 'PROMOTIONAL', period_type: 'PROMOTIONAL', expiration_at_ms: null }), NOW)!;
    expect(row.is_active).toBe(true);
    expect(row.expires_at).toBeNull();
  });

  it('normalises the user id to lower case so it matches auth.users', () => {
    expect(rowFromEvent(base({ app_user_id: USER.toUpperCase() }), NOW)!.user_id).toBe(USER);
  });
});

describe('isStale', () => {
  it('an older event never overwrites a newer row', () => {
    const row = rowFromEvent(base({ event_timestamp_ms: earlier }), NOW)!;
    expect(isStale(row, new Date(NOW).toISOString())).toBe(true);
    expect(isStale(row, new Date(earlier - 1).toISOString())).toBe(false);
    expect(isStale(row, null)).toBe(false);
  });
});
