import { Inject, Injectable } from '@nestjs/common';
import { InstituteScheduleConfig, Prisma } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class InstituteScheduleConfigRepository extends TenantAwareRepository<InstituteScheduleConfig> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'instituteScheduleConfig');
  }

  /**
   * Find configuration for the current institute.
   */
  async findConfig(): Promise<InstituteScheduleConfig | null> {
    const instituteId = this.getInstituteId();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.client as any).instituteScheduleConfig.findUnique({
      where: { instituteId },
    });
  }

  /**
   * Upsert configuration for the current institute.
   */
  async upsertConfig(
    data: Omit<Prisma.InstituteScheduleConfigCreateInput, 'institute'>,
  ): Promise<InstituteScheduleConfig> {
    const instituteId = this.getInstituteId();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.client as any).instituteScheduleConfig.upsert({
      where: { instituteId },
      create: {
        ...data,
        institute: { connect: { id: instituteId } },
      },
      update: data,
    });
  }
}
