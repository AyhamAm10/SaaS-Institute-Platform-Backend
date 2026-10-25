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
  Post,
} from '@nestjs/common';
import { TimetablesService } from './timetables.service';
import { GenerateTimetableDto } from './dto/generate-timetable.dto';
import { SaveTimetableEntryDto } from './dto/save-timetable-entry.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/types/user-role.enum';

/**
 * Controller to handle nested academic year timetable routes requested by frontend:
 * /api/academic-years/:academicYearId/timetable/generate
 * /api/academic-years/:academicYearId/sections/:sectionId/timetable
 * /api/academic-years/:academicYearId/sections/:sectionId/timetable/entries
 */
@Controller('academic-years/:academicYearId')
@Roles(UserRole.INSTITUTE_ADMIN, UserRole.SUPER_ADMIN)
export class AcademicYearTimetablesController {
  constructor(
    @Inject(TimetablesService)
    private readonly timetablesService: TimetablesService,
  ) {}

  @Get('sections/:sectionId/timetable')
  async getTimetable(
    @Param('academicYearId', ParseIntPipe) academicYearId: number,
    @Param('sectionId', ParseIntPipe) sectionId: number,
  ) {
    return this.timetablesService.getTimetable(academicYearId, sectionId);
  }

  @Post('timetable/generate')
  @HttpCode(HttpStatus.OK)
  async generateTimetable(
    @Param('academicYearId', ParseIntPipe) academicYearId: number,
    @Body() dto: GenerateTimetableDto,
  ) {
    return this.timetablesService.generateTimetable({
      ...dto,
      academicYearId: dto.academicYearId ?? academicYearId,
    });
  }

  @Post('sections/:sectionId/timetable/entries')
  async createEntry(
    @Param('academicYearId', ParseIntPipe) academicYearId: number,
    @Param('sectionId', ParseIntPipe) sectionId: number,
    @Body() dto: SaveTimetableEntryDto,
  ) {
    const timetable = await this.timetablesService.getTimetable(
      academicYearId,
      sectionId,
    );
    return this.timetablesService.saveEntry(timetable.id, dto);
  }

  @Delete('sections/:sectionId/timetable/entries/:entryId')
  @HttpCode(HttpStatus.OK)
  async deleteEntry(
    @Param('academicYearId', ParseIntPipe) academicYearId: number,
    @Param('sectionId', ParseIntPipe) sectionId: number,
    @Param('entryId', ParseIntPipe) entryId: number,
  ) {
    const timetable = await this.timetablesService.getTimetable(
      academicYearId,
      sectionId,
    );
    return this.timetablesService.deleteEntry(timetable.id, entryId);
  }
}
