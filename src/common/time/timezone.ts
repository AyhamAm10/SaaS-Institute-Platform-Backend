/**
 * Pure time-zone helpers (no I/O). Instants are stored in UTC; calendar dates
 * ("today", due dates, attendance days) are always computed in the
 * institute's IANA time zone (role.md §5.10).
 */

export const DEFAULT_INSTITUTE_TIMEZONE = 'Asia/Damascus';

export interface LocalDateTimeParts {
  /** Local calendar date, `YYYY-MM-DD`. */
  date: string;
  /** Minutes since local midnight (0–1439). */
  minutesOfDay: number;
  /** Local day of week, JS convention (0 = Sunday … 6 = Saturday). */
  dayOfWeek: number;
}

const WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Local date / time-of-day / weekday of an instant in a time zone. */
export function getLocalParts(at: Date, timeZone: string): LocalDateTimeParts {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );

  return {
    date: `${parts['year']}-${parts['month']}-${parts['day']}`,
    minutesOfDay: Number(parts['hour']) * 60 + Number(parts['minute']),
    dayOfWeek: WEEKDAYS[parts['weekday']],
  };
}

/** `HH:mm` → minutes since midnight. */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/** `YYYY-MM-DD` → Date at UTC midnight, the form Prisma expects for `@db.Date`. */
export function dateOnly(localDate: string): Date {
  return new Date(`${localDate}T00:00:00.000Z`);
}

/**
 * UTC instant of local midnight of `localDate` in `timeZone`
 * (start of an institute day, for filtering timestamps by local date).
 */
export function localMidnightUtc(localDate: string, timeZone: string): Date {
  const guess = new Date(`${localDate}T00:00:00.000Z`);
  const parts = getLocalParts(guess, timeZone);
  const localAsUtc =
    Date.parse(`${parts.date}T00:00:00.000Z`) + parts.minutesOfDay * 60_000;
  return new Date(guess.getTime() - (localAsUtc - guess.getTime()));
}

/** Local `YYYY-MM-DD` shifted by `days` (calendar arithmetic, no time zone involved). */
export function shiftLocalDate(localDate: string, days: number): string {
  const d = new Date(`${localDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (b − a). Calendar arithmetic on YYYY-MM-DD. */
export function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}
