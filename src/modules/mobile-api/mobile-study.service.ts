import { Inject, Injectable } from '@nestjs/common';
import { AttendanceService } from '../attendance/attendance.service';
import { ExamsService } from '../exams/exams.service';
import { InstituteClockService } from '../institutes/institute-clock.service';
import { TimetablesService } from '../timetables/timetables.service';
import { MobileAccessService } from './mobile-access.service';
import { ChildScope, MobileContextService } from './mobile-context.service';
import { AttendanceMonthQueryDto } from './dto/attendance-month-query.dto';
import { isoDate } from './mobile-mappers';
import { buildTimetable } from './mobile-timetable';
import {
  MobileAttendanceMonth,
  MobileAttendanceStatus,
  MobileResults,
  MobileTimetable,
} from './mobile-api.types';

const UPCOMING_LIMIT = 20;

/** Attendance calendar, weekly timetable and exam results of a child. */
@Injectable()
export class MobileStudyService {
  constructor(
    @Inject(MobileAccessService) private readonly access: MobileAccessService,
    @Inject(MobileContextService) private readonly context: MobileContextService,
    @Inject(AttendanceService) private readonly attendance: AttendanceService,
    @Inject(TimetablesService) private readonly timetables: TimetablesService,
    @Inject(ExamsService) private readonly exams: ExamsService,
    @Inject(InstituteClockService) private readonly clock: InstituteClockService,
  ) {}

  async getAttendance(
    studentId: number,
    query: AttendanceMonthQueryDto,
  ): Promise<MobileAttendanceMonth> {
    const child = await this.access.child(await this.access.caller(), studentId);
    return this.context.runFor(child, async () => {
      const month = query.month ?? (await this.clock.today()).slice(0, 7);
      const [year, monthNumber] = month.split('-').map(Number);
      const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
      const period = await this.attendance.getStudentPeriod(
        child.id,
        `${month}-01`,
        `${month}-${String(lastDay).padStart(2, '0')}`,
      );
      return {
        month,
        days: [...period.records]
          .sort((a, b) => a.date.getTime() - b.date.getTime())
          .map((r) => ({
            date: isoDate(r.date),
            status: r.status as MobileAttendanceStatus,
            checkInAt: r.checkInAt?.toISOString() ?? null,
            checkOutAt: r.checkOutAt?.toISOString() ?? null,
            note: r.note ?? null,
          })),
        counts: {
          present: period.counts.present,
          late: period.counts.late,
          absent: period.counts.absent,
          excused: period.counts.excused,
        },
        ratePercent: period.ratePercent,
      };
    });
  }

  async getTimetable(studentId: number): Promise<MobileTimetable> {
    const child = await this.access.child(await this.access.caller(), studentId);
    return this.context.runFor(child, async (scope) => {
      const entries = await this.sectionEntries(scope);
      return buildTimetable(entries, await this.attendance.getWorkingDays());
    });
  }

  async getResults(studentId: number): Promise<MobileResults> {
    const child = await this.access.child(await this.access.caller(), studentId);
    return this.context.runFor(child, async (scope) => {
      const today = await this.clock.today();
      const [marks, upcoming] = await Promise.all([
        scope.academicYearId === null
          ? { averagePercent: null, subjects: [] }
          : this.exams.getStudentMarksView(child.id, scope.academicYearId),
        scope.enrollment
          ? this.exams.getUpcomingForStudent(scope.enrollment, today, UPCOMING_LIMIT)
          : [],
      ]);
      return {
        averagePercent: marks.averagePercent,
        subjects: marks.subjects,
        upcoming: upcoming.map((e) => ({
          examId: e.id,
          subject: e.subject.name,
          title: e.title,
          date: e.examDate,
        })),
      };
    });
  }

  /** Timetable rows of the child's section in the context year (empty without a section). */
  private async sectionEntries(scope: ChildScope) {
    if (!scope.enrollment || scope.academicYearId === null) return [];
    return this.timetables.getEntriesForReport(scope.academicYearId, {
      sectionId: scope.enrollment.sectionId,
    });
  }
}
