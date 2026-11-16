import { Inject, Injectable } from '@nestjs/common';
import { Ensure } from '../../common/errors/ensure';
import { ErrorMessages } from '../../common/errors/error-messages';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { InstituteScheduleConfigService } from '../institute-schedule-config/institute-schedule-config.service';
import { TimetablesService } from '../timetables/timetables.service';
import { TeacherAccessService } from './teacher-access.service';
import { TeacherContextService } from './teacher-context.service';
import { buildTimetable } from './teacher-schedule';
import { TeacherStudentsQueryDto } from './dto/teacher-students-query.dto';
import {
  TeacherSection,
  TeacherSectionStudents,
  TeacherTimetable,
} from './teacher-api.types';

/** Roster size cap (a section is far smaller). */
const ROSTER_LIMIT = 300;

/** The teacher's weekly timetable, sections and their students. */
@Injectable()
export class TeacherStudyService {
  constructor(
    @Inject(TeacherAccessService) private readonly access: TeacherAccessService,
    @Inject(TeacherContextService) private readonly context: TeacherContextService,
    @Inject(TimetablesService) private readonly timetables: TimetablesService,
    @Inject(EnrollmentsService) private readonly enrollments: EnrollmentsService,
    @Inject(InstituteScheduleConfigService)
    private readonly schedule: InstituteScheduleConfigService,
  ) {}

  /** The weekly grid of the teacher across all their sections (current year). */
  async getTimetable(): Promise<TeacherTimetable> {
    const caller = await this.access.caller();
    const [yearId, config] = await Promise.all([
      this.access.yearId(),
      this.schedule.getConfig(),
    ]);
    const entries =
      yearId === null
        ? []
        : await this.timetables.getEntriesForReport(yearId, {
            teacherId: caller.teacherId,
          });
    return buildTimetable(entries, config.workingDays, config.breaks, yearId);
  }

  /** Sections the teacher teaches in (current year) with their subjects and student counts. */
  async getSections(): Promise<TeacherSection[]> {
    const caller = await this.access.caller();
    const yearId = await this.access.yearId();
    if (yearId === null) return [];
    const [rows, active] = await Promise.all([
      this.access.assignments(caller, yearId),
      this.enrollments.getActiveStudentSections(yearId),
    ]);
    const counts = new Map<number, number>();
    for (const e of active) {
      counts.set(e.sectionId, (counts.get(e.sectionId) ?? 0) + 1);
    }

    const bySection = new Map<number, TeacherSection>();
    for (const r of rows) {
      const section = bySection.get(r.sectionId) ?? {
        sectionId: r.sectionId,
        name: r.sectionName,
        grade: r.grade,
        branchId: r.branchId,
        branchName: r.branchName,
        academicYearId: r.academicYearId,
        studentCount: counts.get(r.sectionId) ?? 0,
        subjects: [],
      };
      section.subjects.push({ subjectId: r.subjectId, name: r.subjectName });
      bySection.set(r.sectionId, section);
    }
    return [...bySection.values()];
  }

  /** Active students of one of the teacher's own sections (optionally one of their subjects). */
  async getStudents(
    sectionId: number,
    query: TeacherStudentsQueryDto,
  ): Promise<TeacherSectionStudents> {
    const caller = await this.access.caller();
    const mine = await this.access.ownSection(caller, sectionId);
    const section = mine[0];
    if (query.subjectId !== undefined) {
      Ensure.forbidden(
        !mine.some((m) => m.subjectId === query.subjectId),
        ErrorMessages.get('teacher_scope_section'),
      );
    }
    const [rows, takers] = await Promise.all([
      this.enrollments.getYearEnrollments({
        academicYearId: section.academicYearId,
        sectionId,
        activeOnly: true,
        take: ROSTER_LIMIT,
      }),
      query.subjectId === undefined
        ? Promise.resolve(null)
        : this.context.runForSection(section, () =>
            this.enrollments.findStudentsTakingSubject(
              sectionId,
              query.subjectId as number,
            ),
          ),
    ]);
    const allowed = takers ? new Set(takers.map((t) => t.id)) : null;
    return {
      section: {
        id: sectionId,
        name: section.sectionName,
        branchId: section.branchId,
        academicYearId: section.academicYearId,
      },
      students: rows
        .filter((r) => !allowed || allowed.has(r.student.id))
        .map((r) => ({
          id: r.student.id,
          fullName: r.student.fullName,
          gender: r.student.gender,
          familyName: r.student.family?.familyName ?? null,
          guardianPhone: r.student.family?.phone ?? null,
        })),
    };
  }
}
