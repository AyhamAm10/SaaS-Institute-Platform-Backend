import { Inject, Injectable } from '@nestjs/common';
import { City } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { LookupRepository } from '../lookup/lookup.repository';

@Injectable()
export class CityRepository extends LookupRepository<City> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'city');
  }

  /** Students and schools linked to the city. */
  async countUsage(id: number): Promise<number> {
    const instituteId = this.getInstituteId();
    const [students, schools] = await Promise.all([
      this.client.student.count({
        where: { instituteId, cityId: id, deletedAt: null },
      }),
      this.client.school.count({
        where: { instituteId, cityId: id, deletedAt: null },
      }),
    ]);
    return students + schools;
  }
}
