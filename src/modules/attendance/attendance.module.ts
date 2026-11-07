import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { StudentsModule } from '../students/students.module';
import { SectionsModule } from '../sections/sections.module';
import { InstitutesModule } from '../institutes/institutes.module';
import { InstituteScheduleConfigModule } from '../institute-schedule-config/institute-schedule-config.module';
import { QueueNames } from '../../infrastructure/queue/queue-names';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { DailyAttendanceRepository } from './daily-attendance.repository';
import { AttendanceProcessor } from './jobs/attendance.processor';

/** Daily attendance: check-in / check-out and the absence job (E8). */
@Module({
  imports: [
    StudentsModule,
    SectionsModule,
    InstitutesModule,
    InstituteScheduleConfigModule,
    BullModule.registerQueue({ name: QueueNames.attendance }),
  ],
  controllers: [AttendanceController],
  providers: [
    AttendanceService,
    DailyAttendanceRepository,
    AttendanceProcessor,
  ],
  exports: [AttendanceService],
})
export class AttendanceModule {}
