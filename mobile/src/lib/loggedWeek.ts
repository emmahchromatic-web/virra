// Card 298. The free tier's week: what she actually did, not what Virra
// planned. On Pro the dashboard strip is the plan's week (planned, completed,
// missed). Off Pro there is no plan to show, so the strip is built from the
// activities table instead: every run and workout she logged or that came in
// from Apple Health. Logging is free, so seeing it back is free too.
import { deriveDayState, type DayState, type Modality } from '@/lib/dayState';

export interface LoggedActivity {
  activity_type: string;
  sub_type?:     string | null;
  started_at:    string; // ISO timestamp
}

/** activities.activity_type is coarser than the strip's icons; sub_type fills the gap. */
export function modalityOf(a: Pick<LoggedActivity, 'activity_type' | 'sub_type'>): Modality {
  switch (a.activity_type) {
    case 'run':      return 'run';
    case 'swim':     return 'swim';
    case 'strength': return 'strength';
    case 'yoga':     return 'yoga';
  }
  switch (a.sub_type) {
    case 'cycle':
    case 'handcycle': return 'cycle';
    case 'hike':
    case 'walk':      return 'hike';
  }
  return 'other';
}

function localISO(d: Date): string {
  return d.toLocaleDateString('en-CA');
}

/** The seven local dates of the week starting on `mondayISO` (YYYY-MM-DD). */
export function weekDates(mondayISO: string): string[] {
  const [y, m, d] = mondayISO.split('-').map(Number);
  return Array.from({ length: 7 }, (_, i) => localISO(new Date(y, m - 1, d + i)));
}

/**
 * Seven day states, Monday first. A day she did something is `completed`
 * (or `completed_multi`); a day she did not is `rest`. Never `missed` or
 * `planned`: nothing was asked of her, so nothing can be missed.
 */
export function loggedWeekStates(activities: LoggedActivity[], mondayISO: string): DayState[] {
  return weekDates(mondayISO).map((date) => {
    const that = activities
      .filter((a) => localISO(new Date(a.started_at)) === date)
      .map((a) => ({ status: 'completed', modality: modalityOf(a) }));
    return deriveDayState(that, true);
  });
}
