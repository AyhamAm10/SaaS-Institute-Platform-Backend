import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { InstitutesService } from './institutes.service';
import { CreateInstituteDto } from './dto/create-institute.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/types/user-role.enum';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';
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
   * List all institutes (paginated).
   */
  @Get()
  async findAll(@Query() query: PaginationQueryDto) {
    return this.institutesService.findAll(query);
  }

  /**
   * Get an institute by ID.
   */
  @Get(':id')
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.institutesService.findById(id);
  }
}
