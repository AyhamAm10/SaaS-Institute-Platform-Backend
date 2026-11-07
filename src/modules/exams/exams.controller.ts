import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ExamsService } from './exams.service';
import {
  CreateExamDto,
  DeleteExamQueryDto,
  ExamQueryDto,
  SaveResultsDto,
  UpdateExamDto,
} from './dto/exam.dto';
import {
  RequirePermission,
  RequireResource,
} from '../../common/decorators/permissions.decorator';
import { MARKS_ENTER, Resource } from '../../common/types/permissions';

/** Exams and marks (role.md §10.5). */
@Controller()
@RequireResource(Resource.Exams)
export class ExamsController {
  constructor(@Inject(ExamsService) private readonly exams: ExamsService) {}

  @Get('exams')
  async findAll(@Query() query: ExamQueryDto) {
    return this.exams.findAll(query);
  }

  @Post('exams')
  async create(@Body() dto: CreateExamDto) {
    return this.exams.create(dto);
  }

  @Get('exams/:id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.exams.findDetails(id);
  }

  @Patch('exams/:id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExamDto,
  ) {
    return this.exams.update(id, dto);
  }

  /** `?force=true` is required when the exam already has marks. */
  @Delete('exams/:id')
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: DeleteExamQueryDto,
  ) {
    return this.exams.delete(id, query.force === 'true');
  }

  /** Mark sheet: eligible students with their marks and the statistics. */
  @Get('exams/:id/results')
  async results(@Param('id', ParseIntPipe) id: number) {
    return this.exams.getResults(id);
  }

  /** Teachers can enter marks (of their own subjects) without managing exams. */
  @Put('exams/:id/results')
  @RequirePermission(MARKS_ENTER)
  async saveResults(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveResultsDto,
  ) {
    return this.exams.saveResults(id, dto);
  }

  @Get('students/:id/results')
  async studentResults(@Param('id', ParseIntPipe) studentId: number) {
    return this.exams.getStudentResults(studentId);
  }
}
