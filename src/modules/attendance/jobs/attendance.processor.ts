import { Inject } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TenantJobProcessor } from '../../../infrastructure/queue/tenant-job.processor';
import { TenantJobData } from '../../../infrastructure/queue/tenant-job';
import {
  JobNames,
  QueueNames,
} from '../../../infrastructure/queue/queue-names';
import { AttendanceService } from '../attendance.service';

/** Per-institute attendance jobs; runs inside the institute's RequestContext. */
@Processor(QueueNames.attendance, { autorun: false })
export class AttendanceProcessor extends TenantJobProcessor {
  constructor(
    @Inject(AttendanceService) private readonly attendance: AttendanceService,
  ) {
    super();
  }

  protected async handle(job: Job<TenantJobData>): Promise<number> {
    if (job.name !== JobNames.markAbsences) return 0;
    const count = await this.attendance.markAbsencesIfClosed();
    if (count > 0) {
      this.logger.log(
        `institute ${job.data.instituteId}: ${count} student(s) marked absent`,
      );
    }
    return count;
  }
}
