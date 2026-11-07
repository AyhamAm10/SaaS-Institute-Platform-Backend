import { Inject, Injectable } from '@nestjs/common';
import {
  Currency,
  Payment,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { ContextScopedRepository } from '../../../database/context-scoped.repository';
import { PrismaService } from '../../../database/prisma.service';
import { createPaginatedResult } from '../../../common/pagination/paginated-result';
import { PaymentQueryDto } from '../dto/payment.dto';

/** Payment with the student / contract / allocation data a receipt needs. */
const PAYMENT_INCLUDE = {
  branch: { select: { id: true, name: true } },
  academicYear: { select: { id: true, name: true } },
  subscription: {
    select: {
      id: true,
      currency: true,
      totalAmount: true,
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
  allocations: {
    select: {
      amount: true,
      installment: {
        select: { id: true, installmentNumber: true, dueDate: true },
      },
    },
  },
} as const;

/**
 * Payments (receipts). Scoped to the active branch / year; never deleted —
 * cancelled with a reason. Audited.
 */
@Injectable()
export class PaymentRepository extends ContextScopedRepository<Payment> {
  protected override readonly branchKey = 'branchId';
  protected override readonly yearKey = 'academicYearId';
  protected override readonly audited = true;

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'payment');
  }

  async findDetails(id: number) {
    return this.client.payment.findFirst({
      where: this.scopeWhere({ id }),
      include: PAYMENT_INCLUDE,
    });
  }

  async findAllocations(
    paymentId: number,
  ): Promise<{ installmentId: number; amount: Prisma.Decimal }[]> {
    return this.client.paymentAllocation.findMany({
      where: { instituteId: this.getInstituteId(), paymentId },
      select: { installmentId: true, amount: true },
    });
  }

  /** Active payments of a year since an instant (dashboard collections). */
  async findCollectedSince(
    since: Date,
    academicYearId: number,
  ): Promise<{ amount: Prisma.Decimal; currency: Currency; paidAt: Date }[]> {
    return this.client.payment.findMany({
      where: this.scopeWhere({
        academicYearId,
        status: PaymentStatus.ACTIVE,
        paidAt: { gte: since },
      }),
      select: { amount: true, currency: true, paidAt: true },
    });
  }

  async findByReceipt(receiptNumber: number) {
    return this.client.payment.findMany({
      where: this.scopeWhere({ receiptNumber }),
      include: PAYMENT_INCLUDE,
      orderBy: { paidAt: 'desc' },
    });
  }

  /** `range` = UTC bounds of the local `from` / `to` days (to is exclusive). */
  async findFiltered(query: PaymentQueryDto, range: { gte?: Date; lt?: Date }) {
    const where: Prisma.PaymentWhereInput = {
      ...(query.branchId && { branchId: query.branchId }),
      ...(query.currency && { currency: query.currency }),
      ...(query.paymentMethod && { paymentMethod: query.paymentMethod }),
      ...(query.status && { status: query.status }),
      ...(query.receiptNumber && { receiptNumber: query.receiptNumber }),
      ...((range.gte || range.lt) && { paidAt: range }),
      ...((query.studentId || query.search?.trim()) && {
        subscription: {
          ...(query.studentId && { studentId: query.studentId }),
          ...(query.search?.trim() && {
            student: {
              fullName: { contains: query.search.trim(), mode: 'insensitive' },
            },
          }),
        },
      }),
    };
    const scoped = this.scopeWhere(where as Record<string, unknown>);

    const [data, total] = await Promise.all([
      this.client.payment.findMany({
        where: scoped,
        include: PAYMENT_INCLUDE,
        orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.client.payment.count({ where: scoped }),
    ]);
    return createPaginatedResult(data, total, query.page, query.limit);
  }

  /**
   * Payments for reports (D3): field in [gte, lt) (paidAt, or cancelledAt for
   * the cancelled report), with the student, section and receiving staff id.
   * Scoped to the header branch / year like every payment read.
   */
  async findForReport(filter: PaymentReportFilter) {
    const where: Prisma.PaymentWhereInput = {
      [filter.field]: { gte: filter.gte, lt: filter.lt },
      ...(filter.status && { status: filter.status }),
      ...(filter.currency && { currency: filter.currency }),
      ...(filter.paymentMethod && { paymentMethod: filter.paymentMethod }),
    };
    return this.client.payment.findMany({
      where: this.scopeWhere(where as Record<string, unknown>),
      include: REPORT_PAYMENT_INCLUDE,
      orderBy: [{ paidAt: 'asc' }, { id: 'asc' }],
      take: filter.take,
    }) as Promise<ReportPayment[]>;
  }
}

export interface PaymentReportFilter {
  field: 'paidAt' | 'cancelledAt';
  gte: Date;
  lt: Date;
  status?: PaymentStatus;
  currency?: Currency;
  paymentMethod?: PaymentMethod;
  take: number;
}

const REPORT_PAYMENT_INCLUDE = {
  branch: { select: { name: true } },
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

export type ReportPayment = Prisma.PaymentGetPayload<{
  include: typeof REPORT_PAYMENT_INCLUDE;
}>;
