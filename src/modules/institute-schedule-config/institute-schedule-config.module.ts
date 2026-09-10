import { Module } from '@nestjs/common';
import { InstituteScheduleConfigController } from './institute-schedule-config.controller';
import { InstituteScheduleConfigService } from './institute-schedule-config.service';
import { InstituteScheduleConfigRepository } from './institute-schedule-config.repository';

@Module({
  controllers: [InstituteScheduleConfigController],
  providers: [
    InstituteScheduleConfigService,
    InstituteScheduleConfigRepository,
  ],
  exports: [
    InstituteScheduleConfigService,
    InstituteScheduleConfigRepository,
  ],
})
export class InstituteScheduleConfigModule {}
