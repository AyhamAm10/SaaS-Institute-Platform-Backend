import { Inject, Injectable } from '@nestjs/common';
import { SectionSubject } from '@prisma/client';
import { TenantAwareRepository } from '../../database/tenant-aware.repository';
import { PrismaService } from '../../database/prisma.service';

/**
 * Tenant-scoped repository for SectionSubject entities.
 * Scoped automatically to current tenant institute.
 */
@Injectable()
export class SectionSubjectRepository extends TenantAwareRepository<SectionSubject> {
  constructor(@Inject(PrismaService) prisma: PrismaService) {
    super(prisma, 'sectionSubject');
  }

  /**
   * Find a section-subject relationship by sectionId and subjectId within the tenant.
   */
  async findBySectionAndSubject(
    sectionId: number,
    subjectId: number,
  ): Promise<SectionSubject | null> {
    return this.findOne({
      sectionId,
      subjectId,
    });
  }

  /**
   * List all subjects assigned to a section including subject details.
   */
  async findSubjectsBySection(sectionId: number): Promise<SectionSubject[]> {
    return this.findMany({
      where: { sectionId },
      include: {
        subject: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Assign a subject to a section within the current tenant.
   */
  async assignSubject(
    sectionId: number,
    subjectId: number,
  ): Promise<SectionSubject> {
    return this.create({
      sectionId,
      subjectId,
    });
  }

  /**
   * Remove a subject from a section within the current tenant.
   */
  async removeSubject(sectionId: number, subjectId: number): Promise<void> {
    const existing = await this.findBySectionAndSubject(sectionId, subjectId);
    if (existing) {
      await this.delete(existing.id);
    }
  }
}
