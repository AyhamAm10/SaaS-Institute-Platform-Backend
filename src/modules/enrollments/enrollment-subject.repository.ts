import { Inject, Injectable } from '@nestjs/common';
import { EnrollmentSubject } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { PrismaService } from '../../database/prisma.service';

/**
 * Subjects chosen for an enrollment. No rows means the student takes every
 * subject of the section (see EnrollmentsService.getEffectiveSubjects).
 */
@Injectable()
export class EnrollmentSubjectRepository extends TenantAwareRepository<EnrollmentSubject> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'enrollmentSubject');
  }

  async findSubjectIds(enrollmentId: number): Promise<number[]> {
    const rows = await this.findMany({
      where: { enrollmentId, status: 'ACTIVE' },
      orderBy: { subjectId: 'asc' },
    });
    return rows.map((row) => row.subjectId);
  }

  /** Replace the chosen subjects of an enrollment (empty = all subjects). */
  async replace(enrollmentId: number, subjectIds: number[]): Promise<void> {
    await this.client.enrollmentSubject.deleteMany({
      where: this.scopeWhere({ enrollmentId }),
    });
    if (subjectIds.length === 0) return;
    await this.client.enrollmentSubject.createMany({
      data: subjectIds.map((subjectId) => ({
        instituteId: this.getInstituteId(),
        enrollmentId,
        subjectId,
        createdById: this.getActorId(),
      })),
    });
  }

  /** Drop chosen subjects that are not in `keepSubjectIds`; returns the count. */
  async removeOutside(
    enrollmentId: number,
    keepSubjectIds: number[],
  ): Promise<number> {
    const result = await this.client.enrollmentSubject.deleteMany({
      where: this.scopeWhere({
        enrollmentId,
        subjectId: { notIn: keepSubjectIds },
      }),
    });
    return result.count as number;
  }
}
