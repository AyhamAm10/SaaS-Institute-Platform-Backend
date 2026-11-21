import { Inject, Injectable } from '@nestjs/common';
import { InstallmentStatus } from '@prisma/client';
import { StudentsService } from '../../students/students.service';
import { StudentQueryDto } from '../../students/dto/student-query.dto';
import { StudentFieldsService } from '../../student-fields/student-fields.service';
import { FeesReportDataService } from '../../fees/fees-report-data.service';
import { FeesReportsService } from '../../fees/fees-reports.service';
import { ExamsService } from '../../exams/exams.service';
import { buildMarksView } from '../../exams/student-marks';
import { AttendanceService } from '../../attendance/attendance.service';
import { attendanceRate } from '../../attendance/attendance.rules';
import { hasPermission } from '../../../common/types/permissions';
import { RequestContext } from '../../../context/request-context';
import { badge, BadgeCell, money, ReportBlock, ReportBody, ReportColumn, ReportRow, StatItem } from '../document/report-document';
import {
  attendanceBadge,
  dateText,
  ENROLLMENT_STATUS_LABELS,
  GENDER_LABELS,
  isoDate,
  moneyText,
  PAYMENT_METHOD_LABELS,
  periodText,
  resultBadge,
  timeText,
  WEEKDAY_LABELS,
} from '../document/report-format';
import { percent, REPORT_ROW_LIMIT, resolvePeriod } from '../reports.rules';
import { cappedTotal, ReportBuilderGroup, ReportContext } from './report-context';
import { candidateBlocks, groupedBlocks, groupStudents, ListedStudent, STUDENT_GROUP_LABELS, yearEnrollment } from './student-lists';
import { CURRENCY_ORDER, groupBy, num, openAmount } from './report-helpers';
import { dayOfWeekOf } from '../../attendance/attendance.rules';

/** Student reports (D3): one student, everything the caller may see. */
@Injectable()
export class StudentReports implements ReportBuilderGroup {
  constructor(
    @Inject(StudentsService) private readonly students: StudentsService,
    @Inject(StudentFieldsService)
    private readonly studentFields: StudentFieldsService,
    @Inject(FeesReportDataService) private readonly feesData: FeesReportDataService,
    @Inject(FeesReportsService) private readonly feesReports: FeesReportsService,
    @Inject(ExamsService) private readonly exams: ExamsService,
    @Inject(AttendanceService) private readonly attendance: AttendanceService,
  ) {}

  readonly builders = {
    'student-statement': (ctx: ReportContext) => this.statement(ctx),
    'student-transcript': (ctx: ReportContext) => this.transcript(ctx),
    'student-attendance': (ctx: ReportContext) => this.attendanceLog(ctx),
    'student-monthly': (ctx: ReportContext) => this.monthly(ctx),
    'bus-roster': (ctx: ReportContext) => this.busRoster(ctx),
    'student-card': (ctx: ReportContext) => this.card(ctx),
    'students-directory': (ctx: ReportContext) => this.directory(ctx),
    'exam-candidates': (ctx: ReportContext) => this.candidates(ctx),
  };

