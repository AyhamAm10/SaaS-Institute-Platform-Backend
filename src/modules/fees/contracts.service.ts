import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Currency, EnrollmentStatus, InstallmentStatus } from '@prisma/client';
import { StudentEnrollmentRepository } from '../students/student-enrollment.repository';
import { SectionRepository } from '../sections/section.repository';
import { InstituteClockService } from '../institutes/institute-clock.service';
import { SubscriptionRepository } from './repositories/subscription.repository';
import { InstallmentRepository } from './repositories/installment.repository';
import { TransactionHelper } from '../../database/transaction.helper';
import { Ensure } from '../../common/errors/ensure';
import { ErrorMessages } from '../../common/errors/error-messages';
import {
  hasValidPrecision,
  minorToDecimal,
  MoneyInput,
  toMinor,
} from '../../common/money/money';
import { buildSchedule, installmentStatus, ScheduleLine } from './fees.rules';
import { CreateContractDto, UpdateContractDto } from './dto/contract.dto';

const fail = (key: string): never => {
  throw new BadRequestException(ErrorMessages.get(key));
};

export interface ContractPlan {
  enrollmentId: number;
  currency: Currency;
  grossAmount: number;
  discountAmount: number;
  totalAmount: number;
  firstPaymentAmount: number;
  numberOfInstallments: number;
  startDate: string;
  installments: {
    installmentNumber: number;
    amount: number;
    dueDate: string;
  }[];
}

/**
 * Student contracts (role.md §10.3): one per enrollment, amounts default to
 * the section fee, installments generated monthly with the rounding
 * remainder on the last one. Only the discount and unpaid installments can
 * change once payments exist.
 */
@Injectable()
export class ContractsService {
  constructor(
    @Inject(StudentEnrollmentRepository)
    private readonly enrollmentRepository: StudentEnrollmentRepository,
    @Inject(SectionRepository)
    private readonly sectionRepository: SectionRepository,
    @Inject(SubscriptionRepository)
    private readonly subscriptionRepository: SubscriptionRepository,
    @Inject(InstallmentRepository)
    private readonly installmentRepository: InstallmentRepository,
    @Inject(InstituteClockService)
    private readonly clock: InstituteClockService,
    @Inject(TransactionHelper)
    private readonly transactionHelper: TransactionHelper,
  ) {}

  /** Schedule the contract would get, without saving anything. */
  async preview(
    enrollmentId: number,
    dto: CreateContractDto,
  ): Promise<ContractPlan> {
    const enrollment = await this.enrollmentRepository.findById(enrollmentId);
    Ensure.exists(enrollment, 'Enrollment');
    const section = await this.sectionRepository.findById(enrollment.sectionId);
    Ensure.exists(section, 'Section');

    const currency = dto.currency ?? section.feeCurrency;
    const gross = dto.grossAmount ?? Number(section.feeAmount);
    const discount = dto.discountAmount ?? 0;
    const first = dto.firstPaymentAmount ?? 0;
    for (const value of [gross, discount, first]) {
      if (!hasValidPrecision(value, currency)) fail('money_invalid_precision');
    }

    const grossMinor = toMinor(gross, currency);
    const discountMinor = toMinor(discount, currency);
    const firstMinor = toMinor(first, currency);
    if (discountMinor > grossMinor) fail('contract_discount_exceeds');
    const totalMinor = grossMinor - discountMinor;
    if (firstMinor > 0 && firstMinor >= totalMinor)
      fail('contract_first_payment_invalid');

    const startDate = dto.startDate ?? (await this.clock.today());
    const lines = buildSchedule({
      totalMinor,
      firstPaymentMinor: firstMinor,
      count: dto.numberOfInstallments,
      startDate,
    });

    return {
      enrollmentId,
      currency,
      grossAmount: gross,
      discountAmount: discount,
      totalAmount: Number(minorToDecimal(totalMinor, currency)),
      firstPaymentAmount: first,
      numberOfInstallments: lines.length,
      startDate,
      installments: this.toAmounts(lines, currency),
    };
  }

