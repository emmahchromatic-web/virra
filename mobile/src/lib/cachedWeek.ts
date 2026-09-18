/**
 * This week's sessions as the phone last saved them. Card 295.
 *
 * Planned sessions persist on the device (`virra:sessions:v1`, the store card
 * 258 reads to start a workout offline), so with no signal the Training tab can
 * still say what the week holds instead of claiming there is no plan.
 */

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface CachedWeekRow {
  id:       string;
  date:     string;
  dayLabel: string;
  label:    string | null;
  modality: string;
  status:   string;
  isToday:  boolean;
}

/** Local YYYY-MM-DD of the Monday of the week containing `d`. */
export function mondayOfLocal(d: Date): string {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = m.getDay();
  m.setDate(m.getDate() + (dow === 0 ? -6 : 1 - dow));
  return m.toLocaleDateString('en-CA');
}

export function cachedWeekRows(
  days: Array<{ date: string; sessions: Array<{ id: string; session_label: string | null; modality: string; status: string }> }>,
  now: Date,
): CachedWeekRow[] {
  const today = now.toLocaleDateString('en-CA');
  const rows: CachedWeekRow[] = [];
  for (const day of days) {
    const [y, m, d] = day.date.split('-').map(Number);
    const dayLabel = DAY_LABELS[new Date(y, m - 1, d).getDay()];
    for (const s of day.sessions) {
      // Moved and dropped sessions are not part of the week any more.
      if (s.status === 'moved' || s.status === 'dropped') continue;
      rows.push({
        id: s.id, date: day.date, dayLabel, label: s.session_label,
        modality: s.modality, status: s.status, isToday: day.date === today,
      });
    }
  }
  return rows;
}