  private async statement(ctx: ReportContext): Promise<ReportBody> {
    const id = ctx.query.studentId!;
    const [student, contracts, summary] = await Promise.all([
      this.students.findById(id),
      this.feesData.getStudentContracts(id),
      this.feesReports.getStudentSummary(id),
    ]);
    const blocks: ReportBlock[] = [
      studentFields(student),
      {
        type: 'stats',
        items: CURRENCY_ORDER.flatMap((c) => {
          const row = summary.find((s) => s.currency === c);
          if (!row) return [];
          return [
            { label: `الإجمالي (${c === 'SYP' ? 'ل.س' : '$'})`, value: money(row.total, c), tone: 'neutral' as const },
            { label: 'المدفوع', value: money(row.paid, c), tone: 'success' as const },
            { label: 'المتبقي', value: money(row.remaining, c), tone: 'brand' as const },
            { label: 'المتأخر', value: money(row.overdue, c), tone: row.overdue > 0 ? ('danger' as const) : ('neutral' as const) },
          ];
        }),
      },
    ];

    for (const contract of contracts) {
      const c = contract.currency;
      const cancelled = contract.status === 'CANCELLED';
      blocks.push({
        type: 'table',
        title: `${contract.section.name} · ${contract.academicYear.name}${cancelled ? ' (عقد ملغى)' : ''}`,
        columns: [
          { key: 'number', title: 'القسط', kind: 'number', width: 0.5 },
          { key: 'due', title: 'الاستحقاق', kind: 'date' },
          { key: 'amount', title: 'المبلغ', kind: 'money' },
          { key: 'paid', title: 'المدفوع', kind: 'money' },
          { key: 'open', title: 'المتبقي', kind: 'money' },
          { key: 'status', title: 'الحالة', kind: 'badge', width: 1 },
        ],
        rows: contract.installments.map((inst) => {
          const open = openAmount(inst.amount, inst.paidAmount, c);
          return {
            number: inst.installmentNumber,
            due: isoDate(inst.dueDate),
            amount: money(num(inst.amount), c),
            paid: money(num(inst.paidAmount), c),
            open: money(open, c),
            status: installmentBadge(inst.status, open, isoDate(inst.dueDate), ctx.today),
          };
        }),
        totals: [
          {
            number: null,
            due: 'الإجمالي',
            amount: money(num(contract.totalAmount), c),
            paid: money(contract.installments.reduce((a, i) => a + num(i.paidAmount), 0), c),
            open: money(contract.installments.reduce((a, i) => a + openAmount(i.amount, i.paidAmount, c), 0), c),
            status: null,
          },
        ],
      });
      if (num(contract.discountAmount) > 0) {
        blocks.push({
          type: 'note',
          tone: 'info',
          text: `قيمة العقد قبل الحسم ${moneyText(num(contract.grossAmount), c)}، الحسم ${moneyText(num(contract.discountAmount), c)}${contract.discountReason ? ` (${contract.discountReason})` : ''}.`,
        });
      }
      blocks.push({
        type: 'table',
        title: 'الدفعات',
        columns: [
          { key: 'receipt', title: 'الإيصال', kind: 'number', width: 0.6 },
          { key: 'date', title: 'التاريخ', kind: 'date' },
          { key: 'method', title: 'طريقة الدفع', kind: 'text' },
          { key: 'amount', title: 'المبلغ المدفوع', kind: 'money' },
          { key: 'applied', title: 'بعملة العقد', kind: 'money' },
          { key: 'status', title: 'الحالة', kind: 'badge', width: 0.7 },
        ],
        rows: [...contract.payments].reverse().map((p) => ({
          receipt: p.receiptNumber,
          date: isoDate(p.paidAt),
          method: PAYMENT_METHOD_LABELS[p.paymentMethod],
          amount: money(num(p.amount), p.currency),
          applied: money(num(p.appliedAmount), c),
          status: p.status === 'CANCELLED' ? badge('ملغاة', 'danger') : badge('فعالة', 'success'),
        })),
        emptyText: 'لا توجد دفعات على هذا العقد',
      });
    }
    if (contracts.length === 0) blocks.push({ type: 'note', tone: 'warning', text: 'لا توجد عقود مالية لهذا الطالب.' });
    blocks.push({ type: 'signatures', items: ['المحاسب', 'ختم المعهد'] });

    return {
      title: 'كشف حساب الطالب',
      subtitle: 'العقود والأقساط والدفعات والرصيد حتى تاريخه',
      orientation: 'portrait',
      meta: [
        { label: 'الطالب', value: student.fullName },
        { label: 'حتى تاريخ', value: dateText(ctx.today) },
      ],
      blocks,
      verify: {
        subject: student.fullName,
        lines: summary.map((s) => `المتبقي ${moneyText(s.remaining, s.currency)} من ${moneyText(s.total, s.currency)}`),
      },
    };
  }

