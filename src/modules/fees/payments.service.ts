import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import { NotificationEventsService } from '../notifications/notification-events.service';
import { TransactionContext } from '../../database/transaction.context';
import {
  Currency,
  Installment,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  StudentSubscription,
} from '@prisma/client';
import { StudentRepository } from '../students/student.repository';
import { InstituteClockService } from '../institutes/institute-clock.service';
import { SubscriptionRepository } from './repositories/subscription.repository';
import { InstallmentRepository } from './repositories/installment.repository';
import { PaymentRepository } from './repositories/payment.repository';
import { ReceiptSequenceRepository } from './repositories/receipt-sequence.repository';
import { TransactionHelper } from '../../database/transaction.helper';
import { Ensure } from '../../common/errors/ensure';
import { ErrorMessages } from '../../common/errors/error-messages';
import {
  convertToContractMinor,
  fromMinor,
  hasValidPrecision,
  minorToDecimal,
  toMinor,
} from '../../common/money/money';
import { localMidnightUtc, shiftLocalDate } from '../../common/time/timezone';
import { RequestContext } from '../../context/request-context';
import {
  allocateFifo,
  installmentStatus,
  OpenInstallment,
  remainingMinor,
} from './fees.rules';
import {
  CancelPaymentDto,
  CreateFamilyPaymentDto,
  CreatePaymentDto,
  PaymentQueryDto,
} from './dto/payment.dto';

const fail = (key: string, params?: Record<string, string>): never => {
  throw new BadRequestException(ErrorMessages.get(key, params));
};

const toOpen = (i: Installment, currency: Currency): OpenInstallment => ({
  id: i.id,
  installmentNumber: i.installmentNumber,
  dueDate: i.dueDate.toISOString().slice(0, 10),
  amountMinor: toMinor(i.amount, currency),
  paidMinor: toMinor(i.paidAmount, currency),
});

/**
 * Payments (role.md §10.3): converted to the contract currency, allocated
 * FIFO over the installments, numbered from ReceiptSequence in the same
 * transaction. Payments are never deleted, only cancelled (allocations are
 * reversed, the receipt number stays used).
 */
@Injectable()
export class PaymentsService {
  constructor(
    @Inject(SubscriptionRepository)
    private readonly subscriptionRepository: SubscriptionRepository,
    @Inject(InstallmentRepository)
    private readonly installmentRepository: InstallmentRepository,
    @Inject(PaymentRepository)
    private readonly paymentRepository: PaymentRepository,
    @Inject(ReceiptSequenceRepository)
    private readonly receiptRepository: ReceiptSequenceRepository,
    @Inject(StudentRepository)
    private readonly studentRepository: StudentRepository,
    @Inject(InstituteClockService)
    private readonly clock: InstituteClockService,
    @Inject(TransactionHelper)
    private readonly transactionHelper: TransactionHelper,
    /** Optional so unit tests that do not cover notifications need no mock. */
    @Optional()
    @Inject(NotificationEventsService)
    private readonly events?: NotificationEventsService,
  ) {}

  async create(contractId: number, dto: CreatePaymentDto) {
    const today = await this.clock.today();

    const paymentId = await this.transactionHelper.executeInTransaction(
      async () => {
        await this.subscriptionRepository.lockForUpdate(contractId);
        const contract = await this.subscriptionRepository.findById(contractId);
        Ensure.exists(contract, 'Contract');
        if (contract.status === 'CANCELLED') fail('contract_not_active');

        const currency = dto.currency ?? contract.currency;
        const sameCurrency = currency === contract.currency;
        if (!sameCurrency && !dto.exchangeRate) fail('payment_rate_required');
        if (!hasValidPrecision(dto.amount, currency))
          fail('money_invalid_precision');
        const appliedMinor = convertToContractMinor(
          dto.amount,
          currency,
          contract.currency,
          dto.exchangeRate,
        );
        if (appliedMinor <= 0) fail('payment_amount_invalid');

        const installments =
          await this.installmentRepository.findBySubscription(contractId);
        const open = installments.map((i) => toOpen(i, contract.currency));
        const allocations = allocateFifo(open, appliedMinor);
        if (!allocations) {
          fail('payment_exceeds_remaining', {
            amount: `${fromMinor(appliedMinor, contract.currency)} ${contract.currency}`,
            remaining: `${fromMinor(remainingMinor(open), contract.currency)} ${contract.currency}`,
          });
        }

        const student = await this.studentRepository.findById(
          contract.studentId,
        );
        Ensure.exists(student, 'Student');
        const receiptNumber = await this.receiptRepository.next(
          student.branchId,
          contract.academicYearId,
        );

        const payment = await this.paymentRepository.create({
          branchId: student.branchId,
          academicYearId: contract.academicYearId,
          subscriptionId: contractId,
          receiptNumber,
          amount: new Prisma.Decimal(dto.amount),
          currency,
          exchangeRate: sameCurrency
            ? null
            : new Prisma.Decimal(dto.exchangeRate!),
          appliedAmount: minorToDecimal(appliedMinor, contract.currency),
          paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
          paymentMethod: dto.paymentMethod ?? PaymentMethod.CASH,
          note: dto.note?.trim() || null,
          allocations: {
            create: allocations!.map((a) => ({
              instituteId: RequestContext.getInstituteId(),
              installmentId: a.installmentId,
              amount: minorToDecimal(a.amountMinor, contract.currency),
            })),
          },
        });

        await this.applyToInstallments(open, allocations!, 1, contract, today);
        return payment.id;
      },
    );
    const details = await this.findDetails(paymentId);
    // Inside a family payment the outer transaction announces after commit
    if (!TransactionContext.get()) this.announce(details);
    return details;
  }

