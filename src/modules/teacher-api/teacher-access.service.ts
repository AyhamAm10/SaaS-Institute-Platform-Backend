import { Inject, Injectable } from '@nestjs/common';
import { Ensure } from '../../common/errors/ensure';
import { ErrorMessages } from '../../common/errors/error-messages';
import { RequestContext } from '../../context/request-context';
import { AcademicYearsService } from '../academic-years/academic-years.service';
import { TeacherRepository } from '../teachers/teacher.repository';
import { SectionsService, TaughtAssignment } from '../sections/sections.service';

/** The live teacher behind a request. */
export interface TeacherCaller {
  userId: number;
  teacherId: number;
  fullName: string;
  phone: string;
  specialization: string | null;
  branches: { id: number; name: string }[];
  availability: { dayOfWeek: number; startTime: string; endTime: string }[];
}

/**
 * The caller is derived ONLY from the JWT. The token role must be TEACHER
 * and the account must still be linked and ACTIVE (a deactivated teacher is
 * refused even with a valid token). Sections are reached only through the
 * caller's own assignments; anything else is a 404 (existence not revealed).
 */
@Injectable()
export class TeacherAccessService {
  constructor(
    @Inject(TeacherRepository) private readonly teachers: TeacherRepository,
    @Inject(SectionsService) private readonly sections: SectionsService,
    @Inject(AcademicYearsService) private readonly years: AcademicYearsService,
  ) {}

  async caller(): Promise<TeacherCaller> {
    const userId = RequestContext.getUserId();
    const own = await this.teachers.findByUserId(userId);
    Ensure.forbidden(!own, ErrorMessages.get('teacher_not_linked'));
    Ensure.unauthorized(!own!.isActive, ErrorMessages.get('account_deactivated'));
    const details = await this.teachers.findByIdWithDetails(own!.id);
    Ensure.exists(details, 'Teacher');
    return {
      userId,
      teacherId: own!.id,
      fullName: details.user.fullName,
      phone: details.user.phone,
      specialization: details.specialization ?? null,
      branches: (details.branchTeachers as { branch: { id: number; name: string } }[]).map(
        (b) => ({ id: b.branch.id, name: b.branch.name }),
      ),
      availability: (
        details.availabilities as { dayOfWeek: number; startTime: string; endTime: string }[]
      ).map((a) => ({ dayOfWeek: a.dayOfWeek, startTime: a.startTime, endTime: a.endTime })),
    };
  }

  /** The year of the request: the header's year, else the institute's current one (null when none). */
  async yearId(): Promise<number | null> {
    return RequestContext.getAcademicYearId() ?? (await this.years.findCurrentYearId());
  }

  /** Every (section, subject) the teacher teaches, optionally only in one year. */
  assignments(caller: TeacherCaller, academicYearId?: number): Promise<TaughtAssignment[]> {
    return this.sections.getTaughtAssignments(caller.teacherId, academicYearId);
  }

  /** One of the teacher's own sections (any year), or 404. */
  async ownSection(caller: TeacherCaller, sectionId: number): Promise<TaughtAssignment[]> {
    const mine = (await this.assignments(caller)).filter((a) => a.sectionId === sectionId);
    Ensure.exists(mine.length > 0 ? mine : null, 'Section');
    return mine;
  }
}
