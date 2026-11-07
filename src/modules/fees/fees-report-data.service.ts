import { Inject, Injectable } from '@nestjs/common';
import { Currency, PaymentMethod, PaymentStatus } from '@prisma/client';
import { InstituteClockService } from '../institutes/institute-clock.service';
import { localMidnightUtc, shiftLocalDate } from '../../common/time/timezone';
import { PaymentRepository } from './repositories/payment.repository';
import { InstallmentRepository } from './repositories/installment.repository';
import {
  ContractDetails,
  SubscriptionRepository,
} from './repositories/subscription.repository';

/** Local period `from` / `to` (inclusive). */
export interface LocalPeriod {
  from: string;
  to: string;
}

/**
 * Fee data for the reports module (D3). The fees module owns these queries
 * (role.md §10); the reports only lay them out. Branch / year come from the
 * header through the context-scoped repositories (role.md §3), never as
 * parameters. Local dates use the institute time zone; the row cap protects
 * the synchronous export.
 */
@Injectable()
export class FeesReportDataService {
  constructor(
    @Inject(PaymentRepository)
    private readonly paymentRepository: PaymentRepository,
    @Inject(InstallmentRepository)
    private readonly installmentRepository: InstallmentRepository,
    @Inject(SubscriptionRepository)
    private readonly subscriptionRepository: SubscriptionRepository,
    @Inject(InstituteClockService)
    private readonly clock: InstituteClockService,
  ) {}

  /** Payments paid (or cancelled) inside a local period. */
  async getPayments(
    period: LocalPeriod,
    filter: {
      by: 'paidAt' | 'cancelledAt';
      status?: PaymentStatus;
      currency?: Currency;
      paymentMethod?: PaymentMethod;
      take: number;
    },
  ) {
    const timeZone = await this.clock.getTimezone();
    return this.paymentRepository.findForReport({
      field: filter.by,
      gte: localMidnightUtc(period.from, timeZone),
      lt: localMidnightUtc(shiftLocalDate(period.to, 1), timeZone),
      status: filter.status,
      currency: filter.currency,
      paymentMethod: filter.paymentMethod,
      take: filter.take,
    });
  }

  /** Open installments due before today (overdue). */
  async getOverdueInstallments(filter: { sectionId?: number; take: number }) {
    return this.installmentRepository.findOpenForReport({
      ...filter,
      dueBefore: await this.clock.today(),
    });
  }

  /** Open installments due inside a local period. */
  async getUpcomingInstallments(
    period: LocalPeriod,
    filter: { take: number },
  ) {
    return this.installmentRepository.findOpenForReport({
      ...filter,
      dueFrom: period.from,
      dueTo: period.to,
    });
  }

  /** Non-cancelled contracts of a year (balances, discounts, monthly dues). */
  async getYearContracts(filter: {
    academicYearId: number;
    sectionId?: number;
    withDiscount?: boolean;
    take: number;
  }) {
    return this.subscriptionRepository.findForReport(filter);
  }

  /** Every contract of a student with installments and payments. */
  async getStudentContracts(studentId: number): Promise<ContractDetails[]> {
    return this.subscriptionRepository.findByStudent(studentId) as Promise<
      ContractDetails[]
    >;
  }
}