  private async transcript(ctx: ReportContext): Promise<ReportBody> {
    const id = ctx.query.studentId!;
    const [student, all] = await Promise.all([this.students.findById(id), this.exams.getStudentResults(id)]);
    const { from, to } = ctx.query.from || ctx.query.to
      ? resolvePeriod(ctx.today, ctx.query.from, ctx.query.to)
      : { from: '', to: '' };
    const results = all.results.filter((r) => {
      const d = isoDate(r.exam.examDate);
      return (!from || d >= from) && (!to || d <= to);
    });
    // Same rule and rounding as the parents app (one decimal, each exam weighs the same)
    const { subjects, overall } = marksSummary(results);
    const passed = results.filter((r) => r.status === 'PASSED').length;

    return {
      title: 'كشف علامات الطالب',
      subtitle: 'علامات المذاكرات ومعدل كل مادة',
      orientation: 'portrait',
      meta: [
        { label: 'الطالب', value: student.fullName },
        { label: 'الفترة', value: from ? periodText(from, to) : 'كل المذاكرات' },
      ],
      blocks: [
        studentFields(student),
        {
          type: 'stats',
          items: [
            { label: 'المعدل العام', kind: 'percent', value: overall, tone: gradeTone(overall) },
            { label: 'عدد المذاكرات', value: results.length },
            { label: 'ناجح', value: passed, tone: 'success' },
            { label: 'راسب أو غائب', value: results.filter((r) => r.status === 'FAILED' || r.status === 'ABSENT').length, tone: 'danger' },
          ],
        },
        {
          type: 'bars',
          title: 'معدل المواد',
          items: subjects.map((s) => ({ label: s.name, value: s.avg, caption: `${s.avg}% (${s.count})`, tone: gradeTone(s.avg) })),
        },
        {
          type: 'table',
          title: 'العلامات',
          columns: [
            { key: 'date', title: 'التاريخ', kind: 'date' },
            { key: 'subject', title: 'المادة', kind: 'text' },
            { key: 'exam', title: 'المذاكرة', kind: 'text', width: 1.5 },
            { key: 'type', title: 'النوع', kind: 'text', width: 0.8 },
            { key: 'mark', title: 'العلامة', kind: 'mark', width: 0.6 },
            { key: 'max', title: 'من', kind: 'mark', width: 0.5 },
            { key: 'percent', title: 'النسبة', kind: 'percent', width: 0.6 },
            { key: 'status', title: 'النتيجة', kind: 'badge', width: 0.7 },
          ],
          rows: [...results].reverse().map((r) => ({
            date: isoDate(r.exam.examDate),
            subject: r.exam.subject.name,
            exam: r.exam.title,
            type: r.exam.examType?.name ?? '—',
            mark: r.mark,
            max: Number(r.exam.maxMark),
            percent: r.mark === null ? null : percent(r.mark, Number(r.exam.maxMark)),
            status: resultBadge(r.status),
          })),
          emptyText: 'لا توجد علامات في هذه الفترة',
        },
        { type: 'signatures', items: ['المرشد', 'المدير', 'ختم المعهد'] },
      ],
      verify: {
        subject: student.fullName,
        lines: [`المعدل العام ${overall ?? '—'}%`, `${results.length} مذاكرة`],
      },
    };
  }

