import { jest } from '@jest/globals';
import { RequestContext } from '../context/request-context';
import { ExamRepository } from '../modules/exams/exam.repository';
import { InstallmentRepository } from '../modules/fees/repositories/installment.repository';
import { SubscriptionRepository } from '../modules/fees/repositories/subscription.repository';
import { DailyAttendanceRepository } from '../modules/attendance/daily-attendance.repository';

/**
 * The domain repositories made context-scoped (role.md §3): lists follow the
 * header year + branch; the documented record lookups span years but keep
 * the branch.
 */
describe('Context-scoped domain repositories', () => {
  const ctx = { userId: 1, instituteId: 3, role: 'INSTITUTE_ADMIN', language: 'en', branchId: 2, academicYearId: 9 };
  const delegate = () => ({
    findMany: jest.fn(async () => []),
    findFirst: jest.fn(async () => null),
    count: jest.fn(async () => 0),
  });
  let prisma: Record<string, ReturnType<typeof delegate>>;

  beforeEach(() => {
    prisma = { exam: delegate(), installment: delegate(), studentSubscription: delegate(), dailyAttendance: delegate() };
  });
  const whereOf = (mock: ReturnType<typeof delegate>['findMany']) => (mock.mock.calls[0] as [{ where: Record<string, unknown> }])[0].where;

  it('exams list: header year and branch through the section', async () => {
    const repo = new ExamRepository(prisma as never);
    await RequestContext.run(ctx, () => repo.findFiltered({ page: 1, limit: 20 } as never));
    expect(whereOf(prisma.exam.findMany)).toMatchObject({ instituteId: 3, section: { academicYearId: 9, branchId: 2 } });
  });

  it('overdue installments: header year and branch through the contract', async () => {
    const repo = new InstallmentRepository(prisma as never);
    await RequestContext.run(ctx, () => repo.findOverdue({ page: 1, limit: 20 } as never, '2026-11-07'));
    expect(whereOf(prisma.installment.findMany)).toMatchObject({
      instituteId: 3,
      subscription: { status: 'ACTIVE', academicYearId: 9, section: { branchId: 2 } },
    });
  });

  it('a contract schedule spans years but keeps the branch', async () => {
    const repo = new InstallmentRepository(prisma as never);
    await RequestContext.run(ctx, () => repo.findBySubscription(5));
    const where = whereOf(prisma.installment.findMany);
    expect(where).toMatchObject({ subscriptionId: 5, subscription: { section: { branchId: 2 } } });
    expect((where['subscription'] as Record<string, unknown>)['academicYearId']).toBeUndefined();
  });

  it("a student's contracts span years (documented exception)", async () => {
    const repo = new SubscriptionRepository(prisma as never);
    await RequestContext.run(ctx, () => repo.findByStudent(4));
    const where = whereOf(prisma.studentSubscription.findMany);
    expect(where).toMatchObject({ studentId: 4, section: { branchId: 2 } });
    expect(where['academicYearId']).toBeUndefined();
  });

  it('daily attendance follows the header branch', async () => {
    const repo = new DailyAttendanceRepository(prisma as never);
    await RequestContext.run(ctx, () => repo.findBetween('2026-11-01', '2026-11-07', { take: 10 }));
    expect(whereOf(prisma.dailyAttendance.findMany)).toMatchObject({ instituteId: 3, branchId: 2 });
  });
});
