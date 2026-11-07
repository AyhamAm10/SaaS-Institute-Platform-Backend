import { Inject, Injectable } from '@nestjs/common';
import { ExamType } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { LookupRepository } from '../lookup/lookup.repository';

@Injectable()
export class ExamTypeRepository extends LookupRepository<ExamType> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'examType');
  }

  /** Exams of this type. */
  async countUsage(id: number): Promise<number> {
    return this.client.exam.count({
      where: { instituteId: this.getInstituteId(), examTypeId: id },
    });
  }
}
