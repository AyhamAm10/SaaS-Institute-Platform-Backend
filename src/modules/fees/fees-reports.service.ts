import { Inject, Injectable } from '@nestjs/common';
import { Currency, Prisma } from '@prisma/client';
import { InstituteClockService } from '../institutes/institute-clock.service';
import { SubscriptionRepository } from './repositories/subscription.repository';
import { InstallmentRepository } from './repositories/installment.repository';
import { PaymentRepository } from './repositories/payment.repository';
import { fromMinor, toMinor } from '../../common/money/money';
import { getLocalParts, localMidnightUtc } from '../../common/time/timezone';
import { collectionsByMonth, lastMonthKeys } from './fees.rules';
import { OverdueQueryDto } from './dto/overdue-query.dto';

export interface CurrencySummary {
  currency: Currency;
  total: number;
  paid: number;
  remaining: number;
  overdue: number;
}

/** Dashboard finance row: one per currency, amounts never mixed. */
export interface FinanceOverviewRow {
  currency: Currency;
  /** Paid this month in this currency (payment currency). */
  collectedThisMonth: number;
  /** Still owed on active contracts in this currency (contract currency). */
  remaining: number;
  /** Part of `remaining` already due (before today). */
  overdue: number;
  overdueInstallments: number;
}

export interface FinanceOverview {
  currencies: FinanceOverviewRow[];
  /** Collections of the last 6 local months, one row per (month, currency). */
  monthly: { month: string; currency: Currency; amount: number }[];
}

/** Months shown in the collections chart. */
const COLLECTION_MONTHS = 6;

/**
 * Fee reports: overdue installments, the per-student summary and the
 * dashboard overview. Amounts are never mixed across currencies.
 */
@Injectable()
export class FeesReportsService {
  constructor(
    @Inject(SubscriptionRepository)
    private readonly subscriptionRepository: SubscriptionRepository,
    @Inject(InstallmentRepository)
    private readonly installmentRepository: InstallmentRepository,
    @Inject(PaymentRepository)
    private readonly paymentRepository: PaymentRepository,
    @Inject(InstituteClockService)
    private readonly clock: InstituteClockService,
  ) {}

  /** Unpaid installments due before today (institute time), oldest first. */
  async findOverdue(query: OverdueQueryDto) {
    return this.installmentRepository.findOverdue(
      query,
      await this.clock.today(),
    );
  }

  async getStudentSummary(studentId: number): Promise<CurrencySummary[]> {
    const today = await this.clock.today();
    const contracts =
      await this.subscriptionRepository.findByStudent(studentId);
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
        if (inst.dueDate.toISOString().slice(0, 10) < today) {
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

  /**
   * Dashboard: per currency, this month's collections, the open balance and
   * the overdue part of it, plus the monthly collections chart. Months are
   * local to the institute; the branch comes from the header.
   */
  async getOverview(
    academicYearId: number,
    branchId?: number,
  ): Promise<FinanceOverview> {
    const [today, timeZone] = await Promise.all([
      this.clock.today(),
      this.clock.getTimezone(),
    ]);
    const months = lastMonthKeys(today, COLLECTION_MONTHS);
    const since = localMidnightUtc(`${months[0]}-01`, timeZone);

    const [payments, open, due] = await Promise.all([
      this.paymentRepository.findCollectedSince(since, academicYearId),
      this.installmentRepository.sumOpenBySubscription(
        academicYearId,
        branchId,
      ),
      this.installmentRepository.sumOpenBySubscription(
        academicYearId,
        branchId,
        today,
      ),
    ]);
    const currencyOf = await this.subscriptionRepository.findCurrencies([
      ...new Set(open.map((row) => row.subscriptionId)),
    ]);

    const monthly = collectionsByMonth(
      payments.map((p) => ({
        month: getLocalParts(p.paidAt, timeZone).date.slice(0, 7),
        currency: p.currency,
        amountMinor: toMinor(p.amount, p.currency),
      })),
      months,
    );
    const thisMonth = months[months.length - 1];
    const balance = (
      rows: typeof open,
      currency: Currency,
    ): { minor: number; count: number } =>
      rows
        .filter((row) => currencyOf.get(row.subscriptionId) === currency)
        .reduce(
          (acc, row) => ({
            minor: acc.minor + openMinor(row.amount, row.paid, currency),
            count: acc.count + row.count,
          }),
          { minor: 0, count: 0 },
        );

    const currencies = [
      ...new Set<Currency>([
        ...monthly.map((m) => m.currency),
        ...currencyOf.values(),
      ]),
    ].sort();

    return {
      currencies: currencies.map((currency) => {
        const collected =
          monthly.find((m) => m.currency === currency && m.month === thisMonth)
            ?.amountMinor ?? 0;
        const overdue = balance(due, currency);
        return {
          currency,
          collectedThisMonth: fromMinor(collected, currency),
          remaining: fromMinor(balance(open, currency).minor, currency),
          overdue: fromMinor(overdue.minor, currency),
          overdueInstallments: overdue.count,
        };
      }),
      monthly: monthly.map((m) => ({
        month: m.month,
        currency: m.currency,
        amount: fromMinor(m.amountMinor, m.currency),
      })),
    };
  }

  /** Persist OVERDUE on the current institute's installments (daily job). */
  async markOverdue(): Promise<number> {
    return this.installmentRepository.markOverdue(await this.clock.today());
  }
}

/** Σ amount − Σ paid of a group, in minor units (never negative). */
function openMinor(
  amount: Prisma.Decimal | null,
  paid: Prisma.Decimal | null,
  currency: Currency,
): number {
  const total = amount ? toMinor(amount, currency) : 0;
  const settled = paid ? toMinor(paid, currency) : 0;
  return Math.max(0, total - settled);
}
