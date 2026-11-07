import { Inject, Injectable } from '@nestjs/common';
import { AttendanceStatus } from '@prisma/client';
import { AttendanceService } from '../../attendance/attendance.service';
import { attendanceRate, dayOfWeekOf } from '../../attendance/attendance.rules';
import { EnrollmentsService } from '../../enrollments/enrollments.service';
import { SectionsService } from '../../sections/sections.service';
import { TeacherScopeService } from '../../sections/teacher-scope.service';
import { badge, ReportBody, ReportRow } from '../document/report-document';
import { dateText, isoDate, periodText, WEEKDAY_LABELS } from '../document/report-format';
import { resolvePeriod } from '../reports.rules';
import { ReportBuilderGroup, ReportContext, requireYear } from './report-context';
import { groupBy } from './report-helpers';
import { rateTone } from './student.reports';

interface Tally {
  present: number;
  late: number;
  absent: number;
  excused: number;
}

const emptyTally = (): Tally => ({ present: 0, late: 0, absent: 0, excused: 0 });

function tally(statuses: AttendanceStatus[]): Tally {
  const t = emptyTally();
  for (const s of statuses) {
    if (s === 'PRESENT') t.present++;
    else if (s === 'LATE') t.late++;
    else if (s === 'ABSENT') t.absent++;
    else t.excused++;
  }
  return t;
}

const rateOf = (t: Tally) => attendanceRate(t.present + t.late, t.present + t.late + t.absent + t.excused);

/** Attendance reports (D3): daily records joined with the year's enrollments. */
@Injectable()
export class AttendanceReports implements ReportBuilderGroup {
  constructor(
    @Inject(AttendanceService) private readonly attendance: AttendanceService,
    @Inject(EnrollmentsService) private readonly enrollments: EnrollmentsService,
    @Inject(SectionsService) private readonly sections: SectionsService,
    @Inject(TeacherScopeService) private readonly scope: TeacherScopeService,
  ) {}

  readonly builders = {
    'daily-attendance': (ctx: ReportContext) => this.daily(ctx),
    'section-attendance': (ctx: ReportContext) => this.section(ctx),
    'frequent-absences': (ctx: ReportContext) => this.frequent(ctx),
  };

  /** Active enrollments of the year, limited to a teacher's sections. */
  private async activeStudents(ctx: ReportContext, sectionId?: number) {
    const year = requireYear(ctx);
    const [rows, taught] = await Promise.all([
      this.enrollments.getYearEnrollments({
        academicYearId: year.id,
        sectionId,
        branchId: ctx.branchId,
        activeOnly: true,
        take: ctx.take,
      }),
      this.scope.taughtSectionIds(),
    ]);
    return taught ? rows.filter((r) => taught.includes(r.section.id)) : rows;
  }