  /**
   * One-page monthly report to hand to the family: attendance rate and the
   * days missed, plus the marks average when the caller may see exams. The
   * period defaults to the last 30 days like the other student reports.
   */
  private async monthly(ctx: ReportContext): Promise<ReportBody> {
    const id = ctx.query.studentId!;
    const period = resolvePeriod(ctx.today, ctx.query.from, ctx.query.to);
    const withMarks = hasPermission(RequestContext.getRole(), 'exams.view');
    const [student, history, all] = await Promise.all([
      this.students.findById(id),
      this.attendance.getStudentHistory(id, period),
      withMarks ? this.exams.getStudentResults(id) : Promise.resolve(null),
    ]);
    const c = history.counts;
    const recorded = c.present + c.late + c.absent + c.excused;
    const rate = attendanceRate(c.present + c.late, recorded);
    const results = (all?.results ?? []).filter((r) => {
      const d = isoDate(r.exam.examDate);
      return d >= period.from && d <= period.to;
    });
    // Same rule and rounding as the parents app (one decimal, each exam weighs the same)
    const { subjects, overall } = marksSummary(results);
    const missed = history.records.filter((r) => r.status !== 'PRESENT');

    const stats: StatItem[] = [
      { label: 'نسبة الحضور', kind: 'percent', value: rate, tone: rateTone(rate) },
      { label: 'حاضر', value: c.present, tone: 'success' },
      { label: 'متأخر', value: c.late, tone: 'warning' },
      { label: 'غائب', value: c.absent, tone: 'danger' },
      { label: 'بعذر', value: c.excused, tone: 'info' },
    ];
    if (withMarks) stats.push({ label: 'معدل العلامات', kind: 'percent', value: overall, tone: gradeTone(overall) });

    const blocks: ReportBlock[] = [studentFields(student), { type: 'stats', items: stats }];
    if (subjects.length > 0) {
      blocks.push({
        type: 'bars',
        title: 'معدل المواد',
        items: subjects.map((s) => ({ label: s.name, value: s.avg, caption: `${s.avg}% (${s.count})`, tone: gradeTone(s.avg) })),
      });
    }
    blocks.push({
      type: 'table',
      title: 'أيام التأخر والغياب',
      columns: [
        { key: 'date', title: 'التاريخ', kind: 'date' },
        { key: 'day', title: 'اليوم', kind: 'text', width: 0.8 },
        { key: 'status', title: 'الحالة', kind: 'badge', width: 0.8 },
        { key: 'note', title: 'ملاحظة', kind: 'text', width: 2 },
      ],
      rows: [...missed].reverse().map((r) => {
        const date = isoDate(r.date);
        return { date, day: WEEKDAY_LABELS[dayOfWeekOf(date)], status: attendanceBadge(r.status), note: r.note ?? '' };
      }),
      emptyText: 'لا تأخر ولا غياب في هذه الفترة',
    });
    blocks.push({ type: 'signatures', items: ['المرشد', 'المدير', 'ختم المعهد'] });

    return {
      title: 'التقرير الشهري للطالب',
      subtitle: 'الحضور والعلامات خلال الفترة',
      orientation: 'portrait',
      meta: [
        { label: 'الطالب', value: student.fullName },
        { label: 'الفترة', value: periodText(history.from, history.to) },
      ],
      blocks,
    };
  }

  private async attendanceLog(ctx: ReportContext): Promise<ReportBody> {
    const id = ctx.query.studentId!;
    const period = resolvePeriod(ctx.today, ctx.query.from, ctx.query.to);
    const [student, history] = await Promise.all([
      this.students.findById(id),
      this.attendance.getStudentHistory(id, period),
    ]);
    const c = history.counts;
    const recorded = c.present + c.late + c.absent + c.excused;
    const rate = attendanceRate(c.present + c.late, recorded);

    return {
      title: 'سجل حضور الطالب',
      subtitle: 'الحضور والتأخر والغياب يوماً بيوم',
      orientation: 'portrait',
      meta: [
        { label: 'الطالب', value: student.fullName },
        { label: 'الفترة', value: periodText(history.from, history.to) },
      ],
      blocks: [
        {
          type: 'stats',
          items: [
            { label: 'نسبة الحضور', kind: 'percent', value: rate, tone: rateTone(rate) },
            { label: 'حاضر', value: c.present, tone: 'success' },
            { label: 'متأخر', value: c.late, tone: 'warning' },
            { label: 'غائب', value: c.absent, tone: 'danger' },
            { label: 'بعذر', value: c.excused, tone: 'info' },
          ],
        },
        {
          type: 'table',
          columns: [
            { key: 'date', title: 'التاريخ', kind: 'date' },
            { key: 'day', title: 'اليوم', kind: 'text', width: 0.8 },
            { key: 'status', title: 'الحالة', kind: 'badge', width: 0.8 },
            { key: 'in', title: 'الدخول', kind: 'text', width: 0.6 },
            { key: 'out', title: 'الخروج', kind: 'text', width: 0.6 },
            { key: 'note', title: 'ملاحظة', kind: 'text', width: 1.6 },
          ],
          rows: [...history.records].reverse().map((r) => {
            const date = isoDate(r.date);
            return {
              date,
              day: WEEKDAY_LABELS[dayOfWeekOf(date)],
              status: attendanceBadge(r.status),
              in: r.checkInAt ? timeText(r.checkInAt, ctx.timeZone) : '—',
              out: r.checkOutAt ? timeText(r.checkOutAt, ctx.timeZone) : '—',
              note: r.note ?? '',
            };
          }),
          emptyText: 'لا توجد سجلات حضور في هذه الفترة',
        },
      ],
    };
  }

