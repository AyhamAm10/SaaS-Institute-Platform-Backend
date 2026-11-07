import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { InstitutesModule } from '../institutes/institutes.module';
import { QueueNames } from '../../infrastructure/queue/queue-names';
import { ScheduledDispatcherProcessor } from './scheduled-dispatcher.processor';
import { JobsSchedulerService } from './jobs-scheduler.service';

/** Scheduled background work: the repeatable dispatcher and its registration. */
@Module({
  imports: [
    InstitutesModule,
    BullModule.registerQueue(
      { name: QueueNames.dispatch },
      { name: QueueNames.fees },
      { name: QueueNames.attendance },
    ),
  ],
  providers: [ScheduledDispatcherProcessor, JobsSchedulerService],
})
export class JobsModule {}
