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
import { SchoolsService } from './schools.service';
import {
  CreateSchoolDto,
  SchoolQueryDto,
  UpdateSchoolDto,
} from './dto/school.dto';
import { RequireResource } from '../../../common/decorators/permissions.decorator';
import { Resource } from '../../../common/types/permissions';

@Controller('schools')
@RequireResource(Resource.Settings)
export class SchoolsController {
  constructor(
    @Inject(SchoolsService) private readonly schoolsService: SchoolsService,
  ) {}

  @Get()
  async findAll(@Query() query: SchoolQueryDto) {
    return this.schoolsService.findAll(query);
  }

  @Get(':id')
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.schoolsService.getById(id);
  }

  @Post()
  async create(@Body() dto: CreateSchoolDto) {
    return this.schoolsService.create(dto);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSchoolDto,
  ) {
    return this.schoolsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id', ParseIntPipe) id: number) {
    await this.schoolsService.delete(id);
    return { success: true };
  }
}