  private async card(ctx: ReportContext): Promise<ReportBody> {
    const id = ctx.query.studentId!;
    const role = RequestContext.getRole();
    const student = await this.students.findById(id);
    const enrollments: any[] = student.studentEnrollments ?? [];
    const stats: StatItem[] = [];

    if (hasPermission(role, 'fees.view')) {
      for (const s of await this.feesReports.getStudentSummary(id)) {
        stats.push({ label: `المتبقي (${s.currency === 'SYP' ? 'ل.س' : '$'})`, value: money(s.remaining, s.currency), tone: s.overdue > 0 ? 'danger' : 'brand' });
      }
    }
    if (hasPermission(role, 'attendance.view')) {
      const h = await this.attendance.getStudentHistory(id, resolvePeriod(ctx.today));
      const c = h.counts;
      const rate = attendanceRate(c.present + c.late, c.present + c.late + c.absent + c.excused);
      stats.push({ label: 'الحضور (آخر 30 يوماً)', kind: 'percent', value: rate, tone: rateTone(rate) });
    }
    if (hasPermission(role, 'exams.view')) {
      const r = await this.exams.getStudentResults(id);
      const avg = buildMarksView(r.results).averagePercent;
      stats.push({ label: 'المعدل العام', kind: 'percent', value: avg, tone: gradeTone(avg) });
    }

    const allFields = await this.studentFields.findAll(false);
    const reportFields = allFields
      .filter((f) => f.displayInReport)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const customItems: { label: string; value: string }[] = [];
    const studentCustomData =
      (student.customFields as Record<string, unknown>) || {};
    for (const field of reportFields) {
      const val = studentCustomData[field.name];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        let formatted = String(val);
        if (field.type === 'BOOLEAN') {
          formatted = val === true || val === 'true' ? 'نعم' : 'لا';
        } else if (field.type === 'DATE') {
          formatted = isoDate(val as string | Date);
        }
        customItems.push({ label: field.label, value: formatted });
      }
    }

