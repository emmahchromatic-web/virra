import { withinHrBackfillWindow, HR_BACKFILL_WINDOW_DAYS } from '@/lib/healthKitImport';

const NOW = new Date('2026-08-30T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000);

describe('withinHrBackfillWindow — card 044', () => {
  it('fetches heart rate for a run from this week', () => {
    expect(withinHrBackfillWindow(daysAgo(2), NOW)).toBe(true);
  });

  it('stops at the window edge', () => {
    expect(withinHrBackfillWindow(daysAgo(HR_BACKFILL_WINDOW_DAYS), NOW)).toBe(true);
    expect(withinHrBackfillWindow(daysAgo(HR_BACKFILL_WINDOW_DAYS + 1), NOW)).toBe(false);
  });

  it('skips a year-old workout, so a first sync is not a year of HK queries', () => {
    // The import loop runs this once per workout and each lookup is its own
    // HealthKit query with its own timeout. Older runs keep null HR, which is
    // exactly what they have today, so nothing regresses.
    expect(withinHrBackfillWindow(daysAgo(365), NOW)).toBe(false);
  });

  it('handles a workout dated slightly in the future without excluding it', () => {
    // Clock skew between the watch and the phone is real and small.
    expect(withinHrBackfillWindow(new Date(NOW.getTime() + 60_000), NOW)).toBe(true);
  });
});
