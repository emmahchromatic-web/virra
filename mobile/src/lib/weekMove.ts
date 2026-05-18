export const OVERLOAD_THRESHOLD = 2;

interface DateRow {
  scheduled_date: string;
}

export function groupSessionsByDay<T extends DateRow>(
  rows: T[],
  weekDates: string[],
): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const d of weekDates) groups[d] = [];
  for (const r of rows) {
    if (groups[r.scheduled_date]) groups[r.scheduled_date].push(r);
  }
  return groups;
}

export interface RowBounds {
  top:    number;
  bottom: number;
}

export function findRowAtY(
  bounds: Record<string, RowBounds>,
  y:      number,
): string | null {
  for (const [date, b] of Object.entries(bounds)) {
    if (y >= b.top && y < b.bottom) return date;
  }
  return null;
}

export function isOverloaded<T>(groups: Record<string, T[]>): boolean {
  for (const date in groups) {
    if (groups[date].length > OVERLOAD_THRESHOLD) return true;
  }
  return false;
}
