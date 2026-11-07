import { jest } from '@jest/globals';
import { Currency, Prisma } from '@prisma/client';
import { FeesReportsService } from './fees-reports.service';
import { ReportInstallment } from './repositories/installment.repository';
import { SubscriptionRepository } from './repositories/subscription.repository';
import { InstallmentRepository } from './repositories/installment.repository';
import { PaymentRepository } from './repositories/payment.repository';
import { InstituteClockService } from '../institutes/institute-clock.service';
import { FeesReportDataService } from './fees-report-data.service';

describe('FeesReportsService.getOverdueAging', () => {
  let service: FeesReportsService;
  let mockClock: { today: jest.Mock };
  let mockReportData: { getOverdueInstallments: jest.Mock };

  beforeEach(() => {
    mockClock = {
      today: jest.fn().mockResolvedValue('2026-11-07'),
    };
    mockReportData = {
      getOverdueInstallments: jest.fn(),
    };
    service = new FeesReportsService(
      {} as unknown as SubscriptionRepository,
      {} as unknown as InstallmentRepository,
      {} as unknown as PaymentRepository,
      mockClock as unknown as InstituteClockService,
      mockReportData as unknown as FeesReportDataService,
    );
  });

  it('groups overdue installments into aging buckets separated by currency', async () => {
    const installments = [
      {
        amount: new Prisma.Decimal(100),
        paidAmount: new Prisma.Decimal(20),
        dueDate: new Date('2026-11-01T00:00:00.000Z'),
        subscription: { currency: Currency.SYP },
      },
      {
        amount: new Prisma.Decimal(200),
        paidAmount: new Prisma.Decimal(0),
        dueDate: new Date('2026-09-20T00:00:00.000Z'),
        subscription: { currency: Currency.SYP },
      },
      {
        amount: new Prisma.Decimal(50),
        paidAmount: new Prisma.Decimal(10),
        dueDate: new Date('2026-08-20T00:00:00.000Z'),
        subscription: { currency: Currency.USD },
      },
      {
        amount: new Prisma.Decimal(10.5),
        paidAmount: new Prisma.Decimal(0),
        dueDate: new Date('2026-01-01T00:00:00.000Z'),
        subscription: { currency: Currency.USD },
      },
      {
        amount: new Prisma.Decimal(500),
        paidAmount: new Prisma.Decimal(500),
        dueDate: new Date('2026-10-01T00:00:00.000Z'),
        subscription: { currency: Currency.SYP },
      },
    ] as unknown as ReportInstallment[];

    mockReportData.getOverdueInstallments.mockResolvedValue(installments);

    const result = await service.getOverdueAging();

    expect(result).toEqual([
      { currency: 'SYP', bucket: '1-30', count: 1, amount: 80 },
      { currency: 'SYP', bucket: '31-60', count: 1, amount: 200 },
      { currency: 'USD', bucket: '61-90', count: 1, amount: 40 },
      { currency: 'USD', bucket: '90+', count: 1, amount: 10.5 },
    ]);
  });
});
