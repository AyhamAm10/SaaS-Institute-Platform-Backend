import { expect } from '@jest/globals';
import type { PrismaService } from '../../../src/database/prisma.service';

/** Decimal strings from the API / Prisma as plain numbers (exact for 2-decimal money). */
export const num = (v: unknown): number => Number(v);

export interface CurrencyRow {
  currency: 'SYP' | 'USD';
  total: unknown;
  paid: unknown;
  remaining: unknown;
  overdue: unknown;
}

type Totals = { total: number; paid: number; remaining: number; overdue: number };

/**
 * One row per currency, exactly the expected currencies (a row in an unexpected
 * currency fails: amounts of different currencies must never be mixed).
 */
export function expectPerCurrency(rows: CurrencyRow[], expected: Partial<Record<'SYP' | 'USD', Totals>>): void {
  const got = Object.fromEntries(
    rows.map((r) => [r.currency, { total: num(r.total), paid: num(r.paid), remaining: num(r.remaining), overdue: num(r.overdue) }]),
  );
  expect(got).toEqual(expected);
}

export interface InstallmentRow {
  installmentNumber: number;
  amount: number;
  paid: number;
  status: string;
  dueDate: string;
}

/** Installments of a contract as stored in the database, in number order. */
export async function installmentsInDb(prisma: PrismaService, subscriptionId: number): Promise<InstallmentRow[]> {
  const rows = await prisma.installment.findMany({ where: { subscriptionId }, orderBy: { installmentNumber: 'asc' } });
  return rows.map((r) => ({
    installmentNumber: r.installmentNumber,
    amount: num(r.amount),
    paid: num(r.paidAmount),
    status: r.status,
    dueDate: r.dueDate.toISOString().slice(0, 10),
  }));
}

/** Sum of ACTIVE allocations per installment must equal its paidAmount (no drift). */
export async function expectAllocationsMatchPaid(prisma: PrismaService, subscriptionId: number): Promise<void> {
  const installments = await prisma.installment.findMany({ where: { subscriptionId } });
  for (const inst of installments) {
    const allocations = await prisma.paymentAllocation.findMany({
      where: { installmentId: inst.id, payment: { status: 'ACTIVE' } },
    });
    const sum = allocations.reduce((acc, a) => acc + Math.round(num(a.amount) * 100), 0);
    expect({ installment: inst.installmentNumber, allocated: sum }).toEqual({
      installment: inst.installmentNumber,
      allocated: Math.round(num(inst.paidAmount) * 100),
    });
  }
}
