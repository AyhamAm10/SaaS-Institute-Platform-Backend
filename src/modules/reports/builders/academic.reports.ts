import { Inject, Injectable } from '@nestjs/common';
import { ExamsService } from '../../exams/exams.service';
import { ExamWithRefs } from '../../exams/exam.repository';
import { EnrollmentsService } from '../../enrollments/enrollments.service';
import { SectionsService } from '../../sections/sections.service';
import { TimetablesService } from '../../timetables/timetables.service';
import { TeachersService } from '../../teachers/teachers.service';
import { AttendanceService } from '../../attendance/attendance.service';
import { ReportTimetableEntry } from '../../timetables/timetable-entry.repository';
import { timeToMinutes } from '../../../common/time/timezone';
import { Ensure } from '../../../common/errors/ensure';
import { ErrorMessages } from '../../../common/errors/error-messages';
import { ReportBody, ReportColumn, ReportRow } from '../document/report-document';
import { dateText, isoDate, periodText, resultBadge, WEEKDAY_LABELS } from '../document/report-format';
import { average, MARK_BANDS, markDistribution, percent, rankByScore, resolvePeriod } from '../reports.rules';
import { ReportBuilderGroup, ReportContext, requireYear } from './report-context';
import { groupBy, num } from './report-helpers';
import { gradeTone } from './student.reports';

/** Academic reports (D3): marks, timetables and teaching load. */
@Injectable()
export class AcademicReports implements ReportBuilderGroup {
  constructor(
    @Inject(ExamsService) private readonly exams: ExamsService,
    @Inject(EnrollmentsService) private readonly enrollments: EnrollmentsService,
    @Inject(SectionsService) private readonly sections: SectionsService,
    @Inject(TimetablesService) private readonly timetables: TimetablesService,
    @Inject(TeachersService) private readonly teachers: TeachersService,
    @Inject(AttendanceService) private readonly attendance: AttendanceService,
  ) {}

  readonly builders = {
    'exam-results': (ctx: ReportContext) => this.examResults(ctx),
    'section-results': (ctx: ReportContext) => this.sectionResults(ctx),
    'subject-performance': (ctx: ReportContext) => this.subjectPerformance(ctx),
    timetable: (ctx: ReportContext) => this.timetable(ctx),
    'teacher-load': (ctx: ReportContext) => this.teacherLoad(ctx),
  };

  private async examResults(ctx: ReportContext): Promise<ReportBody> {
    const sheet = await this.exams.getResults(ctx.query.examId!);
    const exam = sheet.exam as ExamWithRefs;
    const max = num(exam.maxMark);
    const ranked = rankByScore(
      sheet.rows.map((row) => ({ row, score: row.result?.mark ?? null })),
    );
    const marks = ranked.flatMap((r) => (r.score === null ? [] : [r.score]));
    const percents = marks.map((m) => (m / max) * 100);
    const distribution = markDistribution(percents);
    const avgPercent = average(percents);
    const passRate = percent(sheet.stats.passed, sheet.stats.graded);

    return {
      title: 'كشف علامات مذاكرة',
      subtitle: `${exam.subject.name} · ${exam.title}`,
      orientation: 'portrait',
      meta: [
        { label: 'الشعبة', value: exam.section.name },
        { label: 'المادة', value: exam.subject.name },
        { label: 'التاريخ', value: dateText(isoDate(exam.examDate)) },
        { label: 'العلامة العظمى / النجاح', value: `${max} / ${num(exam.passMark)}` },
      ],
      blocks: [
        {
          type: 'stats',
          items: [
            { label: 'المتوسط', value: sheet.stats.average, tone: gradeTone(avgPercent) },
            { label: 'أعلى علامة', value: marks.length ? Math.max(...marks) : null, tone: 'success' },
            { label: 'أدنى علامة', value: marks.length ? Math.min(...marks) : null, tone: 'danger' },
            { label: 'نسبة النجاح', kind: 'percent', value: passRate, tone: gradeTone(passRate) },
            { label: 'غائب', value: sheet.stats.absent, tone: 'warning' },
            { label: 'لم تُرصد', value: sheet.stats.pending, tone: 'neutral' },
          ],
        },
        {
          type: 'bars',
          title: 'توزيع النتائج',
          items: MARK_BANDS.map((band, i) => ({
            label: band,
            value: percent(distribution[i], percents.length) ?? 0,
            caption: `${distribution[i]} طالب`,
            tone: i === 0 ? 'danger' : i < 3 ? 'warning' : 'success',
          })),
        },
        {
          type: 'table',
          columns: [
            { key: 'rank', title: 'الترتيب', kind: 'number', width: 0.5 },
            { key: 'student', title: 'الطالب', kind: 'text', width: 1.8 },
            { key: 'mark', title: 'العلامة', kind: 'mark', width: 0.6 },
            { key: 'percent', title: 'النسبة', kind: 'percent', width: 0.6 },
            { key: 'status', title: 'النتيجة', kind: 'badge', width: 0.7 },
          ],
          rows: ranked.map((r) => ({
            rank: r.rank,
            student: r.row.student.fullName,
            mark: r.score,
            percent: r.score === null ? null : percent(r.score, max),
            status: r.row.result ? resultBadge(r.row.result.status) : resultBadge('PENDING'),
          })),
          emptyText: 'لا يوجد طلاب لهذه المذاكرة',
        },
        { type: 'signatures', items: ['مدرّس المادة', 'المدير'] },
      ],
      verify: {
        subject: `${exam.title} · ${exam.section.name}`,
        lines: [`المتوسط ${sheet.stats.average ?? '—'} من ${max}`, `ناجح ${sheet.stats.passed} من ${sheet.stats.graded}`],
      },
    };
  }

