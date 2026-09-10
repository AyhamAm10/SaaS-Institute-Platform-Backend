import { Module } from '@nestjs/common';
import { TimetablesController } from './timetables.controller';
import { TimetablesService } from './timetables.service';
import { TimetableRepository } from './timetable.repository';
import { TimetableEntryRepository } from './timetable-entry.repository';
import { TimetableConflictService } from './services/timetable-conflict.service';
import { TimetableSchedulerService } from './services/timetable-scheduler.service';
import { InstituteScheduleConfigModule } from '../institute-schedule-config/institute-schedule-config.module';
import { SectionsModule } from '../sections/sections.module';
import { TeachersModule } from '../teachers/teachers.module';
import { RoomsModule } from '../rooms/rooms.module';
import { AcademicYearsModule } from '../academic-years/academic-years.module';

@Module({
  imports: [
    InstituteScheduleConfigModule,
    SectionsModule,
    TeachersModule,
    RoomsModule,
    AcademicYearsModule,
  ],
  controllers: [TimetablesController],
  providers: [
    TimetablesService,
    TimetableRepository,
    TimetableEntryRepository,
    TimetableConflictService,
    TimetableSchedulerService,
  ],
  exports: [
    TimetablesService,
    TimetableRepository,
    TimetableEntryRepository,
    TimetableConflictService,
    TimetableSchedulerService,
  ],
})
export class TimetablesModule {}
