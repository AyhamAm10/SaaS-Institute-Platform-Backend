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
import { AcademicBranchesService } from './academic-branches.service';
import { CreateAcademicBranchDto } from './dto/create-academic-branch.dto';
import { UpdateAcademicBranchDto } from './dto/update-academic-branch.dto';
import { AcademicBranchQueryDto } from './dto/academic-branch-query.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/types/user-role.enum';

/**
 * Controller for Academic Branch management.
 * Restricted to INSTITUTE_ADMIN and SUPER_ADMIN roles.
 */
@Controller('academic-branches')
@Roles(UserRole.INSTITUTE_ADMIN, UserRole.SUPER_ADMIN)
export class AcademicBranchesController {
  constructor(
    @Inject(AcademicBranchesService)
    private readonly branchesService: AcademicBranchesService,
  ) {}

  /**
   * Create a new academic branch.
   */
  @Post()
  async create(@Body() dto: CreateAcademicBranchDto) {
    return this.branchesService.create(dto);
  }

  /**
   * List academic branches (paginated with search).
   */
  @Get()
  async findAll(@Query() query: AcademicBranchQueryDto) {
    return this.branchesService.findAll(query);
  }

  /**
   * Get an academic branch by ID.
   */
  @Get(':id')
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.branchesService.findById(id);
  }

  /**
   * Update an academic branch.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAcademicBranchDto,
  ) {
    return this.branchesService.update(id, dto);
  }

  /**
   * Delete an academic branch (if no sections are linked).
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id', ParseIntPipe) id: number) {
    await this.branchesService.delete(id);
  }
}