  private async daily(ctx: ReportContext): Promise<ReportBody> {
    const day = ctx.query.date ?? ctx.today;
    const [students, workingDays] = await Promise.all([this.activeStudents(ctx), this.attendance.getWorkingDays()]);
    const records = await this.attendance.getRecordsBetween(day, day, {
      studentIds: students.map((s) => s.student.id),
      take: ctx.take,
    });
    const statusOf = new Map(records.map((r) => [r.studentId, r.status]));
    const bySection = [...groupBy(students, (s) => s.section.name)];
    const sectionRows: ReportRow[] = bySection.map(([name, list]) => {
      const t = tally(list.flatMap((s) => (statusOf.has(s.student.id) ? [statusOf.get(s.student.id)!] : [])));
      const notRecorded = list.length - (t.present + t.late + t.absent + t.excused);
      return {
        section: name,
        students: list.length,
        present: t.present,
        late: t.late,
        absent: t.absent,
        excused: t.excused,
        notRecorded,
        rate: attendanceRate(t.present + t.late, list.length),
      };
    });
    const all = tally(records.map((r) => r.status));
    const missing = students.filter((s) => {
      const st = statusOf.get(s.student.id);
      return st === undefined || st === 'ABSENT';
    });
    const working = workingDays.includes(dayOfWeekOf(day));

    return {
      title: 'الحضور اليومي',
      subtitle: 'حضور كل شعبة في اليوم، وقائمة الغائبين ومن لم يُسجَّل لهم حضور',
      orientation: 'portrait',
      meta: [{ label: 'اليوم', value: `${WEEKDAY_LABELS[dayOfWeekOf(day)]} ${dateText(day)}` }],
      blocks: [
        ...(working ? [] : [{ type: 'note' as const, tone: 'warning' as const, text: 'هذا اليوم ليس من أيام الدوام.' }]),
        {
          type: 'stats',
          items: [
            { label: 'نسبة الحضور', kind: 'percent', value: attendanceRate(all.present + all.late, students.length), tone: rateTone(attendanceRate(all.present + all.late, students.length)) },
            { label: 'الطلاب', value: students.length },
            { label: 'حاضر', value: all.present, tone: 'success' },
            { label: 'متأخر', value: all.late, tone: 'warning' },
            { label: 'غائب', value: all.absent, tone: 'danger' },
            { label: 'بعذر', value: all.excused, tone: 'info' },
          ],
        },
        {
          type: 'bars',
          title: 'نسبة الحضور حسب الشعبة',
          items: sectionRows.map((r) => ({
            label: String(r.section),
            value: (r.rate as number | null) ?? 0,
            caption: r.rate === null ? '—' : `${r.rate}%`,
            tone: rateTone(r.rate as number | null),
          })),
        },
        {
          type: 'table',
          title: 'حسب الشعبة',
          columns: [
            { key: 'section', title: 'الشعبة', kind: 'text', width: 1.4 },
            { key: 'students', title: 'الطلاب', kind: 'number' },
            { key: 'present', title: 'حاضر', kind: 'number' },
            { key: 'late', title: 'متأخر', kind: 'number' },
            { key: 'absent', title: 'غائب', kind: 'number' },
            { key: 'excused', title: 'بعذر', kind: 'number' },
            { key: 'notRecorded', title: 'لم يُسجَّل', kind: 'number' },
            { key: 'rate', title: 'النسبة', kind: 'percent' },
          ],
          rows: sectionRows,
          emptyText: 'لا توجد شعب فيها طلاب',
        },
        {
          type: 'table',
          title: 'الغائبون ومن لم يُسجَّل لهم حضور',
          columns: [
            { key: 'student', title: 'الطالب', kind: 'text', width: 1.5 },
            { key: 'section', title: 'الشعبة', kind: 'text' },
            { key: 'phone', title: 'هاتف ولي الأمر', kind: 'phone' },
            { key: 'status', title: 'الحالة', kind: 'badge' },
          ],
          rows: missing.map((s) => ({
            student: s.student.fullName,
            section: s.section.name,
            phone: s.student.family?.phone ?? null,
            status: statusOf.get(s.student.id) === 'ABSENT' ? badge('غائب', 'danger') : badge('لم يُسجَّل', 'neutral'),
          })),
          emptyText: 'لا يوجد غائبون',
        },
      ],
    };
  }

  private async section(ctx: ReportContext): Promise<ReportBody> {
    const sectionId = ctx.query.sectionId!;
    const period = resolvePeriod(ctx.today, ctx.query.from, ctx.query.to);
    const [section, roster] = await Promise.all([
      this.sections.findById(sectionId),
      this.enrollments.getSectionRoster(sectionId),
    ]);
    const active = roster.filter((r) => r.status === 'ACTIVE');
    const records = await this.attendance.getRecordsBetween(period.from, period.to, {
      studentIds: active.map((r) => r.student.id),
      take: ctx.take,
    });
    const byStudent = groupBy(records, (r) => r.studentId);
    const rows = active.map((r) => {
      const t = tally((byStudent.get(r.student.id) ?? []).map((x) => x.status));
      return { name: r.student.fullName, phone: r.student.phone, ...t, rate: rateOf(t) };
    });
    const total = tally(records.map((r) => r.status));
    const days = new Set(records.map((r) => isoDate(r.date))).size;
    const daily = [...groupBy(records, (r) => isoDate(r.date))].map(([date, list]) => {
      const t = tally(list.map((x) => x.status));
      return { date, rate: attendanceRate(t.present + t.late, active.length) };
    });

    return {
      title: 'حضور الشعبة',
      subtitle: 'أيام الحضور والتأخر والغياب لكل طالب ونسبته',
      orientation: 'portrait',
      meta: [
        { label: 'الشعبة', value: section.name },
        { label: 'الفترة', value: periodText(period.from, period.to) },
      ],
      blocks: [
        {
          type: 'stats',
          items: [
            { label: 'نسبة الحضور', kind: 'percent', value: rateOf(total), tone: rateTone(rateOf(total)) },
            { label: 'الطلاب', value: active.length },
            { label: 'أيام مسجّلة', value: days },
            { label: 'حالات غياب', value: total.absent, tone: 'danger' },
            { label: 'حالات تأخر', value: total.late, tone: 'warning' },
          ],
        },
        {
          type: 'bars',
          title: 'نسبة الحضور اليومية',
          items: daily.map((d) => ({
            label: `${WEEKDAY_LABELS[dayOfWeekOf(d.date)]} ${dateText(d.date).slice(5)}`,
            value: d.rate ?? 0,
            caption: d.rate === null ? '—' : `${d.rate}%`,
            tone: rateTone(d.rate),
          })),
        },
        {
          type: 'table',
          columns: [
            { key: 'name', title: 'الطالب', kind: 'text', width: 1.6 },
            { key: 'phone', title: 'هاتف ولي الأمر', kind: 'phone' },
            { key: 'present', title: 'حاضر', kind: 'number', width: 0.6 },
            { key: 'late', title: 'متأخر', kind: 'number', width: 0.6 },
            { key: 'absent', title: 'غائب', kind: 'number', width: 0.6 },
            { key: 'excused', title: 'بعذر', kind: 'number', width: 0.6 },
            { key: 'rate', title: 'النسبة', kind: 'percent', width: 0.7 },
          ],
          rows,
          emptyText: 'لا يوجد طلاب في هذه الشعبة',
        },
      ],
    };
  }

