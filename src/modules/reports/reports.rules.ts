import { Currency } from '@prisma/client';
import { fromMinor, MoneyInput, toMinor } from '../../common/money/money';
import { shiftLocalDate } from '../../common/time/timezone';
import { dayOfWeekOf } from '../attendance/attendance.rules';

/** Pure maths of the reports (D3). Dates are local `YYYY-MM-DD`. */

/** Max rows a report renders / exports synchronously. */
export const REPORT_ROW_LIMIT = 5000;

/** Default period when the caller gives none: the last 30 days up to today. */
export const DEFAULT_PERIOD_DAYS = 30;

export interface Period {
  from: string;
  to: string;
}

/** `from` / `to` of a report (missing ends default around `today`); `from` ≤ `to`. */
export function resolvePeriod(
  today: string,
  from?: string,
  to?: string,
  days = DEFAULT_PERIOD_DAYS,
): Period {
  const end = to ?? (from ? shiftLocalDate(from, days) : today);
  const start = from ?? shiftLocalDate(end, -days);
  return start <= end ? { from: start, to: end } : { from: end, to: start };
}

/** Whole days from `a` to `b` (b − a). */
export function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export type AgingBucket = '1-30' | '31-60' | '61-90' | '90+';

export const AGING_BUCKETS: readonly AgingBucket[] = ['1-30', '31-60', '61-90', '90+'];

/** Aging bucket of an installment due on `dueDate` (overdue on `today`). */
export function agingBucket(dueDate: string, today: string): AgingBucket {
  const late = daysBetween(dueDate, today);
  if (late <= 30) return '1-30';
  if (late <= 60) return '31-60';
  if (late <= 90) return '61-90';
  return '90+';
}

/** Sums money per currency in minor units, returned as major numbers. */
export function sumByCurrency(
  items: { amount: MoneyInput; currency: Currency }[],
): Map<Currency, number> {
  const minor = new Map<Currency, number>();
  for (const item of items) {
    minor.set(item.currency, (minor.get(item.currency) ?? 0) + toMinor(item.amount, item.currency));
  }
  return new Map([...minor].map(([c, v]) => [c, fromMinor(v, c)]));
}

/** Percentage with one decimal; null without a base. */
export function percent(part: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((part / total) * 1000) / 10;
}

/**
 * Competition ranking ("1, 2, 2, 4") by descending score; null scores get
 * no rank and come last.
 */
export function rankByScore<T extends { score: number | null }>(items: T[]): (T & { rank: number | null })[] {
  const sorted = [...items].sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
  let lastScore: number | null = null;
  let lastRank = 0;
  return sorted.map((item, index) => {
    if (item.score === null) return { ...item, rank: null };
    if (item.score !== lastScore) {
      lastRank = index + 1;
      lastScore = item.score;
    }
    return { ...item, rank: lastRank };
  });
}

export const MARK_BANDS = ['أقل من 50%', '50–59%', '60–69%', '70–79%', '80–89%', '90–100%'] as const;

/** Count of percentages per band (MARK_BANDS order). */
export function markDistribution(percents: number[]): number[] {
  const counts = MARK_BANDS.map(() => 0);
  for (const p of percents) {
    const band = p < 50 ? 0 : Math.min(5, Math.floor(p / 10) - 4);
    counts[band]++;
  }
  return counts;
}

/** The next `count` working days starting at `from` (inclusive). */
export function nextWorkingDays(from: string, count: number, workingDays: number[]): string[] {
  const days: string[] = [];
  if (workingDays.length === 0) return days;
  let date = from;
  while (days.length < count) {
    if (workingDays.includes(dayOfWeekOf(date))) days.push(date);
    date = shiftLocalDate(date, 1);
  }
  return days;
}

/** `YYYY-MM` keys from the month of `from` to the month of `to` (inclusive). */
export function monthKeysBetween(from: string, to: string): string[] {
  const keys: string[] = [];
  let [y, m] = from.slice(0, 7).split('-').map(Number);
  const end = to.slice(0, 7);
  for (;;) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (key > end) break;
    keys.push(key);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return keys;
}

/** Average of numbers with two decimals; null when empty. */
export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
}
