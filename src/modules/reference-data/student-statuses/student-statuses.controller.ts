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
  Query,
} from '@nestjs/common';
import { LookupQueryDto } from '../lookup/dto/lookup-query.dto';
import { StudentStatusesService } from './student-statuses.service';
import {
  CreateStudentStatusDto,
  UpdateStudentStatusDto,
} from './dto/student-status.dto';
import { RequireResource } from '../../../common/decorators/permissions.decorator';
import { Resource } from '../../../common/types/permissions';

@Controller('student-statuses')
@RequireResource(Resource.Settings)
export class StudentStatusesController {
  constructor(
    @Inject(StudentStatusesService)
    private readonly statusesService: StudentStatusesService,
  ) {}

  @Get()
  async findAll(@Query() query: LookupQueryDto) {
    return this.statusesService.findAll(query);
  }

  @Get(':id')
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.statusesService.getById(id);
  }

  @Post()
  async create(@Body() dto: CreateStudentStatusDto) {
    return this.statusesService.create(dto);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStudentStatusDto,
  ) {
    return this.statusesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id', ParseIntPipe) id: number) {
    await this.statusesService.delete(id);
    return { success: true };
  }
}