  private async sectionResults(ctx: ReportContext): Promise<ReportBody> {
    const sectionId = ctx.query.sectionId!;
    const period = ctx.query.from || ctx.query.to ? resolvePeriod(ctx.today, ctx.query.from, ctx.query.to) : null;
    const [section, roster, exams] = await Promise.all([
      this.sections.findById(sectionId),
      this.enrollments.getSectionRoster(sectionId),
      this.exams.getExamsWithResults({ sectionId, from: period?.from, to: period?.to, take: ctx.take }),
    ]);
    const subjects = [...new Map(exams.map((e) => [e.subject.id, e.subject.name]))];
    const students = roster.filter((r) => r.status === 'ACTIVE');
    const scored = students.map((s) => {
      const perSubject = subjects.map(([subjectId]) => {
        const values = exams
          .filter((e) => e.subject.id === subjectId)
          .flatMap((e) => {
            const r = e.results.find((x) => x.studentId === s.student.id);
            return r && r.mark !== null ? [(num(r.mark) / num(e.maxMark)) * 100] : [];
          });
        return average(values);
      });
      const overall = average(perSubject.flatMap((v) => (v === null ? [] : [v])));
      return { s, perSubject, score: overall };
    });
    const ranked = rankByScore(scored);
    const columns: ReportColumn[] = [
      { key: 'rank', title: 'الترتيب', kind: 'number', width: 0.5 },
      { key: 'student', title: 'الطالب', kind: 'text', width: 1.6 },
      ...subjects.map(([id, name]) => ({ key: `s${id}`, title: name, kind: 'percent' as const, width: 0.7 })),
      { key: 'overall', title: 'المعدل العام', kind: 'percent', width: 0.8 },
    ];
    const subjectAverages = subjects.map(([, name], i) => ({
      name,
      avg: average(scored.flatMap((x) => (x.perSubject[i] === null ? [] : [x.perSubject[i]!]))),
    }));
    const sectionAvg = average(scored.flatMap((x) => (x.score === null ? [] : [x.score])));

    return {
      title: 'نتائج الشعبة',
      subtitle: 'معدل كل طالب في كل مادة (نسبة مئوية) مع المعدل العام والترتيب',
      orientation: 'landscape',
      meta: [
        { label: 'الشعبة', value: section.name },
        { label: 'الفترة', value: period ? periodText(period.from, period.to) : 'كل المذاكرات' },
      ],
      blocks: [
        {
          type: 'stats',
          items: [
            { label: 'معدل الشعبة', kind: 'percent', value: sectionAvg, tone: gradeTone(sectionAvg) },
            { label: 'الطلاب', value: students.length },
            { label: 'المذاكرات', value: exams.length },
            { label: 'المواد', value: subjects.length },
          ],
        },
        {
          type: 'bars',
          title: 'معدل كل مادة',
          items: subjectAverages.map((s) => ({
            label: s.name,
            value: s.avg ?? 0,
            caption: s.avg === null ? '—' : `${s.avg}%`,
            tone: gradeTone(s.avg),
          })),
        },
        {
          type: 'table',
          columns,
          rows: ranked.map((r) => {
            const row: ReportRow = { rank: r.rank, student: r.s.student.fullName, overall: r.score };
            subjects.forEach(([id], i) => (row[`s${id}`] = r.perSubject[i]));
            return row;
          }),
          emptyText: 'لا يوجد طلاب في هذه الشعبة',
        },
      ],
    };
  }