  async create(enrollmentId: number, dto: CreateContractDto) {
    const enrollment = await this.enrollmentRepository.findById(enrollmentId);
    Ensure.exists(enrollment, 'Enrollment');
    if (enrollment.status !== EnrollmentStatus.ACTIVE)
      fail('contract_enrollment_not_active');
    if (await this.subscriptionRepository.findByEnrollment(enrollmentId))
      fail('contract_exists');

    const plan = await this.preview(enrollmentId, dto);
    const today = await this.clock.today();
    const dec = (v: MoneyInput) =>
      minorToDecimal(toMinor(v, plan.currency), plan.currency);

    const id = await this.transactionHelper.executeInTransaction(async () => {
      const contract = await this.subscriptionRepository.create({
        studentId: enrollment.studentId,
        enrollmentId,
        sectionId: enrollment.sectionId,
        academicYearId: enrollment.academicYearId,
        currency: plan.currency,
        grossAmount: dec(plan.grossAmount),
        discountAmount: dec(plan.discountAmount),
        discountReason: dto.discountReason?.trim() || null,
        totalAmount: dec(plan.totalAmount),
        firstPaymentAmount:
          plan.firstPaymentAmount > 0 ? dec(plan.firstPaymentAmount) : null,
        numberOfInstallments: plan.numberOfInstallments,
        startDate: new Date(`${plan.startDate}T00:00:00.000Z`),
      });
      await this.installmentRepository.createLines(
        contract.id,
        plan.installments.map((line) => ({
          ...line,
          amount: dec(line.amount),
          status: installmentStatus(1, 0, line.dueDate, today),
        })),
      );
      return contract.id;
    });
    return this.findDetails(id);
  }

  /**
   * Change the discount and / or re-spread the unpaid balance. Installments
   * with any paid amount are kept; the others are regenerated.
   */
  async update(id: number, dto: UpdateContractDto) {
    const contract = await this.subscriptionRepository.findById(id);
    Ensure.exists(contract, 'Contract');
    if (contract.status === 'CANCELLED') fail('contract_not_active');
    const currency = contract.currency;
    const discount = dto.discountAmount ?? Number(contract.discountAmount);
    if (!hasValidPrecision(discount, currency)) fail('money_invalid_precision');

    const grossMinor = toMinor(contract.grossAmount, currency);
    const discountMinor = toMinor(discount, currency);
    if (discountMinor > grossMinor) fail('contract_discount_exceeds');
    const totalMinor = grossMinor - discountMinor;

    const installments =
      await this.installmentRepository.findBySubscription(id);
    const locked = installments.filter(
      (i) => toMinor(i.paidAmount, currency) > 0,
    );
    const unpaid = installments.filter(
      (i) => toMinor(i.paidAmount, currency) === 0,
    );
    const lockedMinor = locked.reduce(
      (s, i) => s + toMinor(i.amount, currency),
      0,
    );
    const restMinor = totalMinor - lockedMinor;
    if (restMinor < 0) fail('contract_total_below_paid');

    const count = dto.numberOfInstallments ?? Math.max(unpaid.length, 1);
    const firstUnpaidDue = unpaid[0]?.dueDate.toISOString().slice(0, 10);
    const startDate =
      dto.startDate ?? firstUnpaidDue ?? (await this.clock.today());
    const lines = buildSchedule({
      totalMinor: restMinor,
      count: restMinor > 0 ? count : 0,
      startDate,
      // Numbering continues after the kept (paid) installments
      firstNumber: Math.max(0, ...locked.map((i) => i.installmentNumber)) + 1,
    });

    const today = await this.clock.today();
    await this.transactionHelper.executeInTransaction(async () => {
      await this.installmentRepository.deleteUnpaid(unpaid.map((i) => i.id));
      await this.installmentRepository.createLines(
        id,
        lines.map((l) => ({
          ...l,
          amount: minorToDecimal(l.amountMinor, currency),
          status: installmentStatus(l.amountMinor, 0, l.dueDate, today),
        })),
      );
      const allPaid = locked.every((i) => i.status === InstallmentStatus.PAID);
      await this.subscriptionRepository.update(id, {
        discountAmount: minorToDecimal(discountMinor, currency),
        ...(dto.discountReason !== undefined && {
          discountReason: dto.discountReason.trim() || null,
        }),
        totalAmount: minorToDecimal(totalMinor, currency),
        numberOfInstallments: locked.length + lines.length,
        status: lines.length === 0 && allPaid ? 'COMPLETED' : 'ACTIVE',
      });
    });
    return this.findDetails(id);
  }

  async findDetails(id: number) {
    const contract = await this.subscriptionRepository.findDetails(id);
    Ensure.exists(contract, 'Contract');
    return contract;
  }

  async findByStudent(studentId: number) {
    return this.subscriptionRepository.findByStudent(studentId);
  }

  private toAmounts(lines: ScheduleLine[], currency: Currency) {
    return lines.map((line) => ({
      installmentNumber: line.installmentNumber,
      amount: Number(minorToDecimal(line.amountMinor, currency)),
      dueDate: line.dueDate,
    }));
  }
}
