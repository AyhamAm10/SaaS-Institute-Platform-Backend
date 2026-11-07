import { Inject, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { startWorker } from '../../infrastructure/queue/tenant-job.processor';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { InstituteRepository } from '../institutes/institute.repository';
import { JobNames, QueueNames } from '../../infrastructure/queue/queue-names';
import { TenantJobData } from '../../infrastructure/queue/tenant-job';

/**
 * System dispatcher (the one worker that does not extend TenantJobProcessor):
 * it runs on a schedule with no tenant, and only enqueues one tenant job per
 * institute — it never reads or writes tenant data itself.
 */
@Processor(QueueNames.dispatch, { autorun: false })
export class ScheduledDispatcherProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(ScheduledDispatcherProcessor.name);

  constructor(
    @Inject(InstituteRepository)
    private readonly instituteRepository: InstituteRepository,
    @InjectQueue(QueueNames.fees) private readonly feesQueue: Queue,
    @InjectQueue(QueueNames.attendance)
    private readonly attendanceQueue: Queue,
  ) {
    super();
  }

  onApplicationBootstrap(): void {
    startWorker(this, this.logger);
  }

  async process(job: Job): Promise<number> {
    const ids = await this.instituteRepository.findAllIds();
    // One job per institute and hour: re-dispatching the same hour is a no-op
    const slot = new Date().toISOString().slice(0, 13);
    const tenantJob = (name: string, prefix: string) =>
      ids.map((instituteId) => ({
        name,
        data: { instituteId, userId: 0 } satisfies TenantJobData,
        opts: { jobId: `${prefix}:${instituteId}:${slot}` },
      }));
    await this.feesQueue.addBulk(
      tenantJob(JobNames.markOverdueInstallments, 'overdue'),
    );
    // Each attendance job checks its institute's own close time (idempotent)
    await this.attendanceQueue.addBulk(
      tenantJob(JobNames.markAbsences, 'absences'),
    );
    this.logger.log(`${job.name}: dispatched ${ids.length} institute job(s)`);
    return ids.length;
  }
}
