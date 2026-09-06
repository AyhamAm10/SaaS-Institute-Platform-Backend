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
import { SectionsService } from './sections.service';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { UpdateSectionFeeDto } from './dto/update-section-fee.dto';
import { SectionQueryDto } from './dto/section-query.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/types/user-role.enum';

/**
 * Controller for Section management.
 * Restricted to INSTITUTE_ADMIN and SUPER_ADMIN roles.
 */
@Controller('sections')
@Roles(UserRole.INSTITUTE_ADMIN, UserRole.SUPER_ADMIN)
export class SectionsController {
  constructor(
    @Inject(SectionsService)
    private readonly sectionsService: SectionsService,
  ) {}

  /**
   * Create a new section.
   */
  @Post()
  async create(@Body() dto: CreateSectionDto) {
    return this.sectionsService.create(dto);
  }

  /**
   * List sections with pagination and filters.
   */
  @Get()
  async findAll(@Query() query: SectionQueryDto) {
    return this.sectionsService.findAll(query);
  }

  /**
   * Get complete section details for the admin dashboard.
   */
  @Get(':id/details')
  async getDetails(@Param('id', ParseIntPipe) id: number) {
    return this.sectionsService.getDetails(id);
  }

  /**
   * Validate section relationship with an academic year.
   */
  @Get(':id/academic-years/:academicYearId/validate')
  async validateAcademicYear(
    @Param('id', ParseIntPipe) id: number,
    @Param('academicYearId', ParseIntPipe) academicYearId: number,
  ) {
    return this.sectionsService.validateSectionBelongsToAcademicYear(
      id,
      academicYearId,
    );
  }

  /**
   * Get a section by ID.
   */
  @Get(':id')
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.sectionsService.findById(id);
  }

  /**
   * Update an existing section.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSectionDto,
  ) {
    return this.sectionsService.update(id, dto);
  }

  /**
   * Dedicated endpoint to update a section's fee amount.
   */
  @Patch(':id/fee')
  @HttpCode(HttpStatus.OK)
  async updateFee(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSectionFeeDto,
  ) {
    return this.sectionsService.updateFee(id, dto);
  }
}
