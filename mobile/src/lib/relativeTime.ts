// Returns a Space-Mono-friendly uppercase relative time string for the inbox
// timestamps. Examples: "JUST NOW", "12 MIN AGO", "3 HR AGO", "YESTERDAY 14:30",
// "MAR 14".
//
// `now` parameter is injectable for testability and for keeping the function pure.

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function startOfDay(d: Date): number {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c.getTime();
}

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then    = new Date(iso);
  const diffMs  = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr  = Math.floor(diffMs / 3_600_000);

  if (diffMs < 0)                            return 'JUST NOW';
  if (diffMin < 1)                           return 'JUST NOW';
  if (diffMin < 60)                          return `${diffMin} MIN AGO`;
  if (diffHr  < 24 && startOfDay(then) === startOfDay(now))
                                             return `${diffHr} HR AGO`;

  const dayDiff = Math.floor((startOfDay(now) - startOfDay(then)) / 86_400_000);
  if (dayDiff === 1) {
    return `YESTERDAY ${pad(then.getHours())}:${pad(then.getMinutes())}`;
  }

  return `${MONTHS[then.getMonth()]} ${then.getDate()}`;
}
