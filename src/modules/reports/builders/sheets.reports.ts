import { Inject, Injectable } from '@nestjs/common';
import { EnrollmentsService } from '../../enrollments/enrollments.service';
import { SectionsService } from '../../sections/sections.service';
import { AttendanceService } from '../../attendance/attendance.service';
import { ExamsService } from '../../exams/exams.service';
import { ExamWithRefs } from '../../exams/exam.repository';
import { dayOfWeekOf } from '../../attendance/attendance.rules';
import { ReportBody } from '../document/report-document';
import { dateText, GENDER_LABELS, isoDate, WEEKDAY_LABELS } from '../document/report-format';
import { nextWorkingDays } from '../reports.rules';
import { ReportBuilderGroup, ReportContext } from './report-context';
import { num } from './report-helpers';

/** Default number of days on an attendance sheet (two school weeks). */
const SHEET_DAYS = 10;

/** Sheets to print and fill by hand in class (D3). */
@Injectable()
export class SheetReports implements ReportBuilderGroup {
  constructor(
    @Inject(EnrollmentsService) private readonly enrollments: EnrollmentsService,
    @Inject(SectionsService) private readonly sections: SectionsService,
    @Inject(AttendanceService) private readonly attendance: AttendanceService,
    @Inject(ExamsService) private readonly exams: ExamsService,
  ) {}

  readonly builders = {
    'section-roster': (ctx: ReportContext) => this.roster(ctx),
    'attendance-sheet': (ctx: ReportContext) => this.attendanceSheet(ctx),
    'mark-entry-sheet': (ctx: ReportContext) => this.markSheet(ctx),
  };

  private async activeRoster(sectionId: number) {
    const [section, roster] = await Promise.all([
      this.sections.findById(sectionId),
      this.enrollments.getSectionRoster(sectionId),
    ]);
    const students = roster
      .filter((r) => r.status === 'ACTIVE')
      .sort((a, b) => a.student.fullName.localeCompare(b.student.fullName, 'ar'));
    return { section, students };
  }

  private async roster(ctx: ReportContext): Promise<ReportBody> {
    const { section, students } = await this.activeRoster(ctx.query.sectionId!);
    const males = students.filter((s) => s.student.gender === 'MALE').length;

    return {
      title: 'قائمة طلاب الشعبة',
      subtitle: 'الأسماء مع أرقام أولياء الأمور للتواصل',
      orientation: 'portrait',
      meta: [
        { label: 'الشعبة', value: section.name },
        ...(ctx.year ? [{ label: 'السنة الدراسية', value: ctx.year.name }] : []),
      ],
      blocks: [
        {
          type: 'stats',
          items: [
            { label: 'عدد الطلاب', value: students.length, tone: 'brand' },
            { label: 'ذكور', value: males, tone: 'info' },
            { label: 'إناث', value: students.length - males, tone: 'info' },
          ],
        },
        {
          type: 'table',
          columns: [
            { key: 'n', title: '#', kind: 'number', width: 0.35 },
            { key: 'student', title: 'الطالب', kind: 'text', width: 1.8 },
            { key: 'gender', title: 'الجنس', kind: 'text', width: 0.5 },
            { key: 'family', title: 'العائلة', kind: 'text' },
            { key: 'phone', title: 'هاتف ولي الأمر', kind: 'phone' },
            { key: 'status', title: 'الحالة', kind: 'text', width: 0.7 },
            { key: 'notes', title: 'ملاحظات', kind: 'blank', width: 1.2 },
          ],
          rows: students.map((s, i) => ({
            n: i + 1,
            student: s.student.fullName,
            gender: GENDER_LABELS[s.student.gender] ?? '—',
            family: s.student.familyName ?? '—',
            phone: s.student.phone,
            status: s.student.status?.name ?? '—',
            notes: null,
          })),
          ruled: true,
          emptyText: 'لا يوجد طلاب في هذه الشعبة',
        },
      ],
    };
  }

  private async attendanceSheet(ctx: ReportContext): Promise<ReportBody> {
    const [{ section, students }, workingDays] = await Promise.all([
      this.activeRoster(ctx.query.sectionId!),
      this.attendance.getWorkingDays(),
    ]);
    const days = nextWorkingDays(ctx.query.from ?? ctx.today, ctx.query.days ?? SHEET_DAYS, workingDays);

    return {
      title: 'ورقة حضور',
      subtitle: 'ضع ✓ للحاضر، ✗ للغائب، ت للمتأخر، ع للغياب بعذر',
      orientation: 'landscape',
      meta: [
        { label: 'الشعبة', value: section.name },
        { label: 'من', value: days.length ? dateText(days[0]) : '—' },
        { label: 'إلى', value: days.length ? dateText(days[days.length - 1]) : '—' },
      ],
      blocks: [
        {
          type: 'grid',
          corner: 'الطالب',
          columns: days.map((d) => `${WEEKDAY_LABELS[dayOfWeekOf(d)]}\n${d.slice(8)}/${d.slice(5, 7)}`),
          rows: students.map((s, i) => ({ label: `${i + 1}. ${s.student.fullName}`, cells: days.map(() => null) })),
          ruled: true,
        },
        ...(days.length === 0 ? [{ type: 'note' as const, tone: 'warning' as const, text: 'لم تُحدَّد أيام الدوام في إعدادات البرنامج.' }] : []),
        { type: 'signatures', items: ['المدرّس', 'المشرف'] },
      ],
    };
  }

  private async markSheet(ctx: ReportContext): Promise<ReportBody> {
    const sheet = await this.exams.getResults(ctx.query.examId!);
    const exam = sheet.exam as ExamWithRefs;
    const students = sheet.rows
      .filter((r) => r.eligible)
      .sort((a, b) => a.student.fullName.localeCompare(b.student.fullName, 'ar'));

    return {
      title: 'ورقة رصد علامات',
      subtitle: `${exam.subject.name} · ${exam.title}`,
      orientation: 'portrait',
      meta: [
        { label: 'الشعبة', value: exam.section.name },
        { label: 'المادة', value: exam.subject.name },
        { label: 'التاريخ', value: dateText(isoDate(exam.examDate)) },
        { label: 'العلامة العظمى', value: String(num(exam.maxMark)) },
      ],
      blocks: [
        {
          type: 'table',
          columns: [
            { key: 'n', title: '#', kind: 'number', width: 0.35 },
            { key: 'student', title: 'الطالب', kind: 'text', width: 2 },
            { key: 'mark', title: 'العلامة', kind: 'blank', width: 0.8 },
            { key: 'absent', title: 'غائب', kind: 'blank', width: 0.5 },
            { key: 'notes', title: 'ملاحظات', kind: 'blank', width: 1.4 },
          ],
          rows: students.map((s, i) => ({ n: i + 1, student: s.student.fullName, mark: null, absent: null, notes: null })),
          ruled: true,
          emptyText: 'لا يوجد طلاب لهذه المذاكرة',
        },
        { type: 'signatures', items: ['مدرّس المادة', 'المراقب'] },
      ],
    };
  }
}
