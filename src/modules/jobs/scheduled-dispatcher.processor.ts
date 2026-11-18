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
    @InjectQueue(QueueNames.notifications)
    private readonly notificationsQueue: Queue,
  ) {
    super();
  }

  onApplicationBootstrap(): void {
    startWorker(this, this.logger);
  }

  async process(job: Job): Promise<number> {
    const ids = await this.instituteRepository.findAllIds();
    if (job.name === JobNames.dispatchFrequent) return this.dispatchFrequent(ids);
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
    // Reminders (absences, installments, marks); each one is sent once
    await this.notificationsQueue.addBulk(
      tenantJob(JobNames.sendReminders, 'reminders'),
    );
    this.logger.log(`${job.name}: dispatched ${ids.length} institute job(s)`);
    return ids.length;
  }

  /** Lesson reminders, one job per institute and 5-minute slot. */
  private async dispatchFrequent(ids: number[]): Promise<number> {
    const slot = fiveMinuteSlot(new Date());
    await this.notificationsQueue.addBulk(
      ids.map((instituteId) => ({
        name: JobNames.sendLessonReminders,
        data: { instituteId, userId: 0 } satisfies TenantJobData,
        opts: { jobId: `lessons:${instituteId}:${slot}` },
      })),
    );
    return ids.length;
  }
}

/**
 * `2026-11-18T11-15` (UTC, minutes floored to 5). No colon inside: BullMQ
 * rejects a custom job id with more than the two separators of `name:id:slot`.
 */
export function fiveMinuteSlot(at: Date): string {
  const minutes = String(Math.floor(at.getUTCMinutes() / 5) * 5).padStart(2, '0');
  return `${at.toISOString().slice(0, 13)}-${minutes}`;
}