  private async frequent(ctx: ReportContext): Promise<ReportBody> {
    const period = resolvePeriod(ctx.today, ctx.query.from, ctx.query.to);
    const min = ctx.query.minCount ?? 3;
    const sectionName = ctx.query.sectionId ? (await this.sections.findById(ctx.query.sectionId)).name : null;
    const students = await this.activeStudents(ctx, ctx.query.sectionId);
    const records = await this.attendance.getRecordsBetween(period.from, period.to, {
      studentIds: students.map((s) => s.student.id),
      take: ctx.take * 10,
    });
    const byStudent = groupBy(records, (r) => r.studentId);
    const flagged = students
      .map((s) => {
        const t = tally((byStudent.get(s.student.id) ?? []).map((r) => r.status));
        return { s, t, rate: rateOf(t) };
      })
      .filter((x) => x.t.absent >= min || x.t.late >= min)
      .sort((a, b) => b.t.absent - a.t.absent || b.t.late - a.t.late);

    return {
      title: 'الغياب والتأخر المتكرر',
      subtitle: `الطلاب الذين غابوا أو تأخروا ${min} مرات أو أكثر: للتواصل مع الأهل`,
      orientation: 'portrait',
      meta: [
        { label: 'الفترة', value: periodText(period.from, period.to) },
        { label: 'الحد الأدنى', value: `${min} مرات` },
        ...(sectionName ? [{ label: 'الشعبة', value: sectionName }] : []),
      ],
      blocks: [
        {
          type: 'stats',
          items: [
            { label: 'طلاب يحتاجون متابعة', value: flagged.length, tone: flagged.length ? 'danger' : 'success' },
            { label: 'غياب متكرر', value: flagged.filter((x) => x.t.absent >= min).length, tone: 'danger' },
            { label: 'تأخر متكرر', value: flagged.filter((x) => x.t.late >= min).length, tone: 'warning' },
          ],
        },
        {
          type: 'table',
          columns: [
            { key: 'student', title: 'الطالب', kind: 'text', width: 1.5 },
            { key: 'section', title: 'الشعبة', kind: 'text' },
            { key: 'family', title: 'ولي الأمر', kind: 'text' },
            { key: 'phone', title: 'الهاتف', kind: 'phone' },
            { key: 'absent', title: 'غياب', kind: 'number', width: 0.6 },
            { key: 'late', title: 'تأخر', kind: 'number', width: 0.6 },
            { key: 'excused', title: 'بعذر', kind: 'number', width: 0.6 },
            { key: 'rate', title: 'نسبة الحضور', kind: 'percent', width: 0.8 },
          ],
          rows: flagged.map((x) => ({
            student: x.s.student.fullName,
            section: x.s.section.name,
            family: x.s.student.family?.fatherName ?? x.s.student.family?.familyName ?? '—',
            phone: x.s.student.family?.phone ?? null,
            absent: x.t.absent,
            late: x.t.late,
            excused: x.t.excused,
            rate: x.rate,
          })),
          emptyText: 'لا يوجد طلاب تجاوزوا الحد في هذه الفترة',
        },
      ],
    };
  }
}
