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
  Query,
} from '@nestjs/common';
import { StaffService } from './staff.service';
import {
  CreateStaffDto,
  ResetStaffPasswordDto,
  StaffQueryDto,
  UpdateStaffDto,
} from './dto/staff.dto';
import { RequireResource } from '../../common/decorators/permissions.decorator';
import { Resource } from '../../common/types/permissions';

/** Staff accounts of the institute (admins only, role.md §8.6). */
@Controller('staff')
@RequireResource(Resource.Staff)
export class StaffController {
  constructor(@Inject(StaffService) private readonly staff: StaffService) {}

  @Get()
  async findAll(@Query() query: StaffQueryDto) {
    return this.staff.findAll(query);
  }

  @Post()
  async create(@Body() dto: CreateStaffDto) {
    return this.staff.create(dto);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.staff.update(id, dto);
  }

  @Post(':id/reset-password')
  async resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetStaffPasswordDto,
  ) {
    return this.staff.resetPassword(id, dto);
  }

  /** Deactivate (soft delete); history and audit entries are kept. */
  @Delete(':id')
  async deactivate(@Param('id', ParseIntPipe) id: number) {
    return this.staff.deactivate(id);
  }
}
