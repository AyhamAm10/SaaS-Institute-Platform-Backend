import { InstallmentStatus } from '@prisma/client';

/**
 * Pure fee rules (no I/O), in integer minor units (see common/money).
 * Shared by ContractsService / PaymentsService and their tests.
 */

export interface ScheduleLine {
  installmentNumber: number;
  amountMinor: number;
  /** Local date `YYYY-MM-DD`. */
  dueDate: string;
}

/** `YYYY-MM-DD` + n months, clamped to the month length (31 Jan + 1 → 28/29 Feb). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const index = m - 1 + months;
  const year = y + Math.floor(index / 12);
  const month = ((index % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Installment schedule of a contract:
 * - an optional first payment is installment #1, due on `startDate`;
 * - the rest is split into `count` monthly installments (starting on
 *   `startDate`, or one month later when there is a first payment);
 * - the rounding remainder goes to the LAST installment.
 */
export function buildSchedule(input: {
  totalMinor: number;
  firstPaymentMinor?: number;
  count: number;
  startDate: string;
  firstNumber?: number;
}): ScheduleLine[] {
  const first = input.firstPaymentMinor ?? 0;
  const lines: ScheduleLine[] = [];
  let number = input.firstNumber ?? 1;
  let monthOffset = 0;

  if (first > 0) {
    lines.push({
      installmentNumber: number++,
      amountMinor: first,
      dueDate: input.startDate,
    });
    monthOffset = 1;
  }

  const rest = input.totalMinor - first;
  if (input.count <= 0 || rest <= 0) return lines;

  const base = Math.floor(rest / input.count);
  for (let i = 0; i < input.count; i++) {
    const isLast = i === input.count - 1;
    lines.push({
      installmentNumber: number++,
      amountMinor: isLast ? rest - base * (input.count - 1) : base,
      dueDate: addMonths(input.startDate, monthOffset + i),
    });
  }
  return lines;
}

export interface OpenInstallment {
  id: number;
  installmentNumber: number;
  dueDate: string;
  amountMinor: number;
  paidMinor: number;
}

/** What is still owed on the given installments. */
export function remainingMinor(installments: OpenInstallment[]): number {
  return installments.reduce(
    (sum, i) => sum + Math.max(0, i.amountMinor - i.paidMinor),
    0,
  );
}

/**
 * Splits a payment over installments, oldest due date first (FIFO).
 * Returns null when the payment is larger than what is still owed.
 */
export function allocateFifo(
  installments: OpenInstallment[],
  appliedMinor: number,
): { installmentId: number; amountMinor: number }[] | null {
  if (appliedMinor > remainingMinor(installments)) return null;

  const ordered = [...installments].sort(
    (a, b) =>
      a.dueDate.localeCompare(b.dueDate) ||
      a.installmentNumber - b.installmentNumber,
  );
  const allocations: { installmentId: number; amountMinor: number }[] = [];
  let left = appliedMinor;
  for (const inst of ordered) {
    if (left <= 0) break;
    const open = inst.amountMinor - inst.paidMinor;
    if (open <= 0) continue;
    const take = Math.min(open, left);
    allocations.push({ installmentId: inst.id, amountMinor: take });
    left -= take;
  }
  return allocations;
}

/** Status of an installment from its amounts and due date (local dates). */
export function installmentStatus(
  amountMinor: number,
  paidMinor: number,
  dueDate: string,
  today: string,
): InstallmentStatus {
  if (paidMinor >= amountMinor) return InstallmentStatus.PAID;
  if (dueDate < today) return InstallmentStatus.OVERDUE;
  return paidMinor > 0 ? InstallmentStatus.PARTIAL : InstallmentStatus.PENDING;
}

/** The last `count` month keys (`YYYY-MM`) up to the month of `today`, oldest first. */
export function lastMonthKeys(today: string, count: number): string[] {
  const [y, m] = today.split('-').map(Number);
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const index = m - 1 - i;
    const year = y + Math.floor(index / 12);
    const month = ((index % 12) + 12) % 12;
    keys.push(`${year}-${String(month + 1).padStart(2, '0')}`);
  }
  return keys;
}

export interface MonthlyCollection<C extends string = string> {
  month: string;
  currency: C;
  amount: number;
}

/**
 * Sums payments per (local month, currency) for the given month keys.
 * Every currency present gets a value for every month (0 when nothing paid).
 * Amounts are in minor units of their own currency: never mixed.
 */
export function collectionsByMonth<C extends string>(
  payments: { month: string; currency: C; amountMinor: number }[],
  months: string[],
): { month: string; currency: C; amountMinor: number }[] {
  const currencies = [...new Set(payments.map((p) => p.currency))].sort();
  return currencies.flatMap((currency) =>
    months.map((month) => ({
      month,
      currency,
      amountMinor: payments
        .filter((p) => p.currency === currency && p.month === month)
        .reduce((sum, p) => sum + p.amountMinor, 0),
    })),
  );
}
