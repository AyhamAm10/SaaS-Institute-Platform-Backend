import {
  Body,
  Controller,
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
import { AcademicYearsService } from './academic-years.service';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto';
import { UpdateAcademicYearDto } from './dto/update-academic-year.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/types/user-role.enum';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';

/**
 * Controller for Academic Year management.
 * Restricted to INSTITUTE_ADMIN and SUPER_ADMIN roles.
 */
@Controller('academic-years')
@Roles(UserRole.INSTITUTE_ADMIN, UserRole.SUPER_ADMIN)
export class AcademicYearsController {
  constructor(
    @Inject(AcademicYearsService)
    private readonly academicYearsService: AcademicYearsService,
  ) {}

  /**
   * Create a new academic year.
   */
  @Post()
  async create(@Body() dto: CreateAcademicYearDto) {
    return this.academicYearsService.create(dto);
  }

  /**
   * Update an existing academic year.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAcademicYearDto,
  ) {
    return this.academicYearsService.update(id, dto);
  }

  /**
   * Set an academic year as the current year (atomic).
   */
  @Patch(':id/set-current')
  @HttpCode(HttpStatus.OK)
  async setCurrent(@Param('id', ParseIntPipe) id: number) {
    return this.academicYearsService.setCurrent(id);
  }

  /**
   * List all academic years (paginated).
   */
  @Get()
  async findAll(@Query() pagination: PaginationQueryDto) {
    return this.academicYearsService.findAll(pagination);
  }

  /**
   * Get an academic year by ID.
   */
  @Get(':id')
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.academicYearsService.findById(id);
  }

  /**
   * List all sections under a specific academic year.
   */
  @Get(':id/sections')
  async findSections(@Param('id', ParseIntPipe) id: number) {
    return this.academicYearsService.findSections(id);
  }
}

