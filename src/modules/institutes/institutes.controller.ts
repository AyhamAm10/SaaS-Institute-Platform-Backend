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
import { InstitutesService } from './institutes.service';
import { CreateInstituteDto } from './dto/create-institute.dto';
import { UpdateInstituteDto } from './dto/update-institute.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/types/user-role.enum';
import { InstituteQueryDto } from './dto/institute-query.dto';
import { InstituteWithAdminResponse } from './dto/institute-response.dto';

/**
 * Controller for Institute management — restricted to SUPER_ADMIN role.
 */
@Controller('institutes')
@Roles(UserRole.SUPER_ADMIN)
export class InstitutesController {
  constructor(
    @Inject(InstitutesService)
    private readonly institutesService: InstitutesService,
  ) {}

  /**
   * Create a new institute and provision its admin account.
   */
  @Post()
  async create(
    @Body() dto: CreateInstituteDto,
  ): Promise<InstituteWithAdminResponse> {
    return this.institutesService.createInstitute(dto);
  }

  /**
   * List all institutes (paginated with optional search).
   */
  @Get()
  async findAll(@Query() query: InstituteQueryDto) {
    return this.institutesService.findAll(query, query.search);
  }

  /**
   * Get an institute by ID.
   */
  @Get(':id')
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.institutesService.findById(id);
  }

  /**
   * Update institute details (name, login code, branding, contact).
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInstituteDto,
  ) {
    return this.institutesService.update(id, dto);
  }
}
