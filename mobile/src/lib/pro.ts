// Card 298. The free tier's one rule: anything where she puts data in is
// free; anything where Virra interprets or prescribes is Virra Pro. This file
// is the single list of what "prescribes" means, so a locked tile, the
// paywall kicker and a test all read the same words.
import { useSubscriptionStore } from '@/store/subscription';

export type ProFeature =
  | 'plans'
  | 'strength'
  | 'mobility'
  | 'nutrition_targets'
  | 'recipes'
  | 'insights'
  | 'trends'
  | 'describe_meal'
  | 'week_ahead'
  | 'season';

export interface ProFeatureCopy {
  /** Short uppercase kicker for a locked tile and the paywall. */
  kicker: string;
  /** One line on what the feature does, in the app's voice. */
  body:   string;
}

export const PRO_FEATURES: Record<ProFeature, ProFeatureCopy> = {
  plans: {
    kicker: 'Training plans',
    body:   'A running plan from 5K to marathon, adjusted to where you are in your cycle.',
  },
  strength: {
    kicker: 'Strength programmes',
    body:   'Strength sessions that follow your cycle, with a guided set and rep logger.',
  },
  mobility: {
    kicker: 'Mobility sessions',
    body:   'Ten, twenty or thirty minutes on the mat, picked for your phase.',
  },
  nutrition_targets: {
    kicker: 'Targets that shift with your phase',
    body:   'Calories and macros that move with your cycle and your bodyweight, not a fixed number.',
  },
  recipes: {
    kicker: 'The recipe book',
    body:   'Recipes matched to your phase and to what is left of your targets today.',
  },
  insights: {
    kicker: 'Insights',
    body:   'Your week, narrated: pace, progress and what your cycle did to both.',
  },
  trends: {
    kicker: 'Check-in trends',
    body:   'Energy, mood and sleep across your cycle, so patterns stop being a surprise.',
  },
  describe_meal: {
    kicker: 'Describe a meal',
    body:   'Type what you ate and Virra estimates the calories and macros for you.',
  },
  season: {
    kicker: 'Season planning',
    body:   'Two or more races and Virra builds the season between them: base, build, peak, taper and recovery.',
  },
  week_ahead: {
    kicker: 'The week ahead',
    body:   'Next week planned around your phase: sessions, fuelling and recovery.',
  },
};

export function isProFeature(value: unknown): value is ProFeature {
  return typeof value === 'string' && value in PRO_FEATURES;
}

/**
 * True while the `virra_pro` entitlement is active (trial or paid).
 *
 * `unknown` counts as Pro. RevenueCat answers from its local cache within a
 * moment of launch, and the alternative is every subscriber watching her
 * plan turn into a row of padlocks on every cold start. A free user sees
 * the unlocked layout for that same moment instead, which is the cheaper
 * mistake: nothing in it can be acted on before the answer lands.
 */
export function isProStatus(status: string, isActive: boolean): boolean {
  return status === 'unknown' || isActive;
}

export function useIsPro(): boolean {
  return useSubscriptionStore((s) => isProStatus(s.status, s.isActive));
}

/** The paywall route for an upsell from inside the app. Back returns here. */
export function paywallRoute(feature: ProFeature): string {
  return `/(auth)/paywall?from=app&feature=${feature}`;
}

/**
 * The one button that sells Pro. A lapsed subscriber has already used her
 * introductory offer (Apple grants it once per Apple ID per subscription
 * group), so the label cannot promise a trial she will not get.
 */
export function trialEligible(status: string): boolean {
  return status !== 'expired' && status !== 'cancelled';
}

export function proCtaLabel(status: string): string {
  return trialEligible(status) ? 'Start 14-day free trial' : 'Subscribe to Virra Pro';
}

/**
 * What a gated call site needs in one read. `showLocked` is "draw the locked
 * tile here": she is not Pro AND has not hidden Pro features in Profile.
 * `ProScreen` ignores the preference on purpose (a route she reached must
 * say something), so it reads the store directly.
 */
export function useProGate(): { isPro: boolean; showLocked: boolean } {
  const isPro  = useIsPro();
  const show   = useSubscriptionStore((s) => s.showProFeatures);
  return { isPro, showLocked: !isPro && show };
}

/** The paywall's two lists. Free is named so the wall reads as a choice. */
export const PAYWALL_PRO_LIST = [
  'Cycle-adjusted training plans (5K → marathon)',
  'Nutrition targets that shift with your phase',
  'Strength and mobility programmes that follow your cycle',
  'A recipe book that matches your phase and your targets',
  'Insights and check-in trends',
  'Describe a meal and Virra estimates it',
];

export const PAYWALL_FREE_LIST = [
  'Cycle logging and your phase, every day',
  'Meal logging with daily totals',
  'Runs and workouts, logged or imported from Apple Health',
  'Weight tracking and a daily check-in',
];