  private async subjectPerformance(ctx: ReportContext): Promise<ReportBody> {
    const year = requireYear(ctx);
    const period = ctx.query.from || ctx.query.to ? resolvePeriod(ctx.today, ctx.query.from, ctx.query.to) : null;
    const sectionName = ctx.query.sectionId ? (await this.sections.findById(ctx.query.sectionId)).name : null;
    const exams = await this.exams.getExamsWithResults({
      academicYearId: year.id,
      sectionId: ctx.query.sectionId,
      branchId: ctx.branchId,
      from: period?.from,
      to: period?.to,
      take: ctx.take,
    });
    const groups = [...groupBy(exams, (e) => `${e.section.id}|${e.subject.id}`)].map(([, list]) => {
      const graded = list.flatMap((e) =>
        e.results.flatMap((r) => (r.mark === null ? [] : [{ p: (num(r.mark) / num(e.maxMark)) * 100, passed: r.status === 'PASSED' }])),
      );
      return {
        section: list[0].section.name,
        subject: list[0].subject.name,
        exams: list.length,
        graded: graded.length,
        avg: average(graded.map((g) => g.p)),
        passRate: percent(graded.filter((g) => g.passed).length, graded.length),
      };
    });
    const bySubject = [...groupBy(groups, (g) => g.subject)].map(([subject, list]) => ({
      subject,
      avg: average(list.flatMap((g) => (g.avg === null ? [] : [g.avg]))),
    }));

    return {
      title: 'أداء المواد',
      subtitle: 'متوسط العلامات ونسبة النجاح لكل مادة في كل شعبة',
      orientation: 'portrait',
      meta: [
        { label: 'السنة الدراسية', value: year.name },
        ...(sectionName ? [{ label: 'الشعبة', value: sectionName }] : []),
        { label: 'الفترة', value: period ? periodText(period.from, period.to) : 'كل المذاكرات' },
      ],
      blocks: [
        {
          type: 'bars',
          title: 'متوسط كل مادة',
          items: bySubject.map((s) => ({ label: s.subject, value: s.avg ?? 0, caption: s.avg === null ? '—' : `${s.avg}%`, tone: gradeTone(s.avg) })),
        },
        {
          type: 'table',
          columns: [
            { key: 'section', title: 'الشعبة', kind: 'text' },
            { key: 'subject', title: 'المادة', kind: 'text' },
            { key: 'exams', title: 'المذاكرات', kind: 'number', width: 0.6 },
            { key: 'graded', title: 'علامات مرصودة', kind: 'number', width: 0.7 },
            { key: 'avg', title: 'المتوسط', kind: 'percent', width: 0.7 },
            { key: 'passRate', title: 'نسبة النجاح', kind: 'percent', width: 0.7 },
          ],
          rows: groups,
          emptyText: 'لا توجد مذاكرات',
        },
      ],
    };
  }

