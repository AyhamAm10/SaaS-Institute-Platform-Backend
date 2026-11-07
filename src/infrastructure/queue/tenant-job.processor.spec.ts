import { Job } from 'bullmq';
import { RequestContext } from '../../context/request-context';
import { SYSTEM_JOB_ROLE, TenantJobProcessor } from './tenant-job.processor';
import { TenantJobData, tenantJobData } from './tenant-job';

class ProbeProcessor extends TenantJobProcessor<{ note: string }> {
  protected async handle(job: Job<{ note: string } & TenantJobData>) {
    const ctx = RequestContext.getOrFail();
    return {
      instituteId: ctx.instituteId,
      role: ctx.role,
      note: job.data.note,
    };
  }
}

const jobWith = (data: object) =>
  ({ id: '1', name: 'probe', data }) as unknown as Job<
    { note: string } & TenantJobData
  >;

describe('Tenant jobs', () => {
  it('attaches the caller tenant to job data', () => {
    const data = RequestContext.run(
      { userId: 5, instituteId: 3, role: 'INSTITUTE_ADMIN', language: 'ar' },
      () => tenantJobData({ note: 'x' }),
    );

    expect(data).toEqual({ note: 'x', instituteId: 3, userId: 5 });
  });

  it('runs the handler inside the job tenant context', async () => {
    const result = await new ProbeProcessor().process(
      jobWith({ note: 'hi', instituteId: 3, userId: 0 }),
    );

    expect(result).toEqual({
      instituteId: 3,
      role: SYSTEM_JOB_ROLE,
      note: 'hi',
    });
  });

  it('rejects a job without a valid instituteId', async () => {
    await expect(
      new ProbeProcessor().process(jobWith({ note: 'x', userId: 0 })),
    ).rejects.toThrow('no valid instituteId');
  });
});
