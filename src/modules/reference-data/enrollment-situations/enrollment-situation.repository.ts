import { Inject, Injectable } from '@nestjs/common';
import { EnrollmentSituation } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { LookupRepository } from '../lookup/lookup.repository';

@Injectable()
export class EnrollmentSituationRepository extends LookupRepository<EnrollmentSituation> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'enrollmentSituation');
  }

  /** Enrollments (any year) in this situation. */
  async countUsage(id: number): Promise<number> {
    return this.client.studentEnrollment.count({
      where: { instituteId: this.getInstituteId(), situationId: id },
    });
  }
}
