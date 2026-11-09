import { Controller, Get, Inject, Param, ParseIntPipe, Query, UseInterceptors } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/types/user-role.enum';
import { AttendanceMonthQueryDto } from './dto/attendance-month-query.dto';
import { MobileLanguageInterceptor } from './mobile-language.interceptor';
import { MobileOverviewService } from './mobile-overview.service';
import { MobileProfileService } from './mobile-profile.service';
import { MobileStudyService } from './mobile-study.service';
import {
  MobileAttendanceMonth,
  MobileFinance,
  MobileMe,
  MobileOverview,
  MobileProfile,
  MobileResults,
  MobileTimetable,
} from './mobile-api.types';

/**
 * Read-only API of the guardian / student apps. The caller comes only from
 * the JWT; `:studentId` must belong to the caller's own children (404
 * otherwise). No branch / year headers are needed or honoured.
 */
@Controller('mobile')
@Roles(UserRole.FAMILY, UserRole.STUDENT)
@UseInterceptors(MobileLanguageInterceptor)
export class MobileApiController {
  constructor(
    @Inject(MobileProfileService) private readonly profile: MobileProfileService,
    @Inject(MobileOverviewService) private readonly overview: MobileOverviewService,
    @Inject(MobileStudyService) private readonly study: MobileStudyService,
  ) {}

  @Get('me')
  me(): Promise<MobileMe> {
    return this.profile.getMe();
  }

  @Get('students/:studentId/overview')
  getOverview(@Param('studentId', ParseIntPipe) studentId: number): Promise<MobileOverview> {
    return this.overview.getOverview(studentId);
  }

  @Get('students/:studentId/attendance')
  getAttendance(
    @Param('studentId', ParseIntPipe) studentId: number,
    @Query() query: AttendanceMonthQueryDto,
  ): Promise<MobileAttendanceMonth> {
    return this.study.getAttendance(studentId, query);
  }

  @Get('students/:studentId/timetable')
  getTimetable(@Param('studentId', ParseIntPipe) studentId: number): Promise<MobileTimetable> {
    return this.study.getTimetable(studentId);
  }

  @Get('students/:studentId/results')
  getResults(@Param('studentId', ParseIntPipe) studentId: number): Promise<MobileResults> {
    return this.study.getResults(studentId);
  }

  /** Guardians only (a student account gets 403). */
  @Get('students/:studentId/finance')
  getFinance(@Param('studentId', ParseIntPipe) studentId: number): Promise<MobileFinance> {
    return this.profile.getFinance(studentId);
  }

  @Get('students/:studentId/profile')
  getProfile(@Param('studentId', ParseIntPipe) studentId: number): Promise<MobileProfile> {
    return this.profile.getProfile(studentId);
  }
}
