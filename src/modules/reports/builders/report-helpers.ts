import { Currency, Prisma } from '@prisma/client';
import { fromMinor, toMinor } from '../../../common/money/money';
import { money, ReportRow, StatItem, Tone } from '../document/report-document';
import { CURRENCY_LABELS } from '../document/report-format';
import { sumByCurrency } from '../reports.rules';

/** Shared bits of the report builders (D3). */

export const CURRENCY_ORDER: Currency[] = ['SYP', 'USD'];

export function num(value: Prisma.Decimal | number | string | null | undefined): number {
  return value === null || value === undefined ? 0 : Number(value.toString());
}

/** Remaining of an installment in major units (amount − paid, never negative). */
export function openAmount(amount: Prisma.Decimal, paid: Prisma.Decimal, currency: Currency): number {
  return fromMinor(Math.max(0, toMinor(amount, currency) - toMinor(paid, currency)), currency);
}

/**
 * Totals rows of a money table: one row per currency, the label in
 * `labelKey` and the sums in `amountKeys` (never mixed across currencies).
 */
export function currencyTotals(
  items: { currency: Currency; amounts: Record<string, number> }[],
  labelKey: string,
  amountKeys: string[],
): ReportRow[] {
  return CURRENCY_ORDER.flatMap((currency) => {
    const rows = items.filter((i) => i.currency === currency);
    if (rows.length === 0) return [];
    const row: ReportRow = { [labelKey]: `المجموع (${CURRENCY_LABELS[currency]})` };
    for (const key of amountKeys) {
      const sum = sumByCurrency(rows.map((r) => ({ amount: r.amounts[key] ?? 0, currency })));
      row[key] = money(sum.get(currency) ?? 0, currency);
    }
    return [row];
  });
}

/** One stat per currency ("المحصّل بالليرة", ...). */
export function currencyStats(
  label: string,
  items: { amount: number; currency: Currency }[],
  tone: Tone = 'brand',
): StatItem[] {
  const sums = sumByCurrency(items);
  if (sums.size === 0) return [{ label, value: money(0, 'SYP'), tone }];
  return CURRENCY_ORDER.filter((c) => sums.has(c)).map((c) => ({
    label: `${label} (${CURRENCY_LABELS[c]})`,
    value: money(sums.get(c)!, c),
    tone,
  }));
}

/** Group by a key, keeping first-seen order. */
export function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}
