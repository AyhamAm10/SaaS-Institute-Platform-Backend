import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { RequestContext } from '../../context/request-context';
import { TenantJobData } from './tenant-job';
import { jobsEnabled } from './queue-names';

/** Role recorded in RequestContext while a background job runs. */
export const SYSTEM_JOB_ROLE = 'SYSTEM';

/**
 * Base class of every queue worker.
 *
 * Rebuilds RequestContext from the job's tenant before running the handler,
 * so TenantAware / ContextScoped repositories, the audit log and
 * InstituteClock behave exactly as in an HTTP request. A job without a valid
 * `instituteId` is rejected (it would otherwise run unscoped).
 *
 * Usage:
 *   @Processor(QueueNames.installments)
 *   export class XProcessor extends TenantJobProcessor<XPayload> {
 *     protected async handle(job: Job<XPayload & TenantJobData>) { ... }
 *   }
 */
export abstract class TenantJobProcessor<T extends object = object>
  extends WorkerHost
  implements OnApplicationBootstrap
{
  protected readonly logger = new Logger(this.constructor.name);

  /** Workers are declared with `autorun: false`; start them unless jobs are disabled. */
  onApplicationBootstrap(): void {
    startWorker(this, this.logger);
  }

  async process(job: Job<T & TenantJobData>): Promise<unknown> {
    const { instituteId, userId } = job.data;
    if (!Number.isInteger(instituteId) || instituteId <= 0) {
      throw new Error(`Job ${job.name}#${job.id} has no valid instituteId`);
    }

    return RequestContext.run(
      {
        instituteId,
        userId: userId ?? 0,
        role: SYSTEM_JOB_ROLE,
        language: 'ar',
      },
      () => this.handle(job),
    );
  }

  protected abstract handle(job: Job<T & TenantJobData>): Promise<unknown>;
}

/** Starts a worker declared with `autorun: false` (never blocks bootstrap). */
export function startWorker(host: WorkerHost, logger: Logger): void {
  if (!jobsEnabled()) return;
  host.worker.run().catch((err: unknown) => {
    logger.error(`Worker stopped: ${String(err)}`);
  });
}
