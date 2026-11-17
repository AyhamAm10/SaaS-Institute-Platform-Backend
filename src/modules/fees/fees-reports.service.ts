import { Inject, Injectable } from '@nestjs/common';
import { Currency, Prisma } from '@prisma/client';
import { InstituteClockService } from '../institutes/institute-clock.service';
import { SubscriptionRepository } from './repositories/subscription.repository';
import { InstallmentRepository } from './repositories/installment.repository';
import { PaymentRepository } from './repositories/payment.repository';
import { fromMinor, toMinor } from '../../common/money/money';
import { getLocalParts, localMidnightUtc } from '../../common/time/timezone';
import { agingBucket, AgingBucket, collectionsByMonth, lastMonthKeys } from './fees.rules';
import { OverdueQueryDto } from './dto/overdue-query.dto';
import { FeesReportDataService } from './fees-report-data.service';
import {
  buildStudentFinance,
  CurrencySummary,
  StudentFinance,
  summarizeContracts,
} from './student-finance';

/** GET /families/:id/financial-summary */
export interface FamilyFinanceSummary {
  totals: CurrencySummary[];
  /** Active contracts with something left to pay: the lines of a family payment. */
  openContracts: {
    contractId: number;
    studentId: number;
    fullName: string;
    sectionName: string;
    yearName: string;
    currency: Currency;
    remaining: number;
  }[];
  students: { studentId: number; fullName: string; summary: CurrencySummary[] }[];
}

export interface OverdueAgingRow {
  currency: Currency;
  bucket: AgingBucket;
  count: number;
  amount: number;
}

export type { CurrencySummary };

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
    @Inject(FeesReportDataService)
    private readonly reportData: FeesReportDataService,
  ) {}

  /**
   * Overdue aging breakdown by bucket ('1-30', '31-60', '61-90', '90+')
   * per currency, amounts never mixed.
   */
  async getOverdueAging(): Promise<OverdueAgingRow[]> {
    const today = await this.clock.today();
    // Header branch / year apply through the installment repository
    const installments = await this.reportData.getOverdueInstallments({ take: 10_000 });

    const map = new Map<string, { currency: Currency; bucket: AgingBucket; count: number; minor: number }>();

    for (const inst of installments) {
      const cur = inst.subscription.currency;
      const dueDateStr = inst.dueDate.toISOString().slice(0, 10);
      const bucket = agingBucket(dueDateStr, today);
      const overdueMinor = Math.max(0, toMinor(inst.amount, cur) - toMinor(inst.paidAmount, cur));
      if (overdueMinor <= 0) continue;

      const key = `${cur}:${bucket}`;
      const entry = map.get(key) ?? { currency: cur, bucket, count: 0, minor: 0 };
      entry.count += 1;
      entry.minor += overdueMinor;
      map.set(key, entry);
    }

    const bucketOrder: Record<AgingBucket, number> = {
      '1-30': 0,
      '31-60': 1,
      '61-90': 2,
      '90+': 3,
    };

    return Array.from(map.values())
      .map((row) => ({
        currency: row.currency,
        bucket: row.bucket,
        count: row.count,
        amount: fromMinor(row.minor, row.currency),
      }))
      .sort((a, b) => a.currency.localeCompare(b.currency) || bucketOrder[a.bucket] - bucketOrder[b.bucket]);
  }

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
    return summarizeContracts(contracts, today);
  }

  /** Family finances: totals per currency plus one summary per student. */
  async getFamilySummary(familyId: number): Promise<FamilyFinanceSummary> {
    const today = await this.clock.today();
    const contracts = await this.subscriptionRepository.findByFamily(familyId);
    const byStudent = new Map<
      number,
      { studentId: number; fullName: string; contracts: typeof contracts }
    >();
    for (const contract of contracts) {
      const entry = byStudent.get(contract.student.id) ?? {
        studentId: contract.student.id,
        fullName: contract.student.fullName,
        contracts: [],
      };
      entry.contracts.push(contract);
      byStudent.set(contract.student.id, entry);
    }
    type Row = {
      id: number;
      status: string;
      currency: Currency;
      student: { id: number; fullName: string };
      section: { name: string };
      academicYear: { name: string };
      installments: { amount: Prisma.Decimal; paidAmount: Prisma.Decimal }[];
    };
    const openContracts = (contracts as Row[])
      .filter((c) => c.status === 'ACTIVE')
      .map((c) => {
        const remainingMinor = c.installments.reduce(
          (sum: number, i) =>
            sum + toMinor(i.amount, c.currency) - toMinor(i.paidAmount, c.currency),
          0,
        );
        return {
          contractId: c.id,
          studentId: c.student.id,
          fullName: c.student.fullName,
          sectionName: c.section.name,
          yearName: c.academicYear.name,
          currency: c.currency,
          remaining: fromMinor(remainingMinor, c.currency),
        };
      })
      .filter((c) => c.remaining > 0);
    return {
      totals: summarizeContracts(contracts, today),
      openContracts,
      students: [...byStudent.values()].map((s) => ({
        studentId: s.studentId,
        fullName: s.fullName,
        summary: summarizeContracts(s.contracts, today),
      })),
    };
  }

  /** Contracts, installments, payments and next due date of one student (guardian view). */
  async getStudentFinance(studentId: number): Promise<StudentFinance> {
    const [today, timeZone, contracts] = await Promise.all([
      this.clock.today(),
      this.clock.getTimezone(),
      this.subscriptionRepository.findByStudent(studentId),
    ]);
    return buildStudentFinance(contracts, today, timeZone);
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
