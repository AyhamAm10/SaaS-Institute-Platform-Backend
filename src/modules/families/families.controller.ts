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
import { FamiliesService } from './families.service';
import { CreateFamilyDto } from './dto/create-family.dto';
import { UpdateFamilyDto } from './dto/update-family.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/types/user-role.enum';

@Controller('families')
@Roles(UserRole.INSTITUTE_ADMIN, UserRole.SUPER_ADMIN)
export class FamiliesController {
  constructor(
    @Inject(FamiliesService)
    private readonly familiesService: FamiliesService,
  ) {}

  @Post()
  async create(@Body() dto: CreateFamilyDto) {
    return this.familiesService.create(dto);
  }

  @Get()
  async search(@Query('search') search?: string) {
    return this.familiesService.search(search);
  }

  @Get(':id')
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.familiesService.findById(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFamilyDto,
  ) {
    return this.familiesService.update(id, dto);
  }

  /** Soft delete — only allowed when the family has no students. */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id', ParseIntPipe) id: number) {
    await this.familiesService.delete(id);
    return { success: true };
  }
}
