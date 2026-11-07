import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { SubscriptionRepository } from './repositories/subscription.repository';
import { InstallmentRepository } from './repositories/installment.repository';
import { PaymentRepository } from './repositories/payment.repository';
import { ReceiptSequenceRepository } from './repositories/receipt-sequence.repository';
import { StudentRepository } from '../students/student.repository';
import { InstituteClockService } from '../institutes/institute-clock.service';
import { TransactionHelper } from '../../database/transaction.helper';
import { RequestContext } from '../../context/request-context';

const D = (v: number) => new Prisma.Decimal(v);
const installment = (
  id: number,
  amount: number,
  paid: number,
  due: string,
) => ({
  id,
  installmentNumber: id,
  amount: D(amount),
  paidAmount: D(paid),
  dueDate: new Date(`${due}T00:00:00.000Z`),
  status: 'PENDING',
});

describe('PaymentsService', () => {
  let service: PaymentsService;
  let subscriptions: any;
  let installments: any;
  let payments: any;
  let receipts: any;

  const contract = (over: object = {}) => ({
    id: 7,
    studentId: 1,
    academicYearId: 3,
    currency: 'SYP',
    status: 'ACTIVE',
    ...over,
  });

  beforeEach(async () => {
    subscriptions = {
      lockForUpdate: jest.fn(),
      findById: jest.fn<any>().mockResolvedValue(contract()),
      update: jest.fn(),
    };
    installments = {
      findBySubscription: jest
        .fn<any>()
        .mockResolvedValue([
          installment(1, 100_000, 100_000, '2026-09-01'),
          installment(2, 100_000, 20_000, '2026-10-01'),
          installment(3, 100_000, 0, '2026-11-01'),
        ]),
      setPaid: jest.fn(),
    };
    payments = {
      create: jest.fn<any>().mockResolvedValue({ id: 50 }),
      findDetails: jest.fn<any>().mockResolvedValue({ id: 50 }),
      findById: jest.fn(),
      findAllocations: jest.fn(),
      update: jest.fn(),
    };
    receipts = { next: jest.fn<any>().mockResolvedValue(12) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: SubscriptionRepository, useValue: subscriptions },
        { provide: InstallmentRepository, useValue: installments },
        { provide: PaymentRepository, useValue: payments },
        { provide: ReceiptSequenceRepository, useValue: receipts },
        {
          provide: StudentRepository,
          useValue: {
            findById: jest.fn<any>().mockResolvedValue({ id: 1, branchId: 4 }),
          },
        },
        {
          provide: InstituteClockService,
          useValue: { today: jest.fn<any>().mockResolvedValue('2026-10-15') },
        },
        {
          provide: TransactionHelper,
          useValue: { executeInTransaction: (fn: () => unknown) => fn() },
        },
      ],
    }).compile();
    service = moduleRef.get(PaymentsService);
    jest.spyOn(RequestContext, 'getInstituteId').mockReturnValue(1);
  });

  afterEach(() => jest.restoreAllMocks());

  it('allocates FIFO, numbers the receipt and updates installment statuses', async () => {
    await service.create(7, { amount: 130_000 });

    expect(subscriptions.lockForUpdate).toHaveBeenCalledWith(7);
    expect(receipts.next).toHaveBeenCalledWith(4, 3);
    const data = payments.create.mock.calls[0][0];
    expect(data.receiptNumber).toBe(12);
    expect(data.appliedAmount.toString()).toBe('130000');
    expect(
      data.allocations.create.map((a: any) => [
        a.installmentId,
        a.amount.toString(),
      ]),
    ).toEqual([
      [2, '80000'],
      [3, '50000'],
    ]);
    // #2 was due 2026-10-01 < today → fully paid now; #3 partial, not due yet
    expect(
      installments.setPaid.mock.calls.map((c: any[]) => [c[0], c[2]]),
    ).toEqual([
      [2, 'PAID'],
      [3, 'PARTIAL'],
    ]);
  });

  it('refuses a payment above the remaining balance', async () => {
    await expect(service.create(7, { amount: 180_001 })).rejects.toThrow(
      BadRequestException,
    );
    expect(payments.create).not.toHaveBeenCalled();
    expect(receipts.next).not.toHaveBeenCalled();
  });

  it('converts a USD payment into the SYP contract with the rate', async () => {
    await service.create(7, {
      amount: 10,
      currency: 'USD',
      exchangeRate: 13_000,
    });
    const data = payments.create.mock.calls[0][0];
    expect(data.appliedAmount.toString()).toBe('130000');
    expect(data.exchangeRate.toString()).toBe('13000');
  });

  it('requires the exchange rate for another currency, and whole SYP', async () => {
    await expect(
      service.create(7, { amount: 10, currency: 'USD' }),
    ).rejects.toThrow(BadRequestException);
    await expect(service.create(7, { amount: 100.5 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('marks the contract completed when everything is paid', async () => {
    await service.create(7, { amount: 180_000 });
    expect(subscriptions.update).toHaveBeenCalledWith(7, {
      status: 'COMPLETED',
    });
  });

  it('cancels a payment: reverses its allocations and keeps the record', async () => {
    payments.findById.mockResolvedValue({
      id: 50,
      subscriptionId: 7,
      status: 'ACTIVE',
    });
    payments.findAllocations.mockResolvedValue([
      { installmentId: 2, amount: D(20_000) },
    ]);

    await service.cancel(50, { reason: 'خطأ بالمبلغ' });

    expect(installments.setPaid).toHaveBeenCalledWith(2, D(0), 'OVERDUE');
    expect(payments.update).toHaveBeenCalledWith(
      50,
      expect.objectContaining({
        status: 'CANCELLED',
        cancelReason: 'خطأ بالمبلغ',
      }),
    );
  });

  it('refuses cancelling twice', async () => {
    payments.findById.mockResolvedValue({
      id: 50,
      subscriptionId: 7,
      status: 'CANCELLED',
    });
    await expect(service.cancel(50, { reason: 'x' })).rejects.toThrow(
      BadRequestException,
    );
  });
});