    return {
      title: 'بطاقة الطالب الشاملة',
      subtitle: 'البيانات الشخصية والعائلة والتسجيلات',
      orientation: 'portrait',
      meta: [{ label: 'الطالب', value: student.fullName }],
      blocks: [
        {
          type: 'fields',
          title: 'البيانات الشخصية',
          columns: 3,
          items: [
            { label: 'الاسم الكامل', value: student.fullName },
            { label: 'الجنس', value: GENDER_LABELS[student.gender] ?? '—' },
            { label: 'تاريخ الميلاد', value: student.birthDate ? isoDate(student.birthDate) : null },
            { label: 'الفرع', value: student.branch?.name ?? '—' },
            { label: 'الحالة', value: student.status?.name ?? '—' },
            { label: 'المدينة', value: student.city?.name ?? '—' },
            { label: 'المدرسة', value: student.school?.name ?? '—' },
            { label: 'الباص', value: student.bus?.name ?? '—' },
            { label: 'عرفنا عن طريق', value: student.knowWay?.name ?? '—' },
            { label: 'تاريخ التسجيل بالمعهد', value: isoDate(student.createdAt) },
          ],
        },
        {
          type: 'fields',
          title: 'العائلة',
          columns: 2,
          items: [
            { label: 'اسم العائلة', value: student.family?.familyName ?? '—' },
            { label: 'الهاتف', value: student.family?.phone ?? '—' },
            { label: 'اسم الأب', value: student.family?.fatherName ?? '—' },
            { label: 'اسم الأم', value: student.family?.motherName ?? '—' },
          ],
        },
        ...(customItems.length
          ? [
              {
                type: 'fields' as const,
                title: 'معلومات إضافية',
                columns: 3 as const,
                items: customItems,
              },
            ]
          : []),
        ...(stats.length ? [{ type: 'stats' as const, title: 'ملخص', items: stats }] : []),
        {
          type: 'table',
          title: 'التسجيلات',
          columns: [
            { key: 'year', title: 'السنة الدراسية', kind: 'text' },
            { key: 'section', title: 'الشعبة', kind: 'text' },
            { key: 'enrolledAt', title: 'تاريخ التسجيل', kind: 'date' },
            { key: 'status', title: 'الحالة', kind: 'badge' },
          ],
          rows: enrollments.map((e) => ({
            year: e.academicYear?.name ?? '—',
            section: e.section?.name ?? '—',
            enrolledAt: isoDate(e.enrolledAt),
            status: badge(ENROLLMENT_STATUS_LABELS[e.status] ?? e.status, e.status === 'ACTIVE' ? 'success' : 'neutral'),
          })),
          emptyText: 'لا توجد تسجيلات',
        },
      ],
    };
  }

  /** Students of each bus (all buses, or the one chosen) with the driver and the head count. */
  private async busRoster(ctx: ReportContext): Promise<ReportBody> {
    const paginated = await this.students.findAll(
      Object.assign(new StudentQueryDto(), {
        sectionId: ctx.query.sectionId,
        busId: ctx.query.busId,
        page: 1,
        limit: REPORT_ROW_LIMIT,
      }),
    );
    cappedTotal(ctx, paginated.total);
    type Row = {
      fullName: string;
      family?: { familyName: string; phone?: string | null } | null;
      bus?: { id: number; name: string; plateNumber?: string | null; driverName?: string | null; driverPhone?: string | null } | null;
      studentEnrollments?: { section?: { name: string } | null }[];
    };
    const students = ((paginated.data || []) as unknown as Row[]).filter((s) => s.bus);
    const byBus = groupBy(students, (s) => s.bus!.id);

    const blocks: ReportBlock[] = [
      {
        type: 'stats',
        items: [
          { label: 'عدد الباصات', value: byBus.size },
          { label: 'الطلاب المسجلون بباص', value: students.length, tone: 'brand' },
        ],
      },
    ];
    for (const list of byBus.values()) {
      const bus = list[0].bus!;
      const details = [
        bus.driverName && `السائق: ${bus.driverName}`,
        bus.driverPhone && `الهاتف: ${bus.driverPhone}`,
        bus.plateNumber && `اللوحة: ${bus.plateNumber}`,
        `الركاب: ${list.length}`,
      ].filter(Boolean);
      blocks.push({
        type: 'table',
        title: `${bus.name} · ${details.join(' · ')}`,
        columns: [
          { key: 'n', title: '#', kind: 'number', width: 0.35 },
          { key: 'student', title: 'الاسم', kind: 'text', width: 1.5 },
          { key: 'section', title: 'الشعبة', kind: 'text', width: 1 },
          { key: 'family', title: 'العائلة', kind: 'text' },
          { key: 'phone', title: 'الهاتف', kind: 'phone' },
        ],
        rows: list
          .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ar'))
          .map((s, i) => ({
            n: i + 1,
            student: s.fullName,
            section: s.studentEnrollments?.[0]?.section?.name ?? '—',
            family: s.family?.familyName ?? '—',
            phone: s.family?.phone ?? '',
          })),
      });
    }
    if (byBus.size === 0) blocks.push({ type: 'table', columns: [{ key: 'x', title: '', kind: 'text' }], rows: [], emptyText: 'لا طلاب مسجلون بباص' });

    return {
      title: 'كشف الباصات',
      subtitle: 'طلاب كل باص مع السائق والهاتف',
      orientation: 'portrait',
      meta: [],
      blocks,
    };
  }

  private async directory(ctx: ReportContext): Promise<ReportBody> {
    const [allFields, paginated] = await Promise.all([
      this.studentFields.findAll(false),
      this.students.findAll(
        Object.assign(new StudentQueryDto(), {
          sectionId: ctx.query.sectionId,
          statusId: ctx.query.statusId,
          cityId: ctx.query.cityId,
          schoolId: ctx.query.schoolId,
          busId: ctx.query.busId,
          knowWayId: ctx.query.knowWayId,
          nationalityId: ctx.query.nationalityId,
          religionId: ctx.query.religionId,
          languageId: ctx.query.languageId,
          situationId: ctx.query.situationId,
          gender: ctx.query.gender,
          examCandidate: ctx.query.examCandidate,
          customFilters: ctx.query.customFilters,
          page: 1,
          limit: REPORT_ROW_LIMIT,
        }),
      ),
    ]);

    cappedTotal(ctx, paginated.total);
    const reportFields = allFields
      .filter((f) => f.displayInReport)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const students = paginated.data || [];
    const males = students.filter((s: any) => s.gender === 'MALE').length;

    const columns: ReportColumn[] = [
      { key: 'n', title: '#', kind: 'number', width: 0.35 },
      { key: 'student', title: 'الاسم', kind: 'text', width: 1.5 },
      { key: 'gender', title: 'الجنس', kind: 'text', width: 0.5 },
      { key: 'family', title: 'العائلة', kind: 'text' },
      { key: 'phone', title: 'الهاتف', kind: 'phone' },
      { key: 'status', title: 'الحالة', kind: 'badge', width: 0.8 },
      { key: 'section', title: 'الشعبة', kind: 'text', width: 1 },
      { key: 'situation', title: 'الوضع', kind: 'text', width: 0.8 },
      ...reportFields.map((f) => ({
        key: `cf_${f.name}`,
        title: f.label,
        kind: 'text' as const,
      })),
    ];

    const toRow = (s: any, n: number): ReportRow => {
      const activeEnrollment = (s.studentEnrollments || []).find(
        (e: any) => e.status === 'ACTIVE',
      );
      const customData = (s.customFields as Record<string, unknown>) || {};
      const row: ReportRow = {
        n,
        student: s.fullName,
        gender: GENDER_LABELS[s.gender] ?? '—',
        family: s.family?.familyName ?? '—',
        phone: s.family?.phone ?? '—',
        status: badge(s.status?.name ?? '—', 'neutral'),
        section: activeEnrollment?.section?.name ?? '—',
        situation: yearEnrollment(s)?.situation?.name ?? '—',
      };

      for (const f of reportFields) {
        const val = customData[f.name];
        if (val === undefined || val === null || String(val).trim() === '') {
          row[`cf_${f.name}`] = '—';
        } else if (f.type === 'BOOLEAN') {
          row[`cf_${f.name}`] = val === true || val === 'true' ? 'نعم' : 'لا';
        } else if (f.type === 'DATE') {
          row[`cf_${f.name}`] = isoDate(val as string | Date);
        } else {
          row[`cf_${f.name}`] = String(val);
        }
      }

      return row;
    };
    const groupBy = ctx.query.groupBy;
    const listBlocks: ReportBlock[] = groupBy
      ? groupedBlocks(students, groupBy, columns, toRow)
      : [{ type: 'table', columns, rows: students.map((s: any, i: number) => toRow(s, i + 1)), emptyText: 'لا يوجد طلاب يطابقون هذه المعايير' }];

    return {
      title: 'قائمة الطلاب',
      subtitle: 'دليل الطلاب مع بيانات التواصل والشعب والحقول المخصصة',
      orientation: reportFields.length > 2 ? 'landscape' : 'portrait',
      meta: [
        ...(ctx.year ? [{ label: 'السنة الدراسية', value: ctx.year.name }] : []),
        { label: 'إجمالي النتائج', value: String(paginated.total) },
        ...(groupBy ? [{ label: 'التجميع حسب', value: STUDENT_GROUP_LABELS[groupBy] }] : []),
      ],
      blocks: [
        {
          type: 'stats',
          items: [
            { label: 'عدد الطلاب', value: paginated.total, tone: 'brand' },
            { label: 'ذكور', value: males, tone: 'info' },
            { label: 'إناث', value: students.length - males, tone: 'info' },
          ],
        },
        ...listBlocks,
      ],
    };
  }

  /**
   * Candidates of the official exams this year (enrollment flag), grouped by exam
   * language then gender. `languageId` filters on the EXAM language here.
   */
  private async candidates(ctx: ReportContext): Promise<ReportBody> {
    const paginated = await this.students.findAll(
      Object.assign(new StudentQueryDto(), {
        sectionId: ctx.query.sectionId,
        gender: ctx.query.gender,
        examCandidate: true,
        page: 1,
        limit: REPORT_ROW_LIMIT,
      }),
    );
    cappedTotal(ctx, paginated.total);
    const all = (paginated.data || []) as unknown as ListedStudent[];
    const students = ctx.query.languageId
      ? all.filter((s) => yearEnrollment(s)?.examLanguage?.id === ctx.query.languageId)
      : all;
    const languages = groupStudents(students, (s) => yearEnrollment(s)?.examLanguage?.name ?? 'غير محدد');
    return {
      title: 'المتقدمون للامتحان',
      subtitle: 'قوائم المتقدمين للامتحانات الرسمية حسب لغة الامتحان والجنس',
      orientation: 'landscape',
      meta: ctx.year ? [{ label: 'السنة الدراسية', value: ctx.year.name }] : [],
      blocks: [
        {
          type: 'stats',
          items: [
            { label: 'عدد المتقدمين', value: students.length, tone: 'brand' },
            ...languages.map(([name, list]) => ({ label: name, value: list.length, tone: 'info' as const })),
          ],
        },
        ...(students.length ? candidateBlocks(students) : [{ type: 'note' as const, tone: 'neutral' as const, text: 'لا يوجد متقدمون للامتحان هذه السنة' }]),
      ],
    };
  }
}

