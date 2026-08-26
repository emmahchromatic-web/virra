import * as Sentry from '@sentry/react-native';

// Female-health fields that must never leave the device inside a crash report,
// even though Sentry doesn't capture user data unless we explicitly attach it —
// this is defence in depth for breadcrumbs/extra that come from raw Supabase rows.
const SENSITIVE_KEYS = [
  'period_start', 'cycle_length_days', 'cycle_length', 'phase', 'phase_at_time',
  'symptoms', 'energy', 'mood', 'sleep_quality', 'food_name', 'weight_kg',
  'carbs_g', 'protein_g', 'fat_g', 'calories', 'notes',
];

const REDACTED = '[redacted]';

export function scrubSensitiveData<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => scrubSensitiveData(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEYS.includes(key) ? REDACTED : scrubSensitiveData(val);
    }
    return out as T;
  }
  return value;
}

function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.extra) event.extra = scrubSensitiveData(event.extra);
  if (event.contexts) event.contexts = scrubSensitiveData(event.contexts);
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((crumb) => (
      crumb.data ? { ...crumb, data: scrubSensitiveData(crumb.data) } : crumb
    ));
  }
  return event;
}

// Only reports from release-mode (TestFlight/production) builds that carry a
// DSN — local dev and internal test builds stay silent by omission.
export function initSentry(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (__DEV__ || !dsn) return;

  const environment = process.env.EXPO_PUBLIC_INTERNAL_BUILD === 'true' ? 'testflight' : 'production';

  Sentry.init({
    dsn,
    environment,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => (
      breadcrumb.data ? { ...breadcrumb, data: scrubSensitiveData(breadcrumb.data) } : breadcrumb
    ),
    tracesSampleRate: 0,
  });
}
