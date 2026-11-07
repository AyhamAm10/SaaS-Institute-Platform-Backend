import { Inject, Injectable } from '@nestjs/common';
import { KnowWay } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { LookupRepository } from '../lookup/lookup.repository';

@Injectable()
export class KnowWayRepository extends LookupRepository<KnowWay> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'knowWay');
  }

  /** Students who came through this source. */
  async countUsage(id: number): Promise<number> {
    return this.client.student.count({
      where: {
        instituteId: this.getInstituteId(),
        knowWayId: id,
        deletedAt: null,
      },
    });
  }
}