/** Identity block shared by the student documents. */
function studentFields(student: any): ReportBlock {
  const active = (student.studentEnrollments ?? []).find((e: any) => e.status === 'ACTIVE');
  return {
    type: 'fields',
    columns: 4,
    items: [
      { label: 'الطالب', value: student.fullName },
      { label: 'العائلة', value: student.family?.familyName ?? '—' },
      { label: 'هاتف ولي الأمر', value: student.family?.phone ?? '—' },
      { label: 'الشعبة الحالية', value: active?.section?.name ?? '—' },
    ],
  };
}

function installmentBadge(status: InstallmentStatus, open: number, due: string, today: string): BadgeCell {
  if (status === 'CANCELLED') return badge('ملغى', 'neutral');
  if (open <= 0) return badge('مدفوع', 'success');
  if (due < today) return badge('متأخر', 'danger');
  if (status === 'PARTIAL') return badge('مدفوع جزئياً', 'warning');
  return badge('لم يستحق', 'info');
}

export function gradeTone(value: number | null) {
  if (value === null) return 'neutral' as const;
  if (value >= 85) return 'success' as const;
  if (value >= 60) return 'info' as const;
  if (value >= 50) return 'warning' as const;
  return 'danger' as const;
}

export function rateTone(value: number | null) {
  if (value === null) return 'neutral' as const;
  if (value >= 90) return 'success' as const;
  if (value >= 75) return 'warning' as const;
  return 'danger' as const;
}

/** Per-subject and overall averages of a student's results, exactly as the parents app computes them. */
function marksSummary(results: Parameters<typeof buildMarksView>[0]) {
  const view = buildMarksView(results);
  const subjects = view.subjects.flatMap((s) =>
    s.averagePercent === null
      ? []
      : [{ name: s.subject, avg: s.averagePercent, count: s.results.filter((r) => r.percent !== null).length }],
  );
  return { subjects, overall: view.averagePercent };
}
