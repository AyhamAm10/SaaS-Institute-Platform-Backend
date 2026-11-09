import { jest } from '@jest/globals';
import { RequestContext } from '../../context/request-context';
import { MobileOverviewService } from './mobile-overview.service';

const childRow = {
  id: 1,
  fullName: 'Ali',
  branch: { id: 1, name: 'Main' },
  studentEnrollments: [],
};
const noScope = { child: childRow, branchId: 1, academicYearId: null, enrollment: null };

describe('MobileOverviewService', () => {
  let role = 'FAMILY';
  let service: MobileOverviewService;
  let exams: any;
  let fees: any;
  let timetables: any;
  let attendance: any;

  const build = (scope: object) => {
    const access = {
      caller: jest.fn(async () => ({ userId: 7, role, fullName: 'P', phone: '1' })),
      child: jest.fn(async () => childRow),
    };
    const context = { runFor: jest.fn(async (_c: unknown, fn: any) => fn(scope)) };
    attendance = {
      getStudentPeriod: jest.fn(async () => ({
        counts: { present: 0, late: 0, absent: 0, excused: 0, notRecorded: 0 },
        ratePercent: null,
        records: [],
      })),
      isWorkingDate: jest.fn(async () => true),
    };
    timetables = { getEntriesForReport: jest.fn(async () => []) };
    exams = {
      getStudentMarksView: jest.fn(async () => ({ averagePercent: null, subjects: [] })),
      getUpcomingForStudent: jest.fn(async () => []),
    };
    fees = {
      getStudentFinance: jest.fn(async () => ({
        totals: [{ currency: 'SYP', total: 100, paid: 40, remaining: 60, overdue: 0 }],
        nextDue: { amount: 60, currency: 'SYP', dueDate: '2026-12-01' },
        contracts: [],
        payments: [],
      })),
    };
    const clock = {
      localParts: jest.fn(async () => ({ date: '2026-11-08', dayOfWeek: 0, minutesOfDay: 600 })),
    };
    service = new MobileOverviewService(
      access as any,
      context as any,
      attendance,
      timetables,
      exams,
      fees,
      clock as any,
    );
  };

  const run = () =>
    RequestContext.run({ userId: 7, instituteId: 3, role, language: 'en' }, () => service.getOverview(1));

  beforeEach(() => {
    role = 'FAMILY';
  });

  it('empty case: no section, no enrollment, no year, no results', async () => {
    build(noScope);
    const o = await run();
    expect(o.student.section).toBeNull();
    expect(o.today.lessons).toEqual([]);
    expect(o.today.attendance).toEqual({ status: null, checkInAt: null, checkOutAt: null });
    expect(o.attendance30d).toEqual({ present: 0, late: 0, absent: 0, excused: 0, ratePercent: null });
    expect(o.marks).toEqual({ averagePercent: null, latest: [], upcoming: [] });
    expect(exams.getStudentMarksView).not.toHaveBeenCalled();
    expect(timetables.getEntriesForReport).not.toHaveBeenCalled();
  });

  it('finance is present for a guardian and null for a student', async () => {
    build(noScope);
    expect((await run()).finance?.currencies[0].currency).toBe('SYP');
    role = 'STUDENT';
    build(noScope);
    expect((await run()).finance).toBeNull();
    expect(fees.getStudentFinance).not.toHaveBeenCalled();
  });

  it('latest marks: graded only, newest first, max 3; today attendance and lessons', async () => {
    build({
      child: childRow,
      branchId: 1,
      academicYearId: 5,
      enrollment: { id: 9, sectionId: 4, section: { id: 4, name: 'A' } },
    });
    const r = (examId: number, date: string, score: number | null) => ({
      examId, title: `E${examId}`, date, score, max: 100, percent: score, status: 'PASSED',
    });
    exams.getStudentMarksView.mockResolvedValue({
      averagePercent: 70,
      subjects: [
        {
          subjectId: 1,
          subject: 'Math',
          averagePercent: 70,
          results: [r(1, '2026-10-01', 60), r(2, '2026-10-05', null), r(3, '2026-10-09', 80), r(4, '2026-10-12', 70), r(5, '2026-10-20', 90)],
        },
      ],
    });
    attendance.getStudentPeriod.mockResolvedValue({
      counts: { present: 1, late: 0, absent: 0, excused: 0, notRecorded: 0 },
      ratePercent: 100,
      records: [
        { date: new Date('2026-11-08T00:00:00Z'), status: 'PRESENT', checkInAt: new Date('2026-11-08T05:00:00Z'), checkOutAt: null },
      ],
    });
    timetables.getEntriesForReport.mockResolvedValue([
      { id: 1, dayOfWeek: 0, startTime: '08:00', endTime: '08:45', subject: { name: 'Math' }, teacher: null, room: { name: 'R1' } },
      { id: 2, dayOfWeek: 1, startTime: '08:00', endTime: '08:45', subject: { name: 'Other' }, teacher: null, room: null },
    ]);
    const o = await run();
    expect(o.marks.latest.map((m) => m.examId)).toEqual([5, 4, 3]);
    expect(o.today.attendance.status).toBe('PRESENT');
    expect(o.today.attendance.checkInAt).toBe('2026-11-08T05:00:00.000Z');
    expect(o.today.lessons).toEqual([
      { id: 1, subject: 'Math', startTime: '08:00', endTime: '08:45', room: 'R1', teacher: null },
    ]);
  });
});
