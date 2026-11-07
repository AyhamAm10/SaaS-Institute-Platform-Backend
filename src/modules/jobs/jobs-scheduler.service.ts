import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  JobNames,
  jobsEnabled,
  QueueNames,
} from '../../infrastructure/queue/queue-names';

/** Every hour: idempotent per-institute jobs (each one uses the institute's own "today"). */
const DISPATCH_EVERY_MS = 60 * 60 * 1000;

/**
 * Registers the repeatable dispatcher job once the app is up. Never blocks
 * startup: without Redis the registration is logged and skipped
 * (jobs are fail-closed, the HTTP API keeps working).
 */
@Injectable()
export class JobsSchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(JobsSchedulerService.name);

  constructor(
    @InjectQueue(QueueNames.dispatch) private readonly dispatchQueue: Queue,
  ) {}

  onApplicationBootstrap(): void {
    if (!jobsEnabled()) return;
    void this.dispatchQueue
      .upsertJobScheduler(
        JobNames.dispatchScheduled,
        { every: DISPATCH_EVERY_MS },
        { name: JobNames.dispatchScheduled },
      )
      .then(() => this.logger.log('Scheduled dispatcher registered'))
      .catch((err: unknown) =>
        this.logger.error(`Could not register scheduled jobs: ${String(err)}`),
      );
  }
}
