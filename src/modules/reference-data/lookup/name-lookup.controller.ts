import {
  Body,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { LookupEntity } from './lookup.store';
import { LookupService } from './lookup.service';
import { CreateLookupDto, UpdateLookupDto } from './dto/lookup.dto';
import { LookupQueryDto } from './dto/lookup-query.dto';

/**
 * CRUD endpoints shared by the name-only lookups (cities, know-ways, exam
 * types). DTO types are concrete classes so ValidationPipe sees them; tables
 * with extra fields have their own controllers.
 *
 * Usage:
 *   @Controller('cities') @Roles(...)
 *   export class CitiesController extends NameLookupController<City> { ... }
 */
export abstract class NameLookupController<T extends LookupEntity> {
  protected constructor(
    private readonly service: LookupService<
      T,
      CreateLookupDto,
      UpdateLookupDto
    >,
  ) {}

  @Get()
  async findAll(@Query() query: LookupQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.service.getById(id);
  }

  @Post()
  async create(@Body() dto: CreateLookupDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLookupDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id', ParseIntPipe) id: number) {
    await this.service.delete(id);
    return { success: true };
  }
}
