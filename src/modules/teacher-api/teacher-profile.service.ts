import { Inject, Injectable } from '@nestjs/common';
import { RequestContext } from '../../context/request-context';
import { AcademicYearsService } from '../academic-years/academic-years.service';
import { InstituteClockService } from '../institutes/institute-clock.service';
import { InstituteScheduleConfigService } from '../institute-schedule-config/institute-schedule-config.service';
import { ExamTypesService } from '../reference-data/exam-types/exam-types.service';
import { LookupQueryDto } from '../reference-data/lookup/dto/lookup-query.dto';
import { TeacherAccessService } from './teacher-access.service';
import { TeacherMe } from './teacher-api.types';

const ymd = (d: Date): string => d.toISOString().slice(0, 10);

/** Who the teacher is, the institute schedule, and the exam types for the create form. */
@Injectable()
export class TeacherProfileService {
  constructor(
    @Inject(TeacherAccessService) private readonly access: TeacherAccessService,
    @Inject(AcademicYearsService) private readonly years: AcademicYearsService,
    @Inject(InstituteClockService) private readonly clock: InstituteClockService,
    @Inject(InstituteScheduleConfigService)
    private readonly schedule: InstituteScheduleConfigService,
    @Inject(ExamTypesService) private readonly examTypes: ExamTypesService,
  ) {}

  async getMe(): Promise<TeacherMe> {
    const caller = await this.access.caller();
    const [yearId, config, timezone] = await Promise.all([
      this.access.yearId(),
      this.schedule.getConfig(),
      this.clock.getTimezone(),
    ]);
    const year = yearId === null ? null : await this.years.findById(yearId);
    return {
      teacher: {
        id: caller.teacherId,
        fullName: caller.fullName,
        phone: caller.phone,
        specialization: caller.specialization,
      },
      institute: { id: RequestContext.getInstituteId(), timezone },
      branches: caller.branches,
      academicYear: year
        ? {
            id: year.id,
            name: year.name,
            startDate: ymd(year.startDate),
            endDate: ymd(year.endDate),
          }
        : null,
      schedule: {
        workingDays: config.workingDays,
        dayStartTime: config.dayStartTime,
        dayEndTime: config.dayEndTime,
        periodDurationMinutes: config.periodDurationMinutes,
        lateAfterMinutes: config.lateAfterMinutes,
        breaks: config.breaks,
      },
      availability: caller.availability,
    };
  }

  /** Exam types (reference data) for the exam form; a teacher has no access to settings. */
  async getExamTypes(): Promise<{ id: number; name: string }[]> {
    await this.access.caller();
    const page = await this.examTypes.findAll({
      page: 1,
      limit: 100,
    } as LookupQueryDto);
    return page.data.map((t) => ({ id: t.id, name: t.name }));
  }
}