  private async timetable(ctx: ReportContext): Promise<ReportBody> {
    const year = requireYear(ctx);
    const { sectionId, teacherId } = ctx.query;
    Ensure.custom(!sectionId && !teacherId, ErrorMessages.get('report_param_required', { param: 'الشعبة أو المدرّس' }), 400);
    const [entries, workingDays] = await Promise.all([
      this.timetables.getEntriesForReport(year.id, { sectionId, teacherId }),
      this.attendance.getWorkingDays(),
    ]);
    const owner = sectionId
      ? `الشعبة: ${(await this.sections.findById(sectionId)).name}`
      : `المدرّس: ${(await this.teachers.findById(teacherId!)).user?.fullName ?? ''}`;
    const days = [...new Set([...workingDays, ...entries.map((e) => e.dayOfWeek)])].sort((a, b) => a - b);
    const slots = [...new Set(entries.map((e) => `${e.startTime}–${e.endTime}`))].sort(
      (a, b) => timeToMinutes(a.split('–')[0]) - timeToMinutes(b.split('–')[0]),
    );
    const cellOf = (e: ReportTimetableEntry) =>
      [e.subject.name, sectionId ? e.teacher.user.fullName : e.timetable.section.name, e.room?.name].filter(Boolean).join('\n');

    return {
      title: 'برنامج الدوام',
      subtitle: owner,
      orientation: 'landscape',
      meta: [
        { label: 'السنة الدراسية', value: year.name },
        { label: sectionId ? 'الشعبة' : 'المدرّس', value: owner.split(': ')[1] },
        { label: 'عدد الحصص الأسبوعية', value: String(entries.length) },
      ],
      blocks: [
        {
          type: 'grid',
          corner: 'الوقت',
          columns: days.map((d) => WEEKDAY_LABELS[d]),
          rows: slots.map((slot) => ({
            label: slot.split('–')[0],
            sub: slot.split('–')[1],
            cells: days.map((d) => {
              const e = entries.find((x) => x.dayOfWeek === d && `${x.startTime}–${x.endTime}` === slot);
              return e ? cellOf(e) : null;
            }),
          })),
        },
        ...(entries.length === 0 ? [{ type: 'note' as const, tone: 'warning' as const, text: 'لا يوجد برنامج دوام بعد.' }] : []),
      ],
    };
  }

  private async teacherLoad(ctx: ReportContext): Promise<ReportBody> {
    const year = requireYear(ctx);
    const entries = await this.timetables.getEntriesForReport(year.id, { branchId: ctx.branchId });
    const rows = [...groupBy(entries, (e) => e.teacher.id)]
      .map(([, list]) => {
        const minutes = list.reduce((acc, e) => acc + timeToMinutes(e.endTime) - timeToMinutes(e.startTime), 0);
        return {
          teacher: list[0].teacher.user.fullName,
          periods: list.length,
          hours: Math.round((minutes / 60) * 10) / 10,
          days: new Set(list.map((e) => e.dayOfWeek)).size,
          sections: [...new Set(list.map((e) => e.timetable.section.name))].join('، '),
          subjects: [...new Set(list.map((e) => e.subject.name))].join('، '),
        };
      })
      .sort((a, b) => b.periods - a.periods);
    const maxPeriods = Math.max(1, ...rows.map((r) => r.periods));

    return {
      title: 'نصاب المدرّسين',
      subtitle: 'الحصص الأسبوعية لكل مدرّس من برنامج الدوام',
      orientation: 'landscape',
      meta: [{ label: 'السنة الدراسية', value: year.name }],
      blocks: [
        {
          type: 'stats',
          items: [
            { label: 'المدرّسون في البرنامج', value: rows.length },
            { label: 'مجموع الحصص الأسبوعية', value: entries.length },
            { label: 'متوسط الحصص للمدرّس', value: average(rows.map((r) => r.periods)) },
          ],
        },
        {
          type: 'bars',
          title: 'الحصص الأسبوعية',
          items: rows.map((r) => ({ label: r.teacher, value: (r.periods / maxPeriods) * 100, caption: `${r.periods} حصة`, tone: 'brand' as const })),
        },
        {
          type: 'table',
          columns: [
            { key: 'teacher', title: 'المدرّس', kind: 'text', width: 1.3 },
            { key: 'periods', title: 'الحصص', kind: 'number', width: 0.6 },
            { key: 'hours', title: 'الساعات', kind: 'number', width: 0.6 },
            { key: 'days', title: 'أيام الدوام', kind: 'number', width: 0.6 },
            { key: 'sections', title: 'الشعب', kind: 'text', width: 1.6 },
            { key: 'subjects', title: 'المواد', kind: 'text', width: 1.4 },
          ],
          rows,
          emptyText: 'لا يوجد برنامج دوام بعد',
        },
      ],
    };
  }
}
