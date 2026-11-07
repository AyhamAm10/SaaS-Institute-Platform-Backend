import { jest } from '@jest/globals';
import ExcelJS from 'exceljs';
import { RequestContext } from '../../context/request-context';
import { ReportsService } from './reports.service';
import { ReportVerificationService } from './report-verification.service';
import { ReportExcelService } from './report-excel.service';
import { REPORT_CATALOG } from './report-catalog';
import { StudentReports } from './builders/student.reports';
import { FinanceReports } from './builders/finance.reports';
import { AttendanceReports } from './builders/attendance.reports';
import { AcademicReports } from './builders/academic.reports';
import { SheetReports } from './builders/sheets.reports';
import { AdminReports } from './builders/admin.reports';
import { ReportBody, ReportDocument } from './document/report-document';

const none = {} as never;
const ctx = (role: string) => ({ userId: 6, instituteId: 3, role, language: 'ar' });

/** Real builder groups (their constructors only keep the services). */
function groups() {
  return [
    new StudentReports(none, none, none, none, none),
    new FinanceReports(none, none, none, none),
    new AttendanceReports(none, none, none, none),
    new AcademicReports(none, none, none, none, none, none),
    new SheetReports(none, none, none, none),
    new AdminReports(none, none),
  ] as const;
}

function makeService(stubBody?: ReportBody) {
  const g = groups();
  if (stubBody) {
    for (const group of g) {
      for (const key of Object.keys(group.builders)) {
        (group.builders as Record<string, unknown>)[key] = async () => stubBody;
      }
    }
  }
  const clock = { today: async () => '2026-11-07', getTimezone: async () => 'Asia/Damascus' };
  const years = { findById: async () => null, findCurrentYear: async () => null };
  const institutes = { findById: jest.fn(async () => ({ id: 3, name: 'معهد الاختبار', logoUrl: '', primaryColor: '' })) };
  const scope = { assertTeachesSection: jest.fn(async () => undefined) };
  const staff = { getUserNames: async () => new Map([[6, 'مدير الاختبار']]) };
  const verification = new ReportVerificationService(institutes as never);
  const service = new ReportsService(
    ...g,
    clock as never,
    years as never,
    institutes as never,
    scope as never,
    staff as never,
    none,
    verification,
    new ReportExcelService(),
  );
  return { service, scope };
}

const body: ReportBody = {
  title: 'كشف',
  orientation: 'portrait',
  meta: [{ label: 'الطالب', value: 'سارة' }],
  blocks: [
    { type: 'stats', items: [{ label: 'المتبقي', value: { amount: 1500, currency: 'SYP' } }] },
    {
      type: 'table',
      columns: [
        { key: 'name', title: 'الاسم', kind: 'text' },
        { key: 'amount', title: 'المبلغ', kind: 'money' },
        { key: 'rate', title: 'النسبة', kind: 'percent' },
      ],
      rows: [{ name: 'سارة', amount: { amount: 12.5, currency: 'USD' }, rate: 50 }],
    },
  ],
  verify: { subject: 'سارة', lines: ['المتبقي 1,500 ل.س'] },
};

describe('ReportsService', () => {
  it('every catalog report has a builder', () => {
    expect(makeService().service.missingBuilders()).toEqual([]);
    expect(new Set(REPORT_CATALOG.map((r) => r.key)).size).toBe(REPORT_CATALOG.length);
  });

  it('catalog follows the role permissions', () => {
    const { service } = makeService();
    const keys = (role: string) => RequestContext.run(ctx(role), () => service.catalog().map((r) => r.key));
    expect(keys('INSTITUTE_ADMIN')).toHaveLength(REPORT_CATALOG.length);
    const accountant = keys('ACCOUNTANT');
    expect(accountant).toContain('daily-cashbox');
    expect(accountant).not.toContain('daily-attendance');
    expect(accountant).not.toContain('staff-activity');
    const teacher = keys('TEACHER');
    expect(teacher).toContain('exam-results');
    expect(teacher).not.toContain('student-statement');
    expect(keys('FAMILY')).toEqual([]);
  });

  it('refuses unknown reports, missing permissions and missing parameters', async () => {
    const { service } = makeService(body);
    await RequestContext.run(ctx('INSTITUTE_ADMIN'), async () => {
      await expect(service.build('nope', {})).rejects.toMatchObject({ status: 404 });
      await expect(service.build('student-statement', {})).rejects.toMatchObject({ status: 400 });
    });
    await RequestContext.run(ctx('TEACHER'), async () => {
      await expect(service.build('student-statement', { studentId: 1 })).rejects.toMatchObject({ status: 403 });
    });
  });

  it('checks the teacher scope of a section', async () => {
    const { service, scope } = makeService(body);
    await RequestContext.run(ctx('TEACHER'), () => service.build('section-results', { sectionId: 4 }));
    expect(scope.assertTeachesSection).toHaveBeenCalledWith(4);
  });

  it('stamps author and time, and signs verifiable documents only', async () => {
    const { service } = makeService(body);
    const [statement, roster] = await RequestContext.run(ctx('INSTITUTE_ADMIN'), () =>
      Promise.all([service.build('student-statement', { studentId: 1 }), service.build('section-roster', { sectionId: 2 })]),
    );
    expect(statement).toMatchObject({ key: 'student-statement', generatedBy: 'مدير الاختبار' });
    expect(statement.verification?.number).toMatch(/^ST-/);
    expect('verify' in statement).toBe(false);
    expect((roster as ReportDocument).verification).toBeUndefined();
  });

  it('writes a right-to-left workbook with typed money and percent cells', async () => {
    const { service } = makeService(body);
    const { buffer, filename } = await RequestContext.run(ctx('INSTITUTE_ADMIN'), () =>
      service.excel('section-roster', { sectionId: 2 }),
    );
    expect(filename).toMatch(/^section-roster-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as never);
    const sheet = wb.worksheets[0];
    expect(sheet.views[0].rightToLeft).toBe(true);
    const cells: ExcelJS.Cell[] = [];
    sheet.eachRow((row) => row.eachCell((c) => cells.push(c)));
    const usd = cells.find((c) => c.value === 12.5);
    expect(usd?.numFmt).toContain('$');
    const pct = cells.find((c) => c.value === 0.5);
    expect(pct?.numFmt).toBe('0.0%');
    expect(cells.some((c) => c.value === 'معهد الاختبار')).toBe(true);
  });
});
