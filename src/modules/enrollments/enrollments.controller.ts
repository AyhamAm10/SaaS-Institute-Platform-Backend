import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';
import { BulkEnrollDto } from './dto/bulk-enroll.dto';
import { TransferEnrollmentDto } from './dto/transfer-enrollment.dto';
import { ChangeEnrollmentStatusDto } from './dto/change-enrollment-status.dto';
import { SetEnrollmentSubjectsDto } from './dto/set-enrollment-subjects.dto';
import { RequireResource } from '../../common/decorators/permissions.decorator';
import { Resource } from '../../common/types/permissions';

/**
 * Section enrollments. Unassigned students are listed through
 * `GET /students?unassigned=true` (context year) (students module).
 */
@Controller()
@RequireResource(Resource.Students)
export class EnrollmentsController {
  constructor(
    @Inject(EnrollmentsService)
    private readonly enrollmentsService: EnrollmentsService,
  ) {}

  /** Students of a section with their enrollment status and subjects. */
  @Get('sections/:sectionId/students')
  async getRoster(@Param('sectionId', ParseIntPipe) sectionId: number) {
    return this.enrollmentsService.getSectionRoster(sectionId);
  }

  /** Bulk enroll: returns the enrolled and the rejected students (with reason). */
  @Post('sections/:sectionId/enrollments')
  async enroll(
    @Param('sectionId', ParseIntPipe) sectionId: number,
    @Body() dto: BulkEnrollDto,
  ) {
    return this.enrollmentsService.enrollStudents(sectionId, dto);
  }

  @Patch('enrollments/:id/transfer')
  async transfer(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TransferEnrollmentDto,
  ) {
    return this.enrollmentsService.transfer(id, dto);
  }

  @Patch('enrollments/:id/status')
  async changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeEnrollmentStatusDto,
  ) {
    return this.enrollmentsService.changeStatus(id, dto);
  }

  @Put('enrollments/:id/subjects')
  async setSubjects(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetEnrollmentSubjectsDto,
  ) {
    return this.enrollmentsService.setSubjects(id, dto);
  }
}
