import { Inject } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TenantJobProcessor } from '../../../infrastructure/queue/tenant-job.processor';
import { TenantJobData } from '../../../infrastructure/queue/tenant-job';
import {
  JobNames,
  QueueNames,
} from '../../../infrastructure/queue/queue-names';
import { FeesReportsService } from '../fees-reports.service';

/** Per-institute fee jobs; runs inside the institute's RequestContext. */
@Processor(QueueNames.fees, { autorun: false })
export class FeesProcessor extends TenantJobProcessor {
  constructor(
    @Inject(FeesReportsService) private readonly reports: FeesReportsService,
  ) {
    super();
  }

  protected async handle(job: Job<TenantJobData>): Promise<number> {
    if (job.name !== JobNames.markOverdueInstallments) return 0;
    const count = await this.reports.markOverdue();
    if (count > 0) {
      this.logger.log(
        `institute ${job.data.instituteId}: ${count} installment(s) overdue`,
      );
    }
    return count;
  }
}
