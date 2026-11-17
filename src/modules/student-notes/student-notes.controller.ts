import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { StudentNotesService } from './student-notes.service';
import {
  CreateStudentNoteDto,
  UpdateStudentNoteDto,
} from './dto/student-note.dto';
import {
  RequirePermission,
  RequireResource,
} from '../../common/decorators/permissions.decorator';
import { RECORDS_DELETE, Resource } from '../../common/types/permissions';

/** Notes for the families, written by the staff on the student page. */
@Controller()
@RequireResource(Resource.Students)
export class StudentNotesController {
  constructor(
    @Inject(StudentNotesService) private readonly notes: StudentNotesService,
  ) {}

  @Get('students/:studentId/notes')
  async list(@Param('studentId', ParseIntPipe) studentId: number) {
    return this.notes.findByStudent(studentId);
  }

  @Post('students/:studentId/notes')
  async create(
    @Param('studentId', ParseIntPipe) studentId: number,
    @Body() dto: CreateStudentNoteDto,
  ) {
    return this.notes.create(studentId, dto);
  }

  @Patch('student-notes/:id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStudentNoteDto,
  ) {
    return this.notes.update(id, dto);
  }

  /** Deleting is limited like deleting students (not for data entry). */
  @Delete('student-notes/:id')
  @RequirePermission(RECORDS_DELETE)
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.notes.remove(id);
    return { success: true };
  }
}
