import { Inject, Injectable } from '@nestjs/common';
import { FeatureKey, InstituteFeature } from '@prisma/client';
import { SystemRepository } from '../../database/system.repository';
import { PrismaService } from '../../database/prisma.service';

/**
 * Feature flags of any institute — super-admin platform operations only.
 */
@Injectable()
export class InstituteFeatureSystemRepository extends SystemRepository<InstituteFeature> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'instituteFeature');
  }

  async findByInstitute(instituteId: number): Promise<InstituteFeature[]> {
    return this.findMany({ where: { instituteId } });
  }

  async upsert(
    instituteId: number,
    key: FeatureKey,
    enabled: boolean,
  ): Promise<InstituteFeature> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.client as any).instituteFeature.upsert({
      where: { instituteId_key: { instituteId, key } },
      update: { enabled },
      create: { instituteId, key, enabled },
    });
  }
}
