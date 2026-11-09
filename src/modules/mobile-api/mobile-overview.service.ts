import { Inject, Injectable } from '@nestjs/common';
import { shiftLocalDate } from '../../common/time/timezone';
import { UserRole } from '../../common/types/user-role.enum';
import { AttendanceService } from '../attendance/attendance.service';
import { ExamsService } from '../exams/exams.service';
import { FeesReportsService } from '../fees/fees-reports.service';
import { InstituteClockService } from '../institutes/institute-clock.service';
import { TimetablesService } from '../timetables/timetables.service';
import { MobileAccessService } from './mobile-access.service';
import { ChildScope, MobileContextService } from './mobile-context.service';
import { isoDate, sectionOf } from './mobile-mappers';
import { lessonsOfDay } from './mobile-timetable';
import {
  MobileAttendanceStatus,
  MobileMarkSummary,
  MobileOverview,
} from './mobile-api.types';

const ATTENDANCE_WINDOW_DAYS = 30;
const LATEST_MARKS = 3;
const UPCOMING_EXAMS = 3;

/** Home screen of one child: today, 30-day attendance, marks and (guardians) finance. */
@Injectable()
export class MobileOverviewService {
  constructor(
    @Inject(MobileAccessService) private readonly access: MobileAccessService,
    @Inject(MobileContextService) private readonly context: MobileContextService,
    @Inject(AttendanceService) private readonly attendance: AttendanceService,
    @Inject(TimetablesService) private readonly timetables: TimetablesService,
    @Inject(ExamsService) private readonly exams: ExamsService,
    @Inject(FeesReportsService) private readonly fees: FeesReportsService,
    @Inject(InstituteClockService) private readonly clock: InstituteClockService,
  ) {}

  async getOverview(studentId: number): Promise<MobileOverview> {
    const caller = await this.access.caller();
    const child = await this.access.child(caller, studentId);
    const withFinance = caller.role === UserRole.FAMILY;

    return this.context.runFor(child, async (scope) => {
      const local = await this.clock.localParts();
      const today = local.date;
      const [period, isWorkingDay, lessons, marks, upcoming, finance] =
        await Promise.all([
          this.attendance.getStudentPeriod(
            child.id,
            shiftLocalDate(today, -(ATTENDANCE_WINDOW_DAYS - 1)),
            today,
          ),
          this.attendance.isWorkingDate(today),
          this.todayLessons(scope, local.dayOfWeek),
          scope.academicYearId === null
            ? { averagePercent: null, subjects: [] }
            : this.exams.getStudentMarksView(child.id, scope.academicYearId),
          scope.enrollment
            ? this.exams.getUpcomingForStudent(scope.enrollment, today, UPCOMING_EXAMS)
            : [],
          withFinance ? this.fees.getStudentFinance(child.id) : null,
        ]);

      const todayRecord = period.records.find((r) => isoDate(r.date) === today);
      const latest: MobileMarkSummary[] = marks.subjects
        .flatMap((s) =>
          s.results.flatMap((r) =>
            r.score !== null && r.percent !== null
              ? [
                  {
                    examId: r.examId,
                    subject: s.subject,
                    title: r.title,
                    date: r.date,
                    score: r.score,
                    max: r.max,
                    percent: r.percent,
                  },
                ]
              : [],
          ),
        )
        .sort((a, b) => b.date.localeCompare(a.date) || b.examId - a.examId)
        .slice(0, LATEST_MARKS);

      return {
        student: {
          id: child.id,
          fullName: child.fullName,
          section: sectionOf(child),
          branch: { id: child.branch.id, name: child.branch.name },
        },
        today: {
          date: today,
          isWorkingDay,
          attendance: {
            status: (todayRecord?.status as MobileAttendanceStatus) ?? null,
            checkInAt: todayRecord?.checkInAt?.toISOString() ?? null,
            checkOutAt: todayRecord?.checkOutAt?.toISOString() ?? null,
          },
          lessons: isWorkingDay ? lessons : [],
        },
        attendance30d: {
          present: period.counts.present,
          late: period.counts.late,
          absent: period.counts.absent,
          excused: period.counts.excused,
          ratePercent: period.ratePercent,
        },
        marks: {
          averagePercent: marks.averagePercent,
          latest,
          upcoming: upcoming.map((e) => ({
            examId: e.id,
            subject: e.subject.name,
            title: e.title,
            date: e.examDate,
          })),
        },
        finance: finance
          ? { currencies: finance.totals, nextDue: finance.nextDue }
          : null,
      };
    });
  }

  private async todayLessons(scope: ChildScope, dayOfWeek: number) {
    if (!scope.enrollment || scope.academicYearId === null) return [];
    const entries = await this.timetables.getEntriesForReport(
      scope.academicYearId,
      { sectionId: scope.enrollment.sectionId },
    );
    return lessonsOfDay(entries, dayOfWeek);
  }
}
