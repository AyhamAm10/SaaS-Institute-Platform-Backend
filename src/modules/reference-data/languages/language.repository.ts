import { Inject, Injectable } from '@nestjs/common';
import { Language } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { LookupRepository } from '../lookup/lookup.repository';

@Injectable()
export class LanguageRepository extends LookupRepository<Language> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'language');
  }

  /** Students studying it plus exam candidacies in it. */
  async countUsage(id: number): Promise<number> {
    const instituteId = this.getInstituteId();
    const [students, candidates] = await Promise.all([
      this.client.student.count({ where: { instituteId, languageId: id, deletedAt: null } }),
      this.client.studentEnrollment.count({ where: { instituteId, examLanguageId: id } }),
    ]);
    return students + candidates;
  }
}
