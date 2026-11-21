import { Inject, Injectable } from '@nestjs/common';
import { Nationality } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { LookupRepository } from '../lookup/lookup.repository';

@Injectable()
export class NationalityRepository extends LookupRepository<Nationality> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'nationality');
  }

  /** Students of this nationality. */
  async countUsage(id: number): Promise<number> {
    return this.client.student.count({
      where: { instituteId: this.getInstituteId(), nationalityId: id, deletedAt: null },
    });
  }
}
