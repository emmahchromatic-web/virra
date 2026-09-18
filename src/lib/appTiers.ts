// Card 314. What is free in the VIRRA app and what is Virra Pro.
//
// The source of truth is the app's own paywall: PAYWALL_FREE_LIST and
// PAYWALL_PRO_LIST in mobile/src/lib/pro.ts. The site and the app are separate
// packages, so the lists are mirrored here rather than imported. Do not
// paraphrase them. `node tools/check-tier-copy.mjs` fails when they drift.
export const FREE_LIST = [
  'Cycle logging and your phase, every day',
  'Meal logging with daily totals',
  'Runs and workouts, logged or imported from Apple Health',
  'Weight tracking and a daily check-in',
];

export const PRO_LIST = [
  'Cycle-adjusted training plans (5K → marathon)',
  'Nutrition targets that shift with your phase',
  'Strength and mobility programmes that follow your cycle',
  'A recipe book that matches your phase and your targets',
  'Insights and check-in trends',
  'Describe a meal and Virra estimates it',
];

export const PRICE = {
  monthly: '£9.99',
  annual:  '£99',
  trial:   '14-day free trial',
};

export const FAQ = [
  {
    q: 'What is free?',
    a: 'Logging. Your cycle and your phase, what you eat with daily totals, your runs and workouts (by hand, with GPS, or straight from Apple Health), your weight and a daily check-in. Free for as long as you like, with no card.',
  },
  {
    q: 'What happens when my trial ends?',
    a: 'A trial renews into Virra Pro unless you cancel it in your App Store settings at least 24 hours before it ends. If you cancel, you keep everything you have logged and logging stays free. The plans, targets, programmes and recipes lock until you come back.',
  },
  {
    q: 'Can I have a second free trial?',
    a: 'No. Apple offers the free trial once per Apple ID. If you have had one, the app offers the subscription without a trial.',
  },
];
