import { Currency, Prisma } from '@prisma/client';

/**
 * Pure money helpers (role.md §10.3). All arithmetic is done in integer
 * minor units so rounding never drifts:
 * - SYP has no fractions (scale 0);
 * - USD has two decimals (scale 2).
 * Exchange rates are always "SYP per 1 USD".
 */

export type MoneyInput = number | string | Prisma.Decimal;

const SCALE: Record<Currency, number> = { SYP: 0, USD: 2 };

export function currencyScale(currency: Currency): number {
  return SCALE[currency];
}

/** Value → integer minor units (throws on more decimals than the currency allows). */
export function toMinor(value: MoneyInput, currency: Currency): number {
  const factor = 10 ** SCALE[currency];
  const minor = Number(value.toString()) * factor;
  const rounded = Math.round(minor);
  if (Math.abs(minor - rounded) > 1e-6) {
    throw new RangeError(
      `Too many decimals for ${currency}: ${value.toString()}`,
    );
  }
  return rounded;
}

/** True when the value has no more decimals than the currency allows. */
export function hasValidPrecision(
  value: MoneyInput,
  currency: Currency,
): boolean {
  try {
    toMinor(value, currency);
    return true;
  } catch {
    return false;
  }
}

/** Integer minor units → number with the currency scale. */
export function fromMinor(minor: number, currency: Currency): number {
  return minor / 10 ** SCALE[currency];
}

/** Integer minor units → Prisma Decimal (for writes). */
export function minorToDecimal(
  minor: number,
  currency: Currency,
): Prisma.Decimal {
  return new Prisma.Decimal(
    fromMinor(minor, currency).toFixed(SCALE[currency]),
  );
}

/**
 * Converts a paid amount into the contract currency.
 * `rate` = SYP per 1 USD, required when the currencies differ.
 * The result is rounded to the contract currency precision.
 */
export function convertToContractMinor(
  amount: MoneyInput,
  paidCurrency: Currency,
  contractCurrency: Currency,
  rate?: MoneyInput | null,
): number {
  if (paidCurrency === contractCurrency)
    return toMinor(amount, contractCurrency);
  const r = Number(rate?.toString() ?? NaN);
  if (!(r > 0)) throw new RangeError('exchange rate required');
  const value = Number(amount.toString());
  const converted = paidCurrency === 'USD' ? value * r : value / r;
  return Math.round(converted * 10 ** SCALE[contractCurrency]);
}
