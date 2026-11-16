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
import { ClosuresService } from './closures.service';
import {
  ClosureQueryDto,
  CreateClosureDto,
  UpdateClosureDto,
} from './dto/closure.dto';
import { RequireResource } from '../../common/decorators/permissions.decorator';
import { Resource } from '../../common/types/permissions';

/** Closures / holidays: settings (view for registrar, manage for admins). */
@Controller('closures')
@RequireResource(Resource.Settings)
export class ClosuresController {
  constructor(
    @Inject(ClosuresService) private readonly closures: ClosuresService,
  ) {}

  @Get()
  async findAll(@Query() query: ClosureQueryDto) {
    return this.closures.findAll(query);
  }

  @Post()
  async create(@Body() dto: CreateClosureDto) {
    return this.closures.create(dto);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateClosureDto,
  ) {
    return this.closures.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.closures.remove(id);
    return { success: true };
  }
}
