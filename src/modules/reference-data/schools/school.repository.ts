import { Inject, Injectable } from '@nestjs/common';
import { School } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { LookupRepository } from '../lookup/lookup.repository';
import { SchoolQueryDto } from './dto/school.dto';

@Injectable()
export class SchoolRepository extends LookupRepository<School> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'school');
  }

  /** Name search plus the optional city filter. */
  protected override searchWhere(
    query: SchoolQueryDto,
  ): Record<string, unknown> {
    return {
      ...super.searchWhere(query),
      ...(query.cityId !== undefined && { cityId: query.cityId }),
    };
  }

  /** Students attending the school. */
  async countUsage(id: number): Promise<number> {
    return this.client.student.count({
      where: {
        instituteId: this.getInstituteId(),
        schoolId: id,
        deletedAt: null,
      },
    });
  }
}
