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
import { LookupQueryDto } from '../lookup/dto/lookup-query.dto';
import { BusesService } from './buses.service';
import { CreateBusDto, UpdateBusDto } from './dto/bus.dto';
import { RequireResource } from '../../../common/decorators/permissions.decorator';
import { Resource } from '../../../common/types/permissions';

/** Buses of the active branch (X-Branch-Id). */
@Controller('buses')
@RequireResource(Resource.Settings)
export class BusesController {
  constructor(
    @Inject(BusesService) private readonly busesService: BusesService,
  ) {}

  @Get()
  async findAll(@Query() query: LookupQueryDto) {
    return this.busesService.findAll(query);
  }

  @Get(':id')
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.busesService.getById(id);
  }

  @Post()
  async create(@Body() dto: CreateBusDto) {
    return this.busesService.create(dto);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBusDto,
  ) {
    return this.busesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id', ParseIntPipe) id: number) {
    await this.busesService.delete(id);
    return { success: true };
  }
}
