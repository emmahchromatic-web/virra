// Card 298. The free tier's line, in one place.
import { isProStatus, proCtaLabel, trialEligible, paywallRoute, isProFeature, PRO_FEATURES } from '@/lib/pro';
import { resolveTargetsForTier, getNutritionTargets, resolveNutritionTargets } from '@/lib/nutritionTargets';

describe('isProStatus', () => {
  it('is Pro while the entitlement is active (trial or paid)', () => {
    expect(isProStatus('trial',  true)).toBe(true);
    expect(isProStatus('active', true)).toBe(true);
  });

  it('is not Pro on the free tier or after lapsing', () => {
    expect(isProStatus('free',      false)).toBe(false);
    expect(isProStatus('expired',   false)).toBe(false);
    expect(isProStatus('cancelled', false)).toBe(false);
  });

  it('treats unknown as Pro so a subscriber never sees padlocks on cold start', () => {
    expect(isProStatus('unknown', false)).toBe(true);
  });
});

describe('the one CTA', () => {
  it('promises a trial only to someone who can still get one', () => {
    expect(trialEligible('free')).toBe(true);
    expect(trialEligible('unknown')).toBe(true);
    expect(trialEligible('expired')).toBe(false);
    expect(trialEligible('cancelled')).toBe(false);
    expect(proCtaLabel('free')).toBe('Start 14-day free trial');
    expect(proCtaLabel('expired')).toBe('Subscribe to Virra Pro');
  });
});

describe('paywall route + feature copy', () => {
  it('names the feature so the paywall can say why she is there', () => {
    expect(paywallRoute('plans')).toBe('/(auth)/paywall?from=app&feature=plans');
  });

  it('only accepts known features from a route param', () => {
    expect(isProFeature('recipes')).toBe(true);
    expect(isProFeature('nope')).toBe(false);
    expect(isProFeature(undefined)).toBe(false);
  });

  it('every feature has a kicker and a body', () => {
    for (const copy of Object.values(PRO_FEATURES)) {
      expect(copy.kicker.length).toBeGreaterThan(0);
      expect(copy.body.length).toBeGreaterThan(0);
    }
  });
});

describe('resolveTargetsForTier', () => {
  const metrics = { weightKg: 62, heightCm: 168, age: 30, sex: 'female' as const };

  it('gives the free tier the flat table whatever the phase or bodyweight', () => {
    expect(resolveTargetsForTier(false, metrics, 'luteal', 'easy')).toEqual(getNutritionTargets(null, 'easy'));
    expect(resolveTargetsForTier(false, null, 'follicular', 'hard')).toEqual(getNutritionTargets(null, 'hard'));
  });

  it('gives Pro the phase-shifting, personalised target', () => {
    expect(resolveTargetsForTier(true, metrics, 'luteal', 'easy')).toEqual(resolveNutritionTargets(metrics, 'luteal', 'easy'));
    expect(resolveTargetsForTier(true, metrics, 'luteal', 'easy')).not.toEqual(getNutritionTargets(null, 'easy'));
  });
});

describe('paywall lists', () => {
  const { PAYWALL_PRO_LIST, PAYWALL_FREE_LIST } = require('@/lib/pro');
  it('names what is free as well as what is Pro', () => {
    expect(PAYWALL_FREE_LIST.length).toBeGreaterThan(0);
    expect(PAYWALL_FREE_LIST.join(' ')).toMatch(/Cycle logging/);
    expect(PAYWALL_PRO_LIST.join(' ')).toMatch(/training plans/);
    // Free things must not be sold as Pro.
    expect(PAYWALL_PRO_LIST.join(' ')).not.toMatch(/HealthKit|Apple Health|Daily dashboard/);
  });
});
