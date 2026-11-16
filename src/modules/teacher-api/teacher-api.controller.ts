import {
  Controller,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/types/user-role.enum';
import { TeacherStudentsQueryDto } from './dto/teacher-students-query.dto';
import { TeacherOverviewService } from './teacher-overview.service';
import { TeacherProfileService } from './teacher-profile.service';
import { TeacherStudyService } from './teacher-study.service';
import {
  TeacherMe,
  TeacherOverview,
  TeacherSection,
  TeacherSectionStudents,
  TeacherTimetable,
} from './teacher-api.types';

/**
 * Read models of the teacher app. The caller comes only from the JWT and is
 * checked live (linked and ACTIVE). Writes (attendance, exams, marks) use the
 * existing endpoints, which already enforce the teacher scope: send the
 * section's own `X-Branch-Id` and `X-Academic-Year-Id` (from /teacher/sections).
 */
@Controller('teacher')
@Roles(UserRole.TEACHER)
export class TeacherApiController {
  constructor(
    @Inject(TeacherProfileService) private readonly profile: TeacherProfileService,
    @Inject(TeacherStudyService) private readonly study: TeacherStudyService,
    @Inject(TeacherOverviewService) private readonly overview: TeacherOverviewService,
  ) {}

  @Get('me')
  me(): Promise<TeacherMe> {
    return this.profile.getMe();
  }

  @Get('overview')
  getOverview(): Promise<TeacherOverview> {
    return this.overview.getOverview();
  }

  @Get('timetable')
  timetable(): Promise<TeacherTimetable> {
    return this.study.getTimetable();
  }

  @Get('sections')
  sections(): Promise<TeacherSection[]> {
    return this.study.getSections();
  }

  @Get('sections/:sectionId/students')
  students(
    @Param('sectionId', ParseIntPipe) sectionId: number,
    @Query() query: TeacherStudentsQueryDto,
  ): Promise<TeacherSectionStudents> {
    return this.study.getStudents(sectionId, query);
  }

  @Get('exam-types')
  examTypes(): Promise<{ id: number; name: string }[]> {
    return this.profile.getExamTypes();
  }
}
