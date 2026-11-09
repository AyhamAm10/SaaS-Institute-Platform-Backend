import { Currency, InstallmentStatus } from '@prisma/client';
import { fromMinor, toMinor } from '../../common/money/money';
import { getLocalParts } from '../../common/time/timezone';
import { installmentStatus } from './fees.rules';
import { ContractDetails } from './repositories/subscription.repository';

/**
 * Pure read model of one student's finances (no I/O). Single place for the
 * per-currency totals (docs/behavior/money.md): amounts of different
 * currencies are never summed; "today" is the institute-local date.
 */

export interface CurrencySummary {
  currency: Currency;
  total: number;
  paid: number;
  remaining: number;
  overdue: number;
}

export interface StudentInstallmentView {
  id: number;
  installmentNumber: number;
  dueDate: string;
  amount: number;
  paid: number;
  remaining: number;
  /** Computed against today, so OVERDUE is right before the hourly job runs. */
  status: InstallmentStatus;
}

export interface StudentContractView {
  id: number;
  yearName: string;
  currency: Currency;
  total: number;
  discount: number;
  paid: number;
  remaining: number;
  installments: StudentInstallmentView[];
}

export interface StudentPaymentView {
  id: number;
  receiptNumber: number;
  /** Local (institute time zone) date of the payment. */
  date: string;
  amount: number;
  currency: Currency;
  method: string;
  status: 'ACTIVE' | 'CANCELLED';
}

export interface StudentNextDue {
  amount: number;
  currency: Currency;
  dueDate: string;
}

export interface StudentFinance {
  totals: CurrencySummary[];
  contracts: StudentContractView[];
  /** Newest first. */
  payments: StudentPaymentView[];
  /** Earliest unpaid installment (an overdue one counts), null when nothing is open. */
  nextDue: StudentNextDue | null;
}

const isoDate = (value: Date): string => value.toISOString().slice(0, 10);

/** Per-currency totals of the non-cancelled contracts (money.md "Student summary"). */
export function summarizeContracts(
  contracts: ContractDetails[],
  today: string,
): CurrencySummary[] {
  const byCurrency = new Map<
    Currency,
    { total: number; paid: number; overdue: number }
  >();

  for (const contract of contracts) {
    if (contract.status === 'CANCELLED') continue;
    const c = contract.currency;
    const row = byCurrency.get(c) ?? { total: 0, paid: 0, overdue: 0 };
    row.total += toMinor(contract.totalAmount, c);
    for (const inst of contract.installments) {
      const amount = toMinor(inst.amount, c);
      const paid = toMinor(inst.paidAmount, c);
      row.paid += paid;
      if (isoDate(inst.dueDate) < today) {
        row.overdue += Math.max(0, amount - paid);
      }
    }
    byCurrency.set(c, row);
  }

  return [...byCurrency.entries()].map(([currency, row]) => ({
    currency,
    total: fromMinor(row.total, currency),
    paid: fromMinor(row.paid, currency),
    remaining: fromMinor(row.total - row.paid, currency),
    overdue: fromMinor(row.overdue, currency),
  }));
}

function toInstallmentView(
  inst: ContractDetails['installments'][number],
  currency: Currency,
  today: string,
): StudentInstallmentView {
  const amount = toMinor(inst.amount, currency);
  const paid = toMinor(inst.paidAmount, currency);
  const cancelled = inst.status === InstallmentStatus.CANCELLED;
  return {
    id: inst.id,
    installmentNumber: inst.installmentNumber,
    dueDate: isoDate(inst.dueDate),
    amount: fromMinor(amount, currency),
    paid: fromMinor(paid, currency),
    remaining: cancelled ? 0 : fromMinor(Math.max(0, amount - paid), currency),
    status: cancelled
      ? InstallmentStatus.CANCELLED
      : installmentStatus(amount, paid, isoDate(inst.dueDate), today),
  };
}

function toContractView(
  contract: ContractDetails,
  today: string,
): StudentContractView {
  const c = contract.currency;
  const installments = contract.installments.map((i) =>
    toInstallmentView(i, c, today),
  );
  const total = toMinor(contract.totalAmount, c);
  const paid = contract.installments.reduce(
    (sum, i) => sum + toMinor(i.paidAmount, c),
    0,
  );
  return {
    id: contract.id,
    yearName: contract.academicYear.name,
    currency: c,
    total: fromMinor(total, c),
    discount: fromMinor(toMinor(contract.discountAmount, c), c),
    paid: fromMinor(paid, c),
    remaining: fromMinor(total - paid, c),
    installments,
  };
}

function nextDueOf(contracts: StudentContractView[]): StudentNextDue | null {
  const open = contracts.flatMap((contract) =>
    contract.installments
      .filter(
        (i) =>
          i.status !== InstallmentStatus.PAID &&
          i.status !== InstallmentStatus.CANCELLED &&
          i.remaining > 0,
      )
      .map((i) => ({ contract, installment: i })),
  );
  open.sort(
    (a, b) =>
      a.installment.dueDate.localeCompare(b.installment.dueDate) ||
      a.installment.installmentNumber - b.installment.installmentNumber,
  );
  const first = open[0];
  return first
    ? {
        amount: first.installment.remaining,
        currency: first.contract.currency,
        dueDate: first.installment.dueDate,
      }
    : null;
}

/** Everything the guardian finance screen shows, from the student's contracts. */
export function buildStudentFinance(
  contracts: ContractDetails[],
  today: string,
  timeZone: string,
): StudentFinance {
  const live = contracts.filter((c) => c.status !== 'CANCELLED');
  const views = live.map((c) => toContractView(c, today));

  const payments = contracts
    .flatMap((c) => c.payments)
    .sort(
      (a, b) =>
        b.paidAt.getTime() - a.paidAt.getTime() ||
        b.receiptNumber - a.receiptNumber,
    )
    .map(
      (p): StudentPaymentView => ({
        id: p.id,
        receiptNumber: p.receiptNumber,
        date: getLocalParts(p.paidAt, timeZone).date,
        amount: fromMinor(toMinor(p.amount, p.currency), p.currency),
        currency: p.currency,
        method: p.paymentMethod,
        status: p.status,
      }),
    );

  return {
    totals: summarizeContracts(contracts, today),
    contracts: views,
    payments,
    nextDue: nextDueOf(views),
  };
}
