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
import { SubjectsService } from './subjects.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { SubjectQueryDto } from './dto/subject-query.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/types/user-role.enum';

/**
 * Controller for Subject management.
 * Restricted to INSTITUTE_ADMIN and SUPER_ADMIN roles.
 */
@Controller('subjects')
@Roles(UserRole.INSTITUTE_ADMIN, UserRole.SUPER_ADMIN)
export class SubjectsController {
  constructor(
    @Inject(SubjectsService)
    private readonly subjectsService: SubjectsService,
  ) {}

  /**
   * Create a new subject.
   */
  @Post()
  async create(@Body() dto: CreateSubjectDto) {
    return this.subjectsService.create(dto);
  }

  /**
   * List subjects with pagination and search.
   */
  @Get()
  async findAll(@Query() query: SubjectQueryDto) {
    return this.subjectsService.findAll(query);
  }

  /**
   * Get a subject by ID.
   */
  @Get(':id')
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.subjectsService.findById(id);
  }

  /**
   * Update an existing subject.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSubjectDto,
  ) {
    return this.subjectsService.update(id, dto);
  }

  /**
   * Delete a subject.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id', ParseIntPipe) id: number) {
    await this.subjectsService.delete(id);
    return { success: true };
  }
}
