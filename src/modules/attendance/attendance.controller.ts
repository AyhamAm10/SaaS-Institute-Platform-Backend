import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import {
  AttendanceMarkDto,
  BulkAttendanceDto,
  DailyQueryDto,
  ExcuseDto,
  StudentAttendanceQueryDto,
  UpdateAttendanceDto,
} from './dto/attendance.dto';
import { RequireResource } from '../../common/decorators/permissions.decorator';
import { Resource } from '../../common/types/permissions';

/** Daily check-in / check-out (role.md §10.4). */
@Controller()
@RequireResource(Resource.Attendance)
export class AttendanceController {
  constructor(
    @Inject(AttendanceService) private readonly attendance: AttendanceService,
  ) {}

  /** Section roster of a day, including students not recorded yet. */
  @Get('attendance/daily')
  async daily(@Query() query: DailyQueryDto) {
    return this.attendance.getDaily(query);
  }

  @Post('attendance/check-in')
  async checkIn(@Body() dto: AttendanceMarkDto) {
    return this.attendance.checkIn(dto);
  }

  @Post('attendance/check-out')
  async checkOut(@Body() dto: AttendanceMarkDto) {
    return this.attendance.checkOut(dto);
  }

  /** Whole section; returns done / skipped (with reason) students. */
  @Post('attendance/bulk')
  async bulk(@Body() dto: BulkAttendanceDto) {
    return this.attendance.bulk(dto);
  }

  @Post('attendance/excuse')
  async excuse(@Body() dto: ExcuseDto) {
    return this.attendance.excuse(dto);
  }

  @Patch('attendance/:id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAttendanceDto,
  ) {
    return this.attendance.update(id, dto);
  }

  @Get('students/:id/attendance')
  async history(
    @Param('id', ParseIntPipe) studentId: number,
    @Query() query: StudentAttendanceQueryDto,
  ) {
    return this.attendance.getStudentHistory(studentId, query);
  }
}
