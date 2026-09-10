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
import { TimetablesService } from './timetables.service';
import { GenerateTimetableDto } from './dto/generate-timetable.dto';
import { SaveTimetableEntryDto } from './dto/save-timetable-entry.dto';
import { TimetableQueryDto } from './dto/timetable-query.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/types/user-role.enum';

@Controller('timetables')
@Roles(UserRole.INSTITUTE_ADMIN, UserRole.SUPER_ADMIN)
export class TimetablesController {
  constructor(
    @Inject(TimetablesService)
    private readonly timetablesService: TimetablesService,
  ) {}

  @Get()
  async getTimetable(@Query() query: TimetableQueryDto) {
    return this.timetablesService.getTimetable(
      query.academicYearId,
      query.sectionId || 0,
    );
  }

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  async generateTimetable(@Body() dto: GenerateTimetableDto) {
    return this.timetablesService.generateTimetable(dto);
  }

  @Post(':id/entries')
  async createEntry(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveTimetableEntryDto,
  ) {
    return this.timetablesService.saveEntry(id, dto);
  }

  @Patch(':id/entries/:entryId')
  @HttpCode(HttpStatus.OK)
  async updateEntry(
    @Param('id', ParseIntPipe) id: number,
    @Param('entryId', ParseIntPipe) entryId: number,
    @Body() dto: SaveTimetableEntryDto,
  ) {
    return this.timetablesService.saveEntry(id, dto, entryId);
  }

  @Delete(':id/entries/:entryId')
  @HttpCode(HttpStatus.OK)
  async deleteEntry(
    @Param('id', ParseIntPipe) id: number,
    @Param('entryId', ParseIntPipe) entryId: number,
  ) {
    return this.timetablesService.deleteEntry(id, entryId);
  }

  @Patch(':id/entries/:entryId/lock')
  @HttpCode(HttpStatus.OK)
  async toggleLock(
    @Param('id', ParseIntPipe) id: number,
    @Param('entryId', ParseIntPipe) entryId: number,
    @Body('isLocked') isLocked: boolean,
  ) {
    return this.timetablesService.toggleLock(id, entryId, isLocked);
  }

  @Get(':id/conflicts')
  async getConflicts(@Param('id', ParseIntPipe) id: number) {
    return this.timetablesService.getConflicts(id);
  }
}
