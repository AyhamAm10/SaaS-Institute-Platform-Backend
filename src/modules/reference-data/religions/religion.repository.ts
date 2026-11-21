import { Inject, Injectable } from '@nestjs/common';
import { Religion } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { LookupRepository } from '../lookup/lookup.repository';

@Injectable()
export class ReligionRepository extends LookupRepository<Religion> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'religion');
  }

  /** Students of this religion. */
  async countUsage(id: number): Promise<number> {
    return this.client.student.count({
      where: { instituteId: this.getInstituteId(), religionId: id, deletedAt: null },
    });
  }
}
