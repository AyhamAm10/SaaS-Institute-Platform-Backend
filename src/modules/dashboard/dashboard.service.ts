import { Inject, Injectable } from '@nestjs/common';
import { AcademicYear } from '@prisma/client';
import { RequestContext } from '../../context/request-context';
import { localMidnightUtc } from '../../common/time/timezone';
import { InstituteClockService } from '../institutes/institute-clock.service';
import { AcademicYearRepository } from '../academic-years/academic-year.repository';
import { SectionRepository } from '../sections/section.repository';
import { TeacherRepository } from '../teachers/teacher.repository';
import { StudentsService } from '../students/students.service';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { AttendanceService } from '../attendance/attendance.service';
import { FeesReportsService } from '../fees/fees-reports.service';
import { ExamsService } from '../exams/exams.service';
import { sectionRows, todayAttendance } from './dashboard.rules';
import { DashboardOverview } from './dto/dashboard-overview.dto';

/**
 * Dashboard home (phase 3 D1). Composition only: every number comes from
 * the service that owns the data (role.md §10); nothing is queried here
 * except the year, the sections list and the teachers count.
 */
@Injectable()
export class DashboardService {
  constructor(
    @Inject(InstituteClockService)
    private readonly clock: InstituteClockService,
    @Inject(AcademicYearRepository)
    private readonly yearRepository: AcademicYearRepository,
    @Inject(SectionRepository)
    private readonly sectionRepository: SectionRepository,
    @Inject(TeacherRepository)
    private readonly teacherRepository: TeacherRepository,
    @Inject(StudentsService) private readonly students: StudentsService,
    @Inject(EnrollmentsService)
    private readonly enrollments: EnrollmentsService,
    @Inject(AttendanceService) private readonly attendance: AttendanceService,
    @Inject(FeesReportsService) private readonly fees: FeesReportsService,
    @Inject(ExamsService) private readonly exams: ExamsService,
  ) {}

  async getOverview(): Promise<DashboardOverview> {
    const [today, timeZone] = await Promise.all([
      this.clock.today(),
      this.clock.getTimezone(),
    ]);
    const branchId = RequestContext.getBranchId();
    const monthStart = localMidnightUtc(`${today.slice(0, 7)}-01`, timeZone);
    const year = await this.resolveYear();

    const [studentCounts, teachers, attendance] = await Promise.all([
      this.students.getOverview(year?.id ?? null, monthStart),
      this.teacherRepository.count({ isActive: true }),
      this.attendance.getOverview(today, branchId),
    ]);
    if (!year) {
      return emptyOverview(today, attendance, studentCounts, teachers);
    }

    const [enrolled, sections, finance, exams] = await Promise.all([
      this.enrollments.getActiveStudentSections(year.id, branchId),
      this.sectionRepository.findMany({
        where: { academicYearId: year.id },
        orderBy: { name: 'asc' },
      }),
      this.fees.getOverview(year.id, branchId),
      this.exams.getOverview(year.id, today, branchId),
    ]);

    return {
      today,
      isWorkingDay: attendance.isWorkingDay,
      academicYear: { id: year.id, name: year.name },
      students: {
        active: enrolled.length,
        unassigned: studentCounts.unassigned,
        newThisMonth: studentCounts.newSince,
      },
      teachers,
      sections: sectionRows(
        sections,
        enrolled,
        attendance.todayRecords,
        exams.sectionAverages,
      ),
      attendance: {
        today: todayAttendance(
          enrolled.map((e) => e.studentId),
          attendance.todayRecords,
          attendance.isWorkingDay,
        ),
        week: attendance.week,
      },
      finance,
      exams: {
        upcoming: exams.upcoming,
        averagePercent30d: exams.averagePercent30d,
      },
    };
  }

  /** The header year when sent, else the institute's current year (never created here). */
  private async resolveYear(): Promise<AcademicYear | null> {
    const headerYearId = RequestContext.getAcademicYearId();
    return headerYearId
      ? this.yearRepository.findById(headerYearId)
      : this.yearRepository.findCurrentYear();
  }
}

/** Overview of an institute without an academic year yet. */
function emptyOverview(
  today: string,
  attendance: {
    isWorkingDay: boolean;
    week: DashboardOverview['attendance']['week'];
  },
  students: { unassigned: number; newSince: number },
  teachers: number,
): DashboardOverview {
  return {
    today,
    isWorkingDay: attendance.isWorkingDay,
    academicYear: null,
    students: {
      active: 0,
      unassigned: students.unassigned,
      newThisMonth: students.newSince,
    },
    teachers,
    sections: [],
    attendance: {
      today: { ...todayAttendance([], [], false) },
      week: attendance.week,
    },
    finance: { currencies: [], monthly: [] },
    exams: { upcoming: [], averagePercent30d: null },
  };
}