  /** Tells the family a payment was received (after the payment is committed). */
  private announce(payment: Awaited<ReturnType<PaymentsService['findDetails']>>): void {
    void this.events?.paymentReceived({
      paymentId: payment.id,
      studentId: payment.subscription.student.id,
      receiptNumber: payment.receiptNumber,
      amount: Number(payment.amount),
      currency: payment.currency,
    });
  }

  /**
   * A parent paying for several children at once: one payment (and receipt)
   * per line, all in one transaction. Every contract must belong to a child
   * of this family and appear once.
   */
  async createForFamily(familyId: number, dto: CreateFamilyPaymentDto) {
    const ids = dto.payments.map((p) => p.contractId);
    if (new Set(ids).size !== ids.length) fail('payment_duplicate_contracts');
    for (const id of ids) {
      const contract = await this.subscriptionRepository.findById(id);
      Ensure.exists(contract, 'Contract');
      const student = await this.studentRepository.findById(contract.studentId);
      Ensure.exists(student, 'Student');
      if (student.familyId !== familyId) fail('payment_contract_family_mismatch');
    }
    const createdIds = await this.transactionHelper.executeInTransaction(
      async () => {
        const created: number[] = [];
        for (const line of dto.payments) {
          const payment = await this.create(line.contractId, {
            amount: line.amount,
            currency: line.currency,
            exchangeRate: line.exchangeRate,
            paymentMethod: dto.paymentMethod,
            paidAt: dto.paidAt,
            note: dto.note,
          });
          created.push(payment.id);
        }
        return created;
      },
      { timeout: 20000 },
    );
    const payments = await Promise.all(createdIds.map((id) => this.findDetails(id)));
    payments.forEach((p) => this.announce(p));
    return payments;
  }

  async cancel(id: number, dto: CancelPaymentDto) {
    const reason = dto.reason.trim();
    if (!reason) fail('payment_cancel_reason_required');
    const today = await this.clock.today();

    await this.transactionHelper.executeInTransaction(async () => {
      const payment = await this.paymentRepository.findById(id);
      Ensure.exists(payment, 'Payment');
      if (payment.status === PaymentStatus.CANCELLED)
        fail('payment_already_cancelled');

      await this.subscriptionRepository.lockForUpdate(payment.subscriptionId);
      const contract = await this.subscriptionRepository.findById(
        payment.subscriptionId,
      );
      Ensure.exists(contract, 'Contract');

      const allocations = await this.paymentRepository.findAllocations(id);
      const installments = await this.installmentRepository.findBySubscription(
        contract.id,
      );
      await this.applyToInstallments(
        installments.map((i) => toOpen(i, contract.currency)),
        allocations.map((a) => ({
          installmentId: a.installmentId,
          amountMinor: toMinor(a.amount, contract.currency),
        })),
        -1,
        contract,
        today,
      );
      await this.paymentRepository.update(id, {
        status: PaymentStatus.CANCELLED,
        cancelReason: reason,
        cancelledAt: new Date(),
      });
    });
    return this.findDetails(id);
  }

  async findDetails(id: number) {
    const payment = await this.paymentRepository.findDetails(id);
    Ensure.exists(payment, 'Payment');
    return payment;
  }

  async findByReceipt(receiptNumber: number) {
    return this.paymentRepository.findByReceipt(receiptNumber);
  }

  async findAll(query: PaymentQueryDto) {
    const tz = await this.clock.getTimezone();
    return this.paymentRepository.findFiltered(query, {
      ...(query.from && { gte: localMidnightUtc(query.from, tz) }),
      ...(query.to && {
        lt: localMidnightUtc(shiftLocalDate(query.to, 1), tz),
      }),
    });
  }

  /**
   * Adds (sign 1) or removes (sign -1) allocations on the installments, then
   * refreshes each installment status and the contract status.
   */
  private async applyToInstallments(
    open: OpenInstallment[],
    allocations: { installmentId: number; amountMinor: number }[],
    sign: 1 | -1,
    contract: StudentSubscription,
    today: string,
  ): Promise<void> {
    const byId = new Map(open.map((i) => [i.id, i]));
    for (const allocation of allocations) {
      const inst = byId.get(allocation.installmentId);
      if (!inst) continue;
      inst.paidMinor = Math.max(
        0,
        inst.paidMinor + sign * allocation.amountMinor,
      );
      await this.installmentRepository.setPaid(
        inst.id,
        minorToDecimal(inst.paidMinor, contract.currency),
        installmentStatus(
          inst.amountMinor,
          inst.paidMinor,
          inst.dueDate,
          today,
        ),
      );
    }
    const settled = remainingMinor(open) === 0;
    const status = settled ? 'COMPLETED' : 'ACTIVE';
    if (contract.status !== status) {
      await this.subscriptionRepository.update(contract.id, { status });
    }
  }
}
