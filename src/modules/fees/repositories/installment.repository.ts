import { Inject, Injectable } from '@nestjs/common';
import { Installment, InstallmentStatus, Prisma } from '@prisma/client';
import { TenantAwareRepository } from '../../../database/tenant-aware.repository';
import { PrismaService } from '../../../database/prisma.service';
import { dateOnly } from '../../../common/time/timezone';
import { createPaginatedResult } from '../../../common/pagination/paginated-result';
import { OverdueQueryDto } from '../dto/overdue-query.dto';

const OPEN_STATUSES = [
  InstallmentStatus.PENDING,
  InstallmentStatus.PARTIAL,
  InstallmentStatus.OVERDUE,
];

/** Installments of a contract. Audited (paid amount / status changes). */
@Injectable()
export class InstallmentRepository extends TenantAwareRepository<Installment> {
  protected override readonly audited = true;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'installment');
  }

  async findBySubscription(subscriptionId: number): Promise<Installment[]> {
    return this.findMany({
      where: { subscriptionId },
      orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }],
    });
  }

  async createLines(
    subscriptionId: number,
    lines: {
      installmentNumber: number;
      amount: Prisma.Decimal;
      dueDate: string;
      status?: InstallmentStatus;
    }[],
  ): Promise<void> {
    if (lines.length === 0) return;
    const actorId = this.getActorId();
    await this.client.installment.createMany({
      data: lines.map((line) => ({
        instituteId: this.getInstituteId(),
        subscriptionId,
        installmentNumber: line.installmentNumber,
        amount: line.amount,
        dueDate: dateOnly(line.dueDate),
        status: line.status ?? InstallmentStatus.PENDING,
        createdById: actorId,
        updatedById: actorId,
      })),
    });
  }

  /**
   * Removes installments with nothing paid (to regenerate them). Their
   * allocations can only belong to cancelled payments and go with them.
   */
  async deleteUnpaid(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    const instituteId = this.getInstituteId();
    await this.client.paymentAllocation.deleteMany({
      where: { instituteId, installmentId: { in: ids } },
    });
    await this.client.installment.deleteMany({
      where: { instituteId, id: { in: ids }, paidAmount: 0 },
    });
  }

  async setPaid(
    id: number,
    paidAmount: Prisma.Decimal,
    status: InstallmentStatus,
  ) {
    return this.update(id, { paidAmount, status });
  }

  /** Persists OVERDUE for open installments due before `today` (idempotent). */
  async markOverdue(today: string): Promise<number> {
    const result = await this.client.installment.updateMany({
      where: {
        instituteId: this.getInstituteId(),
        status: { in: [InstallmentStatus.PENDING, InstallmentStatus.PARTIAL] },
        dueDate: { lt: dateOnly(today) },
        subscription: { status: 'ACTIVE' },
      },
      data: { status: InstallmentStatus.OVERDUE },
    });
    return result.count as number;
  }

  /**
   * Open balance per contract of a year (optionally only installments due
   * before `dueBefore`): Σ amount, Σ paid and the number of open installments.
   */
  async sumOpenBySubscription(
    academicYearId: number,
    branchId?: number,
    dueBefore?: string,
  ): Promise<
    {
      subscriptionId: number;
      amount: Prisma.Decimal | null;
      paid: Prisma.Decimal | null;
      count: number;
    }[]
  > {
    const rows: {
      subscriptionId: number;
      _sum: {
        amount: Prisma.Decimal | null;
        paidAmount: Prisma.Decimal | null;
      };
      _count: { _all: number };
    }[] = await this.client.installment.groupBy({
      by: ['subscriptionId'],
      where: {
        instituteId: this.getInstituteId(),
        status: { in: OPEN_STATUSES },
        ...(dueBefore && { dueDate: { lt: dateOnly(dueBefore) } }),
        subscription: {
          status: 'ACTIVE',
          academicYearId,
          ...(branchId && { section: { branchId } }),
        },
      },
      _sum: { amount: true, paidAmount: true },
      _count: { _all: true },
    });
    return rows.map((r) => ({
      subscriptionId: r.subscriptionId,
      amount: r._sum.amount,
      paid: r._sum.paidAmount,
      count: r._count._all,
    }));
  }

  /** Unpaid installments due before `today`, oldest first. */
  async findOverdue(query: OverdueQueryDto, today: string) {
    const where: Prisma.InstallmentWhereInput = {
      instituteId: this.getInstituteId(),
      status: { in: OPEN_STATUSES },
      dueDate: { lt: dateOnly(today) },
      subscription: {
        status: 'ACTIVE',
        ...(query.currency && { currency: query.currency }),
        ...(query.branchId && { section: { branchId: query.branchId } }),
        ...(query.sectionId && { sectionId: query.sectionId }),
        ...(query.search?.trim() && {
          student: {
            fullName: { contains: query.search.trim(), mode: 'insensitive' },
          },
        }),
      },
    };
    const [data, total] = await Promise.all([
      this.client.installment.findMany({
        where,
        include: {
          subscription: {
            select: {
              id: true,
              currency: true,
              student: {
                select: {
                  id: true,
                  fullName: true,
                  family: { select: { familyName: true, phone: true } },
                },
              },
              section: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.client.installment.count({ where }),
    ]);
    return createPaginatedResult(data, total, query.page, query.limit);
  }

  /**
   * Open installments of active contracts for reports (D3): overdue ones
   * (dueBefore) or the ones due in a window (dueFrom / dueTo, inclusive).
   */
  async findOpenForReport(filter: OpenInstallmentFilter) {
    const due: Prisma.DateTimeFilter = {
      ...(filter.dueBefore && { lt: dateOnly(filter.dueBefore) }),
      ...(filter.dueFrom && { gte: dateOnly(filter.dueFrom) }),
      ...(filter.dueTo && { lte: dateOnly(filter.dueTo) }),
    };
    return this.client.installment.findMany({
      where: {
        instituteId: this.getInstituteId(),
        status: { in: OPEN_STATUSES },
        dueDate: due,
        subscription: {
          status: 'ACTIVE',
          student: { deletedAt: null },
          ...(filter.sectionId && { sectionId: filter.sectionId }),
          ...(filter.branchId && { section: { branchId: filter.branchId } }),
        },
      },
      include: REPORT_INSTALLMENT_INCLUDE,
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
      take: filter.take,
    }) as Promise<ReportInstallment[]>;
  }
}

export interface OpenInstallmentFilter {
  dueBefore?: string;
  dueFrom?: string;
  dueTo?: string;
  sectionId?: number;
  branchId?: number;
  take: number;
}

const REPORT_INSTALLMENT_INCLUDE = {
  subscription: {
    select: {
      currency: true,
      student: {
        select: {
          id: true,
          fullName: true,
          family: { select: { familyName: true, phone: true } },
        },
      },
      section: { select: { id: true, name: true } },
    },
  },
} as const;

export type ReportInstallment = Prisma.InstallmentGetPayload<{
  include: typeof REPORT_INSTALLMENT_INCLUDE;
}>;
