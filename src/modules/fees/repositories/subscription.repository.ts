import { Inject, Injectable } from '@nestjs/common';
import {
  Currency,
  Installment,
  Payment,
  Prisma,
  StudentSubscription,
} from '@prisma/client';
import { ContextScopedRepository } from '../../../database/context-scoped.repository';
import { PrismaService } from '../../../database/prisma.service';

/** Contract with its schedule and payments (student finance view). */
export const CONTRACT_DETAILS_INCLUDE = {
  section: { select: { id: true, name: true, branchId: true } },
  academicYear: { select: { id: true, name: true } },
  installments: { orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }] },
  payments: {
    orderBy: { paidAt: 'desc' },
    include: {
      allocations: {
        select: { installmentId: true, amount: true },
      },
    },
  },
} as const;

/**
 * Student contracts (StudentSubscription): one per enrollment. Audited.
 */
@Injectable()
export class SubscriptionRepository extends ContextScopedRepository<StudentSubscription> {
  // Lists / totals follow the header year and branch (role.md §3)
  protected override readonly yearKey = 'academicYearId';
  protected override readonly branchKey = 'section.branchId';
  protected override readonly audited = true;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'studentSubscription');
  }

  async findByEnrollment(
    enrollmentId: number,
  ): Promise<StudentSubscription | null> {
    // One contract per enrollment, whatever the header year (record lookup)
    return this.client.studentSubscription.findFirst({
      where: this.scopeWhereAllYears({ enrollmentId }),
    });
  }

  async findDetails(id: number) {
    return this.client.studentSubscription.findFirst({
      // Opened by id: a contract of another year stays reachable (same branch)
      where: this.scopeWhereAllYears({ id }),
      include: CONTRACT_DETAILS_INCLUDE,
    });
  }

  async findByStudent(studentId: number) {
    return this.client.studentSubscription.findMany({
      // The student's financial history spans every year (documented exception)
      where: this.scopeWhereAllYears({ studentId }),
      include: CONTRACT_DETAILS_INCLUDE,
      orderBy: { startDate: 'desc' },
    });
  }

  /** Contract currency by contract id. */
  async findCurrencies(ids: number[]): Promise<Map<number, Currency>> {
    if (ids.length === 0) return new Map();
    const rows: { id: number; currency: Currency }[] =
      await this.client.studentSubscription.findMany({
        where: this.scopeWhereAllYears({ id: { in: ids } }),
        select: { id: true, currency: true },
      });
    return new Map(rows.map((row) => [row.id, row.currency]));
  }

  /**
   * Row lock on the contract until the surrounding transaction ends, so two
   * payments on the same contract are allocated one after the other.
   */
  async lockForUpdate(id: number): Promise<void> {
    await this.client
      .$queryRaw`SELECT id FROM student_subscriptions WHERE id = ${id} AND institute_id = ${this.getInstituteId()} FOR UPDATE`;
  }

  /**
   * Non-cancelled contracts of a year for reports (D3), with the student and
   * the installment amounts (balances, monthly dues, discounts).
   */
  async findForReport(filter: ContractReportFilter) {
    return this.client.studentSubscription.findMany({
      where: this.scopeWhere({
        academicYearId: filter.academicYearId,
        status: { not: 'CANCELLED' },
        student: { deletedAt: null },
        ...(filter.sectionId && { sectionId: filter.sectionId }),
        ...(filter.branchId && { section: { branchId: filter.branchId } }),
        ...(filter.withDiscount && { discountAmount: { gt: 0 } }),
      }),
      include: REPORT_CONTRACT_INCLUDE,
      orderBy: [{ section: { name: 'asc' } }, { student: { fullName: 'asc' } }],
      take: filter.take,
    }) as Promise<ReportContract[]>;
  }
}

export interface ContractReportFilter {
  academicYearId: number;
  sectionId?: number;
  branchId?: number;
  withDiscount?: boolean;
  take: number;
}

const REPORT_CONTRACT_INCLUDE = {
  student: {
    select: {
      id: true,
      fullName: true,
      family: { select: { familyName: true, phone: true } },
    },
  },
  section: { select: { id: true, name: true } },
  installments: {
    select: { amount: true, paidAmount: true, dueDate: true, status: true },
  },
} as const;

export type ReportContract = Prisma.StudentSubscriptionGetPayload<{
  include: typeof REPORT_CONTRACT_INCLUDE;
}>;

/** Contract with schedule and payments (CONTRACT_DETAILS_INCLUDE). */
export type ContractDetails = StudentSubscription & {
  section: { id: number; name: string; branchId: number };
  academicYear: { id: number; name: string };
  installments: Installment[];
  payments: (Payment & {
    allocations: { installmentId: number; amount: Prisma.Decimal }[];
  })[];
};
