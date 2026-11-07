import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ContractsService } from './contracts.service';
import { SubscriptionRepository } from './repositories/subscription.repository';
import { InstallmentRepository } from './repositories/installment.repository';
import { StudentEnrollmentRepository } from '../students/student-enrollment.repository';
import { SectionRepository } from '../sections/section.repository';
import { InstituteClockService } from '../institutes/institute-clock.service';
import { TransactionHelper } from '../../database/transaction.helper';

const D = (v: number) => new Prisma.Decimal(v);

describe('ContractsService', () => {
  let service: ContractsService;
  let enrollments: any;
  let subscriptions: any;
  let installments: any;

  beforeEach(async () => {
    enrollments = {
      findById: jest.fn<any>().mockResolvedValue({
        id: 5,
        studentId: 1,
        sectionId: 2,
        academicYearId: 3,
        status: 'ACTIVE',
      }),
    };
    subscriptions = {
      findByEnrollment: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>().mockResolvedValue({ id: 9 }),
      findById: jest.fn(),
      update: jest.fn(),
      findDetails: jest.fn<any>().mockResolvedValue({ id: 9 }),
    };
    installments = {
      createLines: jest.fn(),
      findBySubscription: jest.fn(),
      deleteUnpaid: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ContractsService,
        { provide: StudentEnrollmentRepository, useValue: enrollments },
        {
          provide: SectionRepository,
          useValue: {
            findById: jest.fn<any>().mockResolvedValue({
              id: 2,
              feeAmount: D(1_000_000),
              feeCurrency: 'SYP',
            }),
          },
        },
        { provide: SubscriptionRepository, useValue: subscriptions },
        { provide: InstallmentRepository, useValue: installments },
        {
          provide: InstituteClockService,
          useValue: { today: jest.fn<any>().mockResolvedValue('2026-09-01') },
        },
        {
          provide: TransactionHelper,
          useValue: { executeInTransaction: (fn: () => unknown) => fn() },
        },
      ],
    }).compile();
    service = moduleRef.get(ContractsService);
  });

  it('previews from the section fee with the discount and the remainder on the last installment', async () => {
    const plan = await service.preview(5, {
      numberOfInstallments: 3,
      discountAmount: 100_000,
    });
    expect(plan.currency).toBe('SYP');
    expect(plan.totalAmount).toBe(900_000);
    expect(plan.installments.map((i) => i.amount)).toEqual([
      300_000, 300_000, 300_000,
    ]);

    const odd = await service.preview(5, {
      numberOfInstallments: 3,
      grossAmount: 1_000_000,
    });
    expect(odd.installments.map((i) => i.amount)).toEqual([
      333_333, 333_333, 333_334,
    ]);
    expect(odd.startDate).toBe('2026-09-01');
  });

  it('refuses a discount above the gross, fractions in SYP and a too large first payment', async () => {
    await expect(
      service.preview(5, {
        numberOfInstallments: 2,
        discountAmount: 1_000_001,
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.preview(5, { numberOfInstallments: 2, grossAmount: 1000.5 }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.preview(5, {
        numberOfInstallments: 2,
        firstPaymentAmount: 1_000_000,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses a second contract for the same enrollment', async () => {
    subscriptions.findByEnrollment.mockResolvedValue({ id: 1 });
    await expect(
      service.create(5, { numberOfInstallments: 2 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates the contract with its installments', async () => {
    await service.create(5, { numberOfInstallments: 2 });
    expect(subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        enrollmentId: 5,
        studentId: 1,
        sectionId: 2,
        currency: 'SYP',
      }),
    );
    const lines = installments.createLines.mock.calls[0][1];
    expect(lines.map((l: any) => l.amount.toString())).toEqual([
      '500000',
      '500000',
    ]);
  });

  describe('update', () => {
    beforeEach(() => {
      subscriptions.findById.mockResolvedValue({
        id: 9,
        currency: 'SYP',
        grossAmount: D(900),
        discountAmount: D(0),
        status: 'ACTIVE',
      });
      installments.findBySubscription.mockResolvedValue([
        {
          id: 1,
          installmentNumber: 1,
          amount: D(300),
          paidAmount: D(300),
          status: 'PAID',
          dueDate: new Date('2026-09-01'),
        },
        {
          id: 2,
          installmentNumber: 2,
          amount: D(300),
          paidAmount: D(100),
          status: 'PARTIAL',
          dueDate: new Date('2026-10-01'),
        },
        {
          id: 3,
          installmentNumber: 3,
          amount: D(300),
          paidAmount: D(0),
          status: 'PENDING',
          dueDate: new Date('2026-11-01'),
        },
      ]);
    });

    it('keeps paid installments and re-spreads the rest after a discount', async () => {
      await service.update(9, { discountAmount: 100, numberOfInstallments: 2 });
      expect(installments.deleteUnpaid).toHaveBeenCalledWith([3]);
      const lines = installments.createLines.mock.calls[0][1];
      // total 800 − locked 600 = 200 over 2 installments, numbered after the kept #2
      expect(
        lines.map((l: any) => [
          l.installmentNumber,
          l.amount.toString(),
          l.dueDate,
        ]),
      ).toEqual([
        [3, '100', '2026-11-01'],
        [4, '100', '2026-12-01'],
      ]);
    });

    it('refuses a discount that leaves less than what is locked', async () => {
      await expect(service.update(9, { discountAmount: 400 })).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
