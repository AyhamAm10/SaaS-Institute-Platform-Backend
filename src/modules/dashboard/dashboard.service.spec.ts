import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { DashboardService } from './dashboard.service';
import { InstituteClockService } from '../institutes/institute-clock.service';
import { AcademicYearRepository } from '../academic-years/academic-year.repository';
import { SectionRepository } from '../sections/section.repository';
import { TeacherRepository } from '../teachers/teacher.repository';
import { StudentsService } from '../students/students.service';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { AttendanceService } from '../attendance/attendance.service';
import { FeesReportsService } from '../fees/fees-reports.service';
import { FeesReportDataService } from '../fees/fees-report-data.service';
import { ExamsService } from '../exams/exams.service';
import { SubscriptionRepository } from '../fees/repositories/subscription.repository';
import { InstallmentRepository } from '../fees/repositories/installment.repository';
import { PaymentRepository } from '../fees/repositories/payment.repository';
import { RequestContext } from '../../context/request-context';

const clock = {
  today: jest.fn<any>().mockResolvedValue('2026-11-05'),
  getTimezone: jest.fn<any>().mockResolvedValue('Asia/Damascus'),
};

describe('DashboardService', () => {
  let service: DashboardService;
  let years: any;

  beforeEach(async () => {
    years = {
      findById: jest.fn(),
      findCurrentYear: jest
        .fn<any>()
        .mockResolvedValue({ id: 3, name: '2026-2027' }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: InstituteClockService, useValue: clock },
        { provide: AcademicYearRepository, useValue: years },
        {
          provide: SectionRepository,
          useValue: {
            findMany: jest.fn<any>().mockResolvedValue([{ id: 10, name: 'أ' }]),
          },
        },
        {
          provide: TeacherRepository,
          useValue: { count: jest.fn<any>().mockResolvedValue(4) },
        },
        {
          provide: StudentsService,
          useValue: {
            getOverview: jest
              .fn<any>()
              .mockResolvedValue({ unassigned: 2, newSince: 1 }),
          },
        },
        {
          provide: EnrollmentsService,
          useValue: {
            getActiveStudentSections: jest.fn<any>().mockResolvedValue([
              { studentId: 1, sectionId: 10 },
              { studentId: 2, sectionId: 10 },
            ]),
          },
        },
        {
          provide: AttendanceService,
          useValue: {
            getOverview: jest.fn<any>().mockResolvedValue({
              isWorkingDay: true,
              week: [],
              todayRecords: [{ studentId: 1, status: 'PRESENT' }],
            }),
          },
        },
        {
          provide: FeesReportsService,
          useValue: {
            getOverview: jest
              .fn<any>()
              .mockResolvedValue({ currencies: [], monthly: [] }),
          },
        },
        {
          provide: ExamsService,
          useValue: {
            getOverview: jest.fn<any>().mockResolvedValue({
              upcoming: [],
              averagePercent30d: 61.5,
              sectionAverages: new Map([[10, 61.5]]),
            }),
          },
        },
      ],
    }).compile();
    service = moduleRef.get(DashboardService);
    jest.spyOn(RequestContext, 'getBranchId').mockReturnValue(undefined);
    jest.spyOn(RequestContext, 'getAcademicYearId').mockReturnValue(undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('composes the overview of the current year', async () => {
    const overview = await service.getOverview();
    expect(overview.academicYear).toEqual({ id: 3, name: '2026-2027' });
    expect(overview.students).toEqual({
      active: 2,
      unassigned: 2,
      newThisMonth: 1,
    });
    expect(overview.teachers).toBe(4);
    expect(overview.attendance.today).toEqual(
      expect.objectContaining({ present: 1, notRecorded: 1, rate: 50 }),
    );
    expect(overview.sections).toEqual([
      {
        id: 10,
        name: 'أ',
        students: 2,
        attendedToday: 1,
        averagePercent: 61.5,
      },
    ]);
    expect(overview.exams.averagePercent30d).toBe(61.5);
  });

  it('uses the header year when it is sent', async () => {
    jest.spyOn(RequestContext, 'getAcademicYearId').mockReturnValue(7);
    years.findById.mockResolvedValue({ id: 7, name: '2025-2026' });
    const overview = await service.getOverview();
    expect(years.findById).toHaveBeenCalledWith(7);
    expect(overview.academicYear?.id).toBe(7);
  });

  it('returns zeros without an academic year', async () => {
    years.findCurrentYear.mockResolvedValue(null);
    const overview = await service.getOverview();
    expect(overview.academicYear).toBeNull();
    expect(overview.students.active).toBe(0);
    expect(overview.sections).toEqual([]);
    expect(overview.attendance.today.rate).toBeNull();
  });
});

describe('FeesReportsService.getOverview', () => {
  it('splits collections, balance and overdue per currency', async () => {
    const D = (v: number) => new Prisma.Decimal(v);
    const installments = {
      sumOpenBySubscription: jest
        .fn<any>()
        // open balance of the year
        .mockResolvedValueOnce([
          { subscriptionId: 1, amount: D(900), paid: D(300), count: 3 },
          { subscriptionId: 2, amount: D(50.5), paid: D(0), count: 1 },
        ])
        // part already due
        .mockResolvedValueOnce([
          { subscriptionId: 1, amount: D(300), paid: D(100), count: 1 },
        ]),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        FeesReportsService,
        { provide: InstituteClockService, useValue: clock },
        { provide: InstallmentRepository, useValue: installments },
        {
          provide: SubscriptionRepository,
          useValue: {
            findCurrencies: jest.fn<any>().mockResolvedValue(
              new Map([
                [1, 'SYP'],
                [2, 'USD'],
              ]),
            ),
          },
        },
        {
          provide: PaymentRepository,
          useValue: {
            findCollectedSince: jest.fn<any>().mockResolvedValue([
              // 23:30 UTC on Oct 31 is already November in Damascus
              {
                amount: D(200),
                currency: 'SYP',
                paidAt: new Date('2026-10-31T23:30:00Z'),
              },
              {
                amount: D(10),
                currency: 'USD',
                paidAt: new Date('2026-10-15T10:00:00Z'),
              },
            ]),
          },
        },
        { provide: FeesReportDataService, useValue: {} },
      ],
    }).compile();
    const service = moduleRef.get(FeesReportsService);

    const overview = await service.getOverview(3);
    expect(overview.currencies).toEqual([
      {
        currency: 'SYP',
        collectedThisMonth: 200,
        remaining: 600,
        overdue: 200,
        overdueInstallments: 1,
      },
      {
        currency: 'USD',
        collectedThisMonth: 0,
        remaining: 50.5,
        overdue: 0,
        overdueInstallments: 0,
      },
    ]);
    expect(overview.monthly.filter((m) => m.amount > 0)).toEqual([
      { month: '2026-11', currency: 'SYP', amount: 200 },
      { month: '2026-10', currency: 'USD', amount: 10 },
    ]);
  });
});
