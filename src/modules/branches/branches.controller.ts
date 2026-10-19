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
import { Branch } from '@prisma/client';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/types/user-role.enum';

/**
 * Controller for physical institute Branches.
 * All operations are tenant-scoped via BranchesService & BranchRepository.
 */
@Controller('branches')
@Roles(UserRole.INSTITUTE_ADMIN, UserRole.SUPER_ADMIN)
export class BranchesController {
  constructor(
    @Inject(BranchesService)
    private readonly branchesService: BranchesService,
  ) {}

  /**
   * Get all active branches for the authenticated tenant.
   * Ensures at least the default branch exists if none has been provisioned yet.
   */
  @Get()
  async findAll(): Promise<Branch[]> {
    return this.branchesService.findAll();
  }

  /**
   * Get a branch by ID.
   */
  @Get(':id')
  async findById(@Param('id', ParseIntPipe) id: number): Promise<Branch> {
    return this.branchesService.findById(id);
  }

  /**
   * Create a new branch.
   */
  @Post()
  async create(@Body() dto: CreateBranchDto): Promise<Branch> {
    return this.branchesService.create(dto);
  }

  /**
   * Update an existing branch.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBranchDto,
  ): Promise<Branch> {
    return this.branchesService.update(id, dto);
  }

  /**
   * Deactivate/delete a branch.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.branchesService.delete(id);
  }
}
