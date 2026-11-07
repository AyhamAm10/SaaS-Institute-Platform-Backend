import { Inject, Injectable } from '@nestjs/common';
import { InstituteFeature } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { PrismaService } from '../../database/prisma.service';

/** Feature flags of the current institute (tenant-scoped). */
@Injectable()
export class InstituteFeatureRepository extends TenantAwareRepository<InstituteFeature> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'instituteFeature');
  }
}
