import { jest } from '@jest/globals';
import { StudentReports } from './student.reports';
import { RequestContext } from '../../../context/request-context';

const ctx = {
  query: { studentId: 4, from: '2026-11-01', to: '2026-11-30' },
  today: '2026-11-30',
  timeZone: 'Asia/Damascus',
} as never;

const mark = (date: string, subject: string, value: number | null, max = 100) => ({
  mark: value,
  status: value === null ? 'ABSENT' : 'PASSED',
  exam: { examDate: new Date(`${date}T00:00:00Z`), subject: { name: subject }, title: 't', examType: null, maxMark: max },
});

describe('StudentReports monthly report', () => {
  const build = (role: string) => {
    const students = { findById: jest.fn<any>().mockResolvedValue({ id: 4, fullName: 'سامي', family: { familyName: 'خوجه' } }) };
    const attendance = {
      getStudentHistory: jest.fn<any>().mockResolvedValue({
        from: '2026-11-01',
        to: '2026-11-30',
        counts: { present: 14, late: 2, absent: 3, excused: 1 },
        records: [
          { date: new Date('2026-11-03T00:00:00Z'), status: 'ABSENT', note: 'مرض', checkInAt: null, checkOutAt: null },
          { date: new Date('2026-11-04T00:00:00Z'), status: 'PRESENT', note: null, checkInAt: null, checkOutAt: null },
        ],
      }),
    };
    const exams = {
      getStudentResults: jest.fn<any>().mockResolvedValue({
        results: [
          mark('2026-11-10', 'رياضيات', 80),
          mark('2026-11-12', 'رياضيات', 60),
          mark('2026-11-15', 'علوم', 90),
          mark('2026-10-01', 'علوم', 10), // outside the period
        ],
      }),
    };
    const reports = new StudentReports(students as never, {} as never, {} as never, {} as never, exams as never, attendance as never);
    jest.spyOn(RequestContext, 'getRole').mockReturnValue(role);
    return { reports, exams };
  };

  afterEach(() => jest.restoreAllMocks());

  it('shows the attendance rate, the marks average of the period and the days missed', async () => {
    const { reports } = build('REGISTRAR');
    const body = await (reports.builders['student-monthly'] as (c: never) => Promise<any>)(ctx);
    const stats = body.blocks.find((b: any) => b.type === 'stats').items;
    // (14 + 2) / 20 = 80%
    expect(stats.find((s: any) => s.label === 'نسبة الحضور').value).toBe(80);
    // subjects: رياضيات 70, علوم 90 → overall 80; the October mark is ignored
    expect(stats.find((s: any) => s.label === 'معدل العلامات').value).toBe(80);
    const table = body.blocks.find((b: any) => b.type === 'table');
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0].note).toBe('مرض');
  });

  it('leaves the marks out for a role without exams.view', async () => {
    const { reports, exams } = build('ACCOUNTANT');
    const body = await (reports.builders['student-monthly'] as (c: never) => Promise<any>)(ctx);
    expect(exams.getStudentResults).not.toHaveBeenCalled();
    const stats = body.blocks.find((b: any) => b.type === 'stats').items;
    expect(stats.some((s: any) => s.label === 'معدل العلامات')).toBe(false);
  });
});
